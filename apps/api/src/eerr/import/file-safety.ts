import JSZip from 'jszip';
import {
  BadRequestException,
  HttpException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { fromBuffer, type ZipFile, type Entry } from 'yauzl';
import { SaxesParser } from 'saxes';
import { IMPORT_LIMITS } from '@puro-origen/domain';

export const invalidFile = () =>
  new BadRequestException(
    'Archivo incompatible o dañado. Usá la plantilla CSV UTF-8 con punto y coma o XLSX del sistema.',
  );
export const tooLarge = () =>
  new PayloadTooLargeException(
    'El archivo o su expansión supera los límites de importación.',
  );
export function utf8(data: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    throw new BadRequestException(
      'Codificación incompatible. Guardá el CSV como UTF-8.',
    );
  }
}
function inspectXml(name: string, data: Buffer) {
  const parser = new SaxesParser({ xmlns: true });
  let depth = 0,
    rows = 0,
    cells = 0,
    textLength = 0;
  parser.on('doctype', () => {
    throw invalidFile();
  });
  parser.on('opentag', (tag) => {
    if (++depth > 64) throw tooLarge();
    if (tag.local === 'f' || tag.local === 'definedName')
      throw new BadRequestException(
        'No se admiten fórmulas de Excel, ni resultados cacheados o nombres definidos.',
      );
    if (tag.local === 'row' && ++rows > IMPORT_LIMITS.rows + 20)
      throw tooLarge();
    if (tag.local === 'c' && ++cells > (IMPORT_LIMITS.rows + 20) * 7)
      throw tooLarge();
    if (tag.local === 't' || tag.local === 'v') textLength = 0;
    for (const a of Object.values(tag.attributes)) {
      if (a.value.length > IMPORT_LIMITS.cell * 2) throw tooLarge();
      // Bound sparse coordinates before ExcelJS allocates row/cell arrays.
      if (
        a.local === 'r' &&
        tag.local === 'row' &&
        (!/^\d+$/.test(a.value) || Number(a.value) > IMPORT_LIMITS.rows + 20)
      )
        throw tooLarge();
      if (
        a.local === 'r' &&
        tag.local === 'c' &&
        !/^[A-G]([1-9]\d{0,2}|100[01])$/.test(a.value)
      )
        throw tooLarge();
      if (
        (a.local === 'TargetMode' && a.value.toLowerCase() === 'external') ||
        /macroenabled|vbaproject|activex|oleobject|externallink/i.test(a.value)
      )
        throw new BadRequestException(
          'No se admiten macros, vínculos externos ni contenido activo.',
        );
    }
  });
  parser.on('text', (text) => {
    textLength += text.length;
    if (
      textLength > IMPORT_LIMITS.cell &&
      /sharedStrings|worksheets/.test(name)
    )
      throw tooLarge();
  });
  parser.on('closetag', () => {
    depth--;
    textLength = 0;
  });
  parser.write(utf8(data)).close();
}
/** Bounded streaming ZIP inspection before the workbook library allocates sheets/cells.
 * No extraction to disk, no custom ZIP/XML parser, no external entity resolution. */
export async function inspectXlsx(buffer: Buffer): Promise<Buffer> {
  if (buffer.length > IMPORT_LIMITS.fileBytes) throw tooLarge();
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50)
    throw invalidFile();
  let zip: ZipFile | undefined;
  try {
    zip = await new Promise<ZipFile>((resolve, reject) =>
      fromBuffer(
        buffer,
        { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
        (error, z) => (error ? reject(error) : resolve(z)),
      ),
    );
    if (zip.entryCount > IMPORT_LIMITS.entries) throw tooLarge();
    const safe = new JSZip();
    let expanded = 0,
      sheets = 0;
    const names = new Set<string>();
    await new Promise<void>((resolve, reject) => {
      const fail = (error: unknown) => {
        zip!.close();
        reject(error);
      };
      zip!.on('error', fail);
      zip!.on('end', resolve);
      zip!.on('entry', (entry: Entry) => {
        void (async () => {
          const name = entry.fileName;
          if (names.has(name)) throw invalidFile();
          names.add(name);
          if (entry.generalPurposeBitFlag & 1) throw invalidFile();
          if (entry.uncompressedSize > IMPORT_LIMITS.expandedBytes - expanded)
            throw tooLarge();
          if (name.endsWith('/')) {
            if (entry.uncompressedSize) throw invalidFile();
            zip!.readEntry();
            return;
          }
          if (
            !/^(\[Content_Types\]\.xml|_rels\/\.rels|docProps\/(core|app)\.xml|xl\/(workbook|styles|sharedStrings)\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/theme\/theme\d+\.xml|xl\/worksheets\/sheet\d+\.xml)$/.test(
              name,
            )
          )
            throw new BadRequestException(
              'El libro contiene componentes no admitidos; usá una plantilla sin contenido adicional.',
            );
          if (
            name.startsWith('xl/worksheets/') &&
            ++sheets > IMPORT_LIMITS.sheets
          )
            throw tooLarge();
          const stream = await new Promise<import('node:stream').Readable>(
            (res, rej) =>
              zip!.openReadStream(entry, (e, s) => (e ? rej(e) : res(s))),
          );
          const chunks: Buffer[] = [];
          for await (const chunk of stream) {
            const bytes = Buffer.from(chunk);
            expanded += bytes.length;
            if (expanded > IMPORT_LIMITS.expandedBytes) {
              stream.destroy();
              throw tooLarge();
            }
            chunks.push(bytes);
          }
          const content = Buffer.concat(chunks);
          inspectXml(name, content);
          safe.file(name, content);
          zip!.readEntry();
        })().catch(fail);
      });
      zip!.readEntry();
    });
    if (
      !names.has('[Content_Types].xml') ||
      !names.has('xl/workbook.xml') ||
      sheets !== 2
    )
      throw invalidFile();
    return await safe.generateAsync({
      type: 'nodebuffer',
      compression: 'STORE',
    });
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw invalidFile();
  } finally {
    zip?.close();
  }
}

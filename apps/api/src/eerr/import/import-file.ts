import { BadRequestException, HttpException } from '@nestjs/common';
import ExcelJS from '@protobi/exceljs';
import {
  IMPORT_COLUMNS,
  IMPORT_LIMITS,
  isArchived,
  type EerrStructure,
  type ImportRow,
} from '@puro-origen/domain';
import { inspectXlsx, invalidFile, tooLarge } from './file-safety.js';
import { csvEscape, safeCsvLabel, readCsv } from './csv.js';
export type ImportFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};
export type TemplateContext = {
  id: string;
  branchName: string;
  year: number;
  month: number;
  revision: number;
  stamp: string;
  structure: EerrStructure;
};
export const importMime = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const NUMERIC_AMOUNT_ISSUE =
  'El importe debe estar guardado como texto en Excel. Cambiá el formato de la celda a Texto y volvé a ingresar el valor.';
function templateRows(context: TemplateContext) {
  const nodes = context.structure.nodes;
  return nodes
    .filter((n) => n.kind === 'ITEM' && !isArchived(n))
    .map((n) => {
      const path: string[] = [];
      let parent = nodes.find((p) => p.nodeId === n.parentId);
      while (parent) {
        path.unshift(parent.name);
        parent = nodes.find((p) => p.nodeId === parent!.parentId);
      }
      return [
        context.id,
        context.stamp,
        n.code,
        n.name,
        path.join(' / '),
        '',
        '',
      ];
    });
}
export async function createImportTemplate(
  format: 'csv' | 'xlsx',
  context: TemplateContext,
): Promise<Buffer> {
  const rows = templateRows(context);
  if (format === 'csv')
    return Buffer.from(
      '\uFEFF' +
        [
          IMPORT_COLUMNS,
          ...rows.map((r) =>
            r.map((v, i) => (i === 3 || i === 4 ? safeCsvLabel(v) : v)),
          ),
        ]
          .map((r) => r.map(csvEscape).join(';'))
          .join('\r\n') +
        '\r\n',
      'utf8',
    );
  const workbook = new ExcelJS.Workbook();
  const instructions = workbook.addWorksheet('Instrucciones');
  const lines = [
    [
      'Plantilla de carga EERR',
      'Solo importes y cantidades; no crea categorías ni ítems',
    ],
    ['Sucursal', context.branchName],
    ['Período', `${context.month}/${context.year}`],
    ['eerr_id', context.id],
    ['revision_estructura', context.stamp],
    ['Versión al descargar', String(context.revision)],
    [
      'Importe en XLSX',
      'Escribí todos los importes como texto en la columna importe_o_expresion. Si Excel guardó una celda como número, cambiá su formato a Texto y volvé a ingresar el valor.',
    ],
    ['Vacío', 'No modifica ese campo'],
    [
      'Literales',
      'Texto: 1500, 1500,25 o 1500.25. El texto 0 carga cero explícito.',
    ],
    [
      'SIN_CARGAR',
      'Escribí SIN_CARGAR como texto para limpiar valor y expresión del campo',
    ],
    [
      'Expresiones',
      'Texto sin =; por ejemplo (1000 + 500) / 3. No se admiten fórmulas nativas de Excel.',
    ],
    ['Cantidad', 'Entero no negativo; no admite expresiones'],
    [
      'Identidad',
      'No editar códigos ni metadatos. Nombre y ruta son informativos.',
    ],
    [
      'Concurrencia',
      'Un cambio estructural requiere plantilla nueva; los valores actuales se revisan en el preview.',
    ],
  ];
  lines.forEach((r) => instructions.addRow(r));
  instructions.columns = [{ width: 26 }, { width: 85 }];
  instructions.eachRow((r) => {
    r.height = r.number === 7 ? 54 : 36;
    r.eachCell((c) => {
      c.alignment = { wrapText: true, vertical: 'middle' };
    });
    r.getCell(1).font = { bold: true };
  });
  const sheet = workbook.addWorksheet('Carga');
  sheet.addRow([...IMPORT_COLUMNS]);
  rows.forEach((r) => sheet.addRow(r));
  sheet.columns = [
    { width: 38, hidden: true },
    { width: 40, hidden: true },
    { width: 38 },
    { width: 30 },
    { width: 45 },
    { width: 30 },
    { width: 18 },
  ];
  sheet.getColumn(6).numFmt = '@';
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.eachRow((row, index) =>
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.numFmt = '@';
      cell.alignment = { wrapText: true, vertical: 'top' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: index === 1 ? 'FF285343' : col >= 6 ? 'FFFFF1CE' : 'FFF0F3EE',
        },
      };
      if (index === 1) cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.protection = { locked: col < 6 || index === 1 };
    }),
  );
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
function numberText(value: number): string {
  if (!Number.isFinite(value)) throw invalidFile();
  const raw = String(value);
  if (!/[eE]/.test(raw)) return raw;
  const [mantissa, e] = raw.toLowerCase().split('e');
  const sign = mantissa.startsWith('-') ? '-' : '';
  const digits = mantissa.replace('-', '').replace('.', ''),
    point = mantissa.replace('-', '').split('.')[0].length + Number(e);
  return (
    sign +
    (point <= 0
      ? '0.' + '0'.repeat(-point) + digits
      : point >= digits.length
        ? digits + '0'.repeat(point - digits.length)
        : digits.slice(0, point) + '.' + digits.slice(point))
  );
}
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return numberText(value);
  if (typeof value === 'string') return value;
  throw new BadRequestException(
    'Solo se admiten celdas de texto o números; no fórmulas, fechas, enlaces ni errores de Excel.',
  );
}
export async function readImportFile(file: ImportFile) {
  if (!file?.buffer?.length)
    throw new BadRequestException('Seleccioná un archivo con filas de carga.');
  if (file.buffer.length > IMPORT_LIMITS.fileBytes) throw tooLarge();
  const format: 'csv' | 'xlsx' | null = file.originalname
    .toLowerCase()
    .endsWith('.csv')
    ? 'csv'
    : file.originalname.toLowerCase().endsWith('.xlsx')
      ? 'xlsx'
      : null;
  if (!format)
    throw new BadRequestException(
      'Solo se admiten archivos .csv y .xlsx; no .xls ni .xlsm.',
    );
  const allowed =
    format === 'csv'
      ? [
          'text/csv',
          'text/plain',
          'application/vnd.ms-excel',
          'application/octet-stream',
          '',
        ]
      : [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/octet-stream',
          '',
        ];
  if (!allowed.includes(file.mimetype.split(';')[0].toLowerCase()))
    throw invalidFile();
  let grid: string[][],
    numericAmounts = new Set<number>(),
    metadata: { id: string; stamp: string } | undefined;
  try {
    if (format === 'csv') grid = readCsv(file.buffer);
    else {
      const safe = await inspectXlsx(file.buffer);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(new Uint8Array(safe).buffer);
      const sheet = book.getWorksheet('Carga'),
        instructions = book.getWorksheet('Instrucciones');
      if (!sheet || !instructions || book.worksheets.length !== 2)
        throw invalidFile();
      if (sheet.rowCount > IMPORT_LIMITS.rows + 1 || sheet.columnCount > 7)
        throw tooLarge();
      metadata = {
        id: cellText(instructions.getCell('B4').value).trim(),
        stamp: cellText(instructions.getCell('B5').value).trim(),
      };
      grid = [];
      for (let r = 1; r <= sheet.rowCount; r++) {
        const values = Array.from({ length: 7 }, (_, i) => {
          const value = sheet.getRow(r).getCell(i + 1).value;
          if (r > 1 && i === 5 && typeof value === 'number') {
            numericAmounts.add(r);
            return '';
          }
          return cellText(value);
        });
        grid.push(values);
      }
    }
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw invalidFile();
  }
  if (
    !grid.length ||
    JSON.stringify(grid[0].map((v) => v.trim())) !==
      JSON.stringify(IMPORT_COLUMNS)
  )
    throw new BadRequestException(
      'Columnas o delimitador incompatibles. Usá la plantilla UTF-8 separada por punto y coma o su versión XLSX.',
    );
  if (grid.length < 2)
    throw new BadRequestException('El archivo no contiene filas de carga.');
  const first = grid
    .slice(1)
    .find((r, i) => r.some((v) => v.length) || numericAmounts.has(i + 2));
  if (!first || first.length !== 7) throw invalidFile();
  const id = first[0].trim(),
    stamp = first[1].trim(),
    rows: ImportRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r.some((v) => v.length) && !numericAmounts.has(i + 1)) continue;
    if (r.length !== 7) throw invalidFile();
    if (r.some((v) => v.length > IMPORT_LIMITS.cell)) throw tooLarge();
    if (!id || !stamp || r[0].trim() !== id || r[1].trim() !== stamp)
      throw new BadRequestException(
        'Metadatos inconsistentes entre filas. Descargá una plantilla nueva.',
      );
    rows.push({
      row: i + 1,
      code: r[2],
      amount: r[5],
      quantity: r[6],
      ...(numericAmounts.has(i + 1)
        ? { amountIssue: NUMERIC_AMOUNT_ISSUE }
        : {}),
    });
  }
  if (metadata && (metadata.id !== id || metadata.stamp !== stamp))
    throw new BadRequestException(
      'Metadatos XLSX incompatibles con la hoja Carga.',
    );
  return { id, stamp, rows, format };
}

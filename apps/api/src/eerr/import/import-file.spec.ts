import JSZip from 'jszip';
import ExcelJS from '@protobi/exceljs';
import { randomUUID } from 'node:crypto';
import {
  initialNodes,
  emptyAmount,
  IMPORT_COLUMNS,
  IMPORT_LIMITS,
  importPlan,
} from '@puro-origen/domain';
import {
  createImportTemplate,
  readImportFile,
  type TemplateContext,
} from './import-file.js';
import { readCsv, csvEscape } from './csv.js';
import { inspectXlsx } from './file-safety.js';
const context = (): TemplateContext => {
  const nodes = initialNodes([], randomUUID);
  nodes.push({
    nodeId: randomUUID(),
    code: randomUUID(),
    kind: 'ITEM',
    name: '=Nombre; "seguro"',
    parentId: nodes[0].nodeId,
    position: 0,
    amount: emptyAmount(),
  });
  return {
    id: randomUUID(),
    branchName: 'Sucursal ficticia',
    year: 2026,
    month: 9,
    revision: 3,
    stamp: 'fixture-stamp',
    structure: {
      schemaVersion: 1,
      structureVersion: 3,
      initializedAt: '2026-09-01T12:00:00Z',
      initializedBy: 'fixture',
      nodes,
    },
  };
};
const file = (
  buffer: Buffer,
  ext = 'csv',
  mimetype = ext === 'csv'
    ? 'text/csv'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
) => ({ buffer, originalname: 'carga.' + ext, mimetype });
async function book() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    new Uint8Array(await createImportTemplate('xlsx', context())).buffer,
  );
  return wb;
}
async function bytes(w: ExcelJS.Workbook) {
  return Buffer.from(await w.xlsx.writeBuffer());
}
async function xlsxWithAmount(value: string | number | null) {
  const c = context();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    new Uint8Array(await createImportTemplate('xlsx', c)).buffer,
  );
  wb.getWorksheet('Carga')!.getCell('F2').value = value;
  const parsed = await readImportFile(file(await bytes(wb), 'xlsx'));
  return { c, parsed, plan: importPlan(c.structure, parsed.rows) };
}
describe('Archivos de importación aislados', () => {
  it('CSV BOM, delimitador, comillas e injection, con reapertura', async () => {
    const c = context(),
      buffer = await createImportTemplate('csv', c);
    expect(buffer.subarray(0, 3)).toEqual(Buffer.from([239, 187, 191]));
    const grid = readCsv(buffer);
    expect(grid[0]).toEqual(IMPORT_COLUMNS);
    expect(grid[1][3]).toBe("'" + c.structure.nodes[3].name);
    const parsed = await readImportFile(file(buffer));
    expect(parsed.rows[0].code).toBe(c.structure.nodes[3].code);
    expect(parsed.rows[0].amount).toBe('');
  });
  it('CSV conserva delimitadores, comillas y saltos entre comillas', () => {
    expect(readCsv(Buffer.from('a;"b;c";"d""e";"f\ng"\r\n'))).toEqual([
      ['a', 'b;c', 'd"e', 'f\ng'],
    ]);
  });
  it('XLSX tiene hojas, metadata, estilos y entradas texto, con reapertura real', async () => {
    const wb = await book(),
      sheet = wb.getWorksheet('Carga')!;
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      'Instrucciones',
      'Carga',
    ]);
    expect(wb.getWorksheet('Instrucciones')!.getCell('B5').value).toBe(
      'fixture-stamp',
    );
    expect(sheet.getCell('F2').numFmt).toBe('@');
    expect(sheet.getColumn(6).numFmt).toBe('@');
    expect(wb.getWorksheet('Instrucciones')!.getCell('B7').value).toContain(
      'texto',
    );
    expect(sheet.getCell('C2').fill).not.toEqual(sheet.getCell('F2').fill);
    sheet.getCell('F2').value = ' (1+2) / 3 ';
    sheet.getCell('G2').value = 0;
    const p = await readImportFile(file(await bytes(wb), 'xlsx'));
    expect(p.rows[0]).toMatchObject({ amount: ' (1+2) / 3 ', quantity: '0' });
  });
  it.each([0, 1500, 1500.25])(
    'XLSX rechaza importe numérico %s por fila y campo',
    async (amount) => {
      const { parsed, plan } = await xlsxWithAmount(amount);
      expect(parsed.rows[0].amount).toBe('');
      expect(plan.issues).toEqual([
        {
          row: 2,
          field: 'importe_o_expresion',
          message: expect.stringContaining(
            'Cambiá el formato de la celda a Texto',
          ),
        },
      ]);
      expect(plan.changes).toHaveLength(0);
      expect(plan.rows[0].after.amount.state).toBe('SIN_CARGAR');
    },
  );
  it('reporta el importe numérico aunque el código del ítem también sea inválido', async () => {
    const c = context();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      new Uint8Array(await createImportTemplate('xlsx', c)).buffer,
    );
    wb.getWorksheet('Carga')!.getCell('C2').value = randomUUID();
    wb.getWorksheet('Carga')!.getCell('F2').value = 0;
    const parsed = await readImportFile(file(await bytes(wb), 'xlsx'));
    expect(
      importPlan(c.structure, parsed.rows).issues.map((i) => i.field),
    ).toEqual(['importe_o_expresion', 'codigo_item']);
  });
  it('rechaza el literal numérico largo del XML sin aproximarlo a 0.005 ni planificar 0.01', async () => {
    const c = context();
    const zip = await JSZip.loadAsync(await createImportTemplate('xlsx', c));
    const path = 'xl/worksheets/sheet2.xml';
    const xml = await zip.file(path)!.async('string');
    const changed = xml.replace(
      /<c r="F2"[^>]*>.*?<\/c>/,
      '<c r="F2"><v>0.004999999999999999999</v></c>',
    );
    expect(changed).not.toBe(xml);
    zip.file(path, changed);
    const parsed = await readImportFile(
      file(await zip.generateAsync({ type: 'nodebuffer' }), 'xlsx'),
    );
    const plan = importPlan(c.structure, parsed.rows);
    expect(plan.issues).toMatchObject([
      { row: 2, field: 'importe_o_expresion' },
    ]);
    expect(JSON.stringify({ parsed, plan })).not.toContain('0.005');
    expect(JSON.stringify(plan)).not.toContain('0.01');
    expect(plan.changes).toHaveLength(0);
  });
  it.each([
    ['0', '0.00'],
    ['1500', '1500.00'],
    ['1500,25', '1500.25'],
    ['1500.25', '1500.25'],
    ['1000+500', '1500.00'],
  ])('XLSX admite importe textual %s sin pérdida', async (amount, expected) => {
    const { parsed, plan } = await xlsxWithAmount(amount);
    expect(parsed.rows[0].amount).toBe(amount);
    expect(plan.issues).toEqual([]);
    expect(plan.changes[0].amount?.value).toBe(expected);
  });
  it('XLSX admite SIN_CARGAR textual y celda vacía conserva', async () => {
    const c = context();
    c.structure.nodes[3].amount = {
      state: 'CARGADO',
      input: '5',
      value: '5.00',
      currency: 'ARS',
      scale: 2,
    };
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      new Uint8Array(await createImportTemplate('xlsx', c)).buffer,
    );
    wb.getWorksheet('Carga')!.getCell('F2').value = 'SIN_CARGAR';
    let parsed = await readImportFile(file(await bytes(wb), 'xlsx'));
    expect(importPlan(c.structure, parsed.rows).changes[0].amount?.state).toBe(
      'SIN_CARGAR',
    );
    wb.getWorksheet('Carga')!.getCell('F2').value = '';
    parsed = await readImportFile(file(await bytes(wb), 'xlsx'));
    expect(importPlan(c.structure, parsed.rows).changes).toEqual([]);
  });
  it.each([
    0,
    3,
    1.5,
    999999999999,
    1000000000000,
    Number.MAX_SAFE_INTEGER + 1,
  ])('cantidad numérica %s respeta entero y rango', async (quantity) => {
    const c = context();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      new Uint8Array(await createImportTemplate('xlsx', c)).buffer,
    );
    wb.getWorksheet('Carga')!.getCell('G2').value = quantity;
    const parsed = await readImportFile(file(await bytes(wb), 'xlsx'));
    const plan = importPlan(c.structure, parsed.rows);
    if (
      Number.isInteger(quantity) &&
      quantity >= 0 &&
      quantity <= 999999999999
    ) {
      expect(plan.issues).toEqual([]);
      expect(plan.changes[0].quantity?.value).toBe(String(quantity));
    } else expect(plan.issues).toMatchObject([{ row: 2, field: 'cantidad' }]);
  });
  it('CSV mantiene importe textual y semántica de cero', async () => {
    const c = context();
    const grid = readCsv(await createImportTemplate('csv', c));
    grid[1][5] = '0';
    const parsed = await readImportFile(
      file(
        Buffer.from(grid.map((r) => r.map(csvEscape).join(';')).join('\r\n')),
      ),
    );
    expect(importPlan(c.structure, parsed.rows).changes[0].amount?.value).toBe(
      '0.00',
    );
  });
  it('plantillas excluyen archivados', async () => {
    const c = context();
    c.structure.nodes[3].archive = {
      state: 'ARCHIVED',
      at: '2026-09-01T12:00:00Z',
      by: 'fixture',
    };
    expect(readCsv(await createImportTemplate('csv', c))).toHaveLength(1);
  });
  it.each(['xls', 'xlsm', 'txt', 'csv.exe'])(
    'rechaza extensión %s',
    async (ext) => {
      await expect(
        readImportFile(file(Buffer.from('x'), ext)),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
  it('MIME falso no habilita contenido inválido', async () => {
    await expect(
      readImportFile(file(Buffer.from('PNG'), 'xlsx')),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      readImportFile(
        file(await createImportTemplate('csv', context()), 'csv', 'image/png'),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it.each(['', 'a,b,c', 'a\tb\tc', '"sin cerrar', 'a;"ok"oops'])(
    'CSV inválido %s',
    async (input) => {
      await expect(
        readImportFile(file(Buffer.from(input))),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
  it('rechaza UTF-16 y UTF-8 inválido sin adivinar locale', async () => {
    for (const buffer of [
      Buffer.from([255, 254, 0, 0]),
      Buffer.from([0xc3, 0x28]),
    ])
      await expect(readImportFile(file(buffer))).rejects.toMatchObject({
        status: 400,
      });
  });
  it('límites comprimido, filas y longitud de celda', async () => {
    await expect(
      readImportFile(file(Buffer.alloc(IMPORT_LIMITS.fileBytes + 1))),
    ).rejects.toMatchObject({ status: 413 });
    expect(() => readCsv(Buffer.from('a;b\n'.repeat(1002)))).toThrow();
    expect(() => readCsv(Buffer.from('a'.repeat(2049)))).toThrow();
  });
  it.each([
    'formula',
    'cachedFormula',
    'missingSheet',
    'metadata',
    'extraSheet',
    'externalLink',
    'date',
    'oversizedCell',
    'expanded',
  ])('XLSX rechaza %s', async (kind) => {
    const wb = await book(),
      sheet = wb.getWorksheet('Carga')!;
    if (kind === 'formula') sheet.getCell('F2').value = { formula: '1+2' };
    if (kind === 'cachedFormula')
      sheet.getCell('F2').value = { formula: '1+2', result: 3 };
    if (kind === 'missingSheet') sheet.name = 'Otra';
    if (kind === 'metadata')
      wb.getWorksheet('Instrucciones')!.getCell('B4').value = randomUUID();
    if (kind === 'extraSheet') wb.addWorksheet('Otra');
    if (kind === 'externalLink')
      sheet.getCell('F2').value = {
        text: 'enlace',
        hyperlink: 'https://example.invalid',
      };
    if (kind === 'date') {
      sheet.getCell('F2').value = new Date('2026-01-01T12:00:00Z');
      sheet.getCell('F2').numFmt = 'yyyy-mm-dd';
    }
    if (kind === 'oversizedCell') sheet.getCell('F2').value = '1'.repeat(2049);
    if (kind === 'expanded')
      sheet.getCell('F2').value = 'a'.repeat(IMPORT_LIMITS.expandedBytes + 1);
    await expect(
      readImportFile(file(await bytes(wb), 'xlsx')),
    ).rejects.toMatchObject({
      status: ['extraSheet', 'oversizedCell', 'expanded'].includes(kind)
        ? 413
        : 400,
    });
  });
  it('rechaza inconsistencias entre filas y columnas adicionales', async () => {
    const c = context(),
      grid = readCsv(await createImportTemplate('csv', c));
    grid.push([...grid[1]]);
    grid[2][0] = randomUUID();
    await expect(
      readImportFile(
        file(
          Buffer.from(grid.map((r) => r.map(csvEscape).join(';')).join('\n')),
        ),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('libro inválido no expone mensajes internos', async () => {
    await expect(
      inspectXlsx(Buffer.from([80, 75, 3, 4, 0, 0])),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Archivo incompatible'),
    });
  });
});

describe('Coordenadas y contenido activo', () => {
  it.each(['sparse', 'macro', 'doctype'])(
    'rechaza %s antes de cargar ExcelJS',
    async (kind) => {
      const zip = await JSZip.loadAsync(
        await createImportTemplate('xlsx', context()),
      );
      if (kind === 'macro') zip.file('xl/vbaProject.bin', 'fixture');
      else {
        const path = 'xl/worksheets/sheet2.xml';
        let xml = await zip.file(path)!.async('string');
        xml =
          kind === 'sparse'
            ? xml.replace('r="2"', 'r="999999999"')
            : xml.replace(
                '<worksheet',
                '<!DOCTYPE worksheet [<!ENTITY x "test">]><worksheet',
              );
        zip.file(path, xml);
      }
      await expect(
        readImportFile(
          file(await zip.generateAsync({ type: 'nodebuffer' }), 'xlsx'),
        ),
      ).rejects.toMatchObject({ status: kind === 'sparse' ? 413 : 400 });
    },
  );
  it('conserva el número de fila después de una fila vacía', async () => {
    const grid = readCsv(await createImportTemplate('csv', context()));
    const buffer = Buffer.from(
      [
        grid[0].map(csvEscape).join(';'),
        '',
        grid[1].map(csvEscape).join(';'),
      ].join('\n'),
    );
    expect((await readImportFile(file(buffer))).rows[0].row).toBe(3);
  });
  it('rechaza una primera fila incompleta con error controlado', async () => {
    const buffer = Buffer.from(IMPORT_COLUMNS.join(';') + '\nsolo');
    await expect(readImportFile(file(buffer))).rejects.toMatchObject({
      status: 400,
    });
  });
});

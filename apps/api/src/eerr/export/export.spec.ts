import { randomUUID } from 'node:crypto';
import ExcelJS from '@protobi/exceljs';
import JSZip from 'jszip';
import {
  initialNodes,
  emptyAmount,
  type EerrStructure,
} from '@puro-origen/domain';
import { CALCULATION_VERSION } from '@puro-origen/calculation-engine';
import { describe, expect, it } from 'vitest';
import { EerrLoadStatus } from '../schemas/eerr.schema.js';
import { buildEerrExportViewModel } from './export-view-model.js';
import {
  ExportPrecisionError,
  monetaryExcelNumber,
  renderEerrXlsx,
} from './export-xlsx.js';
import { exportFilename } from './export.service.js';

async function reopen(model: ReturnType<typeof fixture>) {
  const buffer = await renderEerrXlsx(model);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(new Uint8Array(buffer).buffer);
  return { buffer, sheet: book.getWorksheet('EERR')! };
}

function namedCell(sheet: ExcelJS.Worksheet, name: string): ExcelJS.Cell {
  const row = (sheet.getRows(1, sheet.rowCount) ?? []).find(
    (candidate) => candidate.getCell(1).value === name,
  );
  if (!row) throw new Error(`Fila ausente: ${name}`);
  return row.getCell(2);
}

function exactCents(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  const sign = whole!.startsWith('-') ? -1n : 1n;
  return BigInt(whole!) * 100n + sign * BigInt(fraction.padEnd(2, '0'));
}

function fixture(
  complete = false,
  historicalName = '=Cero',
  largeNegative = false,
) {
  const nodes = initialNodes([], randomUUID);
  const category = {
    nodeId: randomUUID(),
    code: randomUUID(),
    parentId: nodes[0].nodeId,
    position: 0,
    name: '+Categoría',
    kind: 'CATEGORY' as const,
  };
  nodes.push(category);
  nodes.push({
    nodeId: randomUUID(),
    code: randomUUID(),
    parentId: category.nodeId,
    position: 1,
    name: '-Pendiente',
    kind: 'ITEM',
    amount: complete
      ? { ...emptyAmount(), state: 'CARGADO', input: '100', value: '100.00' }
      : emptyAmount(),
    note: '@nota',
    quantityEnabled: true,
    quantity: { state: 'SIN_CARGAR', value: null },
  });
  nodes.push({
    nodeId: randomUUID(),
    code: randomUUID(),
    parentId: category.nodeId,
    position: 0,
    name: historicalName,
    kind: 'ITEM',
    amount: { ...emptyAmount(), state: 'CARGADO', input: '0', value: '0.00' },
    quantityEnabled: true,
    quantity: { state: 'CARGADO', value: '7' },
    unit: 'u',
    note: '=SUM(1,1)',
  });
  nodes.push({
    nodeId: randomUUID(),
    code: randomUUID(),
    parentId: category.nodeId,
    position: 2,
    name: 'Archivado',
    kind: 'ITEM',
    amount: emptyAmount(),
    archive: { state: 'ARCHIVED', at: '2026-09-01T00:00:00Z', by: 'test' },
  });
  if (complete)
    for (const [root, value] of [
      [nodes[1]!, '20.00'],
      [nodes[2]!, '10.00'],
    ] as const)
      nodes.push({
        nodeId: randomUUID(),
        code: randomUUID(),
        parentId: root.nodeId,
        position: 0,
        name: 'Otro',
        kind: 'ITEM',
        amount: { ...emptyAmount(), state: 'CARGADO', input: value, value },
      });
  if (largeNegative)
    for (let index = 0; index < 10; index++)
      nodes.push({
        nodeId: randomUUID(),
        code: randomUUID(),
        parentId: nodes[1]!.nodeId,
        position: index + 1,
        name: `Costo grande ${index}`,
        kind: 'ITEM',
        amount: {
          ...emptyAmount(),
          state: 'CARGADO',
          input: '999999999999.99',
          value: '999999999999.99',
        },
      });
  const structure: EerrStructure = {
    schemaVersion: 1,
    structureVersion: 1,
    initializedAt: '2026-09-01T00:00:00Z',
    initializedBy: 'test',
    nodes,
  };
  return buildEerrExportViewModel({
    branchName: 'CALLE 13',
    year: 2026,
    month: 9,
    lifecycleStatus: 'CLOSED',
    loadStatus: complete ? EerrLoadStatus.CARGADO : EerrLoadStatus.PARCIAL,
    revision: 4,
    periodNote: 'Nota del período',
    structure,
    salesGoal: complete
      ? { mode: 'NET_MARGIN_PERCENT', value: '20.0000' }
      : null,
  });
}

describe('exportación XLSX individual', () => {
  it('construye filas ordenadas del snapshot activo, v3 y estados distintos', () => {
    const model = fixture();
    expect(model.analysis.calculationVersion).toBe(CALCULATION_VERSION);
    expect(model.rows.slice(0, 4).map((row) => [row.label, row.depth])).toEqual(
      [
        ['INGRESOS', 0],
        ['+Categoría', 1],
        ['=Cero', 2],
        ['-Pendiente', 2],
      ],
    );
    expect(model.rows.some((row) => row.label === 'Archivado')).toBe(false);
    expect(model.rows[2]?.amount).toEqual({ status: 'CARGADO', value: '0.00' });
    expect(model.rows[3]?.amount).toEqual({
      status: 'SIN_CARGAR',
      value: null,
    });
    expect(model.analysis.metrics.netResult.status).toBe('BLOCKED');
    expect(model.periodNote).toBe('Nota del período');
  });

  it('reabre números, porcentajes, cantidad, estado parcial y texto hostil sin fórmulas', async () => {
    const buffer = await renderEerrXlsx(fixture());
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(new Uint8Array(buffer).buffer);
    const sheet = book.getWorksheet('EERR')!;
    expect(book.worksheets).toHaveLength(1);
    expect(sheet.getCell('B4').value).toBe('Cerrado');
    expect(sheet.getCell('B5').value).toBe('Parcial');
    expect(sheet.getCell('B6').value).toBe(4);
    expect(sheet.getCell('B7').value).toBe(3);
    expect(sheet.getCell('B8').value).toBe('Nota del período');
    const zero = sheet.getRow(13);
    expect(zero.getCell(1).value).toBe('=Cero');
    expect(zero.getCell(1).alignment?.indent).toBe(2);
    expect(zero.getCell(2).value).toBe(0);
    expect(zero.getCell(4).value).toBe(7);
    expect(zero.getCell(6).value).toBe('=SUM(1,1)');
    expect(sheet.getRow(14).getCell(2).value).toBe('Sin cargar');
    expect(sheet.getRow(14).getCell(4).value).toBe('Sin cargar');
    for (const row of sheet.getRows(1, sheet.rowCount) ?? [])
      row.eachCell({ includeEmpty: true }, (cell) => {
        expect(
          cell.value === null ||
            typeof cell.value !== 'object' ||
            !('formula' in cell.value),
        ).toBe(true);
      });
    const xml = await (
      await JSZip.loadAsync(buffer)
    )
      .file('xl/worksheets/sheet1.xml')!
      .async('string');
    expect(xml).not.toMatch(/<f(?:\s|>)/);
  });

  it.each([
    '0',
    '0.01',
    '0.10',
    '1.23',
    '-0.01',
    '9999999999999.99',
    '10000000000000.00',
    '10000000000000.10',
    '100000000000000.00',
    '-9999999999999.99',
  ])('conserva %s a centavos después de reabrir XLSX', async (value) => {
    const model = fixture(true);
    model.rows[2]!.amount = { status: 'CARGADO', value };
    const { sheet } = await reopen(model);
    const reopened = sheet.getRow(13).getCell(2).value;
    expect(reopened).toBe(monetaryExcelNumber(value));
    expect(reopened).toBe(Number(value));
    expect(exactCents(String(reopened))).toBe(exactCents(value));
    expect(sheet.getRow(13).getCell(2).numFmt).toContain('0.00');
  });

  it.each(['10000000000000.01', '10000000000000.25', '100000000000000.01'])(
    'rechaza %s si Excel no conserva su precisión significativa',
    async (value) => {
      const model = fixture(true);
      model.rows[2]!.amount = { status: 'CARGADO', value };
      await expect(renderEerrXlsx(model)).rejects.toThrow(ExportPrecisionError);
    },
  );

  it('preserva un resultado neto negativo grande calculado por el motor', async () => {
    const model = fixture(true, '=Cero', true);
    const calculated = model.analysis.metrics.netResult;
    expect(calculated.status).toBe('COMPLETE');
    expect(calculated.value).toBe('-9999999999929.90');
    const { sheet } = await reopen(model);
    expect(namedCell(sheet, 'Resultado Neto $').value).toBe(
      monetaryExcelNumber(calculated.value!),
    );
    expect(exactCents(String(namedCell(sheet, 'Resultado Neto $').value))).toBe(
      exactCents(calculated.value!),
    );
  });

  it('protege el nombre de archivo frente a texto hostil y longitudes grandes', () => {
    expect(exportFilename('Calle 13 / Ñá\r\n', 2026, 9)).toBe(
      'EERR_CALLE-13-NA_2026-09.xlsx',
    );
    for (const name of [
      'Ñá Unicode 😀',
      '  espacios   repetidos  ',
      '../\\\"\r\n.xlsx',
      'A'.repeat(500),
      '東京',
    ]) {
      const filename = exportFilename(name, 2026, 9);
      expect(filename).toBe(exportFilename(name, 2026, 9));
      expect(filename.length).toBeLessThanOrEqual(66);
      expect(filename).toMatch(/^EERR_[A-Z0-9-]+_2026-09\.xlsx$/);
      expect(filename).not.toContain('..');
      expect(filename.match(/\.xlsx/g)).toHaveLength(1);
    }
  });

  it('mantiene cantidad cero como número y porcentajes de 0, negativos y mayores a 100', async () => {
    const model = fixture(true);
    model.rows[2]!.quantity = { status: 'CARGADO', value: '0' };
    const percentages = model.indicators.filter(
      (row) => row.unit === 'PERCENT',
    );
    expect(percentages.length).toBeGreaterThanOrEqual(3);
    for (const [index, value] of ['0.0000', '-12.5000', '125.0000'].entries())
      percentages[index]!.result = { status: 'COMPLETE', value };
    const { sheet } = await reopen(model);
    expect(sheet.getRow(13).getCell(4).value).toBe(0);
    for (const [index, value] of [0, -0.125, 1.25].entries()) {
      const cell = namedCell(sheet, percentages[index]!.label);
      expect(cell.value).toBe(value);
      expect(cell.numFmt).toBe('0.00%');
    }
    expect(namedCell(sheet, 'Objetivo de Ventas').value).not.toBe('0');
  });

  it('preserva texto de usuario de todas las fuentes sin fórmulas', async () => {
    const model = fixture(true);
    model.branchName = '=sucursal';
    model.periodNote = '+período';
    model.rows[1]!.label = '-categoría';
    model.rows[2]!.label = '@ítem';
    model.rows[2]!.note = '=nota';
    model.rows[2]!.unit = '+unidad';
    const { buffer, sheet } = await reopen(model);
    for (const [address, value] of [
      ['B2', '=sucursal'],
      ['B8', '+período'],
      ['A12', '-categoría'],
      ['A13', '@ítem'],
      ['E13', '+unidad'],
      ['F13', '=nota'],
    ])
      expect(sheet.getCell(address!).value).toBe(value);
    for (const row of sheet.getRows(1, sheet.rowCount) ?? [])
      row.eachCell((cell) => expect(cell.formula).toBeUndefined());
    const xml = await (
      await JSZip.loadAsync(buffer)
    )
      .file('xl/worksheets/sheet1.xml')!
      .async('string');
    expect(xml).not.toMatch(/<f(?:\s|>)/);
  });

  it('exporta el nombre histórico del snapshot y preserva notas extensas con saltos', async () => {
    const templateActual = { name: 'Nombre actual B' };
    const model = fixture(true, 'Nombre histórico A');
    model.periodNote = `Período áéíóú\n${'Línea extensa '.repeat(180)}`;
    model.rows[2]!.note = `Ítem ñ\n${'Nota extensa '.repeat(180)}`;
    const { sheet } = await reopen(model);
    expect(templateActual.name).toBe('Nombre actual B');
    expect(sheet.getCell('A13').value).toBe('Nombre histórico A');
    expect(sheet.getCell('A13').value).not.toBe(templateActual.name);
    expect(sheet.getCell('B8').value).toBe(model.periodNote);
    expect(sheet.getCell('F13').value).toBe(model.rows[2]!.note);
    expect(sheet.getCell('B8').alignment?.wrapText).toBe(true);
    expect(sheet.getCell('F13').alignment?.wrapText).toBe(true);
  });

  it('escribe porcentajes reales y métricas v3 calculadas, sin fórmulas', async () => {
    const model = fixture(true);
    expect(model.analysis.metrics.netResult.value).toBe('70.00');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(new Uint8Array(await renderEerrXlsx(model)).buffer);
    const sheet = book.getWorksheet('EERR')!;
    const rows = sheet.getRows(1, sheet.rowCount) ?? [];
    const net = rows.find(
      (row) => row.getCell(1).value === 'Resultado Neto $',
    )!;
    const percent = rows.find(
      (row) => row.getCell(1).value === 'Resultado Neto %',
    )!;
    const target = rows.find(
      (row) => row.getCell(1).value === 'Objetivo de Ventas',
    )!;
    expect(net.getCell(2).value).toBe(70);
    expect(percent.getCell(2).value).toBe(0.7);
    expect(percent.getCell(2).numFmt).toBe('0.00%');
    expect(target.getCell(2).value).toBe(37.5);
  });

  it('presenta un EERR sin estructura sin inventar cifras', async () => {
    const model = buildEerrExportViewModel({
      branchName: 'Sin estructura',
      year: 2026,
      month: 9,
      lifecycleStatus: 'OPEN',
      loadStatus: EerrLoadStatus.SIN_CARGAR,
      revision: 0,
      periodNote: null,
      structure: null,
      salesGoal: null,
    });
    expect(model.rows).toEqual([]);
    expect(model.analysis.initialized).toBe(false);
    expect(model.indicators).toHaveLength(12);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(new Uint8Array(await renderEerrXlsx(model)).buffer);
    const sheet = book.getWorksheet('EERR')!;
    const net = (sheet.getRows(1, sheet.rowCount) ?? []).find(
      (row) => row.getCell(1).value === 'Resultado Neto $',
    )!;
    const income = (sheet.getRows(1, sheet.rowCount) ?? []).find(
      (row) => row.getCell(1).value === 'Ingresos',
    )!;
    expect(income.getCell(2).value).toBe('Bloqueado — EERR sin estructura');
    expect(net.getCell(2).value).toBe('Bloqueado — EERR sin estructura');
  });
});

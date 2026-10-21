import ExcelJS from '@protobi/exceljs';
import type { EerrExportViewModel, ExportValue } from './export-view-model.js';

export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MONEY_FORMAT = '#,##0.00;[Red]-#,##0.00';
const PERCENT_FORMAT = '0.00%';
// Excel conserva como máximo 15 dígitos significativos del valor, no de sus centavos.
const EXCEL_SIGNIFICANT_DIGITS = 15;
export class ExportPrecisionError extends Error {}

function decimalUnits(value: string, scale: number): bigint | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match || (match[3]?.length ?? 0) > scale) return null;
  const units =
    BigInt(match[2]!) * 10n ** BigInt(scale) +
    BigInt((match[3] ?? '').padEnd(scale, '0'));
  return match[1] === '-' ? -units : units;
}

function significantDigits(value: string): number {
  const digits = value
    .replace(/[-.]/g, '')
    .replace(/^0+/, '')
    .replace(/0+$/, '');
  return digits.length || 1;
}

/** Excel stores IEEE-754 numbers. Reject amounts whose cents cannot round-trip safely. */
export function monetaryExcelNumber(value: string): number {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value))
    throw new Error('Importe no canónico');
  const cents = decimalUnits(value, 2)!;
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    significantDigits(value) > EXCEL_SIGNIFICANT_DIGITS ||
    decimalUnits(number.toString(), 2) !== cents
  )
    throw new ExportPrecisionError(
      'Importe fuera de la precisión monetaria segura de Excel',
    );
  return number;
}

function percentageExcelNumber(value: string): number {
  if (!/^-?\d+\.\d{4}$/.test(value))
    throw new Error('Porcentaje persistido inválido');
  const units = BigInt(value.replace('.', ''));
  if (significantDigits(value) > EXCEL_SIGNIFICANT_DIGITS)
    throw new ExportPrecisionError(
      'Porcentaje fuera de la precisión segura de Excel',
    );
  const fraction = Number(value) / 100;
  if (
    !Number.isFinite(fraction) ||
    Math.round(fraction * 1_000_000) !== Number(units)
  )
    throw new ExportPrecisionError(
      'Porcentaje fuera de la precisión segura de Excel',
    );
  return fraction;
}

function quantityExcelNumber(value: string): number {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error('Cantidad persistida inválida');
  return Number(value);
}

function stateLabel(status: string, reason?: string | null): string {
  const states: Record<string, string> = {
    CARGADO: 'Cargado',
    SIN_CARGAR: 'Sin cargar',
    COMPLETE: 'Completo',
    PARTIAL: 'Parcial',
    PENDING: 'Pendiente',
    EMPTY: 'Vacío',
    BLOCKED: 'Bloqueado',
    NOT_CALCULABLE: 'No calculable',
  };
  const reasons: Record<string, string> = {
    UNINITIALIZED: 'EERR sin estructura',
    PENDING_INPUTS: 'Importes pendientes',
    EMPTY_INPUT: 'Sin importes',
    ZERO_DENOMINATOR: 'Denominador cero',
    ZERO_REVENUE: 'Ingresos cero',
    NON_POSITIVE_CONTRIBUTION_MARGIN: 'Margen de contribución no positivo',
    GOAL_NOT_CONFIGURED: 'Meta sin configurar',
    TARGET_MARGIN_UNATTAINABLE: 'Meta de margen inalcanzable',
    NON_POSITIVE_TARGET: 'Objetivo no positivo',
  };
  return `${states[status] ?? status}${reason ? ` — ${reasons[reason] ?? reason}` : ''}`;
}

function setAmount(
  cell: ExcelJS.Cell,
  value: ExportValue,
  unit: 'ARS' | 'PERCENT' = 'ARS',
): void {
  if (value.value === null) cell.value = stateLabel(value.status, value.reason);
  else {
    cell.value =
      unit === 'PERCENT'
        ? percentageExcelNumber(value.value)
        : monetaryExcelNumber(value.value);
    cell.numFmt = unit === 'PERCENT' ? PERCENT_FORMAT : MONEY_FORMAT;
  }
}

export async function renderEerrXlsx(
  model: EerrExportViewModel,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('EERR');
  sheet.columns = [
    { width: 46 },
    { width: 22 },
    { width: 36 },
    { width: 18 },
    { width: 18 },
    { width: 64 },
  ];
  sheet.addRow(['Estado de Resultados']);
  sheet.addRow(['Sucursal', model.branchName]);
  sheet.addRow([
    'Período',
    `${String(model.month).padStart(2, '0')}/${model.year}`,
  ]);
  sheet.addRow([
    'Ciclo de vida',
    model.lifecycleStatus === 'CLOSED' ? 'Cerrado' : 'Abierto',
  ]);
  sheet.addRow([
    'Estado de carga',
    { SIN_CARGAR: 'Sin cargar', PARCIAL: 'Parcial', CARGADO: 'Cargado' }[
      model.loadStatus
    ],
  ]);
  sheet.addRow(['Revisión', model.revision]);
  sheet.addRow(['Versión de cálculo', model.analysis.calculationVersion]);
  sheet.addRow(['Nota del período', model.periodNote ?? '']);
  sheet.getCell('B8').alignment = { wrapText: true, vertical: 'top' };
  sheet.addRow([]);
  const header = sheet.addRow([
    'Concepto',
    'Importe (ARS)',
    'Estado',
    'Cantidad',
    'Unidad',
    'Nota del ítem',
  ]);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF285343' },
  };
  sheet.views = [{ state: 'frozen', ySplit: header.number }];
  for (const item of model.rows) {
    const row = sheet.addRow([
      item.label,
      null,
      stateLabel(item.amount.status, item.amount.reason),
      null,
      item.unit ?? '',
      item.note ?? '',
    ]);
    row.getCell(1).alignment = { indent: item.depth, vertical: 'top' };
    row.getCell(6).alignment = { wrapText: true, vertical: 'top' };
    if (item.kind !== 'ITEM') row.font = { bold: true };
    setAmount(row.getCell(2), item.amount);
    if (item.quantity) {
      row.getCell(4).value =
        item.quantity.value === null
          ? stateLabel(item.quantity.status)
          : quantityExcelNumber(item.quantity.value);
    }
  }
  sheet.addRow([]);
  const summary = sheet.addRow(['Resumen financiero']);
  summary.font = { bold: true };
  for (const indicator of model.indicators) {
    const row = sheet.addRow([
      indicator.label,
      null,
      stateLabel(indicator.result.status, indicator.result.reason),
    ]);
    row.getCell(1).font = { bold: true };
    if (indicator.unit === 'TRAFFIC_LIGHT') {
      const colors: Record<string, string> = {
        RED: 'Rojo',
        YELLOW: 'Amarillo',
        GREEN: 'Verde',
        NEUTRAL: 'Neutral',
      };
      row.getCell(2).value = colors[indicator.result.value ?? ''] ?? 'Neutral';
    } else setAmount(row.getCell(2), indicator.result, indicator.unit);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

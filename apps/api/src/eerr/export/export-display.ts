import type { ExportValue } from './export-view-model.js';

export function stateLabel(status: string, reason?: string | null): string {
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

export function trafficLightLabel(value: ExportValue): string {
  if (value.status === 'NOT_CALCULABLE' || value.value === null)
    return `No disponible — ${stateLabel(value.status, value.reason)}`;
  return (
    {
      RED: 'Rojo',
      YELLOW: 'Amarillo',
      GREEN: 'Verde',
      NEUTRAL: 'No disponible',
    }[value.value] ?? 'No disponible'
  );
}

export function moneyLabel(value: string): string {
  const match = /^(-?)(\d+)\.(\d{2})$/.exec(value);
  if (!match) throw new Error('Importe persistido inválido');
  const integer = match[2]!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$ ${match[1] === '-' ? '-' : ''}${integer},${match[3]}`;
}

export function percentLabel(value: string): string {
  const match = /^(-?)(\d+)\.(\d{4})$/.exec(value);
  if (!match) throw new Error('Porcentaje persistido inválido');
  const units = BigInt(match[2]! + match[3]!);
  const rounded = (units + 50n) / 100n;
  const whole = rounded / 100n;
  const cents = String(rounded % 100n).padStart(2, '0');
  return `${match[1] === '-' && rounded !== 0n ? '-' : ''}${whole},${cents} %`;
}

export function displayValue(
  result: ExportValue,
  unit: 'ARS' | 'PERCENT' | 'QUANTITY',
): string {
  if (result.value === null) return stateLabel(result.status, result.reason);
  const formatted =
    unit === 'ARS'
      ? moneyLabel(result.value)
      : unit === 'PERCENT'
        ? percentLabel(result.value)
        : result.value;
  return result.status === 'PARTIAL' ? `${formatted} (Parcial)` : formatted;
}

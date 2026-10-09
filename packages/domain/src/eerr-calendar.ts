/** Calendario fijo del negocio; no depende del entorno de ejecución. */
export const EERR_TIME_ZONE = 'America/Argentina/Buenos_Aires';

export type EerrPeriod = Readonly<{ year: number; month: number }>;

/** Referencia inicial para comparaciones; conserva año y mes como valores de dominio. */
export function previousEerrPeriod(period: EerrPeriod): EerrPeriod {
  if (
    !Number.isInteger(period.year) ||
    period.year < 1 ||
    period.year > 9999 ||
    !Number.isInteger(period.month) ||
    period.month < 1 ||
    period.month > 12 ||
    (period.year === 1 && period.month === 1)
  )
    throw new RangeError('Período anterior fuera del calendario admitido');
  return period.month === 1
    ? { year: period.year - 1, month: 12 }
    : { year: period.year, month: period.month - 1 };
}

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: EERR_TIME_ZONE,
  calendar: 'gregory',
  numberingSystem: 'latn',
  year: 'numeric',
  month: 'numeric',
});

/** Extrae el mes del negocio de un instante; el período resultante no es una fecha. */
export function businessMonthAt(instant: Date): EerrPeriod {
  const parts = monthFormatter.formatToParts(instant);
  return {
    year: Number(parts.find((part) => part.type === 'year')!.value),
    month: Number(parts.find((part) => part.type === 'month')!.value),
  };
}

function comparePeriods(left: EerrPeriod, right: EerrPeriod): number {
  return left.year - right.year || left.month - right.month;
}

/** Recibe un período válido y un reloj explícito; no consulta la fecha real. */
export function eerrCalendarIssue(
  period: EerrPeriod,
  branchStart: Date,
  now: Date,
): 'FUTURE' | 'BEFORE_START' | null {
  if (comparePeriods(period, businessMonthAt(now)) > 0) return 'FUTURE';
  if (comparePeriods(period, businessMonthAt(branchStart)) < 0)
    return 'BEFORE_START';
  return null;
}

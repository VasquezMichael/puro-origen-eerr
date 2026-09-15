/** Calendario fijo del negocio; no depende del entorno de ejecución. */
export const EERR_TIME_ZONE = 'America/Argentina/Buenos_Aires';

export type EerrPeriod = Readonly<{ year: number; month: number }>;

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
  if (comparePeriods(period, businessMonthAt(branchStart)) < 0) return 'BEFORE_START';
  return null;
}

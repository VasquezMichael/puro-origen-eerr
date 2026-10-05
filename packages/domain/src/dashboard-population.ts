import { businessMonthAt, type EerrPeriod } from "./eerr-calendar.js";

export type DashboardPopulation =
  "EXPECTED" | "NOT_STARTED" | "INACTIVE_WITHOUT_HISTORY";

/** La baja no tiene fecha histórica: una inactiva solo participa si conserva un EERR. */
export function dashboardPopulation(
  period: EerrPeriod,
  startDate: Date,
  active: boolean,
  hasEerr: boolean,
): DashboardPopulation {
  if (!active) return hasEerr ? "EXPECTED" : "INACTIVE_WITHOUT_HISTORY";
  const start = businessMonthAt(startDate);
  return start.year > period.year ||
    (start.year === period.year && start.month > period.month)
    ? "NOT_STARTED"
    : "EXPECTED";
}

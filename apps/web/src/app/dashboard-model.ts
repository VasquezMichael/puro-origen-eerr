import { businessMonthAt } from "@puro-origen/domain";
import type { DashboardBranch, DashboardResponse } from "@puro-origen/shared-types";
import { formatAnalysisMoney } from "./eerr/[id]/analysis-format";

export type Period = { year: number; month: number };
export type DashboardSnapshot = { request: string; data: DashboardResponse; signature: string; error: "" } | { request: string; data: null; signature: null; error: string };
export function acceptsDashboardResponse(request: number, generation: number, aborted: boolean): boolean {
  return !aborted && request === generation;
}
export function visibleDashboard(snapshot: DashboardSnapshot | null, requestKey: string): DashboardResponse | null {
  return snapshot?.request === requestKey && snapshot.data && snapshot.signature === snapshot.data.sourceSignature ? snapshot.data : null;
}
export const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const currentPeriod = (now: Date): Period => businessMonthAt(now);
export const periodKey = ({ year, month }: Period) => `${year}-${month}`;
export function validPeriod(year: number, month: number): boolean {
  return Number.isInteger(year) && year >= 1 && year <= 9999 && Number.isInteger(month) && month >= 1 && month <= 12;
}
export function periodFromQuery(query: URLSearchParams, fallback: Period): Period {
  const years = query.getAll("year"), months = query.getAll("month");
  if (!years.length && !months.length) return fallback;
  if (years.length !== 1 || months.length !== 1 || !/^[1-9][0-9]{0,3}$/.test(years[0]) || !/^(?:[1-9]|1[0-2])$/.test(months[0])) return fallback;
  const year = Number(years[0]), month = Number(months[0]);
  return validPeriod(year, month) ? { year, month } : fallback;
}
export function queryIsCanonical(query: URLSearchParams, period: Period): boolean {
  return query.getAll("year").length === 1 && query.getAll("month").length === 1 && query.get("year") === String(period.year) && query.get("month") === String(period.month);
}
export const periodLabel = ({ year, month }: Period) => `${MONTHS[month - 1]} ${year}`;
export function formatDashboardMetric(value: string | null, unit: "ARS" | "PERCENT"): string {
  if (value === null) return "—";
  if (unit === "ARS") return formatAnalysisMoney(value);
  const match = /^(-?)(\d+)\.(\d{4})$/.exec(value);
  if (!match) throw new Error("Porcentaje de análisis inválido");
  return `${match[1]}${match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${match[3]} %`;
}
export function scopeLabel(scope: DashboardResponse["scope"]): string {
  return scope.type === "GLOBAL" ? "Consolidado global" : "Consolidado de mis sucursales accesibles";
}
export function branchStatus(branch: DashboardBranch): string {
  switch (branch.analysisStatus) {
    case "COMPLETE": return "Completo";
    case "PARTIAL": return "Parcial: hay importes pendientes";
    case "PENDING": return "Importes sin cargar";
    case "EMPTY": return "Sin ítems en un bloque requerido";
    case "UNINITIALIZED": return "Sin estructura";
    case "NO_EERR": return "Sin EERR";
    case "EXCLUDED": return branch.temporal === "NOT_STARTED" ? "Aún no iniciada en este período" : "Inactiva sin EERR histórico";
  }
}
export function metricReason(reason: string | null): string {
  switch (reason) {
    case "INCOMPLETE_SCOPE": return "La cobertura está incompleta.";
    case "NO_COMPLETE_SOURCES": return "Todavía no hay EERR completos para sumar.";
    case "ZERO_REVENUE": case "ZERO_DENOMINATOR": return "No calculable porque los ingresos son cero.";
    case "NON_POSITIVE_CONTRIBUTION_MARGIN": return "No calculable porque el margen de contribución no es positivo.";
    case "EMPTY_INPUT": return "Faltan ítems en un bloque requerido.";
    case "PENDING_INPUTS": return "Quedan importes sin cargar.";
    default: return "Dato no disponible.";
  }
}

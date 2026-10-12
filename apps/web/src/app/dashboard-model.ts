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
export function matchesDashboardMargin(data: DashboardResponse, margin: string): boolean {
  if (data.calculationVersion < 3 && data.consolidated.targetNetMargin === undefined) return true;
  return data.consolidated.targetNetMargin === margin.padEnd(margin.indexOf(".") + 5, "0");
}
export const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const currentPeriod = (now: Date): Period => businessMonthAt(now);
export const periodKey = ({ year, month }: Period) => `${year}-${month}`;
export type DashboardView = "summary" | "comparisons";
export const DEFAULT_TARGET_MARGIN = "0.20";
function canonicalTargetMargin(value: string): string {
  const [integer, fractional] = value.split(".");
  return `${integer}.${fractional!.replace(/0+$/, "").padEnd(2, "0")}`;
}
export function targetMarginFromQuery(query: URLSearchParams): string {
  const values = query.getAll("targetMargin");
  return values.length === 1 && /^(?:0|[1-9]\d{0,2})\.\d{1,4}$/.test(values[0]!) ? canonicalTargetMargin(values[0]!) : DEFAULT_TARGET_MARGIN;
}
export function marginInput(margin: string): string {
  const [whole, fraction] = margin.split(".");
  const digits = `${whole}${fraction!.padEnd(4, "0")}`;
  const hundredths = Number(digits);
  const scaled = String(Math.floor(hundredths / 100));
  const decimal = String(hundredths % 100).padStart(2, "0").replace(/0+$/, "") || "0";
  return `${scaled},${decimal}`;
}
export function marginFromInput(input: string): string | null {
  if (!/^(?:0|[1-9]\d{0,4})(?:[,.]\d{1,2})?$/.test(input)) return null;
  const [whole, fraction = ""] = input.replace(",", ".").split(".");
  const tenThousandths = Number(whole!) * 100 + Number(fraction.padEnd(2, "0"));
  const integer = Math.floor(tenThousandths / 10000);
  const decimals = String(tenThousandths % 10000).padStart(4, "0").replace(/0+$/, "") || "0";
  return canonicalTargetMargin(`${integer}.${decimals}`);
}
export function viewFromQuery(query: URLSearchParams): DashboardView {
  return query.getAll("view").length === 1 && query.get("view") === "comparisons" ? "comparisons" : "summary";
}
export function dashboardHref(period: Period, view: DashboardView, targetMargin = DEFAULT_TARGET_MARGIN): string {
  return `/?year=${period.year}&month=${period.month}&targetMargin=${targetMargin}${view === "comparisons" ? "&view=comparisons" : ""}`;
}
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
export function queryIsCanonical(query: URLSearchParams, period: Period, view: DashboardView = "summary", targetMargin = DEFAULT_TARGET_MARGIN): boolean {
  return query.getAll("year").length === 1 && query.getAll("month").length === 1 && query.get("year") === String(period.year) && query.get("month") === String(period.month)
    && query.getAll("targetMargin").length === 1 && query.get("targetMargin") === targetMargin
    && (view === "comparisons" ? query.getAll("view").length === 1 && query.get("view") === "comparisons" : !query.has("view"))
    && [...query.keys()].every((key) => ["year", "month", "view", "targetMargin"].includes(key));
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
    case "GOAL_NOT_CONFIGURED": return "No hay meta configurada para este EERR.";
    case "TARGET_MARGIN_UNATTAINABLE": return "Esta versión del análisis no pudo calcular la meta de margen.";
    case "NON_POSITIVE_TARGET": return "El Objetivo de Venta debe ser positivo.";
    case "UNINITIALIZED": return "El EERR no tiene estructura preparada.";
    default: return "Dato no disponible.";
  }
}
export function trafficLightLabel(value: "RED" | "YELLOW" | "GREEN" | "NEUTRAL"): string {
  return value === "RED" ? "Rojo" : value === "YELLOW" ? "Amarillo" : value === "GREEN" ? "Verde" : "Neutral";
}

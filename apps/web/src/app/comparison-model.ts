import { previousEerrPeriod } from "@puro-origen/domain";
import type { BranchPeriodComparisonResponse, ComparisonMetric, ComparisonMetricName, ComparisonReason, ComparisonSourceStatus, ConsolidatedPeriodComparisonResponse, TwoBranchComparisonResponse } from "@puro-origen/shared-types";
import { formatDashboardMetric, periodLabel, type Period } from "./dashboard-model";

export const initialReference = (period: Period): Period => previousEerrPeriod(period);
export const comparisonMetrics: readonly { name: ComparisonMetricName; label: string }[] = [
  { name: "income", label: "Ingresos" }, { name: "costs", label: "Costos" },
  { name: "grossMargin", label: "Margen bruto" }, { name: "grossMarginPercent", label: "Margen bruto %" },
  { name: "expenses", label: "Gastos generales" }, { name: "netResult", label: "Resultado neto" },
  { name: "netResultPercent", label: "Resultado neto %" }, { name: "breakEvenSales", label: "Punto de equilibrio" },
];
export function comparisonReason(reason: ComparisonReason | null): string {
  switch (reason) {
    case "CURRENT_NO_EERR": return "No existe un EERR en el período analizado.";
    case "REFERENCE_NO_EERR": return "No existe un EERR en la referencia.";
    case "CURRENT_UNINITIALIZED": case "REFERENCE_UNINITIALIZED": return "Uno de los EERR no tiene estructura inicializada.";
    case "CURRENT_EMPTY": case "REFERENCE_EMPTY": return "Un EERR no contiene ítems en un bloque requerido.";
    case "CURRENT_PENDING": case "REFERENCE_PENDING": return "Hay importes pendientes en uno de los EERR.";
    case "CURRENT_PARTIAL": case "REFERENCE_PARTIAL": return "Un EERR está incompleto; se requieren ambos completos.";
    case "CURRENT_INVALID": case "REFERENCE_INVALID": return "Una fuente contiene datos inválidos.";
    case "CURRENT_SUBTOTAL": case "REFERENCE_SUBTOTAL": return "La cobertura está incompleta; un subtotal no permite comparación definitiva.";
    case "CURRENT_EXCLUDED": case "REFERENCE_EXCLUDED": return "Una sucursal queda fuera de uno de los períodos.";
    case "CURRENT_NOT_CALCULABLE": case "REFERENCE_NOT_CALCULABLE": return "Este indicador no puede calcularse en ambos lados.";
    case "REFERENCE_NOT_POSITIVE": return "No se calcula variación porcentual porque la referencia es cero o negativa.";
    default: return "La comparación requiere información completa en ambos lados.";
  }
}
export function sourceStatus(status: ComparisonSourceStatus): string {
  switch (status) {
    case "COMPLETE": return "Completo"; case "PARTIAL": return "Incompleto: importes parciales";
    case "PENDING": return "Incompleto: importes pendientes"; case "EMPTY": return "Sin ítems requeridos";
    case "UNINITIALIZED": return "Sin estructura"; case "NO_EERR": return "Sin EERR";
    case "EXCLUDED": return "Fuera del período"; case "INVALID": return "Datos inválidos";
  }
}
export function formatComparisonValue(value: string | null, unit: ComparisonMetric["unit"]): string {
  return formatDashboardMetric(value, unit);
}
export function formatDifference(metric: ComparisonMetric): string {
  const value = metric.unit === "PERCENT" ? metric.percentagePointDifference : metric.absoluteDifference;
  if (value === null) return "—";
  const signed = `${value.startsWith("-") || /^0\.0+$/.test(value) ? "" : "+"}${formatDashboardMetric(value, metric.unit)}`;
  return metric.unit === "PERCENT" ? signed.replace(/ %$/, " pp") : signed;
}
export function formatVariation(metric: ComparisonMetric): string {
  return formatDashboardMetric(metric.relativeVariation, "PERCENT");
}
export function comparisonPath(kind: "branch-period" | "two-branches" | "consolidated", period: Period, reference: Period, branchId?: string, referenceBranchId?: string): string {
  const base = `year=${period.year}&month=${period.month}`;
  if (kind === "branch-period") return `/analytics/branches/${encodeURIComponent(branchId!)}/period-comparison?${base}&referenceYear=${reference.year}&referenceMonth=${reference.month}`;
  if (kind === "two-branches") return `/analytics/branches/compare?${base}&branchId=${encodeURIComponent(branchId!)}&referenceBranchId=${encodeURIComponent(referenceBranchId!)}`;
  return `/analytics/consolidated/compare?${base}&referenceYear=${reference.year}&referenceMonth=${reference.month}`;
}
export function matchesComparison(data: BranchPeriodComparisonResponse | TwoBranchComparisonResponse | ConsolidatedPeriodComparisonResponse, period: Period, reference: Period, branchId?: string, referenceBranchId?: string): boolean {
  if (data.orientation !== "CURRENT_MINUS_REFERENCE" || !data.calculationVersion) return false;
  if ("period" in data) return data.period.year === period.year && data.period.month === period.month && data.current.branchId === branchId && data.reference.branchId === referenceBranchId && !!data.sourceSignature;
  const periodsMatch = data.current.period.year === period.year && data.current.period.month === period.month && data.reference.period.year === reference.year && data.reference.period.month === reference.month && !!data.current.sourceSignature && !!data.reference.sourceSignature;
  if ("branch" in data.current && "branch" in data.reference) return periodsMatch && data.current.branch.branchId === branchId && data.reference.branch.branchId === branchId;
  return periodsMatch;
}
export const comparisonDescription = (current: Period, reference: Period) => `Diferencia = período analizado (${periodLabel(current)}) menos referencia (${periodLabel(reference)}).`;

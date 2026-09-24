import { ROOTS } from "@puro-origen/domain";
import type { AnalysisResponse } from "@puro-origen/shared-types";

type Scope = AnalysisResponse["blocks"][number];
type Category = AnalysisResponse["categories"][number];
type Metric = AnalysisResponse["metrics"]["grossMargin"];
export type StatementRow =
  | { kind: "section"; key: string; label: string }
  | { kind: "block" | "category"; key: string; label: string; depth: number; scope: Scope; parentLabel?: string }
  | { kind: "metric"; key: string; label: string; metric: Metric };

export function statementRows(analysis: AnalysisResponse): StatementRow[] {
  const rows: StatementRow[] = [];
  const categories = new Map(analysis.categories.map((category) => [category.nodeId, category]));
  const addBlock = (code: string, label: string) => {
    const block = analysis.blocks.find((entry) => entry.code === code);
    if (!block) return;
    rows.push({ kind: "section", key: `${code}:section`, label: block.name });
    // La API entrega las categorías en preorden; no se suman padres e hijas.
    for (const category of analysis.categories) {
      if (category.parentCode !== code && !belongsTo(category, code, categories)) continue;
      const parent = categories.get(category.parentNodeId);
      rows.push({ kind: "category", key: category.nodeId, label: category.name, depth: category.depth, scope: category, parentLabel: parent?.name ?? label });
    }
    rows.push({ kind: "block", key: block.nodeId, label, depth: 0, scope: block });
  };
  addBlock(ROOTS[0].code, "Ingresos Totales");
  addBlock(ROOTS[1].code, "Costos Totales");
  rows.push({ kind: "metric", key: "grossMargin", label: "Margen Bruto", metric: analysis.metrics.grossMargin });
  rows.push({ kind: "metric", key: "grossMarginPercent", label: "Margen Bruto porcentual", metric: analysis.metrics.grossMarginPercent });
  addBlock(ROOTS[2].code, "Gastos Generales Totales");
  rows.push({ kind: "metric", key: "netResult", label: "Resultado Neto", metric: analysis.metrics.netResult });
  rows.push({ kind: "metric", key: "netResultPercent", label: "Resultado Neto porcentual", metric: analysis.metrics.netResultPercent });
  return rows;
}

function belongsTo(category: Category, blockCode: string, byId: Map<string, Category>): boolean {
  let current: Category | undefined = category;
  const seen = new Set<string>();
  while (current && !seen.has(current.nodeId)) {
    seen.add(current.nodeId);
    if (current.parentCode === blockCode) return true;
    current = byId.get(current.parentNodeId);
  }
  return false;
}

export function scopeStatus(scope: Scope): string {
  if (scope.status === "EMPTY") return "Sin ítems";
  const { loadedCount, totalCount, completenessPercent } = scope.completeness;
  if (scope.status === "COMPLETE") return "Completo";
  const detail = `${loadedCount} de ${totalCount} importes cargados · ${completenessPercent?.replace(".", ",") ?? "0,00"}%`;
  return scope.status === "PARTIAL" ? `Parcial · ${detail}` : `Importes sin cargar · ${detail}`;
}

export function metricStatus(metric: Metric): string {
  if (metric.value !== null) return "Completo";
  switch (metric.reason) {
    case "PENDING_INPUTS": return "Disponible cuando se completen los importes requeridos";
    case "EMPTY_INPUT": return "Falta definir al menos un ítem en uno de los bloques requeridos";
    case "ZERO_DENOMINATOR": return "No calculable porque los ingresos son cero";
    default: return "Resultado no disponible";
  }
}

import { normalizeSalesGoal, type SalesGoalMode, type SalesGoalValue } from "@puro-origen/domain";

export type SalesGoalDraft = { mode: SalesGoalMode; value: string };

/** Solo adapta la coma de entrada; el dominio valida rango, escala y monto exactos. */
export function canonicalSalesGoal(draft: SalesGoalDraft): SalesGoalValue {
  const value = draft.value.trim();
  if (value.includes(",") && value.includes("."))
    throw new Error("Usá coma o punto decimal, sin separadores de miles.");
  return normalizeSalesGoal({ mode: draft.mode, value: value.replace(",", ".") });
}

export function salesGoalDirty(draft: SalesGoalDraft | null, saved: SalesGoalValue | null): boolean {
  if (!draft) return false;
  if (!saved && draft.mode === "NET_MARGIN_PERCENT" && !draft.value) return false;
  if (saved?.mode !== draft.mode) return true;
  try { return canonicalSalesGoal(draft).value !== saved?.value; }
  catch { return true; }
}

export function initialSalesGoalDraft(saved: SalesGoalValue | null): SalesGoalDraft {
  return saved ? { mode: saved.mode, value: saved.value.replace(".", ",") }
    : { mode: "NET_MARGIN_PERCENT", value: "" };
}

/** La meta conserva hasta cuatro decimales significativos, con al menos dos visibles. */
export function formatGoalPercent(value: string): string {
  if (!/^(?:0|[1-9]\d?)\.\d{4}$/.test(value)) throw new Error("Porcentaje inválido");
  const [whole, fraction] = value.split(".");
  return `${whole},${fraction.replace(/0+$/, "").padEnd(2, "0")} %`;
}

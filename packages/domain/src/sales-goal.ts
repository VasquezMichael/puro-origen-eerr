import { MONEY } from "./money.js";

export type SalesGoalMode = "NET_MARGIN_PERCENT" | "NET_PROFIT_AMOUNT";
export type SalesGoalValue = { mode: SalesGoalMode; value: string };

/** Acepta solamente decimales textuales exactos; no redondea precisión descartada. */
export function normalizeSalesGoal(input: unknown): SalesGoalValue {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error("Meta inválida");
  const row = input as Record<string, unknown>;
  if (
    Object.keys(row).sort().join(",") !== "mode,value" ||
    typeof row.value !== "string"
  )
    throw new Error("Campos de meta inválidos");
  if (row.mode === "NET_MARGIN_PERCENT") {
    if (!/^(?:0|[1-9]\d?)(?:\.\d{1,4})?$/.test(row.value))
      throw new Error(
        "El porcentaje debe estar entre 0 y 100, con hasta cuatro decimales",
      );
    const [whole, fraction = ""] = row.value.split(".");
    return { mode: row.mode, value: `${whole}.${fraction.padEnd(4, "0")}` };
  }
  if (row.mode === "NET_PROFIT_AMOUNT") {
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(row.value))
      throw new Error("El monto debe ser no negativo, con hasta dos decimales");
    const [whole, fraction = ""] = row.value.split(".");
    const value = `${whole}.${fraction.padEnd(2, "0")}`;
    if (BigInt(value.replace(".", "")) > BigInt(MONEY.max.replace(".", "")))
      throw new Error("El monto supera el máximo por celda");
    return { mode: row.mode, value };
  }
  throw new Error("Modalidad de meta inválida");
}

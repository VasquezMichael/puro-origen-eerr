export const QUANTITY_LIMITS = { max: "999999999999", length: 12 } as const;
export const NOTE_LIMITS = { item: 1000, period: 4000 } as const;
export type QuantityCell = {
  state: "SIN_CARGAR" | "CARGADO";
  value: string | null;
};
export const emptyQuantity = (): QuantityCell => ({
  state: "SIN_CARGAR",
  value: null,
});
export function normalizeQuantity(input: string): string {
  if (
    typeof input !== "string" ||
    input.length > QUANTITY_LIMITS.length ||
    !/^\d+$/.test(input) ||
    BigInt(input) > BigInt(QUANTITY_LIMITS.max)
  )
    throw new Error(
      `Ingresá un entero entre 0 y ${QUANTITY_LIMITS.max}, sin decimales ni exponentes`,
    );
  return BigInt(input).toString();
}
export function normalizeNote(input: string, limit: number): string | null {
  if (typeof input !== "string" || input.length > limit)
    throw new Error(`La nota admite hasta ${limit} caracteres`);
  return input.trim() || null;
}

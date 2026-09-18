/** ARS: límite por celda de un billón menos un centavo. Sin coma flotante. */
export const MONEY = {
  currency: "ARS",
  scale: 2,
  max: "999999999999.99",
  rounding: "ROUND_HALF_UP",
} as const;
export const MAX_MONEY_INPUT_LENGTH = 80;
const maximumCents = BigInt(MONEY.max.replace(".", ""));

/** Redondea una sola vez un resultado racional exacto; valida antes de redondear. */
export function rationalMoney(numerator: bigint, denominator: bigint): string {
  if (denominator <= 0n) throw new Error("Denominador inválido");
  if (numerator < 0n) throw new Error("El importe no puede ser negativo");
  const scaled = numerator * 100n;
  if (scaled > maximumCents * denominator)
    throw new Error(`El importe máximo es ${MONEY.max} ARS`);
  const cents =
    scaled / denominator +
    (2n * (scaled % denominator) >= denominator ? 1n : 0n);
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

export function normalizeMoney(input: string): string {
  if (
    typeof input !== "string" ||
    input.length > MAX_MONEY_INPUT_LENGTH ||
    !/^\d+(?:[.,]\d+)?$/.test(input)
  ) {
    throw new Error(
      "Ingresá un importe decimal no negativo, sin separadores de miles ni expresiones",
    );
  }
  const [integer, fraction = ""] = input.replace(",", ".").split(".");
  return rationalMoney(
    BigInt(integer! + fraction),
    10n ** BigInt(fraction.length),
  );
}

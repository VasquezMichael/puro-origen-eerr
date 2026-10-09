/** Rounding HALF_UP by magnitude, including negative ties. */
export function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Denominador invalido");
  const magnitude = numerator < 0n ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const rounded =
    quotient + (2n * (magnitude % denominator) >= denominator ? 1n : 0n);
  return numerator < 0n ? -rounded : rounded;
}

export function fixed(value: bigint, scale: number): string {
  const factor = 10n ** BigInt(scale);
  const magnitude = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${magnitude / factor}.${(magnitude % factor).toString().padStart(scale, "0")}`;
}

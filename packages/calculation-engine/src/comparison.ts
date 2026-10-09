import { divideRounded, fixed } from "./decimal.js";

export type ComparisonUnit = "ARS" | "PERCENT";
export type ComparisonReason =
  | "CURRENT_NO_EERR"
  | "REFERENCE_NO_EERR"
  | "CURRENT_UNINITIALIZED"
  | "REFERENCE_UNINITIALIZED"
  | "CURRENT_EMPTY"
  | "REFERENCE_EMPTY"
  | "CURRENT_PENDING"
  | "REFERENCE_PENDING"
  | "CURRENT_PARTIAL"
  | "REFERENCE_PARTIAL"
  | "CURRENT_INVALID"
  | "REFERENCE_INVALID"
  | "CURRENT_NOT_CALCULABLE"
  | "REFERENCE_NOT_CALCULABLE"
  | "CURRENT_SUBTOTAL"
  | "REFERENCE_SUBTOTAL"
  | "CURRENT_EXCLUDED"
  | "REFERENCE_EXCLUDED"
  | "REFERENCE_NOT_POSITIVE";

export type ComparisonMetric = {
  current: string | null;
  reference: string | null;
  absoluteDifference: string | null;
  percentagePointDifference: string | null;
  relativeVariation: string | null;
  unit: ComparisonUnit;
  status: "COMPLETE" | "BLOCKED" | "NOT_CALCULABLE";
  reason: ComparisonReason | null;
};

function scaled(value: string, scale: 2 | 4): bigint {
  if (!new RegExp(`^-?(?:0|[1-9]\\d*)\\.\\d{${scale}}$`).test(value))
    throw new Error("Valor comparativo no canónico");
  const integer = BigInt(value.replace(".", ""));
  if (fixed(integer, scale) !== value)
    throw new Error("Valor comparativo no canónico");
  return integer;
}

/** Diferencia orientada actual − referencia; no interpreta favorabilidad. */
export function compareMetricValues(
  current: string | null,
  reference: string | null,
  unit: ComparisonUnit,
  unavailableReason: ComparisonReason = current === null
    ? "CURRENT_NOT_CALCULABLE"
    : "REFERENCE_NOT_CALCULABLE",
): ComparisonMetric {
  const base = {
    current,
    reference,
    absoluteDifference: null,
    percentagePointDifference: null,
    relativeVariation: null,
    unit,
  };
  if (current === null || reference === null)
    return { ...base, status: "BLOCKED", reason: unavailableReason };
  const scale = unit === "ARS" ? 2 : 4;
  const currentUnits = scaled(current, scale);
  const referenceUnits = scaled(reference, scale);
  const difference = currentUnits - referenceUnits;
  if (unit === "PERCENT")
    return {
      ...base,
      percentagePointDifference: fixed(difference, 4),
      status: "COMPLETE",
      reason: null,
    };
  const absoluteDifference = fixed(difference, 2);
  if (referenceUnits <= 0n)
    return {
      ...base,
      absoluteDifference,
      status: "NOT_CALCULABLE",
      reason: "REFERENCE_NOT_POSITIVE",
    };
  return {
    ...base,
    absoluteDifference,
    relativeVariation: fixed(
      divideRounded(difference * 1_000_000n, referenceUnits),
      4,
    ),
    status: "COMPLETE",
    reason: null,
  };
}

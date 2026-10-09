import { test } from "node:test";
import assert from "node:assert/strict";
import { compareMetricValues } from "../dist/index.js";

test("referencia positiva: aumento, caída, igualdad y redondeo HALF_UP", () => {
  assert.deepEqual(compareMetricValues("150.00", "100.00", "ARS"), {
    current: "150.00",
    reference: "100.00",
    absoluteDifference: "50.00",
    percentagePointDifference: null,
    relativeVariation: "50.0000",
    unit: "ARS",
    status: "COMPLETE",
    reason: null,
  });
  assert.equal(
    compareMetricValues("75.00", "100.00", "ARS").relativeVariation,
    "-25.0000",
  );
  assert.equal(
    compareMetricValues("100.00", "100.00", "ARS").relativeVariation,
    "0.0000",
  );
  assert.equal(
    compareMetricValues("1.00", "32.00", "ARS").relativeVariation,
    "-96.8750",
  );
  assert.equal(
    compareMetricValues("1.01", "32.00", "ARS").relativeVariation,
    "-96.8438",
  );
});

test("referencia cero o negativa conserva diferencia y bloquea variación relativa", () => {
  for (const [current, reference, difference] of [
    ["50.00", "0.00", "50.00"],
    ["-50.00", "-100.00", "50.00"],
    ["50.00", "-100.00", "150.00"],
    ["-50.00", "100.00", "-150.00"],
    ["-50.00", "0.00", "-50.00"],
    ["-100.00", "-50.00", "-50.00"],
    ["-50.00", "100.00", "-150.00"],
    ["-50.00", "-100.00", "50.00"],
    ["50.00", "-50.00", "100.00"],
  ]) {
    const result = compareMetricValues(current, reference, "ARS");
    assert.equal(result.absoluteDifference, difference);
    assert.equal(
      result.relativeVariation,
      BigInt(reference.replace(".", "")) > 0n ? "-150.0000" : null,
    );
    if (BigInt(reference.replace(".", "")) <= 0n)
      assert.equal(result.reason, "REFERENCE_NOT_POSITIVE");
  }
});

test("porcentajes se comparan en puntos, nunca como porcentaje relativo", () => {
  const result = compareMetricValues("30.0000", "20.0000", "PERCENT");
  assert.equal(result.percentagePointDifference, "10.0000");
  assert.equal(result.absoluteDifference, null);
  assert.equal(result.relativeVariation, null);
  assert.equal(
    compareMetricValues("-5.0000", "5.0000", "PERCENT")
      .percentagePointDifference,
    "-10.0000",
  );
});

test("precisión grande y nulos sin cero inventado; no altera entradas", () => {
  const current = "9007199254740993.11",
    reference = "9007199254740993.10";
  assert.equal(
    compareMetricValues(current, reference, "ARS").absoluteDifference,
    "0.01",
  );
  assert.equal(
    compareMetricValues(null, reference, "ARS", "CURRENT_NO_EERR").reason,
    "CURRENT_NO_EERR",
  );
  assert.equal(
    compareMetricValues(null, reference, "ARS").absoluteDifference,
    null,
  );
  assert.equal(
    compareMetricValues(current, null, "ARS").relativeVariation,
    null,
  );
  assert.equal(current, "9007199254740993.11");
  assert.throws(() => compareMetricValues("1.001", "1.00", "ARS"));
});

test("permutar entradas invierte diferencia sin mutar las fuentes", () => {
  const forward = compareMetricValues("20.00", "10.00", "ARS");
  const backward = compareMetricValues("10.00", "20.00", "ARS");
  assert.equal(forward.absoluteDifference, "10.00");
  assert.equal(backward.absoluteDifference, "-10.00");
  assert.deepEqual(compareMetricValues("20.00", "10.00", "ARS"), forward);
});

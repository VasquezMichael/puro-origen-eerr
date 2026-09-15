import { test } from "node:test";
import assert from "node:assert/strict";
import { MONEY, normalizeMoney } from "../dist/index.js";

for (const [input, result] of [
  ["0", "0.00"],
  ["0,00", "0.00"],
  ["123.4", "123.40"],
  ["123,45", "123.45"],
  ["1.005", "1.01"],
  ["9.999", "10.00"],
  ["1.0049999", "1.00"],
  ["000001", "1.00"],
  ["999999999999.985", "999999999999.99"],
  [MONEY.max, MONEY.max],
]) {
  test(`dinero exacto ${input} → ${result}`, () =>
    assert.equal(normalizeMoney(input), result));
}
for (const input of [
  "-1",
  "-0.001",
  "NaN",
  "Infinity",
  "1e3",
  "1+2",
  "1,000.00",
  "1.000,00",
  "",
  " 1",
  "+1",
  ".5",
  "1.",
  "999999999999.991",
  "1000000000000",
  "1".repeat(81),
]) {
  test(`rechaza literal monetario ${input.slice(0, 24)}`, () =>
    assert.throws(() => normalizeMoney(input)));
}

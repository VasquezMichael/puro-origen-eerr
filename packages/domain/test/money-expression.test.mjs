import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateMoneyExpression as evaluate,
  EXPRESSION_LIMITS,
  rationalMoney,
} from "../dist/index.js";

for (const [input, value] of [
  ["1500", "1500.00"],
  ["2500 * 0,21", "525.00"],
  ["2500 * 0.21", "525.00"],
  [" 1000 + 500 ", "1500.00"],
  ["1000 + 500 - 200", "1300.00"],
  ["1000 + (500 * 2)", "2000.00"],
  ["(1000 + 500) / 3", "500.00"],
  ["1+2*3", "7.00"],
  ["(1+2)*3", "9.00"],
  ["8/4/2", "1.00"],
  ["8-4-2", "2.00"],
  ["1/3*3", "1.00"],
  ["1/6+1/6+1/6", "0.50"],
  ["0.1+0.2", "0.30"],
  ["1.005", "1.01"],
  ["1.004999999", "1.00"],
  ["1/200", "0.01"],
  ["999999999999.99", "999999999999.99"],
  ["1000000000000-0.01", "999999999999.99"],
  ["2*-3+10", "4.00"],
  ["-(2-3)", "1.00"],
  ["+2", "2.00"],
  ["--2", "2.00"],
  ["0", "0.00"],
])
  test(`expresión exacta ${input}`, () =>
    assert.deepEqual(evaluate(input), { input: input.trim(), value }));
for (const input of [
  "",
  " ",
  "1/0",
  "1/(2-2)",
  "1+",
  "(1+2",
  "1+2)",
  "()",
  "1 2",
  "2(3)",
  "2**3",
  "abc",
  "Math.max(1,2)",
  "process.exit()",
  "(()=>1)()",
  "1;2",
  "1e3",
  "Infinity",
  "NaN",
  "1,000.00",
  "1.000,00",
  "1,000,000",
  ".5",
  "1.",
  "1,",
  "0-1",
  "-0.001",
  "999999999999.991",
  "1000000000000",
  "1".repeat(EXPRESSION_LIMITS.length + 1),
  "(".repeat(EXPRESSION_LIMITS.depth + 1) +
    "1" +
    ")".repeat(EXPRESSION_LIMITS.depth + 1),
  "+".repeat(EXPRESSION_LIMITS.tokens) + "1",
  "1".repeat(EXPRESSION_LIMITS.literalDigits + 1),
])
  test(`rechaza expresión ${input.slice(0, 40)}`, () =>
    assert.throws(() => evaluate(input)));
test("límites de profundidad y tokens admiten el borde válido", () => {
  assert.equal(
    evaluate(
      "(".repeat(EXPRESSION_LIMITS.depth) +
        "1" +
        ")".repeat(EXPRESSION_LIMITS.depth),
    ).value,
    "1.00",
  );
  assert.equal(
    evaluate("+".repeat(EXPRESSION_LIMITS.tokens - 1) + "1").value,
    "1.00",
  );
});
test("racional rechaza denominador inválido", () =>
  assert.throws(() => rationalMoney(1n, 0n)));

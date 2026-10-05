import { test } from "node:test";
import assert from "node:assert/strict";
import { ROOTS } from "@puro-origen/domain";
import { aggregateEerr, calculateEerr } from "../dist/index.js";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function analysis(income, costs, expenses) {
  const roots = ROOTS.map((root, index) => ({
    ...root, nodeId: id(index + 1), parentId: null, position: index, kind: "BLOCK",
  }));
  const nodes = roots.flatMap((root, index) => {
    const value = [income, costs, expenses][index];
    return [root, {
      nodeId: id(index + 11), code: id(index + 21), parentId: root.nodeId,
      position: 0, name: `Ítem ${index}`, kind: "ITEM",
      amount: value === null
        ? { state: "SIN_CARGAR", input: null, value: null, currency: "ARS", scale: 2 }
        : { state: "CARGADO", input: null, value, currency: "ARS", scale: 2 },
    }];
  });
  return calculateEerr({
    schemaVersion: 1, structureVersion: 1,
    initializedAt: "2026-09-15T12:00:00Z", initializedBy: id(99), nodes,
  });
}
const source = (branchId, value) => ({ branchId, analysis: value });

test("suma bases y recalcula porcentajes, resultado y equilibrio sobre totales", () => {
  const one = analysis("100.00", "40.00", "20.00");
  const two = analysis("50.00", "10.00", "5.00");
  const input = [source("b", two), source("a", one)];
  const result = aggregateEerr(input);
  assert.equal(result.definitive, true);
  assert.deepEqual([result.income.value, result.costs.value, result.expenses.value], ["150.00", "50.00", "25.00"]);
  assert.equal(result.grossMargin.value, "100.00");
  assert.equal(result.grossMarginPercent.value, "66.6667");
  assert.equal(result.netResult.value, "75.00");
  assert.equal(result.netResultPercent.value, "50.0000");
  assert.equal(result.breakEvenSales.value, "37.50");
  assert.equal(result.targetSales, null);
  assert.deepEqual(aggregateEerr([...input].reverse()), result);
  assert.equal(one.projections.breakEvenSales.value, "33.34");
  assert.equal(two.projections.breakEvenSales.value, "6.25");
});

test("faltante y parcial no aportan cero ni sumas conocidas al subtotal", () => {
  const complete = analysis("10.00", "0.00", "20.00");
  const partial = analysis("100.00", null, "0.00");
  const result = aggregateEerr([source("a", complete), source("b", partial), source("c", null)]);
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.includedCount, 1);
  assert.deepEqual([result.income.value, result.costs.value, result.expenses.value], ["10.00", "0.00", "20.00"]);
  for (const key of ["grossMargin", "grossMarginPercent", "netResult", "netResultPercent", "breakEvenSales"])
    assert.deepEqual({ value: result[key].value, reason: result[key].reason }, { value: null, reason: "INCOMPLETE_SCOPE" });
  assert.equal(result.targetSales, null);
  assert.equal(aggregateEerr([source("b", partial)]).income.value, null);
  assert.equal(aggregateEerr([source("b", partial)]).status, "PENDING");
  assert.equal(aggregateEerr([]).definitive, false);
});

test("bloque vacío impide definitivo; cero explícito y resultado negativo son válidos", () => {
  const zero = analysis("10.00", "0.00", "20.00");
  assert.equal(aggregateEerr([source("a", zero)]).netResult.value, "-10.00");
  const empty = calculateEerr({ schemaVersion: 1, structureVersion: 1,
    initializedAt: "2026-09-15T12:00:00Z", initializedBy: id(99),
    nodes: ROOTS.map((root, index) => ({ ...root, nodeId: id(index + 1), parentId: null, position: index, kind: "BLOCK" })) });
  assert.equal(aggregateEerr([source("a", zero), source("b", empty)]).definitive, false);
});

test("bases superiores al entero seguro en centavos conservan precisión", () => {
  const huge = analysis("999999999999.99", "0.00", "0.00");
  const result = aggregateEerr(Array.from({ length: 100 }, (_, index) => source(`b${index}`, huge)));
  assert.equal(result.income.value, "99999999999999.00");
  assert.equal(result.netResult.value, "99999999999999.00");
  assert.equal(result.grossMarginPercent.value, "100.0000");
});

test("un único bloque con subtotal mayor al entero seguro tampoco pasa por Number", () => {
  const roots = ROOTS.map((root, index) => ({ ...root, nodeId: id(index + 1),
    parentId: null, position: index, kind: "BLOCK" }));
  const item = (n, root, value) => ({ nodeId: id(n), code: id(n + 500),
    parentId: root.nodeId, position: n, name: `Ítem ${n}`, kind: "ITEM",
    amount: { state: "CARGADO", input: null, value, currency: "ARS", scale: 2 } });
  const nodes = [...roots,
    ...Array.from({ length: 100 }, (_, n) => item(n + 100, roots[0], "999999999999.99")),
    item(250, roots[0], "0.01"),
    item(300, roots[1], "0.00"), item(301, roots[2], "0.00")];
  const single = calculateEerr({ schemaVersion: 1, structureVersion: 1,
    initializedAt: "2026-09-15T12:00:00Z", initializedBy: id(99), nodes });
  assert.equal(single.blocks[0].value, "99999999999999.01");
  assert.equal(aggregateEerr([source("a", single)]).income.value, "99999999999999.01");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { ROOTS } from "@puro-origen/domain";
import { aggregateEerr, calculateConsolidatedGoal, calculateEerr, DEFAULT_CONSOLIDATED_TARGET_NET_MARGIN } from "../dist/index.js";

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

test("objetivo consolidado v3 suma bases, redondea al centavo y no usa metas locales", () => {
  const sourceA = analysis("100.00", "40.00", "20.00");
  const sourceB = analysis("50.00", "10.00", "5.00");
  const aggregate = aggregateEerr([source("a", sourceA), source("b", sourceB)]);
  const standard = calculateConsolidatedGoal(aggregate, DEFAULT_CONSOLIDATED_TARGET_NET_MARGIN);
  assert.deepEqual([standard.targetNetMargin, standard.targetSales.value, standard.targetDifference.value, standard.targetCompliance.value, standard.trafficLight.value], ["0.2000", "93.75", "56.25", "160.0000", "GREEN"]);
  const custom = calculateConsolidatedGoal(aggregate, "0.2500");
  assert.equal(custom.targetSales.value, "100.00");
  assert.equal(custom.targetDifference.value, "50.00");
  assert.equal(aggregate.targetSales, null);
  assert.equal(sourceA.projections.targetSales.reason, "GOAL_NOT_CONFIGURED");
  assert.equal(calculateConsolidatedGoal(aggregate, "0.5500").targetSales.value, "166.67");
});

test("semáforo consolidado respeta rojo, límite 70 %, amarillo, verde y objetivo cero", () => {
  const goal = (income, costs, expenses, margin = "0.2000") => calculateConsolidatedGoal(aggregateEerr([source("a", analysis(income, costs, expenses))]), margin);
  assert.equal(goal("10.00", "0.00", "20.00").trafficLight.value, "RED");
  assert.equal(goal("14.00", "0.00", "20.00").trafficLight.value, "YELLOW");
  assert.equal(goal("20.00", "0.00", "20.00").trafficLight.value, "YELLOW");
  assert.equal(goal("25.00", "0.00", "20.00").trafficLight.value, "GREEN");
  assert.deepEqual([goal("20.00", "0.00", "20.00").targetDifference.value, goal("20.00", "0.00", "20.00").targetCompliance.value], ["-5.00", "80.0000"]);
  assert.deepEqual([goal("25.00", "0.00", "20.00").targetDifference.value, goal("25.00", "0.00", "20.00").targetCompliance.value], ["0.00", "100.0000"]);
  assert.equal(goal("30.00", "0.00", "20.00").targetDifference.value, "5.00");
  assert.equal(goal("30.00", "0.00", "20.00").targetCompliance.value, "120.0000");
  const zero = goal("50.00", "0.00", "0.00");
  assert.deepEqual([zero.targetDifference.value, zero.targetCompliance.reason, zero.trafficLight.value, zero.trafficLight.reason], ["50.00", "NON_POSITIVE_TARGET", "NEUTRAL", "NON_POSITIVE_TARGET"]);
});

test("margen mayor o igual a uno y cobertura parcial quedan neutrales", () => {
  const full = aggregateEerr([source("a", analysis("100.00", "40.00", "20.00"))]);
  for (const margin of ["1.0000", "1.5000"]) {
    const goal = calculateConsolidatedGoal(full, margin);
    assert.deepEqual([goal.targetSales.status, goal.targetSales.reason, goal.trafficLight.value], ["NOT_CALCULABLE", "TARGET_MARGIN_UNATTAINABLE", "NEUTRAL"]);
  }
  assert.equal(calculateConsolidatedGoal(full, "0.0000").targetSales.value, "60.00");
  assert.equal(calculateConsolidatedGoal(full, "0.9999").targetSales.value, "600000.00");
  const partial = aggregateEerr([source("a", analysis("100.00", "40.00", "20.00")), source("b", analysis("50.00", null, "5.00"))]);
  const goal = calculateConsolidatedGoal(partial, "0.2000");
  assert.equal(partial.income.value, "100.00");
  assert.deepEqual([goal.targetSales.value, goal.targetDifference.value, goal.targetCompliance.value, goal.trafficLight.reason], [null, null, null, "INCOMPLETE_SCOPE"]);
  for (const [income, costs, expectedReason] of [["0.00", "0.00", "ZERO_REVENUE"], ["100.00", "100.00", "NON_POSITIVE_CONTRIBUTION_MARGIN"]]) {
    const base = aggregateEerr([source("a", analysis(income, costs, "10.00"))]);
    const projection = calculateConsolidatedGoal(base, "0.2000");
    assert.deepEqual([projection.targetSales.value, projection.trafficLight.value, projection.trafficLight.reason], [null, "NEUTRAL", expectedReason]);
  }
});

test("margen inválido prevalece sobre ingresos cero, contribución no positiva y cobertura parcial", () => {
  const cases = [
    ["100.00", "40.00", "1.0000"],
    ["0.00", "0.00", "1.0000"],
    ["100.00", "100.00", "1.0000"],
    ["0.00", "0.00", "1.5000"],
  ];
  for (const [income, costs, margin] of cases) {
    const base = aggregateEerr([source("a", analysis(income, costs, "20.00"))]);
    const goal = calculateConsolidatedGoal(base, margin);
    for (const name of ["targetSales", "targetDifference", "targetCompliance"])
      assert.deepEqual([goal[name].status, goal[name].value, goal[name].reason], ["NOT_CALCULABLE", null, "TARGET_MARGIN_UNATTAINABLE"]);
    assert.deepEqual([goal.trafficLight.status, goal.trafficLight.value, goal.trafficLight.reason], ["NOT_CALCULABLE", "NEUTRAL", "TARGET_MARGIN_UNATTAINABLE"]);
  }
  const partial = aggregateEerr([source("a", analysis("100.00", null, "20.00"))]);
  assert.equal(calculateConsolidatedGoal(partial, "1.0000").targetSales.reason, "TARGET_MARGIN_UNATTAINABLE");
  assert.equal(calculateConsolidatedGoal(partial, "0.2000").targetSales.reason, "NO_COMPLETE_SOURCES");
});

test("dataset demo consolidado: agosto y septiembre a 20 y 25 por ciento", () => {
  const months = [
    ["4200093.30", "1768989.30", "1736700.00", "4382111.63", "4674252.40"],
    ["4710071.35", "2061271.45", "1762650.00", "4779901.82", "5098561.94"],
  ];
  for (const [income, costs, expenses, at20, at25] of months) {
    const base = aggregateEerr([source("demo", analysis(income, costs, expenses))]);
    assert.equal(calculateConsolidatedGoal(base, "0.2000").targetSales.value, at20);
    assert.equal(calculateConsolidatedGoal(base, "0.2500").targetSales.value, at25);
  }
});

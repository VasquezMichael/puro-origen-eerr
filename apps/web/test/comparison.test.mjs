import "./tsx-loader.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const model = await import("../src/app/comparison-model.ts");
const dashboard = await import("../src/app/dashboard-model.ts");
const { Comparisons, GoalComparison, TwoBranches } = await import("../src/app/dashboard-comparisons.tsx");
const comparisonFixture = await import("./comparison-browser-fixture.mts");

test("fixture limita indicadores de metas a la comparación temporal", () => {
  const { ids, branchTableFixture, branchPeriodFixture, twoBranchFixture } = comparisonFixture;
  const table = branchTableFixture(2026, 9);
  assert.ok(table.branches.every((branch) => !("goalIndicators" in branch)));
  const temporal = branchPeriodFixture(2026, 9, 2026, 8);
  assert.equal(temporal.current.branch.goalIndicators.targetSales.value, "20.00");
  assert.equal(temporal.reference.branch.goalIndicators.trafficLight.value, "YELLOW");
  const betweenBranches = twoBranchFixture(2026, 9, ids[0], ids[1]);
  assert.equal("goalIndicators" in betweenBranches.current, false);
  assert.equal("goalIndicators" in betweenBranches.reference, false);
});

test("comparación temporal presenta metas y semáforos sin calcular variación de color", () => {
  const metric = (current, reference, unit) => ({ current, reference, unit, absoluteDifference: unit === "ARS" ? "10.00" : null,
    percentagePointDifference: unit === "PERCENT" ? "5.0000" : null, relativeVariation: null, status: "COMPLETE", reason: null });
  const side = (month, value) => ({ period: { year: 2026, month }, branch: { goalIndicators: { trafficLight: { status: "COMPLETE", value, reason: null } } } });
  const data = { current: side(9, "GREEN"), reference: side(8, "YELLOW"), goalComparison: {
    targetSales: metric("200.00", "190.00", "ARS"),
    targetDifference: metric("10.00", "0.00", "ARS"),
    targetCompliance: metric("105.0000", "100.0000", "PERCENT"),
  } };
  const html = renderToStaticMarkup(React.createElement(GoalComparison, { data }));
  for (const fragment of [/Metas locales por período/, /Objetivo de Venta/, /Diferencia contra objetivo/, /Cumplimiento/, /Verde/, /Amarillo/, /sin variación numérica/]) assert.match(html, fragment);
  assert.match(renderToStaticMarkup(React.createElement(GoalComparison, { data: { ...data, goalComparison: undefined } })), /no incluye comparación/);
});
const { ItemComparisonTable } = await import("../src/app/item-comparison-table.tsx");

test('tabla de ítems diferencia ausente, pendiente, cero y cantidad sin recalcular', () => {
  const period = month => ({ year: 2026, month });
  const side = (month, state, value, quantityState, quantityValue) => ({ period: period(month), nodeId: String(month), archived: false, amount: { state, value }, quantity: { state: quantityState, value: quantityValue, unit: 'tickets' } });
  const variation = { absoluteChange: { status: 'COMPLETE', value: '10.00', reason: null }, percentageChange: { status: 'NOT_CALCULABLE', value: null, reason: 'REFERENCE_ZERO' } };
  const html = renderToStaticMarkup(React.createElement(ItemComparisonTable, { comparison: { orientation: 'LATER_MINUS_EARLIER', periods: [period(8), period(9)], items: [
    { code: 'item-1', name: 'Nombre reciente', kind: 'ITEM', inReferenceStructure: true, parentCode: 'cat', rootCode: 'root', path: ['Ingresos', 'Ventas'], periods: [side(8, 'CARGADO', '0.00', 'CARGADO', '10'), side(9, 'CARGADO', '10.00', 'CARGADO', '12')], amountVariation: variation, quantityVariation: { absoluteChange: { status: 'COMPLETE', value: '2', reason: null }, percentageChange: { status: 'COMPLETE', value: '20.0000', reason: null } } },
    { code: 'item-2', name: 'Histórico', kind: 'ITEM', inReferenceStructure: false, parentCode: 'cat', rootCode: 'root', path: ['Ingresos'], periods: [side(8, 'SIN_CARGAR', null, 'NO_APLICA', null), side(9, 'NO_EXISTIA', null, 'NO_EXISTIA', null)], amountVariation: { absoluteChange: { status: 'BLOCKED', value: null, reason: 'CURRENT_NO_EXISTIA' }, percentageChange: { status: 'NOT_CALCULABLE', value: null, reason: 'CURRENT_NO_EXISTIA' } }, quantityVariation: null },
  ] } }));
  for (const text of ['Nombre reciente', 'Ingresos / Ventas', 'Histórico', 'NO_EXISTIA', 'SIN_CARGAR', '0,00 ARS', '10 tickets', '12 tickets', '20,0000 %', 'fuera de la estructura reciente', '% no calculable', 'desplazamiento horizontal']) assert.match(html, new RegExp(text));
});

test('la web renderiza respuesta moderna, null explícito y legacy sin itemComparison', () => {
  const period = month => ({ year: 2026, month });
  const response = { orientation: 'CURRENT_MINUS_REFERENCE', calculationVersion: 2,
    current: { period: period(9), branch: { branchId: 'a' }, sourceSignature: 'one' },
    reference: { period: period(8), branch: { branchId: 'a' }, sourceSignature: 'two' } };
  const modern = { orientation: 'LATER_MINUS_EARLIER', periods: [period(8), period(9)], items: [] };
  for (const [payload, expected] of [
    [{ ...response, itemComparison: modern }, 'Ítems e indicadores de cantidad'],
    [{ ...response, itemComparison: null }, 'La comparación de ítems requiere dos EERR'],
    [response, 'La comparación de ítems requiere dos EERR'],
  ]) {
    assert.equal(model.matchesComparison(payload, period(9), period(8), 'a'), true);
    const html = renderToStaticMarkup(React.createElement(ItemComparisonTable, { comparison: model.itemComparisonOrNull(payload) }));
    assert.match(html, new RegExp(expected));
  }
  assert.equal(model.itemComparisonOrNull(response), null);
});

const money = (reference = "10.00", overrides = {}) => ({ current: "11.00", reference, absoluteDifference: "1.00", percentagePointDifference: null, relativeVariation: reference === "10.00" ? "10.0000" : null, unit: "ARS", status: reference === "10.00" ? "COMPLETE" : "NOT_CALCULABLE", reason: reference === "10.00" ? null : "REFERENCE_NOT_POSITIVE", ...overrides });
test("Resumen es inicial; Comparaciones conserva el período en URL y normaliza parámetros inválidos", () => {
  const period = { year: 2026, month: 10 };
  assert.equal(dashboard.viewFromQuery(new URLSearchParams("year=2026&month=10")), "summary");
  assert.equal(dashboard.viewFromQuery(new URLSearchParams("view=comparisons")), "comparisons");
  assert.equal(dashboard.dashboardHref(period, "comparisons"), "/?year=2026&month=10&view=comparisons");
  assert.equal(dashboard.dashboardHref(period, "summary"), "/?year=2026&month=10");
  assert.equal(dashboard.queryIsCanonical(new URLSearchParams("year=2026&month=10&view=no"), period, "summary"), false);
});
test("referencia anterior cruza enero y las rutas conservan orientación y selección explícita", () => {
  const period = { year: 2026, month: 1 }, reference = model.initialReference(period);
  assert.deepEqual(reference, { year: 2025, month: 12 });
  assert.equal(model.comparisonPath("branch-period", period, reference, "abc"), "/analytics/branches/abc/period-comparison?year=2026&month=1&referenceYear=2025&referenceMonth=12");
  assert.equal(model.comparisonPath("two-branches", period, reference, "a", "b"), "/analytics/branches/compare?year=2026&month=1&branchId=a&referenceBranchId=b");
});
test("valida período, firmas, orientación e IDs de respuestas, incluidas antiguas", () => {
  const a = { year: 2026, month: 9 }, b = { year: 2026, month: 8 };
  const response = { orientation: "CURRENT_MINUS_REFERENCE", calculationVersion: 2, current: { period: a, branch: { branchId: "a" }, sourceSignature: "one" }, reference: { period: b, branch: { branchId: "a" }, sourceSignature: "two" } };
  assert.equal(model.matchesComparison(response, a, b, "a"), true);
  assert.equal(model.matchesComparison(response, a, b, "b"), false);
  assert.equal(model.matchesComparison(response, b, a, "a"), false);
  assert.equal(model.matchesComparison({ ...response, orientation: "REFERENCE_MINUS_CURRENT" }, a, b, "a"), false);
  const pair = { orientation: "CURRENT_MINUS_REFERENCE", calculationVersion: 2, period: a, current: { branchId: "a" }, reference: { branchId: "b" }, sourceSignature: "both" };
  assert.equal(model.matchesComparison(pair, a, a, "a", "b"), true);
  assert.equal(model.matchesComparison(pair, a, a, "b", "a"), false);
});
test("dinero exacto, signo, pp y variación recibida sin cálculo web", () => {
  assert.equal(model.formatComparisonValue("-9007199254740993.10", "ARS"), "-9.007.199.254.740.993,10 ARS");
  assert.equal(model.formatDifference(money("10.00", { absoluteDifference: "-9007199254740993.10" })), "-9.007.199.254.740.993,10 ARS");
  assert.equal(model.formatDifference(money()), "+1,00 ARS");
  assert.equal(model.formatDifference(money("10.00", { absoluteDifference: "0.00" })), "0,00 ARS");
  assert.equal(model.formatVariation(money()), "10,0000 %");
  assert.equal(model.formatDifference(money("10.00", { unit: "PERCENT", absoluteDifference: null, percentagePointDifference: "-1.2500", relativeVariation: null })), "-1,2500 pp");
  assert.equal(model.formatDifference(money("10.00", { unit: "PERCENT", absoluteDifference: null, percentagePointDifference: "1.2500", relativeVariation: null })), "+1,2500 pp");
  assert.equal(model.formatVariation(money("0.00")), "—");
  assert.equal(model.formatVariation(money("-5.00")), "—");
  assert.equal(model.formatComparisonValue(null, "ARS"), "—");
});
test("motivos comprensibles distinguen ausencia, pendientes y subtotal", () => {
  for (const [reason, fragment] of [["CURRENT_NO_EERR", "No existe"], ["REFERENCE_PENDING", "pendientes"], ["CURRENT_SUBTOTAL", "cobertura"], ["REFERENCE_NOT_POSITIVE", "cero o negativa"]]) assert.match(model.comparisonReason(reason), new RegExp(fragment));
  assert.equal(model.sourceStatus("NO_EERR"), "Sin EERR");
  assert.match(model.sourceStatus("PARTIAL"), /Incompleto/);
  assert.equal(model.sourceStatus("COMPLETE"), "Completo");
});
test("vista inicial ofrece modos accesibles sin edición ni cálculo automático", () => {
  const html = renderToStaticMarkup(React.createElement(Comparisons, { period: { year: 2026, month: 9 } }));
  for (const value of ["Modos de comparación", "Sucursal entre períodos", "Sucursales del período", "Consolidado entre períodos"]) assert.match(html, new RegExp(value));
  assert.doesNotMatch(html, /Guardar|Eliminar|Crear período|0,00 ARS/);
});
test("una sola sucursal accesible no inventa pareja ni habilita la comparación", () => {
  const html = renderToStaticMarkup(React.createElement(TwoBranches, { period: { year: 2026, month: 9 }, branches: [{ branchId: "a", name: "Única" }] }));
  assert.match(html, /Hacen falta dos sucursales accesibles/);
  assert.doesNotMatch(html, /<select|Comparar sucursales/);
});

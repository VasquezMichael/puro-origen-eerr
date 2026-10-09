import "./tsx-loader.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const model = await import("../src/app/comparison-model.ts");
const dashboard = await import("../src/app/dashboard-model.ts");
const { Comparisons, TwoBranches } = await import("../src/app/dashboard-comparisons.tsx");

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

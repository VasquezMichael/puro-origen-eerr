import "./tsx-loader.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const { EerrApiError } = await import("../src/app/eerr/api.ts");
const model = await import("../src/app/dashboard-model.ts");
const { Coverage, Consolidated, Branches, PeriodPicker } = await import("../src/app/dashboard-sections.tsx");
const { dashboardError } = await import("../src/app/dashboard.tsx");
const { ROOTS } = await import("../../../packages/domain/dist/index.js");
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const amount = (value, reason = null, unit = "ARS") => ({ value, reason, unit, status: value === null ? "BLOCKED" : "COMPLETE" });
const branch = (status, overrides = {}) => ({ branchId: "a", name: "Sucursal Norte", active: true, temporal: "EXPECTED", eerrId: status === "NO_EERR" ? null : "eerr-1", revision: 1, loadStatus: "CARGADO", analysisStatus: status, reason: status === "COMPLETE" ? null : status, blocks: [
  { code: ROOTS[0].code, value: "9007199254740993.10", status: "COMPLETE" },
  { code: ROOTS[1].code, value: "0.00", status: "COMPLETE" },
  { code: ROOTS[2].code, value: null, status: "PENDING" },
], metrics: null, breakEvenSales: null, ...overrides });
function response(definitive = true, overrides = {}) {
  return { year: 2026, month: 9, timezone: "America/Argentina/Buenos_Aires", scope: { type: "GLOBAL", authorizedCount: 1, expectedCount: 1, label: "Consolidado global" },
    coverage: { expected: 1, withEerr: 1, withoutEerr: 0, complete: definitive ? 1 : 0, partial: definitive ? 0 : 1, pending: 0, empty: 0, uninitialized: 0, inactiveWithHistory: 0, inactiveWithoutHistory: 0, excludedNotStarted: 0 },
    consolidated: { definitive, status: definitive ? "COMPLETE" : "PARTIAL", includedCount: definitive ? 1 : 0, expectedCount: 1, label: definitive ? "Consolidado definitivo" : "Subtotal de 0 de 1 sucursales esperadas", income: amount(definitive ? "9007199254740993.10" : null, definitive ? null : "NO_COMPLETE_SOURCES"), costs: amount(definitive ? "0.00" : null), expenses: amount(definitive ? "5.00" : null), grossMargin: amount(definitive ? "9007199254740993.10" : null, definitive ? null : "INCOMPLETE_SCOPE"), grossMarginPercent: amount(definitive ? "20.0000" : null, null, "PERCENT"), netResult: amount(definitive ? "50.00" : null), netResultPercent: amount(definitive ? "10.0000" : null, null, "PERCENT"), breakEvenSales: amount(definitive ? "25.00" : null), targetSales: null },
    branches: [branch(definitive ? "COMPLETE" : "PARTIAL")], sourceSignature: "signature", ...overrides };
}
test("período inicial del negocio cruza UTC sin depender del navegador", () => {
  assert.deepEqual(model.currentPeriod(new Date("2026-10-01T01:00:00Z")), { year: 2026, month: 9 });
  assert.deepEqual(model.currentPeriod(new Date("2026-10-01T03:00:00Z")), { year: 2026, month: 10 });
});
test("URL válida, ausente e inválida; la normalización produce formato canónico", () => {
  const fallback = { year: 2026, month: 10 };
  assert.deepEqual(model.periodFromQuery(new URLSearchParams("year=2026&month=9"), fallback), { year: 2026, month: 9 });
  for (const query of ["year=2026&month=13", "year=0&month=9", "year=2026", "year=2026&month=9&month=10", "year=1e3&month=9", "year=2026&month=09"]) assert.deepEqual(model.periodFromQuery(new URLSearchParams(query), fallback), fallback);
  assert.equal(model.queryIsCanonical(new URLSearchParams("year=2026&month=10"), fallback), true);
  assert.equal(model.queryIsCanonical(new URLSearchParams("year=2026&month=09"), fallback), false);
  assert.equal(model.periodLabel({ year: 2026, month: 9 }), "Septiembre 2026");
});
test("selector tiene labels, año y mes y validación", () => {
  const html = render(PeriodPicker, { period: { year: 2026, month: 9 }, onSelect() {}, onRefresh() {}, loading: false });
  assert.match(html, /Año del Dashboard/); assert.match(html, /Mes del Dashboard/); assert.match(html, /Ver período/); assert.match(html, /Actualizar/);
  assert.equal(model.validPeriod(2026, 9), true); assert.equal(model.validPeriod(2026.5, 9), false);
});
test("alcance global y autorizado provienen del contrato", () => {
  assert.match(render(Coverage, { data: response() }), /Consolidado global/);
  assert.match(render(Coverage, { data: response(true, { scope: { type: "ACCESSIBLE", authorizedCount: 1, expectedCount: 1, label: "otro" } }) }), /Consolidado de mis sucursales accesibles/);
});
test("cobertura separa faltantes, estados e inactivas; ayuda histórica accesible", () => {
  const data = response(true); data.coverage.inactiveWithHistory = 1; data.coverage.withoutEerr = 2; data.coverage.pending = 1; data.coverage.empty = 1; data.coverage.uninitialized = 1; data.coverage.excludedNotStarted = 1;
  const html = render(Coverage, { data });
  for (const text of ["Esperadas", "Con EERR", "Sin EERR", "Completas", "Pendientes", "Vacías", "Sin estructura", "Inactivas con histórico", "Excluidas por no haber iniciado", "fecha de baja", "Ver detalle de cobertura", "aria-label"] ) assert.match(html, new RegExp(text));
});
test("consolidado definitivo conserva precisión, cero y supuesto; no crea objetivo", () => {
  const html = render(Consolidated, { data: response() });
  assert.match(html, /9\.007\.199\.254\.740\.993,10 ARS/); assert.match(html, /0,00 ARS/); assert.match(html, /20,0000 %/);
  assert.match(html, /Punto de Equilibrio/); assert.match(html, /mezcla observada/); assert.match(html, /No hay Objetivo de Venta consolidado/);
  assert.equal(model.formatDashboardMetric("-9007199254740993.10", "ARS"), "-9.007.199.254.740.993,10 ARS");
});
test("subtotal excluye derivados y explica fuentes", () => {
  const data = response(false); data.consolidated.includedCount = 1; data.consolidated.expectedCount = 2; data.consolidated.income = amount("5.00"); data.consolidated.costs = amount("0.00"); data.consolidated.expenses = amount("1.00");
  const html = render(Consolidated, { data });
  assert.match(html, /Subtotal de 1 de 2/); assert.match(html, /5,00 ARS/); assert.match(html, /Sucursal Norte \(Parcial/);
  assert.doesNotMatch(html, /<span>Margen Bruto<|<span>Resultado Neto<|<span>Punto de Equilibrio</);
});
test("sin EERR no presenta tarjetas con cero y ofrece navegación", () => {
  const data = response(false); data.coverage.withEerr = 0; data.coverage.withoutEerr = 1;
  const html = render(Consolidated, { data }); assert.match(html, /Sin EERR para este período/); assert.match(html, /href="\/eerr"/); assert.doesNotMatch(html, /0,00 ARS/);
});
test("null no se convierte en cero ni en tarjeta monetaria", () => {
  assert.equal(model.formatDashboardMetric(null, "ARS"), "—");
  const data = response(false); data.consolidated.includedCount = 0;
  const html = render(Consolidated, { data });
  assert.match(html, /Todavía no hay EERR completos/);
  assert.doesNotMatch(html, /<strong>0,00 ARS<\/strong>/);
});
test("fuente inexistente carece de importe y de acción de creación para Lector", () => {
  const data = response(false); data.branches = [branch("NO_EERR")];
  const html = render(Branches, { data });
  assert.match(html, /Sin EERR/); assert.doesNotMatch(html, /0,00 ARS|Crear período|Abrir EERR/);
});
test("bloque pendiente muestra raya, nunca un cero inventado", () => {
  const data = response(false); data.branches = [branch("PENDING", { blocks: ROOTS.map((root) => ({ code: root.code, value: null, status: "PENDING" })) })];
  const html = render(Branches, { data });
  assert.match(html, /<dd>—<small>/); assert.doesNotMatch(html, /0,00 ARS/);
});
test("sucursales completas, parciales, pendientes, vacías, sin estructura e inactivas", () => {
  const statuses = ["COMPLETE", "PARTIAL", "PENDING", "EMPTY", "UNINITIALIZED", "NO_EERR"];
  const data = response(); data.branches = statuses.map((status, index) => branch(status, { branchId: String(index), name: `Sucursal ${index}` })); data.branches.push(branch("COMPLETE", { branchId: "i", active: false, name: "Histórica" })); data.branches.push(branch("EXCLUDED", { branchId: "f", eerrId: null, temporal: "NOT_STARTED", name: "Futura" }));
  const html = render(Branches, { data });
  for (const text of ["Completo", "Parcial", "Importes sin cargar", "Sin ítems", "Sin estructura", "Sin EERR", "Inactiva · EERR histórico", "Aún no iniciada"]) assert.match(html, new RegExp(text));
  assert.match(html, /href="\/eerr\/eerr-1"/); assert.match(html, /0,00 ARS/); assert.match(html, /—/); assert.doesNotMatch(html, /Crear período/);
});
test("errores 400 y 409 ofrecen mensajes claros", () => {
  assert.match(dashboardError(new EerrApiError("interno", 409)), /Los datos cambiaron/);
  assert.match(dashboardError(new EerrApiError("interno", 400)), /período solicitado/);
});
test("respuestas antiguas o abortadas no reemplazan el período vigente", () => {
  assert.equal(model.acceptsDashboardResponse(2, 3, false), false);
  assert.equal(model.acceptsDashboardResponse(3, 3, true), false);
  assert.equal(model.acceptsDashboardResponse(3, 3, false), true);
});
test("firma, período y respuesta permanecen atómicos", () => {
  const data = response();
  assert.equal(model.visibleDashboard({ request: "2026-9:1", data, signature: "signature", error: "" }, "2026-9:1"), data);
  assert.equal(model.visibleDashboard({ request: "2026-8:1", data, signature: "signature", error: "" }, "2026-9:1"), null);
  assert.equal(model.visibleDashboard({ request: "2026-9:1", data, signature: "vieja", error: "" }, "2026-9:1"), null);
});

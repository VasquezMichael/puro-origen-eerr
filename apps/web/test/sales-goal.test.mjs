import "./tsx-loader.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const { canonicalSalesGoal, salesGoalDirty, initialSalesGoalDraft, formatGoalPercent } = await import("../src/app/eerr/[id]/sales-goal-form.ts");
const { ProjectionsSection, projectionExplanation } = await import("../src/app/eerr/[id]/projections-section.tsx");
const { SalesGoalModal } = await import("../src/app/eerr/[id]/sales-goal-modal.tsx");
const metric = (value, unit = "ARS", reason = null) => ({ status: value === null ? "BLOCKED" : "COMPLETE", value, unit, reason });
const fixture = (goal = null) => ({ salesGoal: goal, projections: {
  breakEvenSales: metric("50000.00"), targetSales: goal ? metric("66666.67") : metric(null, "ARS", "GOAL_NOT_CONFIGURED"),
  targetReference: { ...goal ? metric(goal.mode === "NET_MARGIN_PERCENT" ? "6666.67" : "13.3333", goal.mode === "NET_MARGIN_PERCENT" ? "ARS" : "PERCENT") : metric(null, "ARS", "GOAL_NOT_CONFIGURED"), type: goal ? goal.mode === "NET_MARGIN_PERCENT" ? "NET_PROFIT_AMOUNT" : "NET_MARGIN_PERCENT" : null },
} });
const render = (analysis, canEdit = false) => renderToStaticMarkup(React.createElement(ProjectionsSection,
  { analysis, canEdit, disabled: false, onConfigure() {}, onDelete() {} }));

test("adapta coma o punto sin Number y respeta escalas, rango y máximo", () => {
  for (const [mode, input, expected] of [
    ["NET_MARGIN_PERCENT", "10,1234", "10.1234"],
    ["NET_MARGIN_PERCENT", "10.1234", "10.1234"],
    ["NET_MARGIN_PERCENT", "0", "0.0000"],
    ["NET_PROFIT_AMOUNT", "2000000,5", "2000000.50"],
    ["NET_PROFIT_AMOUNT", "2000000.50", "2000000.50"],
    ["NET_PROFIT_AMOUNT", "999999999999.99", "999999999999.99"],
  ]) assert.equal(canonicalSalesGoal({ mode, value: input }).value, expected);
  for (const [mode, value] of [
    ["NET_MARGIN_PERCENT", "100"], ["NET_MARGIN_PERCENT", "-1"],
    ["NET_MARGIN_PERCENT", "1.12345"], ["NET_MARGIN_PERCENT", "10%"],
    ["NET_PROFIT_AMOUNT", "1.000,00"], ["NET_PROFIT_AMOUNT", "1,000.00"],
    ["NET_PROFIT_AMOUNT", "1+2"], ["NET_PROFIT_AMOUNT", "1000000000000"],
    ["NET_PROFIT_AMOUNT", "1,001"],
  ]) assert.throws(() => canonicalSalesGoal({ mode, value }));
});

test("borrador de meta distingue equivalencia canónica y cambio de modalidad", () => {
  const saved = { mode: "NET_MARGIN_PERCENT", value: "10.0000" };
  assert.deepEqual(initialSalesGoalDraft(saved), { mode: saved.mode, value: "10,0000" });
  assert.equal(salesGoalDirty(initialSalesGoalDraft(saved), saved), false);
  assert.equal(salesGoalDirty({ mode: saved.mode, value: "10.00" }, saved), false);
  assert.equal(salesGoalDirty({ mode: saved.mode, value: "11" }, saved), true);
  assert.equal(salesGoalDirty({ mode: "NET_PROFIT_AMOUNT", value: "10" }, saved), true);
  assert.equal(salesGoalDirty({ mode: "NET_MARGIN_PERCENT", value: "" }, null), false);
  assert.equal(salesGoalDirty({ mode: "NET_MARGIN_PERCENT", value: "1" }, null), true);
  assert.equal(formatGoalPercent("10.0000"), "10,00 %");
  assert.equal(formatGoalPercent("10.1234"), "10,1234 %");
});

test("sin meta conserva equilibrio, muestra raya y mensaje; Lector no ve acciones", () => {
  const markup = render(fixture());
  assert.match(markup, /Punto de Equilibrio/);
  assert.match(markup, /50\.000,00 ARS/);
  assert.match(markup, /Configurá una meta para calcular el Objetivo de Venta/);
  assert.match(markup, /Referencia secundaria/);
  assert.match(markup, /—/);
  assert.doesNotMatch(markup, /<button[^>]*>Configurar meta/);
  assert.match(render(fixture(), true), /Configurar meta/);
  assert.doesNotMatch(markup, /<canvas|<svg|semáforo|meta global/i);
});

test("porcentaje, monto y referencia se distinguen; cero no se confunde con null", () => {
  const percent = render(fixture({ mode: "NET_MARGIN_PERCENT", value: "10.0000" }), true);
  assert.match(percent, /Meta principal/);
  assert.match(percent, /Margen neto deseado/);
  assert.match(percent, /10,00 %/);
  assert.match(percent, /66\.666,67 ARS/);
  assert.match(percent, /Ganancia neta estimada/);
  assert.match(percent, /6\.666,67 ARS/);
  assert.match(percent, /Cambiar meta/);
  assert.match(percent, /Eliminar meta/);
  const amount = render(fixture({ mode: "NET_PROFIT_AMOUNT", value: "2000000.00" }));
  assert.match(amount, /2\.000\.000,00 ARS/);
  assert.match(amount, /Margen neto equivalente/);
  assert.match(amount, /13,33 %/);
  const zero = fixture(); zero.projections.breakEvenSales = metric("0.00");
  assert.match(render(zero), /0,00 ARS/);
});

test("motivos no calculables se traducen sin códigos ni cero ficticio", () => {
  for (const reason of ["PENDING_INPUTS", "EMPTY_INPUT", "ZERO_REVENUE", "NON_POSITIVE_CONTRIBUTION_MARGIN", "TARGET_MARGIN_UNATTAINABLE", "ZERO_DENOMINATOR"]) {
    const data = fixture({ mode: "NET_PROFIT_AMOUNT", value: "1.00" });
    data.projections.breakEvenSales = metric(null, "ARS", reason);
    data.projections.targetSales = metric(null, "ARS", reason);
    data.projections.targetReference = { ...metric(null, "PERCENT", reason), type: "NET_MARGIN_PERCENT" };
    const markup = render(data);
    assert.match(markup, /—/);
    assert.match(markup, new RegExp(projectionExplanation(reason, true).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(markup, new RegExp(reason));
    assert.doesNotMatch(markup, /0,00 ARS/);
  }
});

test("supuestos accesibles y números largos sin truncamiento", () => {
  const data = fixture(); data.projections.breakEvenSales = metric("9007199254740993.10");
  const markup = render(data);
  assert.match(markup, /9\.007\.199\.254\.740\.993,10 ARS/);
  for (const term of ["netos de IVA", "costos variables", "mayormente fijos", "relación actual", "semivariables"])
    assert.match(markup, new RegExp(term));
  assert.match(markup, /<details/);
});

test("modal muestra modalidades, confirmaciones, error asociado y contexto", () => {
  const common = { context: "Sucursal ficticia · 09/2026", saved: null,
    draft: { mode: "NET_MARGIN_PERCENT", value: "10,1234" }, pendingMode: null,
    busy: false, ready: true, error: "Valor inválido", conflict: false, refreshPending: false,
    confirmDiscard: true, inputRef: { current: null }, onClose() {}, onDiscard() {},
    onValue() {}, onMode() {}, onConfirmMode() {}, onCancelMode() {},
    onSave() {}, onDelete() {}, onRefresh() {} };
  const form = renderToStaticMarkup(React.createElement(SalesGoalModal, { ...common, kind: "form" }));
  assert.match(form, /<fieldset/);
  assert.match(form, /Margen neto deseado/);
  assert.match(form, /Ganancia neta deseada/);
  assert.match(form, /aria-invalid="true"/);
  assert.match(form, /sales-goal-error/);
  assert.match(form, /Descartar borrador de meta/);
  assert.match(form, /Sucursal ficticia/);
  const changing = renderToStaticMarkup(React.createElement(SalesGoalModal, { ...common,
    kind: "form", pendingMode: "NET_PROFIT_AMOUNT", error: "", confirmDiscard: false }));
  assert.match(changing, /Cambiar modalidad y limpiar valor/);
  const removing = renderToStaticMarkup(React.createElement(SalesGoalModal, { ...common,
    kind: "delete", error: "", confirmDiscard: false }));
  assert.match(removing, /El Punto de Equilibrio seguirá disponible/);
  assert.match(removing, /Confirmar eliminación de meta/);
  const refreshing = renderToStaticMarkup(React.createElement(SalesGoalModal, { ...common,
    kind: "form", error: "", confirmDiscard: false, refreshPending: true }));
  assert.match(refreshing, /Reintentar actualización/);
  assert.match(refreshing, /<button[^>]*disabled=""[^>]*>Cancelar/);
});

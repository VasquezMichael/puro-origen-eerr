import "./tsx-loader.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const { CompletePendingSummary, CompletePendingFlow } =
  await import("../src/app/eerr/[id]/complete-pending-flow.tsx");
const noop = () => {
  throw Error("No ejecutar efectos en render");
};
const p = {
  destination: { branchName: "Central", year: 2026, month: 9 },
  before: { total: 3, loaded: 1, pending: 2, status: "PARCIAL" },
  after: { total: 3, loaded: 3, pending: 0, status: "CARGADO" },
  affected: [
    {
      nodeId: "a",
      name: "Pendiente A",
      path: "INGRESOS / Ventas",
      block: "INGRESOS",
    },
    { nodeId: "b", name: "Pendiente B", path: "COSTOS", block: "COSTOS" },
  ],
  revision: 5,
  previewToken: "fixture",
};
const render = (component, props) =>
  renderToStaticMarkup(React.createElement(component, props));
test("Resumen muestra contexto, ruta, cantidad y progreso antes/después", () => {
  const html = render(CompletePendingSummary, {
    preview: p,
    stale: false,
    busy: false,
    blocked: false,
    onConfirm: noop,
  });
  for (const value of [
    "Central",
    "Pendiente A",
    "Pendiente B",
    "INGRESOS / Ventas",
    "100",
    "33",
    "importes se convertirán",
  ])
    assert.ok(html.includes(value));
  assert.doesNotMatch(html, /disabled=""/);
  assert.match(html, /completePendingList/);
});
for (const condition of ["stale", "busy", "blocked", "token", "noop"])
  test("No confirma " + condition, () => {
    const html = render(CompletePendingSummary, {
      preview: {
        ...p,
        ...(condition === "token" ? { previewToken: null } : {}),
        ...(condition === "noop" ? { affected: [] } : {}),
      },
      stale: condition === "stale",
      busy: condition === "busy",
      blocked: condition === "blocked",
      onConfirm: noop,
    });
    assert.match(html, /disabled=""/);
    if (condition === "noop") assert.match(html, /No hay cambios por realizar/);
    if (condition === "stale") assert.match(html, /resumen se conserva/);
  });
for (const pending of [true, false])
  test("Advertencias y borradores " + pending, () => {
    const html = render(CompletePendingFlow, {
      id: "fixture",
      pending,
      blocked: false,
      onBusy: noop,
      onClose: noop,
      onCompleted: noop,
    });
    assert.match(html, /No modificará cantidades ni cerrará el período/);
    assert.match(html, /El período sigue editable/);
    assert.match(html, /Cancelar|Volver a los borradores/);
    if (pending) {
      assert.match(html, /Guardá o descartá/);
      assert.doesNotMatch(html, />Generar vista previa</);
    } else assert.match(html, />Generar vista previa</);
  });

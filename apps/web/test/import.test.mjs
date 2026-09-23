import "./tsx-loader.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  emptyAmount,
  emptyQuantity,
} from "../../../packages/domain/dist/index.js";
const { ImportFlow, ImportSummary } =
  await import("../src/app/eerr/[id]/import-flow.tsx");
const noWrite = () => {
  throw Error("No escribir en render");
};
const render = (Component, props) =>
  renderToStaticMarkup(React.createElement(Component, props));
const p = {
  destination: { branchName: "Central", year: 2026, month: 9 },
  fileName: "carga.csv",
  format: "csv",
  readRows: 1,
  changedFields: 1,
  unchangedFields: 1,
  affectedItems: 1,
  issues: [],
  warnings: ["Notas y estructura conservadas"],
  revision: 3,
  previewToken: "fixture",
  rows: [
    {
      row: 2,
      name: "Digitales",
      before: { amount: emptyAmount(), quantity: emptyQuantity() },
      after: {
        amount: {
          ...emptyAmount(),
          state: "CARGADO",
          input: "10+20",
          value: "30.00",
        },
        quantity: emptyQuantity(),
      },
      changed: ["amount"],
    },
  ],
};
for (const canEdit of [true, false])
  test(`Acción importación según edición ${canEdit}`, () => {
    const html = render(ImportFlow, {
      id: "fixture",
      canEdit,
      blocked: false,
      onDirty: noWrite,
      onBusy: noWrite,
      onImported: noWrite,
    });
    assert.match(html, canEdit ? /Importar archivo/ : /Descargar plantilla/);
    assert.doesNotMatch(html, /type="file"/);
  });
test("Borradores bloquean empezar importación", () => {
  assert.match(
    render(ImportFlow, {
      id: "fixture",
      canEdit: true,
      blocked: true,
      onDirty: noWrite,
      onBusy: noWrite,
      onImported: noWrite,
    }),
    /disabled=""/,
  );
});
test("Preview muestra antes, después, expresión, errores y resumen", () => {
  const html = render(ImportSummary, {
    preview: p,
    stale: false,
    busy: false,
    onConfirm: noWrite,
  });
  for (const text of [
    "Central",
    "carga.csv",
    "30.00",
    "10+20",
    "Sin cargar",
    "campos cambiarían",
    "sin cambios",
  ])
    assert.ok(html.includes(text));
  assert.doesNotMatch(html, /fixture/);
});
for (const condition of ["errors", "stale", "busy", "token", "noop"])
  test(`Confirmar deshabilitado por ${condition}`, () => {
    const html = render(ImportSummary, {
      preview: {
        ...p,
        issues:
          condition === "errors"
            ? [{ row: 3, field: "cantidad", message: "Entero inválido" }]
            : [],
        previewToken: condition === "token" ? null : p.previewToken,
        changedFields: condition === "noop" ? 0 : 1,
      },
      stale: condition === "stale",
      busy: condition === "busy",
      onConfirm: noWrite,
    });
    assert.match(html, /<button[^>]*disabled/);
    if (condition === "stale")
      assert.match(html, /archivo y este resumen se conservan/);
    if (condition === "errors") assert.match(html, /Fila 3/);
  });

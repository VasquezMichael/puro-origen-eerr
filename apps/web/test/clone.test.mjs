import "./tsx-loader.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const { CloneFlow, CloneSummary } =
  await import("../src/app/eerr/[id]/clone-flow.tsx");
const noWrite = () => {
  throw Error("No escribir al render");
};
const render = (component, props) =>
  renderToStaticMarkup(React.createElement(component, props));
const preview = {
  source: { id: "source-uuid", branchName: "Central", year: 2026, month: 8 },
  destination: {
    id: "destination-uuid",
    branchName: "Otra",
    year: 2026,
    month: 9,
  },
  mode: "ESTRUCTURA_Y_VALORES",
  counts: {
    blocks: ["INGRESOS", "COSTOS", "GASTOS GENERALES"],
    categories: 1,
    items: 3,
    loadedAmounts: 2,
    loadedQuantities: 1,
    zeroAmounts: 1,
    zeroQuantities: 1,
    unloadedAmounts: 1,
    unloadedQuantities: 2,
  },
  destinationCategories: 2,
  compatible: true,
  issues: [],
  seedTemplate: false,
  crossBranchWarning: "Estás por copiar valores desde otra sucursal.",
  included: ["Importes", "Cantidades"],
  excluded: ["Notas", "Archivados", "Auditoría"],
  revisions: { source: 4, destination: 0, template: 2 },
  previewToken: "fixture-token",
};
const props = {
  id: "id",
  data: { revision: 0, note: null, structure: null },
  disabled: false,
  pending: false,
  onBase: noWrite,
  onInitialized: noWrite,
  onReload: noWrite,
};
test("EERR sin inicializar ofrece tres alternativas sin escribir", () => {
  const html = render(CloneFlow, props);
  for (const label of [
    "Usar estructura base",
    "Clonar estructura",
    "Clonar estructura y valores",
  ])
    assert.ok(html.includes(label));
});
test("Inicializado no muestra clonación", () => {
  assert.equal(
    render(CloneFlow, {
      ...props,
      data: { ...props.data, structure: { nodes: [] } },
    }),
    "",
  );
});
test("Nota o revisión previa excluye clonación y mantiene base", () => {
  for (const data of [
    { ...props.data, note: "nota" },
    { ...props.data, revision: 2 },
  ]) {
    const html = render(CloneFlow, { ...props, data });
    assert.doesNotMatch(html, />Clonar estructura</);
    assert.match(html, /Usar estructura base/);
  }
});
test("Borradores bloquean clonación sin descarte", () => {
  const html = render(CloneFlow, { ...props, pending: true });
  assert.match(html, /disabled="">Clonar estructura</);
  assert.match(html, /cancelá los borradores/);
});
test("Preview muestra sucursales, alcance y exclusiones sin UUID protagonistas", () => {
  const html = render(CloneSummary, {
    preview,
    accepted: false,
    busy: false,
    onAccept: noWrite,
    onConfirm: noWrite,
    onBack: noWrite,
  });
  assert.match(html, /Central/);
  assert.match(html, /Otra/);
  assert.match(html, /3 ítems activos/);
  assert.match(html, /Notas/);
  assert.match(html, /Archivados/);
  assert.doesNotMatch(html, /source-uuid|destination-uuid|fixture-token/);
  assert.match(html, /type="checkbox"/);
});
for (const condition of ["cross", "incompatible", "busy", "token"])
  test(`Confirmación bloqueada por ${condition}`, () => {
    const html = render(CloneSummary, {
      preview: {
        ...preview,
        compatible: condition !== "incompatible",
        previewToken: condition === "token" ? null : preview.previewToken,
      },
      accepted: condition !== "cross",
      busy: condition === "busy",
      onAccept: noWrite,
      onConfirm: noWrite,
      onBack: noWrite,
    });
    assert.match(html, /<button[^>]*disabled/);
  });
test("Incompatibilidades requieren resolver plantilla, sin ofrecer reemplazo", () => {
  const html = render(CloneSummary, {
    preview: {
      ...preview,
      compatible: false,
      issues: ["Categoría requerida ausente"],
    },
    accepted: false,
    busy: false,
    onAccept: noWrite,
    onConfirm: noWrite,
    onBack: noWrite,
  });
  assert.match(html, /role="alert"/);
  assert.match(html, /Categoría requerida ausente/);
  assert.match(html, /acciones de categorías/);
  assert.doesNotMatch(html, />Reemplazar</);
});

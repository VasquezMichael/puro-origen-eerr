import "./tsx-loader.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { initialNodes, emptyAmount } from "@puro-origen/domain";
const { MovementForm } = await import("../src/app/eerr/[id]/movement-form.tsx");
const { availableActions, movementRank, incompatibleMovementDrafts } =
  await import("../src/app/eerr/[id]/workspace-model.ts");
const { editorReducer, initialEditorState } =
  await import("../src/app/eerr/[id]/editor-state.ts");
function fixture() {
  const nodes = initialNodes([], randomUUID);
  const add = (kind, name, parentId, position) => {
    const node = {
      nodeId: randomUUID(),
      code: randomUUID(),
      kind,
      name,
      parentId,
      position,
      ...(kind === "ITEM" ? { amount: emptyAmount() } : {}),
    };
    nodes.push(node);
    return node;
  };
  const a = add("CATEGORY", "Ventas", nodes[0].nodeId, 0),
    b = add("CATEGORY", "Canales", nodes[0].nodeId, 2),
    i = add("ITEM", "Local", nodes[0].nodeId, 1),
    child = add("ITEM", "Digitales", a.nodeId, 0);
  return { nodes, a, b, i, child };
}
const noWrite = () => {
  throw Error("No escribir al render");
};
function render(f, extra = {}) {
  return renderToStaticMarkup(
    React.createElement(MovementForm, {
      nodes: f.nodes,
      node: f.a,
      selection: { parentId: f.a.parentId, position: 0 },
      preview: null,
      busy: false,
      disabled: false,
      incompatible: false,
      onChange: noWrite,
      onSubmit: noWrite,
      onConfirm: noWrite,
      onBack: noWrite,
      onClose: noWrite,
      ...extra,
    }),
  );
}
test("Categorías ignoran ítems locales al calcular Subir/Bajar", () => {
  const f = fixture();
  assert.deepEqual(movementRank(f.nodes, f.b), { index: 1, total: 2 });
  assert.ok(!availableActions(f.nodes, f.a, true).includes("UP"));
  assert.ok(!availableActions(f.nodes, f.b, true).includes("DOWN"));
  assert.ok(availableActions(f.nodes, f.b, true).includes("UP"));
});
test("Bloques, lectores y archivados no tienen movimientos", () => {
  const f = fixture();
  assert.deepEqual(availableActions(f.nodes, f.a, false), []);
  assert.ok(
    !availableActions(f.nodes, f.nodes[0], true).some((a) =>
      ["UP", "DOWN", "MOVE_CATEGORY", "MOVE_ITEM"].includes(a),
    ),
  );
  f.i.archive = { state: "ARCHIVED" };
  assert.deepEqual(availableActions(f.nodes, f.i, true), ["RESTORE"]);
});
test("Modal filtra otro bloque, sí mismo, descendientes e ítems", () => {
  const f = fixture(),
    html = render(f);
  for (const node of [f.a, f.child, f.i, f.nodes[1], f.nodes[2]])
    assert.ok(!html.includes(`value="${node.nodeId}"`));
  assert.ok(html.includes(`value="${f.b.nodeId}"`));
  assert.match(html, /Nuevo padre<select/);
  assert.match(html, /Posición entre categorías/);
  assert.doesNotMatch(html, /Confirmar movimiento global/);
});
test("Preview separado muestra alcance y confirmación; envío bloqueado durante carga", () => {
  const f = fixture();
  const html = render(f, {
    busy: true,
    disabled: true,
    preview: {
      name: f.a.name,
      from: { name: "INGRESOS", position: 0 },
      to: { name: f.b.name, position: 0 },
      block: { name: "INGRESOS" },
      month: 9,
      year: 2026,
      affected: 3,
      initialized: 2,
      uninitialized: 1,
      accessibleEerrs: ["11111111-1111-4111-8111-111111111111"],
      warning: "Cambio global del período",
      noOp: false,
    },
  });
  assert.match(html, /3 EERR afectados/);
  assert.match(html, /Confirmar movimiento global/);
  assert.match(html, /<button[^>]*disabled/);
  assert.doesNotMatch(html, /Revisar movimiento global/);
});
test("Borrador descendiente bloquea movimiento; no descarta ni escribe", () => {
  const f = fixture(),
    data = { structure: { nodes: f.nodes } };
  assert.equal(
    incompatibleMovementDrafts(data, { [f.child.nodeId]: "1+2" }, f.a.nodeId),
    1,
  );
  assert.equal(
    incompatibleMovementDrafts(data, { [f.i.nodeId]: "8" }, f.a.nodeId),
    0,
  );
  assert.equal(
    incompatibleMovementDrafts(
      data,
      { ["move:" + f.a.nodeId]: "selección" },
      f.a.nodeId,
    ),
    0,
  );
  assert.match(render(f, { incompatible: true }), /Continuar editando/);
  assert.doesNotMatch(
    render(f, { incompatible: true }),
    /Guardar movimiento|Revisar movimiento/,
  );
});
test("409 y recarga preservan selección y borradores ajenos", () => {
  const f = fixture(),
    key = "move:" + f.a.nodeId,
    drafts = {
      [key]: JSON.stringify({ parentId: f.b.nodeId, position: 0 }),
      [f.i.nodeId]: "9",
    };
  let s = { ...initialEditorState, drafts };
  s = editorReducer(s, { type: "CONFLICT" });
  s = editorReducer(s, {
    type: "RELOAD",
    data: { structure: { nodes: f.nodes } },
  });
  assert.deepEqual(s.drafts, drafts);
});
test("Destino desaparecido conserva selección y bloquea guardar", () => {
  const f = fixture(),
    html = render(f, { selection: { parentId: randomUUID(), position: 12 } });
  assert.match(html, /Destino ya no disponible/);
  assert.match(html, /fuera del rango actual/);
  assert.match(html, /<button[^>]*disabled/);
});

import "./tsx-loader.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const { visibleRows, nodeActions, mayEdit, changedValue, pendingDraftCount } =
  await import("../src/app/eerr/[id]/workspace-model.ts");
const { ValueEditor, NoteEditor } =
  await import("../src/app/eerr/[id]/field-editors.tsx");
const { Modal, ActionMenu } = await import("../src/app/eerr/overlays.tsx");
const { WorkspaceShell } = await import("../src/app/eerr/workspace-shell.tsx");
const { editorReducer, initialEditorState } =
  await import("../src/app/eerr/[id]/editor-state.ts");
const render = (component, props) =>
  renderToStaticMarkup(React.createElement(component, props));
const props = {
  canEdit: true,
  busy: false,
  conflict: false,
  draft: undefined,
  onDraft() {},
  onSave() {
    throw new Error("No escribir al renderizar");
  },
};
const tree = [
  { nodeId: "i", parentId: "sub", kind: "ITEM", position: 0 },
  { nodeId: "root", parentId: null, kind: "BLOCK", position: 0 },
  { nodeId: "cat", parentId: "root", kind: "CATEGORY", position: 0 },
  { nodeId: "sub", parentId: "cat", kind: "CATEGORY", position: 0 },
];
test("Jerarquía plana ordenada e indentación de múltiples niveles sin mutar snapshot", () => {
  const before = structuredClone(tree);
  assert.deepEqual(
    visibleRows(tree, new Set()).map((r) => [r.node.nodeId, r.depth]),
    [
      ["root", 0],
      ["cat", 1],
      ["sub", 2],
      ["i", 3],
    ],
  );
  assert.deepEqual(tree, before);
});
for (const [id, count] of [
  ["root", 1],
  ["cat", 2],
  ["sub", 3],
])
  test(`Contraer ${id} oculta solo descendientes; expandir los recupera`, () => {
    assert.equal(visibleRows(tree, new Set([id])).length, count);
    assert.equal(visibleRows(tree, new Set()).length, 4);
  });
for (const kind of ["BLOCK", "CATEGORY", "ITEM"])
  test(`Menú de ${kind}: solo capacidades existentes y Lector sin ediciones`, () => {
    assert.deepEqual(nodeActions(kind, false), []);
    const actions = nodeActions(kind, true);
    assert.ok(actions.length);
    assert.ok(!actions.some((a) => /DELETE|CLONE/.test(a)));
    if (kind === "BLOCK") assert.ok(!actions.includes("RENAME_CATEGORY"));
    if (kind === "CATEGORY") assert.ok(actions.includes("RENAME_CATEGORY"));
    if (kind === "ITEM") assert.ok(actions.includes("ZERO_QUANTITY"));
  });
for (const [role, expected] of [
  ["EDITOR", true],
  ["READER", false],
])
  test(`Permiso visual ${role} requiere asignación`, () => {
    assert.equal(
      mayEdit(
        { isAdmin: false, branchAccesses: [{ branchId: "abc", role }] },
        "abc",
      ),
      expected,
    );
    assert.equal(
      mayEdit(
        { isAdmin: false, branchAccesses: [{ branchId: "abc", role }] },
        "other",
      ),
      false,
    );
  });
test("Administrador edita sin asignación", () =>
  assert.equal(mayEdit({ isAdmin: true, branchAccesses: [] }, "abc"), true));
test("Guardado aparece solo con cambio explícito", () => {
  assert.equal(changedValue(undefined, "0"), false);
  assert.equal(changedValue("0", "0"), false);
  assert.equal(changedValue("", "0"), true);
});
test("Importe: preview exacto, label, resultado guardado separado y botón explícito", () => {
  const html = render(ValueEditor, {
    ...props,
    kind: "amount",
    name: "Digitales",
    state: "CARGADO",
    value: "12.30",
    original: "12,30",
    draft: "(1000 + 500) / 3",
  });
  assert.match(html, /500.00 ARS/);
  assert.match(html, /Guardado: 12,30 ARS/);
  assert.match(html, /Guardar importe de Digitales/);
  assert.match(html, /aria-describedby/);
  assert.match(html, /Borrador/);
});
test("Expresión inválida bloquea Guardar y asocia error accesible", () => {
  const html = render(ValueEditor, {
    ...props,
    kind: "amount",
    name: "A",
    state: "SIN_CARGAR",
    value: null,
    draft: "1\/0",
  });
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /<button[^>]*disabled/);
});
test("Sin cambios no presenta guardado", () => {
  const html = render(ValueEditor, {
    ...props,
    kind: "amount",
    name: "A",
    state: "CARGADO",
    value: "0.00",
  });
  assert.doesNotMatch(html, /<input|Guardar importe/);
  assert.match(html, /Editar importe/);
  assert.match(html, /0,00 ARS/);
});
test("Cantidad independiente sin ARS y SIN CARGAR distinto de cero", () => {
  const empty = render(ValueEditor, {
    ...props,
    kind: "quantity",
    name: "A",
    state: "SIN_CARGAR",
    value: null,
  });
  const zero = render(ValueEditor, {
    ...props,
    kind: "quantity",
    name: "A",
    state: "CARGADO",
    value: "0",
  });
  assert.match(empty, /Sin cargar/);
  assert.doesNotMatch(zero, /Sin cargar/);
  assert.doesNotMatch(zero, /ARS/);
});
for (const state of ["saving", "error", "conflict", "saved"])
  test(`Estado de campo ${state} es accesible`, () => {
    const html = render(ValueEditor, {
      ...props,
      kind: "amount",
      name: "A",
      state: "CARGADO",
      value: "0.00",
      busy: state === "saving",
      conflict: state === "conflict",
      draft: state === "saved" ? undefined : "1",
      feedback: {
        state,
        ...(state === "error" ? { message: "Falló la escritura" } : {}),
      },
    });
    assert.match(html, /role="status"/);
    if (state === "saving" || state === "conflict")
      assert.match(html, /<button[^>]*disabled/);
    if (state === "error") assert.match(html, /Falló la escritura/);
  });
test("Lector ve expresión, importe y notas sin controles", () => {
  const value = render(ValueEditor, {
    ...props,
    canEdit: false,
    kind: "amount",
    name: "A",
    state: "CARGADO",
    value: "2.00",
    original: "1+1",
  });
  assert.match(value, /1\+1/);
  assert.doesNotMatch(value, /<input|<button/);
  const note = render(NoteEditor, {
    ...props,
    canEdit: false,
    title: "Nota",
    saved: "Uno\nDos",
    limit: 1000,
  });
  assert.match(note, /Uno\nDos/);
  assert.doesNotMatch(note, /<textarea|<button/);
});
test("Nota general e ítem preservan saltos y límites", () => {
  for (const limit of [1000, 4000]) {
    const html = render(NoteEditor, {
      ...props,
      title: "Nota",
      saved: null,
      draft: "Uno\nDos",
      limit,
    });
    assert.match(html, new RegExp(`maxLength="${limit}"`));
    assert.match(html, /Uno\nDos/);
    assert.match(html, /Guardar nota/);
  }
});
test("Modal accesible no escribe al render; botón de cierre bloqueado durante envío", () => {
  const html = render(Modal, {
    title: "Detalle",
    context: "Sucursal y período",
    busy: true,
    onClose() {
      throw Error("No cerrar al render");
    },
    children: "Contenido",
  });
  assert.match(html, /<dialog/);
  assert.match(html, /aria-labelledby/);
  assert.match(html, /aria-describedby/);
  assert.match(html, /<button[^>]*disabled/);
});
test("Menú usa top layer y nombres legibles", () => {
  const html = render(ActionMenu, {
    name: "A",
    actions: [{ label: "Editar detalle", run() {} }],
  });
  assert.match(html, /popover="auto"/);
  assert.match(html, /role="menuitem"/);
  assert.match(html, /aria-haspopup="menu"/);
});
test("Shell solo enlaza sucursales para Administrador", () => {
  const reader = render(WorkspaceShell, {
    role: "Lector",
    status: "Listo",
    children: "Contenido",
  });
  assert.doesNotMatch(reader, /href="\/admin\/sucursales"/);
  const admin = render(WorkspaceShell, {
    role: "Administrador",
    isAdmin: true,
    status: "Listo",
    children: "Contenido",
  });
  assert.match(admin, /href="\/admin\/sucursales"/);
  assert.match(admin, /role="status"/);
});
test("Borradores de nombre, unidad y detalles sobreviven 409 y recarga", () => {
  const drafts = {
    "name:i": "Nuevo",
    "action:ITEM:cat": "Borrador",
    "action:ITEM:cat:unit": "kg",
    "note:i": "Nota",
    i: "1+2",
    "quantity:i": "5",
  };
  let s = { ...initialEditorState, drafts };
  s = editorReducer(s, { type: "CONFLICT" });
  s = editorReducer(s, { type: "RELOAD", data: null });
  assert.deepEqual(s.drafts, drafts);
});

test("Contador no anuncia borradores idénticos a datos persistidos", () => {
  const data = {
    note: "General",
    structure: {
      nodes: [
        {
          nodeId: "i",
          name: "A",
          amount: { input: "1+1", value: "2.00" },
          quantity: { value: "0" },
          note: "Nota",
        },
      ],
    },
  };
  assert.equal(
    pendingDraftCount(data, {
      i: "1+1",
      "name:i": "A",
      "quantity:i": "0",
      "note:i": "Nota",
      "period-note": "General",
    }),
    0,
  );
  assert.equal(pendingDraftCount(data, { i: "3", "name:i": "B" }), 2);
});

test("Resultado monetario prioritario, expresión completa secundaria e histórico sin expresión inventada", () => {
  const base = {
    ...props,
    kind: "amount",
    name: "Prueba",
    state: "CARGADO",
    value: "1500.00",
  };
  const html = render(ValueEditor, { ...base, original: "1000 + 500" });
  assert.ok(html.indexOf("1.500,00 ARS") < html.indexOf("1000 + 500"));
  assert.match(html, /class="result"/);
  assert.match(html, /class="expression"/);
  assert.doesNotMatch(html, /<input|<form/);
  const legacy = render(ValueEditor, base);
  assert.doesNotMatch(legacy, /class="expression"|undefined|<input/);
  assert.match(legacy, /1.500,00 ARS/);
});
test("Archivados se excluyen de grilla y sus capacidades se limitan a restaurar", () => {
  const nodes = structuredClone(tree);
  nodes[0].archive = { state: "ARCHIVED" };
  assert.equal(visibleRows(nodes, new Set()).length, 3);
  assert.deepEqual(nodeActions("ITEM", true, true), ["RESTORE"]);
  assert.deepEqual(nodeActions("ITEM", false, true), []);
  for (const kind of ["BLOCK", "CATEGORY"])
    assert.ok(!nodeActions(kind, true).includes("ARCHIVE"));
  nodes[0].archive.state = "ACTIVE";
  assert.equal(visibleRows(nodes, new Set()).length, 4);
});
test("Cancelar una celda descarta únicamente su borrador, sin escribir ni alterar revisión/conflicto", () => {
  const state = {
    ...initialEditorState,
    data: { revision: 7 },
    conflict: true,
    drafts: { i: "2+2", "quantity:i": "9", "note:i": "Nota" },
  };
  const result = editorReducer(state, { type: "CANCEL", draftKey: "i" });
  assert.deepEqual(result.drafts, { "quantity:i": "9", "note:i": "Nota" });
  assert.equal(result.data, state.data);
  assert.equal(result.conflict, true);
  assert.equal(state.drafts.i, "2+2");
});

test("Expresión extensa ofrece texto completo mediante details accesible, sin depender de title", () => {
  const expression = "0 + ".repeat(50) + "0";
  const html = render(ValueEditor, {
    ...props,
    kind: "amount",
    name: "Prueba",
    state: "CARGADO",
    value: "0.00",
    original: expression,
  });
  assert.match(html, /<details><summary>Ver expresión completa<\/summary>/);
  assert.ok(html.includes(expression));
  assert.doesNotMatch(html, /title=/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  initialNodes,
  emptyAmount,
  cloneActiveNodes,
  assertCloneSource,
  cloneSourceCounts,
  loadProgress,
  prepareCloneNodes,
  cloneCategories,
} from "../dist/index.js";
function fixture() {
  const nodes = initialNodes([], randomUUID),
    root = nodes[0];
  const category = {
    nodeId: randomUUID(),
    code: randomUUID(),
    name: "Ventas",
    kind: "CATEGORY",
    parentId: root.nodeId,
    position: 0,
  };
  nodes.push(category);
  const amounts = [
    { ...emptyAmount(), state: "CARGADO", value: "30.00", input: "10+20" },
    { ...emptyAmount(), state: "CARGADO", value: "0.00", input: "0" },
    emptyAmount(),
  ];
  amounts.forEach((amount, i) =>
    nodes.push({
      nodeId: randomUUID(),
      code: randomUUID(),
      kind: "ITEM",
      parentId: category.nodeId,
      position: i,
      name: `Ítem ${i}`,
      amount,
      quantity:
        i === 0
          ? { state: "CARGADO", value: "5" }
          : i === 1
            ? { state: "CARGADO", value: "0" }
            : { state: "SIN_CARGAR", value: null },
      note: "No copiar",
      archive:
        i === 0
          ? { state: "ACTIVE", at: "2026-08-01T12:00:00Z", by: "old" }
          : undefined,
    }),
  );
  nodes.push({
    ...structuredClone(nodes.at(-1)),
    nodeId: randomUUID(),
    code: randomUUID(),
    name: "Archivado",
    position: 9,
    archive: { state: "ARCHIVED", at: "2026-08-01T12:00:00Z", by: "old" },
  });
  return {
    schemaVersion: 1,
    structureVersion: 8,
    initializedAt: "2026-08-01T12:00:00Z",
    initializedBy: "old",
    nodes,
  };
}
for (const mode of ["ESTRUCTURA", "ESTRUCTURA_Y_VALORES"])
  test(`Clonación ${mode}: identidad propia, códigos, parentesco y exclusiones`, () => {
    const source = fixture(),
      before = structuredClone(source),
      nodes = cloneActiveNodes(source, mode, randomUUID);
    assert.equal(nodes.length, source.nodes.length - 1);
    assert.deepEqual(source, before);
    for (const node of nodes) {
      const original = source.nodes.find((n) => n.code === node.code);
      assert.notEqual(node.nodeId, original.nodeId);
      assert.equal(node.name, original.name);
      assert.equal(node.position, original.position);
      assert.equal(
        node.parentId === null
          ? null
          : nodes.find((n) => n.nodeId === node.parentId).code,
        original.parentId === null
          ? null
          : source.nodes.find((n) => n.nodeId === original.parentId).code,
      );
      assert.equal(node.note, undefined);
      assert.equal(node.archive, undefined);
      assert.equal(node.initializedBy, undefined);
    }
    nodes.at(-1).name = "Independiente";
    assert.deepEqual(source, before);
  });
test("Solo estructura: nada cargado, sin expresiones ni cantidades heredadas", () => {
  const nodes = cloneActiveNodes(fixture(), "ESTRUCTURA", randomUUID);
  for (const node of nodes.filter((n) => n.kind === "ITEM")) {
    assert.deepEqual(node.amount, emptyAmount());
    assert.deepEqual(node.quantity, { state: "SIN_CARGAR", value: null });
  }
  assert.equal(loadProgress(nodes).loaded, 0);
});
test("Valores preservan importe, expresión, cantidades, cero y ausencia", () => {
  const source = fixture(),
    nodes = cloneActiveNodes(source, "ESTRUCTURA_Y_VALORES", randomUUID);
  for (const node of nodes.filter((n) => n.kind === "ITEM")) {
    const original = source.nodes.find((n) => n.code === node.code);
    assert.deepEqual(node.amount, original.amount);
    assert.deepEqual(node.quantity, original.quantity);
    assert.notEqual(node.amount, original.amount);
  }
  assert.equal(loadProgress(nodes).loaded, 2);
});
test("Conteos distinguen cero, cargado y sin cargar y excluyen archivados", () => {
  assert.deepEqual(cloneSourceCounts(fixture().nodes), {
    blocks: ["INGRESOS", "COSTOS", "GASTOS GENERALES"],
    categories: 1,
    items: 3,
    loadedAmounts: 2,
    loadedQuantities: 2,
    zeroAmounts: 1,
    zeroQuantities: 1,
    unloadedAmounts: 1,
    unloadedQuantities: 1,
  });
});
for (const kind of [
  "expression",
  "range",
  "duplicate",
  "cycle",
  "version",
  "block",
  "quantity",
])
  test(`Origen inconsistente ${kind} se rechaza sin corregir`, () => {
    const source = fixture(),
      item = source.nodes[4];
    if (kind === "expression") item.amount.value = "31.00";
    if (kind === "range") item.amount.value = "1000000000000.00";
    if (kind === "duplicate") item.code = source.nodes[5].code;
    if (kind === "cycle") source.nodes[3].parentId = source.nodes[3].nodeId;
    if (kind === "version") source.schemaVersion = 9;
    if (kind === "block") source.nodes[0].name = "Otro";
    if (kind === "quantity") item.quantity.value = "1.2";
    const before = structuredClone(source);
    assert.throws(() => assertCloneSource(source));
    assert.deepEqual(source, before);
  });
test("Histórico sin expresión conserva resultado sin inventar entrada", () => {
  const source = fixture();
  source.nodes[4].amount.input = null;
  const copied = cloneActiveNodes(source, "ESTRUCTURA_Y_VALORES", randomUUID);
  assert.deepEqual(copied[4].amount, source.nodes[4].amount);
});

test("Plantilla existente conserva nombres y agrega categorías propias", () => {
  const source = fixture(),
    template = cloneCategories(source.nodes);
  template[0].name = "Nombre destino";
  template.push({
    code: randomUUID(),
    parentCode: source.nodes[0].code,
    name: "Extra",
    position: 1,
  });
  const result = prepareCloneNodes(source, "ESTRUCTURA", template, randomUUID);
  assert.equal(result.seedTemplate, false);
  assert.equal(result.categories.length, 2);
  assert.equal(
    result.nodes.find((n) => n.code === template[0].code).name,
    "Nombre destino",
  );
  assert.equal(result.nodes.filter((n) => n.kind === "ITEM").length, 3);
});
test("Sin plantilla siembra códigos y nombres del snapshot", () => {
  const source = fixture(),
    result = prepareCloneNodes(source, "ESTRUCTURA", null, randomUUID);
  assert.equal(result.seedTemplate, true);
  assert.deepEqual(result.categories, cloneCategories(source.nodes));
});
for (const issue of ["missing", "parent", "duplicate", "position", "cycle"])
  test(`Plantilla incompatible ${issue} rechazada`, () => {
    const source = fixture(),
      template = cloneCategories(source.nodes);
    if (issue === "missing") template.length = 0;
    if (issue === "parent") template[0].parentCode = source.nodes[1].code;
    if (issue === "duplicate") template.push({ ...template[0] });
    if (issue === "position") template[0].position = -1;
    if (issue === "cycle") template[0].parentCode = template[0].code;
    assert.throws(() =>
      prepareCloneNodes(source, "ESTRUCTURA", template, randomUUID),
    );
  });
test("Orden de categorías destino autoritativo con ítems intercalados", () => {
  const source = fixture(),
    root = source.nodes[0],
    a = source.nodes[3],
    item = source.nodes[4];
  item.parentId = root.nodeId;
  item.position = 1;
  const b = {
    nodeId: randomUUID(),
    code: randomUUID(),
    kind: "CATEGORY",
    name: "B",
    parentId: root.nodeId,
    position: 2,
  };
  source.nodes.push(b);
  const template = cloneCategories(source.nodes);
  template[0].position = 1;
  template[1].position = 0;
  const result = prepareCloneNodes(source, "ESTRUCTURA", template, randomUUID);
  const targetRoot = result.nodes.find((n) => n.code === root.code);
  assert.deepEqual(
    result.nodes
      .filter((n) => n.parentId === targetRoot.nodeId)
      .sort((a, b) => a.position - b.position)
      .map((n) => n.code),
    [b.code, item.code, a.code],
  );
});

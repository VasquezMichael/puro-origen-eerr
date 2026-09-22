import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  initialNodes,
  emptyAmount,
  activeSiblings,
  moveNode,
  financialRoot,
  assertStructure,
  moveCategory,
  restoreOrder,
} from "../dist/index.js";
function fixture() {
  const nodes = initialNodes([], randomUUID),
    root = nodes[0];
  const category = (name, parent, position) => ({
    nodeId: randomUUID(),
    code: randomUUID(),
    kind: "CATEGORY",
    name,
    parentId: parent.nodeId,
    position,
  });
  const a = category("A", root, 0),
    b = category("B", root, 1);
  nodes.push(a, b);
  const items = [0, 1, 2].map((position) => ({
    nodeId: randomUUID(),
    code: randomUUID(),
    kind: "ITEM",
    name: `Ítem ${position}`,
    parentId: a.nodeId,
    position,
    amount: {
      ...emptyAmount(),
      state: "CARGADO",
      input: "5+5",
      value: "10.00",
    },
    quantity: { state: "CARGADO", value: "2" },
    note: "Nota\nlocal",
  }));
  nodes.push(...items);
  return { nodes, root, a, b, items };
}
for (const [index, position] of [
  [1, 0],
  [1, 2],
])
  test(`Reordenar ${index} a ${position} normaliza y conserva datos`, () => {
    const { nodes, a, items } = fixture(),
      before = structuredClone(nodes),
      source = items[index];
    const result = moveNode(nodes, source.nodeId, a.nodeId, position);
    assert.equal(result.changed, true);
    assert.deepEqual(nodes, before);
    assert.equal(
      activeSiblings(result.nodes, a.nodeId)[position].nodeId,
      source.nodeId,
    );
    assert.deepEqual(
      activeSiblings(result.nodes, a.nodeId).map((n) => n.position),
      [0, 1, 2],
    );
    for (const node of result.nodes) {
      const original = before.find((n) => n.nodeId === node.nodeId);
      assert.deepEqual({ ...node, position: original.position }, original);
    }
  });
for (const index of [0, 1, 2])
  test(`Misma ubicación ${index} es no-op incluso con huecos legados`, () => {
    const { nodes, a, items } = fixture();
    items.forEach((n) => (n.position *= 3));
    const result = moveNode(nodes, items[index].nodeId, a.nodeId, index);
    assert.equal(result.changed, false);
    assert.deepEqual(result.nodes, nodes);
  });
test("Movimiento local conserva importe, expresión, cantidad, nota e identidad y normaliza origen/destino", () => {
  const { nodes, a, b, items } = fixture();
  const source = structuredClone(items[1]);
  const result = moveNode(nodes, source.nodeId, b.nodeId, 0);
  assert.deepEqual(
    result.nodes.find((n) => n.nodeId === source.nodeId),
    { ...source, parentId: b.nodeId, position: 0 },
  );
  assert.deepEqual(
    activeSiblings(result.nodes, a.nodeId).map((n) => n.position),
    [0, 1],
  );
});
test("Permite ítems bajo bloque, como el modelo existente", () => {
  const { nodes, root, items } = fixture();
  const result = moveNode(nodes, items[0].nodeId, root.nodeId, 1);
  assert.equal(
    activeSiblings(result.nodes, root.nodeId)[1].nodeId,
    items[0].nodeId,
  );
});
for (const invalid of [
  "block",
  "cross",
  "missing",
  "item",
  "self",
  "descendant",
  "position",
  "archived",
])
  test(`Rechaza ${invalid} sin alterar el árbol`, () => {
    const { nodes, root, a, b, items } = fixture();
    let id = items[0].nodeId,
      parent = b.nodeId,
      position = 0;
    if (invalid === "block") id = root.nodeId;
    if (invalid === "cross") parent = nodes[1].nodeId;
    if (invalid === "missing") parent = randomUUID();
    if (invalid === "item") parent = items[1].nodeId;
    if (invalid === "self") {
      id = a.nodeId;
      parent = a.nodeId;
    }
    if (invalid === "descendant") {
      id = a.nodeId;
      b.parentId = a.nodeId;
      b.position = 3;
      parent = b.nodeId;
    }
    if (invalid === "position") position = 999;
    if (invalid === "archived")
      items[0].archive = {
        state: "ARCHIVED",
        at: "2026-09-01T12:00:00Z",
        by: "fixture",
      };
    const before = structuredClone(nodes);
    assert.throws(() => moveNode(nodes, id, parent, position));
    assert.deepEqual(nodes, before);
  });
test("Archivados no ocupan posiciones activas y conservan su posición de recuperación", () => {
  const { nodes, a, items } = fixture();
  items[1].archive = {
    state: "ARCHIVED",
    at: "2026-09-01T12:00:00Z",
    by: "fixture",
  };
  const archived = structuredClone(items[1]);
  const result = moveNode(nodes, items[2].nodeId, a.nodeId, 0);
  assert.deepEqual(
    result.nodes.find((n) => n.nodeId === archived.nodeId),
    archived,
  );
  assert.deepEqual(
    activeSiblings(result.nodes, a.nodeId).map((n) => n.position),
    [0, 1],
  );
  assert.doesNotThrow(() => assertStructure(result.nodes));
});
test("Orden de lectura independiente del orden físico y sin mutación", () => {
  const { nodes, a } = fixture();
  const reversed = structuredClone(nodes).reverse(),
    before = structuredClone(reversed);
  assert.deepEqual(
    activeSiblings(nodes, a.nodeId),
    activeSiblings(reversed, a.nodeId),
  );
  assert.deepEqual(reversed, before);
});
test("Resolver bloque rechaza ciclo sin colgarse", () => {
  const { nodes, a, b } = fixture();
  a.parentId = b.nodeId;
  b.parentId = a.nodeId;
  assert.throws(() => financialRoot(nodes, a.nodeId));
});

test("Categorías intercambian sus espacios; ítems locales mantienen orden relativo", () => {
  const { nodes, root, a, b, items } = fixture();
  items[0].parentId = root.nodeId;
  items[0].position = 1;
  b.position = 2;
  const result = moveCategory(nodes, b.nodeId, root.nodeId, 0);
  assert.deepEqual(
    activeSiblings(result.nodes, root.nodeId).map((n) => n.nodeId),
    [b.nodeId, items[0].nodeId, a.nodeId],
  );
  assert.deepEqual(
    result.nodes.find((n) => n.nodeId === items[0].nodeId),
    items[0],
  );
});
test("Categoría mueve subárbol, permite volver al bloque y conserva datos", () => {
  const { nodes, root, a, b, items } = fixture();
  const moved = moveCategory(nodes, a.nodeId, b.nodeId, 0);
  for (const item of items)
    assert.deepEqual(
      moved.nodes.find((n) => n.nodeId === item.nodeId),
      item,
    );
  const back = moveCategory(moved.nodes, a.nodeId, root.nodeId, 0);
  assert.equal(
    back.nodes.find((n) => n.nodeId === a.nodeId).parentId,
    root.nodeId,
  );
});
test("Restaurar inserta posición preservada y desplaza sin duplicar ni perder metadata", () => {
  const { nodes, a, items } = fixture();
  items[1].archive = {
    state: "ARCHIVED",
    at: "2026-09-01T12:00:00Z",
    by: "fixture",
  };
  const reordered = moveNode(nodes, items[2].nodeId, a.nodeId, 0).nodes;
  const restored = restoreOrder(reordered, items[1].nodeId);
  assert.deepEqual(
    activeSiblings(restored, a.nodeId).map((n) => n.nodeId),
    [items[2].nodeId, items[1].nodeId, items[0].nodeId],
  );
  assert.deepEqual(
    restored.find((n) => n.nodeId === items[1].nodeId),
    { ...items[1], archive: { ...items[1].archive, state: "ACTIVE" } },
  );
});
test("Restaurar acota posición al final y rechaza padre perdido", () => {
  const { nodes, a, items } = fixture();
  items[1].position = 99;
  items[1].archive = {
    state: "ARCHIVED",
    at: "2026-09-01T12:00:00Z",
    by: "fixture",
  };
  assert.equal(
    activeSiblings(restoreOrder(nodes, items[1].nodeId), a.nodeId)[2].nodeId,
    items[1].nodeId,
  );
  items[1].parentId = randomUUID();
  assert.throws(() => restoreOrder(nodes, items[1].nodeId));
});
test("Profundidad del subárbol completo se valida antes de mover", () => {
  const { nodes, root, a, b } = fixture();
  let parent = b;
  for (let index = 0; index < 9; index++) {
    const child = {
      nodeId: randomUUID(),
      code: randomUUID(),
      parentId: parent.nodeId,
      kind: "CATEGORY",
      name: `Nivel ${index}`,
      position: 0,
    };
    nodes.push(child);
    parent = child;
  }
  assert.throws(
    () => moveCategory(nodes, a.nodeId, parent.nodeId, 0),
    /profundidad/,
  );
  assert.equal(a.parentId, root.nodeId);
});

test("Inicializar plantilla movida resuelve padres fuera del orden físico", () => {
  const parent = randomUUID(),
    child = randomUUID(),
    root = initialNodes([], randomUUID)[0].code;
  const nodes = initialNodes(
    [
      { code: child, parentCode: parent, name: "Hija", position: 0 },
      { code: parent, parentCode: root, name: "Padre", position: 0 },
    ],
    randomUUID,
  );
  assertStructure(nodes);
  assert.equal(
    nodes.find((n) => n.code === child).parentId,
    nodes.find((n) => n.code === parent).nodeId,
  );
});

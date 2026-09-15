import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  initialNodes,
  assertStructure,
  ROOTS,
  emptyAmount,
  loadProgress,
  applyCategories,
} from "../dist/index.js";
const roots = () => initialNodes([], randomUUID);
const item = (parentId) => ({
  kind: "ITEM",
  nodeId: randomUUID(),
  code: randomUUID(),
  parentId,
  position: 0,
  name: "Ventas",
  amount: emptyAmount(),
});
test("raíces protegidas exactas con códigos estables e instancias nuevas", () => {
  const a = roots(),
    b = roots();
  assert.deepEqual(
    a.map((n) => n.code),
    ROOTS.map((n) => n.code),
  );
  assert.notEqual(a[0].nodeId, b[0].nodeId);
  assert.doesNotThrow(() => assertStructure(a));
});
for (const [name, mutate] of [
  [
    "raíz adicional",
    (nodes) =>
      nodes.push({
        ...nodes[0],
        code: randomUUID(),
        nodeId: randomUUID(),
        position: 3,
      }),
  ],
  ["raíz eliminada", (nodes) => nodes.pop()],
  [
    "renombrar raíz",
    (nodes) => {
      nodes[0].name = "Otra";
    },
  ],
  [
    "mover raíz",
    (nodes) => {
      nodes[0].parentId = nodes[1].nodeId;
    },
  ],
  [
    "código reservado",
    (nodes) => nodes.push({ ...item(nodes[0].nodeId), code: ROOTS[1].code }),
  ],
  ["padre ajeno", (nodes) => nodes.push(item(randomUUID()))],
  [
    "hijo de ítem",
    (nodes) => {
      const a = item(nodes[0].nodeId);
      nodes.push(a, item(a.nodeId));
    },
  ],
  [
    "ciclo",
    (nodes) => {
      const a = {
        ...item(nodes[0].nodeId),
        kind: "CATEGORY",
        amount: undefined,
      };
      a.parentId = a.nodeId;
      nodes.push(a);
    },
  ],
  [
    "nombre hermano normalizado",
    (nodes) => {
      const a = item(nodes[0].nodeId);
      nodes.push(a, { ...item(a.parentId), name: "  VÉNTAS  ", position: 1 });
    },
  ],
  [
    "importe en bloque",
    (nodes) => {
      nodes[0].amount = emptyAmount();
    },
  ],
])
  test(`invariante: ${name}`, () => {
    const nodes = roots();
    mutate(nodes);
    assert.throws(() => assertStructure(nodes));
  });
test("cero cargado y pendiente tienen progreso diferente", () => {
  const nodes = roots();
  const a = item(nodes[0].nodeId);
  nodes.push(a);
  assert.equal(loadProgress(nodes).status, "SIN_CARGAR");
  a.amount = { ...emptyAmount(), state: "CARGADO", input: "0", value: "0.00" };
  assert.equal(loadProgress(nodes).status, "CARGADO");
  nodes.push({ ...item(nodes[1].nodeId), name: "Costo" });
  assert.equal(loadProgress(nodes).status, "PARCIAL");
  assert.equal(loadProgress(nodes).pending, 1);
});
test("categorías multinivel publican por código y preservan identidades, valores e histórico independiente", () => {
  const category = {
    code: randomUUID(),
    parentCode: ROOTS[0].code,
    name: "Venta",
    position: 0,
  };
  const child = {
    code: randomUUID(),
    parentCode: category.code,
    name: "Salón",
    position: 0,
  };
  const old = initialNodes([category, child], randomUUID);
  const a = item(old[4].nodeId);
  old.push(a);
  const next = applyCategories(
    old,
    [{ ...category, name: "Facturación" }, child],
    randomUUID,
  );
  assert.equal(old[3].name, "Venta");
  assert.equal(next[3].name, "Facturación");
  assert.equal(next[3].nodeId, old[3].nodeId);
  assert.deepEqual(next[5], a);
});

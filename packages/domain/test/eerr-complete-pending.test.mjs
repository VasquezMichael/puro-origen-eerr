import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  initialNodes,
  emptyAmount,
  completePendingPlan,
  loadProgress,
} from "../dist/index.js";
function fixture() {
  const nodes = initialNodes([], randomUUID);
  const category = {
    nodeId: randomUUID(),
    code: randomUUID(),
    kind: "CATEGORY",
    name: "Ventas",
    parentId: nodes[0].nodeId,
    position: 0,
  };
  nodes.push(category);
  for (let i = 0; i < 6; i++)
    nodes.push({
      nodeId: randomUUID(),
      code: randomUUID(),
      kind: "ITEM",
      name: "Item " + i,
      parentId: category.nodeId,
      position: i,
      amount:
        i === 0 || i === 3
          ? {
              ...emptyAmount(),
              state: "CARGADO",
              value: i === 0 ? "10.00" : "0.00",
              input: i === 0 ? "5+5" : "0",
            }
          : emptyAmount(),
      quantity:
        i % 2
          ? { state: "SIN_CARGAR", value: null }
          : { state: "CARGADO", value: "17" },
      note: "Conservar",
      ...(i === 2 || i === 5
        ? {
            archive: {
              state: "ARCHIVED",
              at: "2026-01-01T12:00:00Z",
              by: "fixture",
            },
          }
        : {}),
    });
  return {
    schemaVersion: 1,
    structureVersion: 4,
    initializedAt: "2026-01-01T12:00:00Z",
    initializedBy: "fixture",
    nodes,
  };
}
test("Selecciona todos y solo pendientes activos por identidad y ruta", () => {
  const s = fixture(),
    p = completePendingPlan(s);
  assert.deepEqual(
    p.affected.map((i) => i.nodeId),
    [s.nodes[5].nodeId, s.nodes[8].nodeId],
  );
  assert.ok(
    p.affected.every(
      (i) => i.block === "INGRESOS" && i.path === "INGRESOS / Ventas",
    ),
  );
  assert.equal(p.before.total, 4);
  assert.equal(p.before.loaded, 2);
  assert.equal(p.before.pending, 2);
  assert.deepEqual(p.after, {
    total: 4,
    loaded: 4,
    pending: 0,
    status: "CARGADO",
  });
});
test("Plan puro: conserva nodos, notas, cantidades, expresiones y metadata", () => {
  const s = fixture(),
    original = structuredClone(s),
    p = completePendingPlan(s);
  assert.deepEqual(s, original);
  assert.equal(p.changes.length, 2);
  for (const c of p.changes) {
    assert.deepEqual(Object.keys(c).sort(), ["amount", "code", "nodeId"]);
    assert.deepEqual(c.amount, {
      state: "CARGADO",
      input: null,
      value: "0.00",
      currency: "ARS",
      scale: 2,
    });
  }
});
for (const kind of ["empty", "loaded", "archived"])
  test("No-op " + kind, () => {
    const s = fixture();
    if (kind === "empty") s.nodes = s.nodes.filter((n) => n.kind !== "ITEM");
    else
      for (const n of s.nodes.filter((n) => n.kind === "ITEM")) {
        if (kind === "loaded")
          n.amount = {
            ...emptyAmount(),
            state: "CARGADO",
            value: "0.00",
            input: null,
          };
        else
          n.archive = {
            state: "ARCHIVED",
            at: "2026-01-01T12:00:00Z",
            by: "fixture",
          };
      }
    const p = completePendingPlan(s);
    assert.deepEqual(p.affected, []);
    assert.deepEqual(p.changes, []);
    assert.deepEqual(p.before, p.after);
  });
test("Cantidades no determinan progreso ni operaciones; ausencia permanece", () => {
  const s = fixture();
  for (const n of s.nodes) delete n.quantity;
  const original = structuredClone(s),
    p = completePendingPlan(s);
  assert.equal(p.changes.length, 2);
  assert.deepEqual(s, original);
  assert.equal(p.after.loaded, 4);
});
test("Orden visual y jerarquía, sin alterar array ni posiciones", () => {
  const s = fixture();
  s.nodes.reverse();
  const copy = structuredClone(s),
    p = completePendingPlan(s);
  assert.deepEqual(
    p.affected.map((i) => i.name),
    ["Item 1", "Item 4"],
  );
  assert.deepEqual(s, copy);
});
test("Reaplicar después de completar no produce operaciones y el cero admite limpieza", () => {
  const s = fixture(),
    p = completePendingPlan(s);
  for (const c of p.changes)
    s.nodes.find((n) => n.nodeId === c.nodeId).amount = c.amount;
  assert.equal(completePendingPlan(s).changes.length, 0);
  s.nodes.find((n) => n.nodeId === p.changes[0].nodeId).amount = emptyAmount();
  assert.equal(completePendingPlan(s).changes.length, 1);
  assert.equal(loadProgress(s.nodes).status, "PARCIAL");
});
test("Estructura inconsistente rechazada, sin reparaciones", () => {
  const s = fixture();
  s.nodes[5].amount.value = "1.00";
  assert.throws(() => completePendingPlan(s));
});

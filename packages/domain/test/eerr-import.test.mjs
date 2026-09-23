import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  initialNodes,
  emptyAmount,
  emptyQuantity,
  importPlan,
  importStructureIdentity,
} from "../dist/index.js";
function fixture() {
  const nodes = initialNodes([], randomUUID);
  nodes.push({
    nodeId: randomUUID(),
    code: randomUUID(),
    kind: "ITEM",
    name: "Digitales",
    parentId: nodes[0].nodeId,
    position: 0,
    amount: emptyAmount(),
    quantity: emptyQuantity(),
    note: "Conservar nota",
  });
  return {
    schemaVersion: 1,
    structureVersion: 2,
    initializedAt: "2026-09-01T12:00:00Z",
    initializedBy: "fixture",
    nodes,
  };
}
const row = (s, amount = "", quantity = "") => ({
  row: 2,
  code: s.nodes[3].code,
  amount,
  quantity,
});
for (const [input, value] of [
  ["12", "12.00"],
  ["1,25", "1.25"],
  ["1.25", "1.25"],
  ["1+2*3", "7.00"],
  ["(1+2)*3", "9.00"],
  ["1/8", "0.13"],
  ["0", "0.00"],
  ["  3 + 4  ", "7.00"],
])
  test(`Importe ${input}`, () => {
    const s = fixture(),
      p = importPlan(s, [row(s, input)]);
    assert.deepEqual(p.issues, []);
    assert.equal(p.changes.length, 1);
    assert.equal(p.changes[0].amount.value, value);
    assert.equal(p.changes[0].amount.input, input.trim());
    assert.equal(p.changedFields, 1);
    assert.equal(p.unchangedFields, 1);
  });
for (const input of [
  "1/0",
  "texto",
  "=SUM(A1)",
  "1.000,00",
  "-1",
  "1000000000000",
  "1e3",
])
  test(`Importe inválido ${input}`, () => {
    const s = fixture(),
      p = importPlan(s, [row(s, input)]);
    assert.equal(p.issues.length, 1);
    assert.equal(p.issues[0].field, "importe_o_expresion");
  });
for (const input of ["0", "1", "999999999999", " 12 "])
  test(`Cantidad ${input}`, () => {
    const s = fixture(),
      p = importPlan(s, [row(s, "", input)]);
    assert.equal(p.changes.length, 1);
    assert.equal(p.changes[0].quantity.value, input.trim());
    assert.equal(p.changes[0].amount, undefined);
  });
for (const input of ["1.2", "1,2", "-1", "1+2", "1000000000000", "1e2"])
  test(`Cantidad inválida ${input}`, () => {
    const s = fixture(),
      p = importPlan(s, [row(s, "", input)]);
    assert.equal(p.issues.length, 1);
  });
test("Vacío conserva datos, SIN_CARGAR limpia ambos campos y expresión", () => {
  const s = fixture();
  s.nodes[3].amount = {
    ...emptyAmount(),
    state: "CARGADO",
    input: "1+2",
    value: "3.00",
  };
  s.nodes[3].quantity = { state: "CARGADO", value: "0" };
  const before = structuredClone(s);
  assert.equal(importPlan(s, [row(s, " ", "")]).changes.length, 0);
  const p = importPlan(s, [row(s, " sin_cargar ", "Sin_Cargar")]);
  assert.deepEqual(p.changes[0].amount, emptyAmount());
  assert.deepEqual(p.changes[0].quantity, emptyQuantity());
  assert.equal(p.changedFields, 2);
  assert.deepEqual(s, before);
});
test("Fila sin cambios no modifica revisión ni produce operaciones", () => {
  const s = fixture();
  s.nodes[3].amount = {
    state: "CARGADO",
    input: "0",
    currency: "ARS",
    scale: 2,
    value: "0.00",
  };
  assert.equal(importPlan(s, [row(s, "0", "SIN_CARGAR")]).changes.length, 0);
});
for (const kind of ["missing", "unknown", "duplicate", "archived"])
  test(`Identidad ${kind}`, () => {
    const s = fixture(),
      r = row(s, "10");
    if (kind === "missing") r.code = "";
    if (kind === "unknown") r.code = randomUUID();
    if (kind === "archived")
      s.nodes[3].archive = {
        state: "ARCHIVED",
        at: "2026-09-01T12:00:00Z",
        by: "fixture",
      };
    const p = importPlan(s, kind === "duplicate" ? [r, { ...r, row: 3 }] : [r]);
    assert.equal(p.issues.length, 1);
  });
test("Nombre no es identidad; preview conserva nota, padre, orden y nodeId", () => {
  const s = fixture(),
    original = structuredClone(s),
    r = row(s, "25");
  s.nodes[3].name = "Renombrado";
  const p = importPlan(s, [r]);
  assert.equal(p.rows[0].name, "Renombrado");
  assert.equal(p.changes[0].code, r.code);
  assert.equal(p.changes[0].nodeId, original.nodes[3].nodeId);
  assert.equal(s.nodes[3].note, "Conservar nota");
  assert.equal(s.nodes[3].position, 0);
});
test("Una fila inválida no oculta la válida en preview", () => {
  const s = fixture();
  s.nodes.push({
    ...structuredClone(s.nodes[3]),
    code: randomUUID(),
    nodeId: randomUUID(),
    name: "Otra",
    position: 1,
  });
  const p = importPlan(s, [
    row(s, "12"),
    { row: 3, code: s.nodes[4].code, amount: "1/0", quantity: "" },
  ]);
  assert.equal(p.rows.length, 2);
  assert.equal(p.issues.length, 1);
  assert.equal(p.changes.length, 1);
});
test("Identidad estructural admite valores/notas y renombre local", () => {
  const s = fixture(),
    identity = importStructureIdentity(s);
  s.structureVersion++;
  s.nodes[3].name = "Otro";
  s.nodes[3].amount = {
    ...emptyAmount(),
    state: "CARGADO",
    input: "0",
    value: "0.00",
  };
  s.nodes[3].note = "Otra nota";
  assert.equal(importStructureIdentity(s), identity);
});
for (const kind of ["move", "archive", "newItem", "category"])
  test(`Identidad estructural detecta ${kind}`, () => {
    const s = fixture(),
      identity = importStructureIdentity(s);
    if (kind === "move") s.nodes[3].parentId = s.nodes[1].nodeId;
    if (kind === "archive")
      s.nodes[3].archive = {
        state: "ARCHIVED",
        at: "2026-09-01T12:00:00Z",
        by: "fixture",
      };
    if (kind === "newItem")
      s.nodes.push({
        ...structuredClone(s.nodes[3]),
        nodeId: randomUUID(),
        code: randomUUID(),
        name: "Otro",
        position: 1,
      });
    if (kind === "category")
      s.nodes.push({
        kind: "CATEGORY",
        nodeId: randomUUID(),
        code: randomUUID(),
        name: "Categoría",
        position: 1,
        parentId: s.nodes[0].nodeId,
      });
    assert.notEqual(importStructureIdentity(s), identity);
  });
test("Límites de filas, celda y archivo vacío", () => {
  const s = fixture();
  assert.throws(() => importPlan(s, []));
  assert.throws(() => importPlan(s, Array(1001).fill(row(s))));
  assert.equal(importPlan(s, [row(s, "1".repeat(2049))]).issues.length, 1);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { ROOTS, MONEY } from "@puro-origen/domain";
import { calculateEerr, CALCULATION_VERSION } from "../dist/index.js";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const roots = () =>
  ROOTS.map((root, position) => ({
    nodeId: id(position + 10),
    code: root.code,
    parentId: null,
    position,
    name: root.name,
    kind: "BLOCK",
  }));
const category = (n, parentId, position = 0, name = `Categoría ${n}`) => ({
  nodeId: id(n),
  code: id(n + 100),
  parentId,
  position,
  name,
  kind: "CATEGORY",
});
const item = (n, parentId, value, position = 0) => ({
  nodeId: id(n),
  code: id(n + 100),
  parentId,
  position,
  name: `Ítem ${n}`,
  kind: "ITEM",
  amount:
    value === null
      ? {
          state: "SIN_CARGAR",
          input: null,
          value: null,
          currency: "ARS",
          scale: 2,
        }
      : { state: "CARGADO", input: null, value, currency: "ARS", scale: 2 },
});
const snapshot = (...nodes) => ({
  schemaVersion: 1,
  structureVersion: 1,
  initializedAt: "2026-09-15T12:00:00.000Z",
  initializedBy: id(900),
  nodes: [...roots(), ...nodes],
});
const cells = (income, cost, expense) => {
  const [i, c, g] = roots();
  return snapshot(
    item(20, i.nodeId, income),
    item(21, c.nodeId, cost),
    item(22, g.nodeId, expense),
  );
};

test("tres bloques completos, fórmulas y porcentaje periódico exacto", () => {
  const result = calculateEerr(cells("3.00", "1.00", "1.00"));
  assert.deepEqual(
    result.blocks.map((block) => [block.status, block.value]),
    [
      ["COMPLETE", "3.00"],
      ["COMPLETE", "1.00"],
      ["COMPLETE", "1.00"],
    ],
  );
  assert.equal(result.metrics.grossMargin.value, "2.00");
  assert.equal(result.metrics.grossMarginPercent.value, "66.6667");
  assert.equal(result.metrics.netResult.value, "1.00");
  assert.equal(result.metrics.netResultPercent.value, "33.3333");
  assert.equal(result.calculationVersion, CALCULATION_VERSION);
});

test("categorías multinivel e ítem directo se cuentan una vez, sin sumar dos veces subtotales", () => {
  const [income, cost, expense] = roots();
  const parent = category(30, income.nodeId, 0, "Digitales");
  const child = category(31, parent.nodeId, 0, "Suscripciones");
  const input = snapshot(
    item(40, income.nodeId, "5.00", 1),
    item(41, parent.nodeId, "7.00", 1),
    item(42, child.nodeId, "11.00"),
    child,
    parent,
    item(43, cost.nodeId, "3.00"),
    item(44, expense.nodeId, "2.00"),
  );
  const before = structuredClone(input);
  const result = calculateEerr(input);
  assert.equal(result.blocks[0].value, "23.00");
  assert.equal(result.categories[0].value, "18.00");
  assert.equal(result.categories[0].completeness.totalCount, 2);
  assert.equal(result.categories[1].value, "11.00");
  assert.equal(result.categories[1].depth, 2);
  assert.equal(result.categories[1].parentCode, parent.code);
  assert.equal(result.metrics.netResult.value, "18.00");
  assert.deepEqual(input, before);
  assert.deepEqual(calculateEerr(input), result);
  const shuffled = { ...input, nodes: [...input.nodes].reverse() };
  assert.deepEqual(calculateEerr(shuffled), result);
});

test("códigos reservados y no nombres ni posiciones del array seleccionan las fórmulas", () => {
  const input = cells("100.00", "60.00", "20.00");
  input.nodes[3].name = "Costos que se llaman ventas";
  input.nodes[4].name = "Ventas que se llaman gastos";
  assert.equal(calculateEerr(input).metrics.grossMargin.value, "40.00");
  input.nodes[0].code = id(999);
  assert.throws(() => calculateEerr(input));
});

test("archivados, cantidad, nota y expresión original no intervienen; histórico sin expresión sí", () => {
  const input = cells("100.00", "60.00", "20.00");
  input.nodes[3].quantity = { state: "CARGADO", value: "999999" };
  input.nodes[3].note = "No es importe";
  input.nodes[3].amount.input = "1/0";
  input.nodes.push({
    ...item(50, input.nodes[0].nodeId, "900.00", 1),
    archive: { state: "ARCHIVED", at: "2026-09-15T12:00:00.000Z", by: id(901) },
  });
  assert.equal(calculateEerr(input).blocks[0].value, "100.00");
  assert.equal(calculateEerr(input).metrics.netResult.value, "20.00");
});

test("vacío, pendiente, parcial y cero cargado conservan semánticas separadas", () => {
  const [income, cost, expense] = roots();
  const empty = category(30, income.nodeId);
  const input = snapshot(
    empty,
    item(40, income.nodeId, "0.00", 1),
    item(41, income.nodeId, null, 2),
    item(42, cost.nodeId, null),
  );
  const result = calculateEerr(input);
  assert.deepEqual(
    [
      result.categories[0].status,
      result.categories[0].value,
      result.categories[0].completeness.completenessPercent,
    ],
    ["EMPTY", null, null],
  );
  assert.deepEqual(
    [
      result.blocks[0].status,
      result.blocks[0].value,
      result.blocks[0].completeness.completenessPercent,
    ],
    ["PARTIAL", "0.00", "50.00"],
  );
  assert.deepEqual(
    [
      result.blocks[1].status,
      result.blocks[1].value,
      result.blocks[1].completeness.completenessPercent,
    ],
    ["PENDING", null, "0.00"],
  );
  assert.equal(result.blocks[2].status, "EMPTY");
  assert.equal(result.metrics.grossMargin.reason, "PENDING_INPUTS");
  assert.equal(result.metrics.netResult.reason, "EMPTY_INPUT");
  input.nodes[5].amount = item(99, income.nodeId, "0.00").amount;
  input.nodes[6].amount = item(99, income.nodeId, "0.00").amount;
  assert.equal(calculateEerr(input).blocks[0].status, "COMPLETE");
  assert.equal(calculateEerr(input).blocks[0].value, "0.00");
});

test("gastos pendientes no bloquean margen bruto; pendientes de costo e ingreso sí", () => {
  const input = cells("100.00", "60.00", null);
  let result = calculateEerr(input);
  assert.equal(result.metrics.grossMargin.value, "40.00");
  assert.equal(result.metrics.netResult.reason, "PENDING_INPUTS");
  input.nodes[4].amount = item(99, input.nodes[1].nodeId, null).amount;
  result = calculateEerr(input);
  assert.equal(result.metrics.grossMargin.reason, "PENDING_INPUTS");
  input.nodes[4].amount = item(99, input.nodes[1].nodeId, "60.00").amount;
  input.nodes[3].amount = item(99, input.nodes[0].nodeId, null).amount;
  assert.equal(
    calculateEerr(input).metrics.grossMargin.reason,
    "PENDING_INPUTS",
  );
});

test("cero de ingreso admite márgenes monetarios y bloquea porcentajes", () => {
  const result = calculateEerr(cells("0.00", "1.00", "2.00"));
  assert.equal(result.metrics.grossMargin.value, "-1.00");
  assert.equal(result.metrics.netResult.value, "-3.00");
  assert.equal(result.metrics.grossMarginPercent.reason, "ZERO_DENOMINATOR");
  assert.equal(result.metrics.grossMarginPercent.status, "NOT_CALCULABLE");
  assert.equal(result.metrics.netResultPercent.value, null);
});

test("márgenes positivos, cero y negativos; porcentaje negativo redondea simétricamente", () => {
  const positive = calculateEerr(cells("100.00", "60.00", "20.00"));
  assert.equal(positive.metrics.grossMarginPercent.value, "40.0000");
  assert.equal(positive.metrics.netResult.value, "20.00");
  const zero = calculateEerr(cells("100.00", "100.00", "0.00"));
  assert.equal(zero.metrics.grossMargin.value, "0.00");
  assert.equal(zero.metrics.netResult.value, "0.00");
  const negative = calculateEerr(cells("3.00", "4.00", "1.00"));
  assert.equal(negative.metrics.grossMargin.value, "-1.00");
  assert.equal(negative.metrics.grossMarginPercent.value, "-33.3333");
  assert.equal(negative.metrics.netResult.value, "-2.00");
  assert.equal(negative.metrics.netResultPercent.value, "-66.6667");
  const half = calculateEerr(cells("20000.00", "19999.99", "0.00"));
  assert.equal(half.metrics.grossMarginPercent.value, "0.0001");
  const negativeHalf = calculateEerr(cells("20000.00", "20000.01", "0.00"));
  assert.equal(negativeHalf.metrics.grossMarginPercent.value, "-0.0001");
});

test("completitud intermedia redondea HALF_UP", () => {
  const [income] = roots();
  const input = snapshot(
    item(40, income.nodeId, "1.00"),
    item(41, income.nodeId, null, 1),
    item(42, income.nodeId, null, 2),
  );
  assert.equal(
    calculateEerr(input).blocks[0].completeness.completenessPercent,
    "33.33",
  );
  const half = snapshot(
    ...Array.from({ length: 32 }, (_, index) =>
      item(index + 100, income.nodeId, index === 0 ? "1.00" : null, index),
    ),
  );
  assert.equal(
    calculateEerr(half).blocks[0].completeness.completenessPercent,
    "3.13",
  );
});

test("máximo individual, agregado superior y casi máximo estructural son exactos", () => {
  const [income, cost, expense] = roots();
  const input = snapshot(
    ...Array.from({ length: 995 }, (_, index) =>
      item(index + 1000, income.nodeId, MONEY.max, index),
    ),
    item(3000, cost.nodeId, "0.00"),
    item(3001, expense.nodeId, "0.00"),
  );
  const result = calculateEerr(input);
  assert.equal(result.blocks[0].value, "994999999999990.05");
  assert.equal(result.metrics.netResult.value, result.blocks[0].value);
  input.nodes[3].amount.value = "1000000000000.00";
  assert.throws(() => calculateEerr(input));
});

test("sin inicializar es distinto de estructura vacía y no inventa valores", () => {
  const result = calculateEerr(null);
  assert.equal(result.initialized, false);
  assert.deepEqual(result.blocks, []);
  assert.equal(result.metrics.grossMargin.reason, "UNINITIALIZED");
  const initialized = calculateEerr(snapshot());
  assert.equal(initialized.initialized, true);
  assert.equal(initialized.blocks[0].status, "EMPTY");
  assert.equal(initialized.metrics.grossMargin.reason, "EMPTY_INPUT");
});

test("snapshot inválido, raíz faltante, código duplicado, ciclo y huérfano fallan", () => {
  const base = cells("1.00", "1.00", "1.00");
  for (const mutate of [
    (s) => {
      s.schemaVersion = 2;
    },
    (s) => {
      s.nodes.shift();
    },
    (s) => {
      s.nodes[4].code = s.nodes[3].code;
    },
    (s) => {
      s.nodes[3].parentId = id(9999);
    },
    (s) => {
      s.nodes[0].parentId = s.nodes[3].nodeId;
    },
    (s) => {
      s.nodes[3].amount.value = "01.00";
    },
  ]) {
    const input = structuredClone(base);
    mutate(input);
    assert.throws(() => calculateEerr(input));
  }
});

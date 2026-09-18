import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeQuantity,
  emptyQuantity,
  normalizeNote,
  NOTE_LIMITS,
  loadProgress,
  emptyAmount,
} from "../dist/index.js";
for (const [input, value] of [
  ["12", "12"],
  ["0", "0"],
  ["00012", "12"],
  ["999999999999", "999999999999"],
])
  test(`cantidad exacta ${input}`, () =>
    assert.equal(normalizeQuantity(input), value));
for (const input of [
  "-1",
  "1.5",
  "1,0",
  "1e2",
  "texto",
  "1000000000000",
  "",
  " 1 ",
  "+1",
  1,
  null,
])
  test(`rechaza cantidad ${JSON.stringify(input)}`, () =>
    assert.throws(() => normalizeQuantity(input)));
test("cantidad vacía no es cero y no altera progreso monetario", () => {
  assert.deepEqual(emptyQuantity(), { state: "SIN_CARGAR", value: null });
  assert.equal(
    loadProgress([
      {
        kind: "ITEM",
        amount: emptyAmount(),
        quantity: { state: "CARGADO", value: "0" },
      },
    ]).loaded,
    0,
  );
});
for (const [kind, limit] of Object.entries(NOTE_LIMITS)) {
  test(`nota ${kind}: bordes, saltos y borrado`, () => {
    assert.equal(
      normalizeNote("  primera\n  segunda  ", limit),
      "primera\n  segunda",
    );
    assert.equal(normalizeNote(" \n\t ", limit), null);
    assert.equal(normalizeNote("x".repeat(limit), limit).length, limit);
    assert.throws(() => normalizeNote("x".repeat(limit + 1), limit));
    assert.throws(() => normalizeNote(null, limit));
  });
}

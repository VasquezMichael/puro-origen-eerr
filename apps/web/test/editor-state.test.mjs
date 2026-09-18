import { test } from "node:test";
import assert from "node:assert/strict";
import {
  editorReducer,
  initialEditorState,
} from "../src/app/eerr/[id]/editor-state.ts";

const response = (revision) => ({
  id: "offline",
  revision,
  structure: null,
  progress: { total: 0, loaded: 0, pending: 0, status: "SIN_CARGAR" },
});
test("409 y recarga conservan cada borrador hasta su guardado explícito", () => {
  let state = editorReducer(initialEditorState, {
    type: "RELOAD",
    data: response(1),
  });
  state = editorReducer(state, {
    type: "DRAFT",
    draftKey: "a",
    input: "1,005",
  });
  state = editorReducer(state, { type: "DRAFT", draftKey: "b", input: "0" });
  state = editorReducer(state, { type: "CONFLICT" });
  assert.equal(state.conflict, true);
  assert.equal(state.data.revision, 1);
  state = editorReducer(state, { type: "RELOAD", data: response(7) });
  assert.equal(state.conflict, false);
  assert.deepEqual(state.drafts, { a: "1,005", b: "0" });
  state = editorReducer(state, {
    type: "SAVED",
    data: response(8),
    draftKey: "a",
  });
  assert.deepEqual(state.drafts, { b: "0" });
  assert.equal(state.data.revision, 8);
});
test("cambio estructural no borra importes pendientes ni muta el estado anterior", () => {
  const before = editorReducer(initialEditorState, {
    type: "DRAFT",
    draftKey: "a",
    input: "",
  });
  const after = editorReducer(before, { type: "SAVED", data: response(2) });
  assert.deepEqual(after.drafts, { a: "" });
  assert.equal(before.data, null);
  assert.deepEqual(initialEditorState.drafts, {});
});

for (const key of ["a", "quantity:a", "note:a", "period-note"]) {
  test(`409 y recarga conservan todos los campos; guardar ${key} limpia solo ese borrador`, () => {
    const drafts = {
      a: "(1000 + 500) / 3",
      "quantity:a": "12",
      "note:a": "Primera\nSegunda",
      "period-note": "General",
    };
    let state = { ...initialEditorState, drafts, data: response(1) };
    state = editorReducer(state, { type: "CONFLICT" });
    assert.deepEqual(state.drafts, drafts);
    state = editorReducer(state, {
      type: "RELOAD",
      data: { ...response(5), note: "Nota de otra sesión" },
    });
    assert.deepEqual(state.drafts, drafts);
    const expected = { ...drafts };
    delete expected[key];
    state = editorReducer(state, {
      type: "SAVED",
      data: response(6),
      draftKey: key,
    });
    assert.deepEqual(state.drafts, expected);
  });
}

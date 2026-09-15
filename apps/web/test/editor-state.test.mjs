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
  state = editorReducer(state, { type: "DRAFT", nodeId: "a", input: "1,005" });
  state = editorReducer(state, { type: "DRAFT", nodeId: "b", input: "0" });
  state = editorReducer(state, { type: "CONFLICT" });
  assert.equal(state.conflict, true);
  assert.equal(state.data.revision, 1);
  state = editorReducer(state, { type: "RELOAD", data: response(7) });
  assert.equal(state.conflict, false);
  assert.deepEqual(state.drafts, { a: "1,005", b: "0" });
  state = editorReducer(state, {
    type: "SAVED",
    data: response(8),
    nodeId: "a",
  });
  assert.deepEqual(state.drafts, { b: "0" });
  assert.equal(state.data.revision, 8);
});
test("cambio estructural no borra importes pendientes ni muta el estado anterior", () => {
  const before = editorReducer(initialEditorState, {
    type: "DRAFT",
    nodeId: "a",
    input: "",
  });
  const after = editorReducer(before, { type: "SAVED", data: response(2) });
  assert.deepEqual(after.drafts, { a: "" });
  assert.equal(before.data, null);
  assert.deepEqual(initialEditorState.drafts, {});
});

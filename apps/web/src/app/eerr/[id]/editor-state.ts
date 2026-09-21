import type { StructureResponse } from "@puro-origen/shared-types";

export type EditorState = {
  data: StructureResponse | null;
  drafts: Record<string, string>;
  conflict: boolean;
};
export type EditorEvent =
  | { type: "RELOAD"; data: StructureResponse }
  | { type: "SAVED"; data: StructureResponse; draftKey?: string }
  | { type: "DRAFT"; draftKey: string; input: string }
  | { type: "CONFLICT" }
  | { type: "CANCEL"; draftKey: string };
export const initialEditorState: EditorState = {
  data: null,
  drafts: {},
  conflict: false,
};

/** Un conflicto y una recarga nunca descartan entradas que aún no se guardaron. */
export function editorReducer(
  state: EditorState,
  event: EditorEvent,
): EditorState {
  if (event.type === "CANCEL") {
    const drafts = { ...state.drafts };
    delete drafts[event.draftKey];
    return { ...state, drafts };
  }
  if (event.type === "DRAFT")
    return {
      ...state,
      drafts: { ...state.drafts, [event.draftKey]: event.input },
    };
  if (event.type === "CONFLICT") return { ...state, conflict: true };
  if (event.type === "RELOAD")
    return { ...state, data: event.data, conflict: false };
  const drafts = { ...state.drafts };
  if (event.draftKey !== undefined) delete drafts[event.draftKey];
  return { data: event.data, drafts, conflict: false };
}

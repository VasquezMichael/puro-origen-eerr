import type { StructureResponse } from "@puro-origen/shared-types";

export type EditorState = {
  data: StructureResponse | null;
  drafts: Record<string, string>;
  conflict: boolean;
};
export type EditorEvent =
  | { type: "RELOAD"; data: StructureResponse }
  | { type: "SAVED"; data: StructureResponse; nodeId?: string }
  | { type: "DRAFT"; nodeId: string; input: string }
  | { type: "CONFLICT" };
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
  if (event.type === "DRAFT")
    return {
      ...state,
      drafts: { ...state.drafts, [event.nodeId]: event.input },
    };
  if (event.type === "CONFLICT") return { ...state, conflict: true };
  if (event.type === "RELOAD")
    return { ...state, data: event.data, conflict: false };
  const drafts = { ...state.drafts };
  if (event.nodeId !== undefined) delete drafts[event.nodeId];
  return { data: event.data, drafts, conflict: false };
}

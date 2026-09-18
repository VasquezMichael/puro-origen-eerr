import type { EerrStructure } from "@puro-origen/domain";
export type StructureResponse = {
  id: string;
  revision: number;
  note?: string | null;
  structure: EerrStructure | null;
  progress: {
    total: number;
    loaded: number;
    pending: number;
    status: "SIN_CARGAR" | "PARCIAL" | "CARGADO";
  };
};
export type CategoryPreviewResponse = {
  previewId: string;
  operation: "CREATE" | "RENAME";
  name: string;
  parent: { code: string; name: string };
  year: number;
  month: number;
  expiresAt: string;
  affected: number;
  initialized: number;
  uninitialized: number;
  warning: string;
};
export type AmountRequest = { expectedRevision: number } & (
  { state: "CARGADO"; input: string } | { state: "SIN_CARGAR" }
);
export type QuantityRequest = { expectedRevision: number } & (
  { state: "CARGADO"; input: string } | { state: "SIN_CARGAR" }
);
export type NoteRequest = { expectedRevision: number; note: string };

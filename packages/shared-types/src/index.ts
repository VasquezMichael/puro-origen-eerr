import type { EerrStructure } from "@puro-origen/domain";
import type { SalesGoalValue } from "@puro-origen/domain";
import type { AnalysisCalculation } from "@puro-origen/calculation-engine";
export type AnalysisResponse = AnalysisCalculation & {
  eerrId: string;
  sourceRevision: number;
  salesGoal: (SalesGoalValue & { updatedAt: string; updatedBy: string }) | null;
};
export type SalesGoalRequest = {
  expectedRevision: number;
  goal: SalesGoalValue | null;
};
export type SalesGoalResponse = {
  eerrId: string;
  revision: number;
  salesGoal: AnalysisResponse["salesGoal"];
};
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
export type ItemArchiveRequest = { expectedRevision: number };

export type ItemMoveRequest = {
  expectedRevision: number;
  parentId: string;
  position: number;
};

export type CategoryMoveRequest = ItemMoveRequest & { nodeId: string };
export type CategoryMovePreviewResponse = {
  previewId: string;
  name: string;
  year: number;
  month: number;
  expiresAt: string;
  from: { name: string; code: string; position: number };
  to: { name: string; code: string; position: number };
  block: { name: string; code: string };
  affected: number;
  initialized: number;
  uninitialized: number;
  accessibleEerrs: string[];
  warning: string;
  noOp: boolean;
};

export type CloneMode = import("@puro-origen/domain").CloneMode;
export type CloneCounts = ReturnType<
  typeof import("@puro-origen/domain").cloneSourceCounts
>;
export type CloneContext = {
  id: string;
  branchId: string;
  branchName: string;
  year: number;
  month: number;
};
export type CloneSource = CloneContext & {
  loadStatus: string;
  initialized: true;
  categories: number;
  items: number;
  loadedAmounts: number;
  sameBranch: boolean;
  samePeriod: boolean;
};
export type ClonePreviewRequest = { sourceEerrId: string; mode: CloneMode };
export type CloneConfirmRequest = ClonePreviewRequest & {
  previewToken: string;
  confirmCrossBranchValues?: boolean;
};
export type ClonePreviewResponse = {
  source: CloneContext;
  destination: CloneContext;
  mode: CloneMode;
  counts: CloneCounts;
  destinationCategories: number;
  compatible: boolean;
  issues: string[];
  seedTemplate: boolean;
  crossBranchWarning: string | null;
  included: string[];
  excluded: string[];
  revisions: { source: number; destination: number; template: number | null };
  previewToken: string | null;
  expiresAt: string;
};

export type ImportPreviewResponse = Omit<
  ReturnType<typeof import("@puro-origen/domain").importPlan>,
  "changes"
> & {
  destination: CloneContext;
  fileName: string;
  format: "csv" | "xlsx";
  warnings: string[];
  revision: number;
  structuralRevision: number;
  previewToken: string | null;
  expiresAt: string;
};
export type ImportConfirmResponse = {
  result: StructureResponse;
  affectedItems: number;
  changedFields: number;
};

export type CompletePendingPreviewResponse = Omit<
  ReturnType<typeof import("@puro-origen/domain").completePendingPlan>,
  "changes"
> & {
  destination: CloneContext;
  revision: number;
  previewToken: string | null;
  expiresAt: string;
};
export type CompletePendingConfirmRequest = { previewToken: string };
export type CompletePendingConfirmResponse = {
  result: StructureResponse;
  affectedItems: number;
};

import { ROOTS } from "../../../packages/domain/dist/index.js";

/** Read-only analysis fixture for older browser journeys focused on the editor. */
export function emptyAnalysis(row, id) {
  const complete = { loadedCount: 0, pendingCount: 0, totalCount: 0, completenessPercent: null };
  return {
    eerrId: id, sourceRevision: row.revision, calculationVersion: 2,
    initialized: !!row.structure, currency: "ARS",
    blocks: row.structure ? ROOTS.map(({ code, name }, index) => ({
      nodeId: `fixture-block-${index}`, code, name, status: "EMPTY", value: null, completeness: complete,
    })) : [],
    categories: [],
    metrics: Object.fromEntries(["grossMargin", "grossMarginPercent", "netResult", "netResultPercent"].map((key) => [key, {
      status: "BLOCKED", value: null, unit: key.endsWith("Percent") ? "PERCENT" : "ARS", reason: row.structure ? "EMPTY_INPUT" : "UNINITIALIZED",
    }])),
    salesGoal: null,
    projections: {
      breakEvenSales: { status: "BLOCKED", value: null, unit: "ARS", reason: row.structure ? "EMPTY_INPUT" : "UNINITIALIZED" },
      targetSales: { status: "BLOCKED", value: null, unit: "ARS", reason: row.structure ? "EMPTY_INPUT" : "UNINITIALIZED" },
      targetReference: { status: "BLOCKED", type: null, value: null, unit: "ARS", reason: row.structure ? "EMPTY_INPUT" : "UNINITIALIZED" },
    },
  };
}

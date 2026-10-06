import { ROOTS } from "@puro-origen/domain";
import type { AggregateMetric, AggregateReason, ScopeResult } from "@puro-origen/calculation-engine";
import type { DashboardBranch, DashboardResponse } from "@puro-origen/shared-types";

const branchId = "123456789012345678901234";
const eerrId = "11111111-1111-4111-8111-111111111111";

const metric = (value: string | null, unit: "ARS" | "PERCENT" = "ARS", reason: AggregateReason | null = null): AggregateMetric => ({ status: value === null ? "BLOCKED" : "COMPLETE", value, unit, reason });
const block = (root: (typeof ROOTS)[number], value: string | null, status: ScopeResult["status"] = "COMPLETE"): ScopeResult => ({ nodeId: root.code, code: root.code, name: root.name, status, value, completeness: { loadedCount: status === "COMPLETE" ? 1 : 0, pendingCount: status === "COMPLETE" ? 0 : 1, totalCount: 1, completenessPercent: status === "COMPLETE" ? "100.00" : "0.00" } });

export function dashboardFixture({ year = 2026, month = 9, mode = "complete", role = "ADMIN", signature = "sig-one", includeNotStarted = true }: {
  year?: number; month?: number; mode?: "complete" | "partial" | "empty"; role?: "ADMIN" | "EDITOR" | "READER"; signature?: string; includeNotStarted?: boolean;
} = {}): DashboardResponse {
  const empty = mode === "empty", partial = mode === "partial";
  const withEerr = empty ? 0 : 1;
  const branch: DashboardBranch = { branchId, name: "Sucursal ficticia", active: !partial, temporal: "EXPECTED", eerrId: empty ? null : eerrId, revision: empty ? null : 2, loadStatus: partial ? "PARCIAL" : empty ? null : "CARGADO", analysisStatus: empty ? "NO_EERR" : partial ? "PARTIAL" : "COMPLETE", reason: empty ? "NO_EERR" : partial ? "PARTIAL" : null, blocks: empty ? null : [block(ROOTS[0], "9007199254740993.10"), block(ROOTS[1], "0.00"), block(ROOTS[2], partial ? null : "5.00", partial ? "PENDING" : "COMPLETE")], metrics: null, breakEvenSales: null };
  const value = partial ? "10.00" : month === 7 ? "7.00" : month === 8 ? "8.00" : "9007199254740993.10";
  const completeBranch: DashboardBranch = { ...branch, branchId: "complete", name: "Sucursal completa", active: true, eerrId: "22222222-2222-4222-8222-222222222222", analysisStatus: "COMPLETE", reason: null, blocks: [block(ROOTS[0], "10.00"), block(ROOTS[1], "0.00"), block(ROOTS[2], "5.00")] };
  const notStarted: DashboardBranch = { branchId: "later", name: "Sucursal próxima", active: true, temporal: "NOT_STARTED", eerrId: null, revision: null, loadStatus: null, analysisStatus: "EXCLUDED", reason: "NOT_STARTED", blocks: null, metrics: null, breakEvenSales: null };
  return { year, month, timezone: "America/Argentina/Buenos_Aires", calculationVersion: 2,
    scope: { type: role === "ADMIN" ? "GLOBAL" : "ACCESSIBLE", label: role === "ADMIN" ? "Consolidado global" : "Consolidado de mis sucursales accesibles", authorizedCount: (partial ? 2 : 1) + Number(includeNotStarted), expectedCount: partial ? 2 : 1 },
    coverage: { expected: partial ? 2 : 1, withEerr: partial ? 2 : withEerr, withoutEerr: empty ? 1 : 0, complete: mode === "complete" || partial ? 1 : 0, partial: partial ? 1 : 0, pending: 0, empty: 0, uninitialized: 0, inactiveWithHistory: partial ? 1 : 0, inactiveWithoutHistory: 0, excludedNotStarted: Number(includeNotStarted) },
    consolidated: { status: mode === "complete" ? "COMPLETE" : empty ? "EMPTY" : "PARTIAL", definitive: mode === "complete", includedCount: empty ? 0 : 1, expectedCount: partial ? 2 : 1, label: mode === "complete" ? "Consolidado definitivo" : `Subtotal de ${empty ? 0 : 1} de ${partial ? 2 : 1} sucursales esperadas`, income: metric(empty ? null : value, "ARS", empty ? "NO_COMPLETE_SOURCES" : null), costs: metric(empty ? null : "0.00", "ARS", empty ? "NO_COMPLETE_SOURCES" : null), expenses: metric(empty ? null : "5.00", "ARS", empty ? "NO_COMPLETE_SOURCES" : null), grossMargin: metric(mode === "complete" ? "9007199254740993.10" : null, "ARS", mode === "complete" ? null : "INCOMPLETE_SCOPE"), grossMarginPercent: metric(mode === "complete" ? "100.0000" : null, "PERCENT", mode === "complete" ? null : "INCOMPLETE_SCOPE"), netResult: metric(mode === "complete" ? "9007199254740988.10" : null, "ARS", mode === "complete" ? null : "INCOMPLETE_SCOPE"), netResultPercent: metric(mode === "complete" ? "99.9999" : null, "PERCENT", mode === "complete" ? null : "INCOMPLETE_SCOPE"), breakEvenSales: metric(mode === "complete" ? "5.00" : null, "ARS", mode === "complete" ? null : "INCOMPLETE_SCOPE"), targetSales: null, breakEvenAssumption: mode === "complete" ? "Supone que se mantiene la mezcla observada de ventas y costos variables." : null },
    branches: [...(partial ? [completeBranch] : []), branch, ...(includeNotStarted ? [notStarted] : [])],
    sources: [...(partial ? [{ branchId: completeBranch.branchId, eerrId: completeBranch.eerrId, revision: completeBranch.revision }] : []), { branchId, eerrId: branch.eerrId, revision: branch.revision }, ...(includeNotStarted ? [{ branchId: notStarted.branchId, eerrId: null, revision: null }] : [])],
    sourceSignature: signature };
}

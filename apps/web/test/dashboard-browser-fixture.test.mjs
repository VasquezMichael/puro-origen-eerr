import assert from "node:assert/strict";
import { test } from "node:test";
import { dashboardFixture } from "./dashboard-browser-fixture.mts";

test("la fixture del Dashboard conserva el período solicitado y un alcance coherente", () => {
  for (const mode of ["empty", "partial", "complete"]) {
    const data = dashboardFixture({ year: 2025, month: 8, mode, role: "EDITOR" });
    assert.deepEqual([data.year, data.month, data.timezone, data.calculationVersion], [2025, 8, "America/Argentina/Buenos_Aires", 3]);
    assert.equal(data.scope.type, "ACCESSIBLE");
    assert.equal(data.scope.authorizedCount, data.branches.length);
    assert.equal(data.coverage.expected, data.coverage.withEerr + data.coverage.withoutEerr);
    assert.equal(data.coverage.expected, data.coverage.complete + data.coverage.partial + data.coverage.pending + data.coverage.empty + data.coverage.uninitialized + data.coverage.withoutEerr);
    assert.deepEqual(data.sources.map(({ branchId, eerrId, revision }) => ({ branchId, eerrId, revision })), data.branches.map(({ branchId, eerrId, revision }) => ({ branchId, eerrId, revision })));
    assert.ok(data.sourceSignature);
    const indicators = data.branches.find(({ branchId }) => branchId === "123456789012345678901234")?.goalIndicators;
    if (mode === "empty") assert.equal(indicators, null);
    else {
      const reason = mode === "partial" ? "PENDING_INPUTS" : "GOAL_NOT_CONFIGURED";
      assert.deepEqual(indicators?.targetSales, { status: "BLOCKED", value: null, unit: "ARS", reason });
      assert.deepEqual(indicators?.targetDifference, { status: "NOT_CALCULABLE", value: null, unit: "ARS", reason });
      assert.deepEqual(indicators?.targetCompliance, { status: "NOT_CALCULABLE", value: null, unit: "PERCENT", reason });
      assert.deepEqual(indicators?.trafficLight, { status: "NOT_CALCULABLE", value: "NEUTRAL", reason });
    }
  }
});

test("la navegación recibe un período vacío válido, sin cifras financieras inventadas", () => {
  const data = dashboardFixture({ year: 2026, month: 9, mode: "empty", role: "ADMIN", includeNotStarted: false });
  assert.equal(data.scope.authorizedCount, 1);
  assert.equal(data.coverage.withoutEerr, 1);
  assert.equal(data.coverage.withEerr, 0);
  assert.equal(data.consolidated.status, "EMPTY");
  assert.equal(data.consolidated.income.value, null);
  assert.equal(data.consolidated.income.reason, "NO_COMPLETE_SOURCES");
  assert.equal(data.sources[0].eerrId, null);
});

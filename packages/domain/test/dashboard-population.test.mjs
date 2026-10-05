import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboardPopulation } from "../dist/index.js";

const september = { year: 2026, month: 9 };
const october = { year: 2026, month: 10 };

test("fecha de inicio usa el mes del negocio, no UTC ni la zona del proceso", () => {
  const before = new Date("2026-10-01T01:00:00Z");
  const after = new Date("2026-10-01T03:00:00Z");
  assert.equal(dashboardPopulation(september, before, true, false), "EXPECTED");
  assert.equal(dashboardPopulation(september, after, true, false), "NOT_STARTED");
  assert.equal(dashboardPopulation(october, after, true, false), "EXPECTED");
});

test("inactiva participa solo si conserva EERR histórico", () => {
  const start = new Date("2026-10-01T03:00:00Z");
  assert.equal(dashboardPopulation(september, start, false, true), "EXPECTED");
  assert.equal(dashboardPopulation(september, start, false, false), "INACTIVE_WITHOUT_HISTORY");
});

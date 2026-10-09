import { test } from "node:test";
import assert from "node:assert/strict";
import { previousEerrPeriod } from "../dist/index.js";

test("mes anterior conserva año/mes y atraviesa enero sin timestamps", () => {
  assert.deepEqual(previousEerrPeriod({ year: 2026, month: 10 }), {
    year: 2026,
    month: 9,
  });
  assert.deepEqual(previousEerrPeriod({ year: 2026, month: 1 }), {
    year: 2025,
    month: 12,
  });
  assert.throws(() => previousEerrPeriod({ year: 1, month: 1 }), RangeError);
});

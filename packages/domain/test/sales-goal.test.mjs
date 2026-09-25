import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSalesGoal } from "../dist/index.js";

test("normaliza metas exactas a escala contractual", () => {
  assert.deepEqual(
    normalizeSalesGoal({ mode: "NET_MARGIN_PERCENT", value: "10" }),
    { mode: "NET_MARGIN_PERCENT", value: "10.0000" },
  );
  assert.deepEqual(
    normalizeSalesGoal({ mode: "NET_PROFIT_AMOUNT", value: "0" }),
    { mode: "NET_PROFIT_AMOUNT", value: "0.00" },
  );
  assert.equal(
    normalizeSalesGoal({ mode: "NET_PROFIT_AMOUNT", value: "999999999999.99" })
      .value,
    "999999999999.99",
  );
});

test("rechaza redondeo implícito, Number, rangos y campos extra", () => {
  for (const input of [
    { mode: "NET_MARGIN_PERCENT", value: "100.0000" },
    { mode: "NET_MARGIN_PERCENT", value: "1.00001" },
    { mode: "NET_MARGIN_PERCENT", value: -1 },
    { mode: "NET_PROFIT_AMOUNT", value: "-1.00" },
    { mode: "NET_PROFIT_AMOUNT", value: "0.001" },
    { mode: "NET_PROFIT_AMOUNT", value: "1000000000000.00" },
    { mode: "NET_PROFIT_AMOUNT", value: "1.00", extra: true },
    { mode: "INVALID", value: "1.00" },
  ])
    assert.throws(() => normalizeSalesGoal(input));
});

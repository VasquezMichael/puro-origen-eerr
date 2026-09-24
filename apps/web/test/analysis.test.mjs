import "./tsx-loader.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ROOTS } from "../../../packages/domain/dist/index.js";
const { formatAnalysisMoney, formatAnalysisPercent } = await import("../src/app/eerr/[id]/analysis-format.ts");
const { statementRows } = await import("../src/app/eerr/[id]/analysis-model.ts");
const { StatementTable } = await import("../src/app/eerr/[id]/results-statement.tsx");

const completeness = (loadedCount, totalCount) => ({ loadedCount, pendingCount: totalCount - loadedCount, totalCount, completenessPercent: totalCount ? `${Math.round(loadedCount / totalCount * 100)}.00` : null });
const scope = (nodeId, code, name, status, value, loaded, total) => ({ nodeId, code, name, status, value, completeness: completeness(loaded, total) });
const metric = (value, unit = "ARS", reason = null) => ({ status: value === null ? "BLOCKED" : "COMPLETE", value, unit, reason });
const analysis = () => ({ eerrId: "e", sourceRevision: 4, initialized: true, calculationVersion: 1, currency: "ARS",
  blocks: [scope("income", ROOTS[0].code, "INGRESOS", "PARTIAL", "100.00", 1, 2), scope("cost", ROOTS[1].code, "COSTOS", "COMPLETE", "0.00", 1, 1), scope("expense", ROOTS[2].code, "GASTOS GENERALES", "PENDING", null, 0, 1)],
  categories: [
    { ...scope("cat", "cat-code", "Ventas históricas", "PARTIAL", "100.00", 1, 2), parentNodeId: "income", parentCode: ROOTS[0].code, depth: 1, position: 0 },
    { ...scope("sub", "sub-code", "Digitales", "COMPLETE", "100.00", 1, 1), parentNodeId: "cat", parentCode: "cat-code", depth: 2, position: 0 },
    { ...scope("empty", "empty-code", "Sin movimiento", "EMPTY", null, 0, 0), parentNodeId: "cost", parentCode: ROOTS[1].code, depth: 1, position: 0 },
  ], metrics: { grossMargin: metric(null, "ARS", "PENDING_INPUTS"), grossMarginPercent: metric(null, "PERCENT", "PENDING_INPUTS"), netResult: metric(null, "ARS", "PENDING_INPUTS"), netResultPercent: metric(null, "PERCENT", "PENDING_INPUTS") } });
const html = (data) => renderToStaticMarkup(React.createElement(StatementTable, { analysis: data }));

test("presenta bloques en orden, jerarquía histórica, subtotales y resultados sin ítems", () => {
  const data = analysis();
  const rows = statementRows(data);
  assert.deepEqual(rows.filter((row) => row.kind === "section").map((row) => row.label), ["INGRESOS", "COSTOS", "GASTOS GENERALES"]);
  assert.deepEqual(rows.filter((row) => row.kind === "category").map((row) => [row.label, row.depth, row.parentLabel]), [["Ventas históricas", 1, "Ingresos Totales"], ["Digitales", 2, "Ventas históricas"], ["Sin movimiento", 1, "Costos Totales"]]);
  const markup = html(data);
  assert.match(markup, /Ingresos Totales/);
  assert.match(markup, /Sin ítems/);
  assert.match(markup, /Importes sin cargar/);
  assert.match(markup, /Parcial · 1 de 2 importes cargados/);
  assert.match(markup, /0,00 ARS/);
  assert.match(markup, /Disponible cuando se completen/);
  const grossRow = [...markup.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)].map(([row]) => row).find((row) => row.includes(">Margen Bruto<"));
  assert.ok(grossRow?.includes("—"));
  assert.doesNotMatch(grossRow, /0,00 ARS/);
  assert.doesNotMatch(markup, /Punto de Equilibrio|Objetivo de Venta|<canvas|<svg/);
});
test("dinero exacto con signos, cero y valores superiores al entero seguro", () => {
  for (const [input, expected] of [["125000.00", "125.000,00 ARS"], ["0.00", "0,00 ARS"], ["-1500.25", "-1.500,25 ARS"], ["9007199254740993.10", "9.007.199.254.740.993,10 ARS"]]) assert.equal(formatAnalysisMoney(input), expected);
});
test("porcentaje HALF_UP exacto y simétrico, sin perder valores grandes", () => {
  for (const [input, expected] of [["66.6667", "66,67 %"], ["-12.3450", "-12,35 %"], ["0.0000", "0,00 %"], ["9007199254740993.1250", "9.007.199.254.740.993,13 %"]]) assert.equal(formatAnalysisPercent(input), expected);
});
test("valores nulos y causas distintas nunca se transforman en cero", () => {
  const data = analysis();
  data.metrics.grossMargin = metric(null, "ARS", "EMPTY_INPUT");
  data.metrics.grossMarginPercent = metric(null, "PERCENT", "ZERO_DENOMINATOR");
  const markup = html(data);
  assert.match(markup, /Falta definir al menos un ítem/);
  assert.match(markup, /No calculable porque los ingresos son cero/);
  assert.match(markup, /sin valor/);
  assert.doesNotMatch(markup, /EMPTY_INPUT|ZERO_DENOMINATOR|PENDING_INPUTS/);
});
test("margen completo, gasto pendiente y resultado bloqueado se muestran tal como envía API", () => {
  const data = analysis();
  data.metrics.grossMargin = metric("-15.25");
  data.metrics.grossMarginPercent = metric("-12.3450", "PERCENT");
  assert.match(html(data), /-15,25 ARS/);
  assert.match(html(data), /-12,35 %/);
  assert.match(html(data), /Disponible cuando se completen/);
  data.metrics.netResult = metric("-9007199254740993.10");
  assert.match(html(data), /-9.007.199.254.740.993,10 ARS/);
});

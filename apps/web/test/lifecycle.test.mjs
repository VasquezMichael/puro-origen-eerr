import "./tsx-loader.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { lifecycleActions, runLifecycleTransition } = await import("../src/app/eerr/lifecycle-model.ts");
const { LifecycleBadge, LifecycleDialog } = await import("../src/app/eerr/lifecycle.tsx");
const { EerrSummary } = await import("../src/app/eerr/workspace.tsx");
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const callbacks = { onCancel() {}, onConfirm() {}, onCompletePending() {} };

for (const [name, canEdit, status, everClosed, enabled, expected] of [
  ["lector abierto", false, "OPEN", false, false, []],
  ["lector cerrado", false, "CLOSED", true, true, []],
  ["editor abierto sin capability", true, "OPEN", false, null, ["close"]],
  ["editor abierto con DELETE apagado", true, "OPEN", false, false, ["close"]],
  ["editor abierto con DELETE habilitado", true, "OPEN", false, true, ["close", "delete"]],
  ["editor reabierto", true, "OPEN", true, true, ["close"]],
  ["editor cerrado", true, "CLOSED", true, true, ["reopen"]],
]) test(`Acciones: ${name}`, () => {
  assert.deepEqual(lifecycleActions(canEdit, status, everClosed, enabled === null ? null : { softDeleteEnabled: enabled }), expected);
});

for (const [status, text] of [["OPEN", "Período abierto"], ["CLOSED", "Período cerrado"]])
  test(`Badge ${status} separado de loadStatus`, () => {
    const html = render(LifecycleBadge, { status });
    assert.match(html, new RegExp(text));
    assert.doesNotMatch(html, /Sin cargar|Carga parcial|Cargado/);
  });

for (const [action, pending, expected, absent] of [
  ["close", 0, "Cerrar período", "Marcar pendientes en 0"],
  ["close", 3, "3 importes pendientes", null],
  ["close", 1, "1 importe pendiente", null],
  ["reopen", 0, "último cierre", "Marcar pendientes en 0"],
  ["delete", 0, "nunca estuvo cerrado", "Marcar pendientes en 0"],
]) test(`Confirmación ${action} con ${pending} pendientes`, () => {
  const html = render(LifecycleDialog, { action, pending, busy: false, context: "CALLE 13 · 08/2026", ...callbacks });
  assert.match(html, new RegExp(expected));
  assert.match(html, /CALLE 13/);
  assert.match(html, /Cancelar/);
  if (absent) assert.doesNotMatch(html, new RegExp(absent));
  if (action === "delete") assert.match(html, /class="danger"/);
  if (action === "close" && pending) {
    assert.match(html, /Marcar pendientes en 0/);
    assert.match(html, /Cerrar igualmente/);
    assert.match(html, /cantidades opcionales no se cuentan/);
  }
});

test("Confirmación ocupada impide doble envío", () => {
  const html = render(LifecycleDialog, { action: "delete", pending: 0, busy: true, context: "Sucursal", ...callbacks });
  assert.match(html, /aria-busy="true"/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 3);
});

const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });
for (const [action, method, suffix] of [
  ["close", "POST", "/close"],
  ["reopen", "POST", "/reopen"],
  ["delete", "DELETE", ""],
]) test(`${action} envía expectedRevision actual una sola vez`, async () => {
  const calls = [];
  const outcome = await runLifecycleTransition(action, "eerr-id", 8, async (path, options) => {
    calls.push({ path, options });
    return { revision: 9 };
  }, () => { throw Error("No debe recargar sin conflicto"); });
  assert.equal(outcome.kind, "success");
  assert.equal(outcome.result.revision, 9);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, `/eerr/eerr-id${suffix}`);
  assert.equal(calls[0].options.method, method);
  assert.deepEqual(JSON.parse(calls[0].options.body), { expectedRevision: 8 });
});

for (const action of ["close", "reopen", "delete"])
  test(`409 ${action} recarga una vez sin reintentar transición`, async () => {
    let requests = 0;
    let refreshes = 0;
    const outcome = await runLifecycleTransition(action, "id", 3, async () => {
      requests++;
      throw httpError(409);
    }, async () => { refreshes++; });
    assert.deepEqual(outcome, { kind: "conflict" });
    assert.equal(requests, 1);
    assert.equal(refreshes, 1);
  });

test("404 concurrente devuelve missing sin volver a escribir", async () => {
  let requests = 0;
  const outcome = await runLifecycleTransition("close", "id", 1, async () => {
    requests++;
    throw httpError(404);
  }, async () => { throw Error("No se debe recargar"); });
  assert.deepEqual(outcome, { kind: "missing" });
  assert.equal(requests, 1);
});

test("409 seguido de 404 en recarga dirige al listado", async () => {
  const outcome = await runLifecycleTransition("reopen", "id", 2, async () => { throw httpError(409); }, async () => { throw httpError(404); });
  assert.deepEqual(outcome, { kind: "missing" });
});

test("503 DELETE deshabilitado no se transforma en éxito", async () => {
  const outcome = await runLifecycleTransition("delete", "id", 2, async () => { throw httpError(503); }, async () => { throw Error("No se debe recargar"); });
  assert.deepEqual(outcome, { kind: "disabled" });
});

test("errores no previstos permanecen visibles", async () => {
  await assert.rejects(runLifecycleTransition("close", "id", 2, async () => { throw httpError(500); }, async () => {}), { status: 500 });
});

test("Listado muestra lifecycle y carga como dos dimensiones distintas", () => {
  const html = render(EerrSummary, { row: { id: "id", branchId: "branch", year: 2026, month: 9, loadStatus: "CARGADO", lifecycleStatus: "CLOSED", createdAt: "2026-09-01T03:00:00Z" } });
  assert.match(html, /Período cerrado/);
  assert.match(html, /Cargado/);
});

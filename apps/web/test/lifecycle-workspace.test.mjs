import "./tsx-loader.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { initialNodes, emptyAmount, loadProgress, completePendingPlan } from "../../../packages/domain/dist/index.js";
import { emptyAnalysis } from "./browser-analysis-fixture.mjs";

const { StructureWorkspace } = await import("../src/app/eerr/[id]/structure-workspace.tsx");
const id = "11111111-1111-4111-8111-111111111111";
const branchId = "123456789012345678901234";

function fixture(status = "OPEN", pending = false) {
  const nodes = initialNodes([], randomUUID);
  nodes.push({
    nodeId: "33333333-3333-4333-8333-333333333333",
    code: "44444444-4444-4444-8444-444444444444",
    kind: "ITEM", name: "Ventas demo", parentId: nodes[0].nodeId,
    position: 0, amount: pending ? emptyAmount() : { state: "CARGADO", value: "100.00", input: null },
    quantity: { state: "SIN_CARGAR", value: null }, note: null,
  });
  const row = {
    id, revision: 5, note: null,
    structure: { schemaVersion: 1, structureVersion: 1, initializedAt: "2026-09-01T12:00:00Z", initializedBy: "fixture", nodes },
    progress: loadProgress(nodes),
  };
  const eerr = () => ({ id, branchId, year: 2026, month: 9, revision: row.revision,
    lifecycleStatus: status, everClosed: status === "CLOSED", loadStatus: row.progress.status,
    pendingAmountCount: row.progress.pending });
  return { row, eerr, get status() { return status; }, set status(value) { status = value; } };
}

async function mount(model, { conflict = false } = {}) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: `http://localhost:3000/eerr/${id}` });
  const old = Object.fromEntries(["window", "self", "document", "HTMLElement", "HTMLDialogElement", "location", "requestAnimationFrame", "fetch", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, {
    window: dom.window, self: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, HTMLDialogElement: dom.window.HTMLDialogElement,
    location: dom.window.location, requestAnimationFrame: (fn) => setTimeout(fn, 0),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  dom.window.HTMLElement.prototype.showPopover = function () { this.dataset.popoverOpen = "true"; };
  dom.window.HTMLElement.prototype.hidePopover = function () { delete this.dataset.popoverOpen; };
  const calls = [], destinations = [];
  let deleted = false, conflictNext = conflict, mismatches = 0;
  globalThis.fetch = async (input, options = {}) => {
    const path = new URL(input).pathname, method = options.method ?? "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, method, body });
    let output, status = 200;
    if (path === "/auth/me") output = { user: { name: "Editor", isAdmin: false, branchAccesses: [{ branchId, role: "EDITOR" }] } };
    else if (path === "/branches") output = [{ id: branchId, name: "CALLE 13", active: true }];
    else if (path === "/eerr/capabilities") output = { softDeleteEnabled: false };
    else if (path === `/eerr/${id}` && method === "GET") {
      if (deleted) status = 404; else output = model.eerr();
    } else if (path === `/eerr/${id}/structure`) {
      if (deleted) status = 404;
      else {
        output = structuredClone(model.row);
        if (mismatches > 0) { output.revision++; mismatches--; }
      }
    } else if (path === `/eerr/${id}/analysis`) output = emptyAnalysis(model.row, id);
    else if (path === `/eerr/${id}/close` || path === `/eerr/${id}/reopen`) {
      if (conflictNext) { status = 409; conflictNext = false; }
      else if (body.expectedRevision !== model.row.revision) status = 409;
      else { model.row.revision++; model.status = path.endsWith("close") ? "CLOSED" : "OPEN"; output = model.eerr(); }
    } else if (path.endsWith("/complete-pending/preview")) {
      const plan = completePendingPlan(model.row.structure);
      const publicPlan = { ...plan };
      delete publicPlan.changes;
      output = { ...publicPlan, destination: { id, branchId, branchName: "CALLE 13", year: 2026, month: 9 },
        revision: model.row.revision, previewToken: "fixture-preview", expiresAt: "2026-09-23T12:05:00Z" };
    } else if (path.endsWith("/complete-pending/confirm")) {
      assert.deepEqual(body, { previewToken: "fixture-preview" });
      const plan = completePendingPlan(model.row.structure);
      for (const change of plan.changes) model.row.structure.nodes.find(node => node.nodeId === change.nodeId).amount = change.amount;
      model.row.revision++;
      model.row.progress = loadProgress(model.row.structure.nodes);
      output = { result: structuredClone(model.row), affectedItems: plan.changes.length };
    } else throw Error(`Solicitud inesperada: ${method} ${path}`);
    return new Response(JSON.stringify(status === 200 ? output : { message: `HTTP ${status}` }), { status, headers: { "Content-Type": "application/json" } });
  };
  const router = { replace: (href) => destinations.push(href), push() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root"));
  await act(async () => { root.render(React.createElement(AppRouterContext.Provider, { value: router }, React.createElement(StructureWorkspace, { id }))); });
  async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); }
  async function until(predicate) {
    for (let i = 0; i < 30; i++) { await settle(); if (predicate()) return; }
    assert.fail(`No apareció el estado esperado: ${dom.window.document.body.textContent.slice(0, 400)}`);
  }
  function button(label, scope = dom.window.document) {
    const found = [...scope.querySelectorAll("button")].find(element => element.textContent.trim() === label);
    assert.ok(found, `Falta botón ${label}`);
    return found;
  }
  async function click(label, scope) { await act(async () => { button(label, scope).click(); }); await settle(); }
  await until(() => dom.window.document.body.textContent.includes("CALLE 13"));
  return { dom, calls, destinations, button, click, until, settle,
    remove() { deleted = true; },
    mismatchNext(count) { mismatches = count; },
    async close() { await act(async () => root.unmount()); dom.window.close(); Object.assign(globalThis, old); },
  };
}

test("Actualizar sincroniza cierre y reapertura concurrentes; CLOSED permanece editable", { concurrency: false }, async () => {
  const model = fixture(); const ui = await mount(model);
  try {
    model.status = "CLOSED"; model.row.revision++;
    await ui.click("Actualizar");
    assert.match(ui.dom.window.document.body.textContent, /Período cerrado/);
    assert.match(ui.dom.window.document.body.textContent, /sigue editable/);
    assert.ok(ui.button("Reabrir período"));
    assert.equal(ui.dom.window.document.querySelectorAll('button[aria-label="Editar importe de Ventas demo"]').length, 1);
    assert.equal(ui.dom.window.document.querySelector('button[aria-label="Editar importe de Ventas demo"]').disabled, false);
    await ui.click("Reabrir período");
    await ui.click("Reabrir período", ui.dom.window.document.querySelector("dialog"));
    await ui.until(() => ui.dom.window.document.body.textContent.includes("Período abierto"));
    assert.equal(ui.dom.window.document.body.textContent.includes("sigue editable"), false);
    assert.ok(ui.button("Cerrar período"));
    assert.equal(ui.calls.filter(call => call.path.endsWith("/reopen")).at(-1).body.expectedRevision, 6);
    model.status = "CLOSED"; model.row.revision++;
    await ui.click("Actualizar");
    assert.ok(ui.button("Reabrir período"));
    model.status = "OPEN"; model.row.revision++;
    await ui.click("Actualizar");
    assert.ok(ui.button("Cerrar período"));
    assert.equal(ui.dom.window.document.body.textContent.includes("sigue editable"), false);
  } finally { await ui.close(); }
});

test("409 no reintenta transición y refresca EERR y estructura antes de la próxima acción", { concurrency: false }, async () => {
  const model = fixture(); const ui = await mount(model, { conflict: true });
  try {
    await ui.click("Cerrar período");
    model.status = "CLOSED"; model.row.revision++;
    await ui.click("Cerrar período", ui.dom.window.document.querySelector("dialog"));
    await ui.until(() => ui.dom.window.document.body.textContent.includes("Recargamos el estado"));
    assert.equal(ui.dom.window.document.querySelector("dialog"), null);
    assert.ok(ui.button("Reabrir período"));
    assert.equal(ui.calls.filter(call => call.path.endsWith("/close")).length, 1);
    await ui.click("Reabrir período");
    await ui.click("Reabrir período", ui.dom.window.document.querySelector("dialog"));
    assert.equal(ui.calls.filter(call => call.path.endsWith("/reopen")).at(-1).body.expectedRevision, 6);
  } finally { await ui.close(); }
});

test("Actualizar ante 404 quita UI stale, cierra diálogo y redirige con aviso", { concurrency: false }, async () => {
  const model = fixture(); const ui = await mount(model);
  try {
    ui.remove();
    await ui.click("Actualizar");
    assert.deepEqual(ui.destinations, ["/eerr?missing=1"]);
    assert.equal(ui.dom.window.document.body.textContent.includes("CALLE 13"), false);
    assert.match(ui.dom.window.document.body.textContent, /ya no está disponible/);
    assert.equal(ui.dom.window.document.querySelector("dialog"), null);
    assert.equal(ui.calls.filter(call => call.path === `/eerr/${id}` && call.method === "GET").length, 2);
  } finally { await ui.close(); }
});

test("Actualizar reintenta revisiones dispares y oculta estado obsoleto al agotar el límite", { concurrency: false }, async () => {
  const model = fixture(); const ui = await mount(model);
  try {
    model.status = "CLOSED"; model.row.revision++;
    ui.mismatchNext(1);
    await ui.click("Actualizar");
    assert.ok(ui.button("Reabrir período"));
    assert.equal(ui.calls.filter(call => call.path === `/eerr/${id}/structure`).length, 3);
    ui.mismatchNext(3);
    await ui.click("Actualizar");
    assert.match(ui.dom.window.document.body.textContent, /continúa cambiando/);
    assert.equal(ui.dom.window.document.body.textContent.includes("CALLE 13"), false);
    assert.equal(ui.dom.window.document.querySelector('button[aria-label="Editar importe de Ventas demo"]'), null);
    assert.equal(ui.calls.filter(call => call.path === `/eerr/${id}/structure`).length, 6);
  } finally { await ui.close(); }
});

test("Actualizar conserva un importe en edición sin confirmar", { concurrency: false }, async () => {
  const model = fixture(); const ui = await mount(model);
  try {
    await act(async () => { ui.dom.window.document.querySelector('button[aria-label="Editar importe de Ventas demo"]').click(); });
    const input = ui.dom.window.document.querySelector('form[aria-label="Importe de Ventas demo"] input');
    assert.ok(input);
    await act(async () => {
      Object.getOwnPropertyDescriptor(ui.dom.window.HTMLInputElement.prototype, "value").set.call(input, "125");
      input.dispatchEvent(new ui.dom.window.Event("input", { bubbles: true }));
    });
    model.row.revision++;
    await ui.click("Actualizar");
    assert.equal(input.value, "125");
    assert.match(ui.dom.window.document.body.textContent, /borrador conservado/i);
  } finally { await ui.close(); }
});

test("completar ceros seguido de close usa la revisión N+1", { concurrency: false }, async () => {
  const model = fixture("OPEN", true); const ui = await mount(model);
  try {
    await ui.click("Cerrar período");
    await ui.click("Marcar pendientes en 0", ui.dom.window.document.querySelector("dialog"));
    await ui.click("Generar vista previa", ui.dom.window.document.querySelector("dialog"));
    await ui.until(() => ui.dom.window.document.body.textContent.includes("Completar con cero"));
    await ui.click("Completar con cero", ui.dom.window.document.querySelector("dialog"));
    await ui.until(() => ui.dom.window.document.querySelector("dialog")?.textContent.includes("Cerrar período"));
    await ui.click("Cerrar período", ui.dom.window.document.querySelector("dialog"));
    await ui.until(() => model.status === "CLOSED");
    assert.equal(ui.calls.filter(call => call.path.endsWith("/close")).at(-1).body.expectedRevision, 6);
    assert.equal(model.row.revision, 7);
    assert.match(ui.dom.window.document.body.textContent, /Período cerrado/);
  } finally { await ui.close(); }
});

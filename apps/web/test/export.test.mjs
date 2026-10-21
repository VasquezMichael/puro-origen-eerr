import "./tsx-loader.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
const { EerrApiError } = await import("../src/app/eerr/api.ts");
const { exportErrorMessage, exportFilenameFromHeader } = await import("../src/app/eerr/export-download.ts");
const { ExportActions } = await import("../src/app/eerr/[id]/export-actions.tsx");
const id = "11111111-1111-4111-8111-111111111111";

test("Content-Disposition acepta filename y filename* con fallback y saneamiento", () => {
  assert.equal(exportFilenameFromHeader('attachment; filename="EERR_CALLE-13_2026-09.pdf"', "pdf"), "EERR_CALLE-13_2026-09.pdf");
  assert.equal(exportFilenameFromHeader("attachment; filename=viejo.xlsx; filename*=UTF-8''EERR_%C3%91and%C3%BA.xlsx", "xlsx"), "EERR_Ñandú.xlsx");
  assert.equal(exportFilenameFromHeader('attachment; filename="../\\mal\r\nnombre.exe"', "pdf"), "mal-nombre.pdf");
  assert.equal(exportFilenameFromHeader("attachment; filename*=UTF-8''%ZZ", "pdf"), "EERR.pdf");
  assert.equal(exportFilenameFromHeader("attachment; filename=", "xlsx"), "EERR.xlsx");
  assert.equal(exportFilenameFromHeader(null, "pdf"), "EERR.pdf");
  assert.equal(exportFilenameFromHeader(`attachment; filename="${"x".repeat(200)}.pdf"`, "pdf").length, 104);
});

test("los errores de exportación no muestran códigos ni detalles técnicos", () => {
  assert.match(exportErrorMessage(new EerrApiError("interno", 422, "EXPORT_PRECISION_LIMIT"), "xlsx"), /Podés utilizar la exportación PDF/);
  for (const status of [401, 403, 404, 500, 0])
    assert.doesNotMatch(exportErrorMessage(new EerrApiError("stack interno", status), "pdf"), /stack|interno/);
  assert.doesNotMatch(exportErrorMessage(new Error("fallo interno"), "pdf"), /fallo interno/);
});

async function mount(reply) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost:3000" });
  const old = Object.fromEntries(["window", "document", "HTMLElement", "fetch", "IS_REACT_ACT_ENVIRONMENT", "setTimeout"].map(key => [key, globalThis[key]]));
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  const requests = [], downloads = [], created = [], revoked = [], missing = [];
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  URL.createObjectURL = (blob) => { created.push(blob); return `blob:fixture-${created.length}`; };
  URL.revokeObjectURL = (url) => revoked.push(url);
  globalThis.setTimeout = (fn, delay, ...args) => old.setTimeout(fn, delay === 1000 ? 0 : delay, ...args);
  dom.window.HTMLAnchorElement.prototype.click = function () { downloads.push({ href: this.href, filename: this.download }); };
  globalThis.fetch = async (input, options) => {
    requests.push({ path: new URL(input).pathname, credentials: options.credentials });
    return reply(new URL(input).pathname);
  };
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root"));
  await act(async () => { root.render(React.createElement(ExportActions, { id, onMissing: () => missing.push(true) })); });
  const button = (name) => [...dom.window.document.querySelectorAll("button")].find(b => b.textContent === name);
  const click = async (name) => { await act(async () => { button(name).click(); }); };
  return { dom, requests, downloads, created, revoked, missing, button, click,
    async settle() { await act(async () => { await new Promise(resolve => old.setTimeout(resolve, 10)); }); },
    async close() { await act(async () => root.unmount()); dom.window.close(); Object.assign(globalThis, old); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; },
  };
}

test("click PDF y Excel crea Blob, usa filename, libera URL y autentica ambas solicitudes", { concurrency: false }, async () => {
  const ui = await mount((path) => new Response(new Blob([path]), { status: 200, headers: { "Content-Disposition": path.endsWith("pdf") ? 'attachment; filename="reporte.pdf"' : "attachment; filename*=UTF-8''EERR_%C3%91and%C3%BA.xlsx" } }));
  try {
    await ui.click("Exportar PDF");
    await ui.click("Exportar Excel");
    await ui.settle();
    assert.deepEqual(ui.requests.map(r => r.path), [`/eerr/${id}/export/pdf`, `/eerr/${id}/export/xlsx`]);
    assert.ok(ui.requests.every(r => r.credentials === "include"));
    assert.deepEqual(ui.downloads.map(d => d.filename), ["reporte.pdf", "EERR_Ñandú.xlsx"]);
    assert.equal(ui.created.length, 2);
    assert.ok(ui.created.every(blob => blob instanceof Blob));
    assert.deepEqual(ui.revoked, ["blob:fixture-1", "blob:fixture-2"]);
    assert.equal(ui.dom.window.document.querySelectorAll("a").length, 0);
  } finally { await ui.close(); }
});

test("loading independiente impide doble click del mismo formato sin bloquear el otro", { concurrency: false }, async () => {
  const pending = new Map();
  const ui = await mount((path) => new Promise(resolve => pending.set(path, resolve)));
  try {
    await ui.click("Exportar PDF");
    assert.ok(ui.button("Exportando PDF…").disabled);
    assert.ok(!ui.button("Exportar Excel").disabled);
    await act(async () => { ui.button("Exportando PDF…").click(); });
    await ui.click("Exportar Excel");
    assert.ok(ui.button("Exportando Excel…").disabled);
    assert.equal(ui.requests.length, 2);
    assert.match(ui.dom.window.document.body.textContent, /Preparando descarga/);
    await act(async () => {
      for (const resolve of pending.values()) resolve(new Response(new Blob(["ok"]), { status: 200 }));
    });
    await ui.settle();
    assert.ok(ui.button("Exportar PDF"));
    assert.ok(ui.button("Exportar Excel"));
    assert.deepEqual(ui.downloads.map(d => d.filename), ["EERR.pdf", "EERR.xlsx"]);
  } finally { await ui.close(); }
});

test("422 de Excel informa alternativa PDF sin descargarla automáticamente; 404 avisa desaparición", { concurrency: false }, async () => {
  const ui = await mount((path) => path.endsWith("xlsx")
    ? Response.json({ code: "EXPORT_PRECISION_LIMIT", message: "detalle interno" }, { status: 422 })
    : Response.json({ message: "no encontrado" }, { status: 404 }));
  try {
    await ui.click("Exportar Excel");
    assert.match(ui.dom.window.document.querySelector('[role="alert"]').textContent, /Podés utilizar la exportación PDF/);
    assert.equal(ui.requests.length, 1);
    assert.equal(ui.downloads.length, 0);
    await ui.click("Exportar PDF");
    assert.deepEqual(ui.missing, [true]);
    assert.equal(ui.downloads.length, 0);
  } finally { await ui.close(); }
});

test("500 y error de red muestran mensaje legible sin iniciar descarga", { concurrency: false }, async () => {
  for (const reply of [() => Response.json({ message: "stack interno" }, { status: 500 }), () => { throw Error("red caída"); }]) {
    const ui = await mount(reply);
    try {
      await ui.click("Exportar PDF");
      assert.match(ui.dom.window.document.querySelector('[role="alert"]').textContent, /No se pudo|No pudimos/);
      assert.doesNotMatch(ui.dom.window.document.body.textContent, /stack interno|red caída/);
      assert.equal(ui.downloads.length, 0);
    } finally { await ui.close(); }
  }
});

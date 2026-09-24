// Chromium real contra Next local; toda respuesta API es una fixture en memoria.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOTS } from "../../../packages/domain/dist/index.js";
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ executablePath: process.env.BROWSER_BINARY, headless: true });
const origin = process.env.WEB_TEST_ORIGIN ?? "http://127.0.0.1:3100";
const id = "11111111-1111-4111-8111-111111111111";
const branchId = "123456789012345678901234";
const counts = (loadedCount, totalCount) => ({ loadedCount, pendingCount: totalCount - loadedCount, totalCount, completenessPercent: totalCount ? (loadedCount * 100 / totalCount).toFixed(2) : null });
const scope = (nodeId, code, name, status, value, loaded, total) => ({ nodeId, code, name, status, value, completeness: counts(loaded, total) });
const metric = (value, unit, reason = null) => ({ value, unit, reason, status: value === null ? "BLOCKED" : "COMPLETE" });
function fixture(revision, mode) {
  const pending = mode === "partial" || mode === "pending";
  const empty = mode === "empty";
  const zero = mode === "zero";
  const negative = mode === "negative";
  const income = empty ? null : zero ? "0.00" : "9007199254740993.10";
  const cost = empty ? null : "100.00";
  const expense = empty ? null : mode === "partial" ? "5.00" : pending ? null : "15.00";
  const reason = pending ? "PENDING_INPUTS" : empty ? "EMPTY_INPUT" : null;
  return { eerrId: id, sourceRevision: revision, calculationVersion: 1, initialized: true, currency: "ARS",
    blocks: [scope("b1", ROOTS[0].code, "INGRESOS", empty ? "EMPTY" : "COMPLETE", income, empty ? 0 : 1, empty ? 0 : 1), scope("b2", ROOTS[1].code, "COSTOS", empty ? "EMPTY" : "COMPLETE", cost, empty ? 0 : 1, empty ? 0 : 1), scope("b3", ROOTS[2].code, "GASTOS GENERALES", empty ? "EMPTY" : mode === "partial" ? "PARTIAL" : pending ? "PENDING" : "COMPLETE", expense, empty || mode === "pending" ? 0 : 1, empty ? 0 : mode === "partial" ? 2 : 1)],
    categories: [{ ...scope("cat", "cat-code", "Ventas históricas", empty ? "EMPTY" : "COMPLETE", income, empty ? 0 : 1, empty ? 0 : 1), parentNodeId: "b1", parentCode: ROOTS[0].code, depth: 1, position: 0 }],
    metrics: { grossMargin: metric(empty ? null : negative ? "-1500.25" : "50.00", "ARS", empty ? "EMPTY_INPUT" : null), grossMarginPercent: metric(empty ? null : zero ? null : "66.6667", "PERCENT", empty ? "EMPTY_INPUT" : zero ? "ZERO_DENOMINATOR" : null), netResult: metric(pending || empty ? null : negative ? "-1515.25" : "35.00", "ARS", reason), netResultPercent: metric(pending || empty ? null : zero ? null : "33.3333", "PERCENT", pending || empty ? reason : zero ? "ZERO_DENOMINATOR" : null) } };
}
function structure() { return { id, revision: 2, progress: { total: 1, loaded: 1, pending: 0, status: "CARGADO" }, structure: { schemaVersion: 1, structureVersion: 1, nodes: [
  { nodeId: "b1", code: ROOTS[0].code, kind: "BLOCK", parentId: null, name: "INGRESOS", position: 0 },
  { nodeId: "cat", code: "cat-code", kind: "CATEGORY", parentId: "b1", name: "Ventas históricas", position: 0 },
  { nodeId: "item", code: "item-code", kind: "ITEM", parentId: "cat", name: "Digitales", position: 0, amount: { state: "CARGADO", input: "100", value: "100.00", currency: "ARS", scale: 2 } },
  { nodeId: "b2", code: ROOTS[1].code, kind: "BLOCK", parentId: null, name: "COSTOS", position: 1 },
  { nodeId: "b3", code: ROOTS[2].code, kind: "BLOCK", parentId: null, name: "GASTOS GENERALES", position: 2 },
] } }; }
let passed = 0;
const viewports = process.env.MUTATION_CASE ? [[1440, 900]] : [[1440,900],[1280,720],[1024,768],[768,1024],[390,844]];
try {
  for (const [width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    if (process.env.MUTATION_CASE) page.setDefaultTimeout(4000);
    const errors = [];
    let row = structure(), mode = "complete", role = "EDITOR", fail = false, mismatch = false, delayOld = false, delayNew = false, reads = 0, writes = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (url.origin !== "http://localhost:3001") { errors.push(`External ${url.origin}`); return route.abort(); }
      const headers = { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET,PUT,OPTIONS", "access-control-allow-headers": "content-type" };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const path = url.pathname;
      let body, status = 200;
      if (path === "/auth/me") body = { user: { isAdmin: false, branchAccesses: [{ branchId, role }] } };
      else if (path === "/branches") body = [{ id: branchId, name: "Sucursal ficticia", active: true }];
      else if (path === `/eerr/${id}`) body = { id, branchId, year: 2026, month: 9 };
      else if (path === `/eerr/${id}/structure`) body = row;
      else if (path === `/eerr/${id}/analysis`) { reads++; if (fail) { status = 500; body = { message: "Error interno ficticio" }; } else { body = fixture(mismatch ? row.revision - 1 : row.revision, mode); if (delayOld && body.sourceRevision === 2) await new Promise((resolve) => setTimeout(resolve, 700)); if (delayNew && body.sourceRevision === 3) await new Promise((resolve) => setTimeout(resolve, 500)); } }
      else if (path === `/eerr/${id}/items/item/amount` && request.method() === "PUT") { writes++; const input = request.postDataJSON(); assert.equal(input.expectedRevision, row.revision); row = { ...row, revision: row.revision + 1, structure: { ...row.structure, nodes: row.structure.nodes.map((node) => node.nodeId === "item" ? { ...node, amount: { ...node.amount, input: input.input, value: "25.00" } } : node) } }; body = row; }
      else { errors.push(`Unexpected API ${path}`); return route.abort(); }
      await route.fulfill({ status, headers, json: body });
    });
    const table = page.getByRole("table", { name: "Cuadro de resultados del EERR" });
    const open = async () => { await page.goto(`${origin}/eerr/${id}`); await table.waitFor(); };
    await open();
    assert.equal(writes, 0);
    assert.match(await table.innerText(), /9\.007\.199\.254\.740\.993,10 ARS/);
    assert.match(await table.innerText(), /66,67 %/);
    assert.ok((await page.locator("body").innerText()).indexOf("Cuadro de resultados") < (await page.locator("body").innerText()).indexOf("Estructura y valores"));
    await page.screenshot({ path: join(tmpdir(), `ep05a2-${width}-complete.png`), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    mode = "partial"; await page.reload(); await table.waitFor(); assert.match(await table.innerText(), /Parcial/); assert.match(await table.innerText(), /5,00 ARS/); assert.match(await table.innerText(), /Disponible cuando se completen/);
    mode = "pending"; await page.reload(); await table.waitFor(); assert.match(await table.innerText(), /Importes sin cargar/);
    mode = "empty"; await page.reload(); await table.waitFor(); assert.match(await table.innerText(), /Sin ítems/); assert.doesNotMatch(await table.innerText(), /0,00 ARS/);
    mode = "zero"; await page.reload(); await table.waitFor(); assert.match(await table.innerText(), /0,00 ARS/); assert.match(await table.innerText(), /No calculable porque los ingresos son cero/);
    mode = "negative"; await page.reload(); await table.waitFor(); assert.match(await table.innerText(), /-1\.500,25 ARS/);
    fail = true; await page.reload(); await page.getByRole("button", { name: "Reintentar cuadro" }).waitFor(); await page.getByRole("table", { name: "Estructura del EERR" }).waitFor(); fail = false; await page.getByRole("button", { name: "Reintentar cuadro" }).click(); await table.waitFor();
    mismatch = true; await page.reload(); await page.getByRole("button", { name: "Actualizar cuadro" }).waitFor(); assert.equal(await table.count(), 0); mismatch = false; await page.getByRole("button", { name: "Actualizar cuadro" }).click(); await table.waitFor();
    const editorRow = page.locator('tr[data-node-id="item"]');
    await editorRow.getByRole("button", { name: /Editar importe/ }).click();
    await editorRow.getByRole("textbox", { name: /Importe o expresión/ }).fill("25");
    await page.getByText("Calculado con los datos guardados").waitFor();
    assert.match(await table.innerText(), /-1\.500,25 ARS/);
    const beforeSaveReads = reads;
    mode = "zero";
    delayNew = true;
    await editorRow.getByRole("button", { name: /Guardar importe/ }).click();
    await page.getByText("Guardado: Importe", { exact: false }).first().waitFor();
    assert.equal(await table.count(), 0);
    await table.getByText("No calculable porque los ingresos son cero").first().waitFor();
    delayNew = false;
    assert.ok(reads > beforeSaveReads);
    assert.equal(row.revision, 3);
    row = structure(); mode = "complete"; delayOld = true;
    await page.reload();
    await editorRow.getByRole("button", { name: /Editar importe/ }).click();
    await editorRow.getByRole("textbox", { name: /Importe o expresión/ }).fill("25");
    mode = "negative";
    await editorRow.getByRole("button", { name: /Guardar importe/ }).click();
    await table.getByText("-1.500,25 ARS", { exact: true }).waitFor();
    await page.waitForTimeout(850);
    assert.match(await table.innerText(), /-1\.500,25 ARS/);
    assert.equal(row.revision, 3);
    delayOld = false;
    role = "READER"; await page.reload(); await table.waitFor(); assert.equal(await page.getByRole("button", { name: /Editar importe/ }).count(), 0);
    assert.deepEqual(errors, []);
    assert.ok(reads >= 8);
    await context.close(); passed++; console.log(`PASS analysis ${width}x${height}: states, retry, revision, reader, geometry`);
  }
} finally { await browser.close(); }
assert.equal(passed, viewports.length);

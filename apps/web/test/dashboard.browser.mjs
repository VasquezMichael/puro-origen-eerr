// Chromium sobre Next de producción. Todas las respuestas API viven en memoria.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOTS } from "../../../packages/domain/dist/index.js";
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ executablePath: process.env.BROWSER_BINARY, headless: true });
const origin = process.env.WEB_TEST_ORIGIN ?? "http://127.0.0.1:3100";
const branchId = "123456789012345678901234", eerrId = "11111111-1111-4111-8111-111111111111";
const metric = (value, unit = "ARS", reason = null) => ({ status: value === null ? "BLOCKED" : "COMPLETE", value, unit, reason });
const block = (root, value, status = "COMPLETE") => ({ nodeId: root.code, code: root.code, name: root.name, status, value, completeness: { loadedCount: status === "COMPLETE" ? 1 : 0, pendingCount: status === "COMPLETE" ? 0 : 1, totalCount: 1, completenessPercent: status === "COMPLETE" ? "100.00" : "0.00" } });
function fixture({ year = 2026, month = 9, mode = "complete", role = "ADMIN", signature = "sig-one" } = {}) {
  const empty = mode === "empty", partial = mode === "partial";
  const withEerr = empty ? 0 : 1;
  const branch = { branchId, name: "Sucursal ficticia", active: !partial, temporal: "EXPECTED", eerrId: empty ? null : eerrId, revision: empty ? null : 2, loadStatus: partial ? "PARCIAL" : "CARGADO", analysisStatus: empty ? "NO_EERR" : partial ? "PARTIAL" : "COMPLETE", reason: empty ? "NO_EERR" : partial ? "PARTIAL" : null, blocks: empty ? null : [block(ROOTS[0], "9007199254740993.10"), block(ROOTS[1], "0.00"), block(ROOTS[2], partial ? null : "5.00", partial ? "PENDING" : "COMPLETE")], metrics: null, breakEvenSales: null };
  const value = partial ? "10.00" : month === 7 ? "7.00" : month === 8 ? "8.00" : "9007199254740993.10";
  const completeBranch = { ...branch, branchId: "complete", name: "Sucursal completa", active: true, eerrId: "22222222-2222-4222-8222-222222222222", analysisStatus: "COMPLETE", reason: null, blocks: [block(ROOTS[0], "10.00"), block(ROOTS[1], "0.00"), block(ROOTS[2], "5.00")] };
  return { year, month, timezone: "America/Argentina/Buenos_Aires", calculationVersion: 2,
    scope: { type: role === "ADMIN" ? "GLOBAL" : "ACCESSIBLE", label: role === "ADMIN" ? "Consolidado global" : "Consolidado de mis sucursales accesibles", authorizedCount: partial ? 2 : 1, expectedCount: partial ? 2 : 1 },
    coverage: { expected: partial ? 2 : 1, withEerr: partial ? 2 : withEerr, withoutEerr: empty ? 1 : 0, complete: mode === "complete" || partial ? 1 : 0, partial: partial ? 1 : 0, pending: 0, empty: 0, uninitialized: 0, inactiveWithHistory: partial ? 1 : 0, inactiveWithoutHistory: 0, excludedNotStarted: 0 },
    consolidated: { status: mode === "complete" ? "COMPLETE" : "PARTIAL", definitive: mode === "complete", includedCount: empty ? 0 : 1, expectedCount: partial ? 2 : 1, label: mode === "complete" ? "Consolidado definitivo" : `Subtotal de ${empty ? 0 : 1} de ${partial ? 2 : 1} sucursales esperadas`, income: metric(empty ? null : value, "ARS", empty ? "NO_COMPLETE_SOURCES" : null), costs: metric(empty ? null : "0.00"), expenses: metric(empty ? null : "5.00"), grossMargin: metric(mode === "complete" ? "9007199254740993.10" : null, "ARS", partial ? "INCOMPLETE_SCOPE" : null), grossMarginPercent: metric(mode === "complete" ? "100.0000" : null, "PERCENT"), netResult: metric(mode === "complete" ? "9007199254740988.10" : null), netResultPercent: metric(mode === "complete" ? "99.9999" : null, "PERCENT"), breakEvenSales: metric(mode === "complete" ? "5.00" : null, "ARS", partial ? "INCOMPLETE_SCOPE" : null), targetSales: null, breakEvenAssumption: mode === "complete" ? "Supone que se mantiene la mezcla observada de ventas y costos variables." : null },
    branches: [...(partial ? [completeBranch] : []), branch, { branchId: "later", name: "Sucursal próxima", active: true, temporal: "NOT_STARTED", eerrId: null, revision: null, loadStatus: null, analysisStatus: "EXCLUDED", reason: "NOT_STARTED", blocks: null, metrics: null, breakEvenSales: null }], sources: [], sourceSignature: signature };
}
const sizes = [[1440,900],[1280,720],[1024,768],[768,1024],[390,844]];
try {
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date("2026-10-01T01:00:00Z"));
    const errors = []; let mode = "complete", role = "ADMIN", fail = 0, delay = 0, signature = "sig-one", reads = 0, writes = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (url.origin !== "http://localhost:3001") { errors.push(`Origen inesperado ${url.origin}`); return route.abort(); }
      const headers = { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET,OPTIONS", "access-control-allow-headers": "content-type" };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (request.method() !== "GET") writes++;
      let body, status = 200;
      if (url.pathname === "/auth/me") body = { user: { id: "fixture", name: "Persona", email: "persona@example.invalid", isAdmin: role === "ADMIN", branchAccesses: role === "ADMIN" ? [] : [{ branchId, role }], mustChangePassword: false } };
      else if (url.pathname === "/branches") body = [{ id: branchId, name: "Sucursal ficticia", active: true, startDate: "2025-01-01T12:00:00Z" }];
      else if (url.pathname === "/analytics/dashboard") { reads++; if (delay) await new Promise((resolve) => setTimeout(resolve, delay)); if (fail) { status = fail; body = { message: "Error simulado" }; } else body = fixture({ year: Number(url.searchParams.get("year")), month: Number(url.searchParams.get("month")), mode, role, signature }); }
      else if (url.pathname === `/eerr/${eerrId}`) body = { id: eerrId, branchId, year: 2026, month: 9 };
      else if (url.pathname === `/eerr/${eerrId}/structure`) body = { id: eerrId, revision: 2, progress: { total: 0, loaded: 0, pending: 0, status: "SIN_CARGAR" }, structure: null };
      else if (url.pathname === `/eerr/${eerrId}/analysis`) body = { initialized: false, sourceRevision: 2, blocks: [], categories: [], metrics: {}, projections: {} };
      else { errors.push(`API inesperada ${url.pathname}`); return route.abort(); }
      try { await route.fulfill({ status, headers, json: body }); } catch { /* Navegación abortada. */ }
    });
    await page.goto(`${origin}/?year=2026&month=9`);
    await page.getByRole("heading", { name: "Consolidado definitivo" }).waitFor();
    assert.match(await page.locator("main").innerText(), /Consolidado global/);
    assert.match(await page.locator("main").innerText(), /9\.007\.199\.254\.740\.993,10 ARS/);
    assert.match(await page.locator("main").innerText(), /Punto de Equilibrio/);
    assert.equal(await page.getByRole("button", { name: "Crear período" }).count(), 0);
    await page.screenshot({ path: join(tmpdir(), `ep06a2-${width}-complete.png`), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    mode = "partial"; signature = "sig-two"; await page.getByRole("button", { name: "Actualizar" }).click();
    await page.getByRole("heading", { name: /Subtotal de 1 de 2/ }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Consolidado definitivo" }).count(), 0);
    assert.equal(await page.getByText("Punto de Equilibrio", { exact: true }).count(), 0);
    assert.match(await page.locator("main").innerText(), /Inactiva · EERR histórico/);
    assert.match(await page.locator("main").innerText(), /Parcial/);
    const help = page.getByRole("button", { name: "¿Cómo se cuentan las sucursales inactivas?" });
    await help.hover(); assert.equal(await page.getByRole("tooltip").count(), 1);
    await help.focus(); await page.keyboard.press("Escape"); await page.getByRole("tooltip").waitFor({ state: "hidden" });
    await help.click(); assert.equal(await page.getByRole("tooltip").count(), 1);
    await page.getByRole("heading", { name: /Estado por sucursal/ }).click(); await page.getByRole("tooltip").waitFor({ state: "hidden" });
    await help.focus(); await page.keyboard.press("Escape"); await page.getByRole("tooltip").waitFor({ state: "hidden" });
    await page.keyboard.press("Enter"); await page.getByRole("tooltip").waitFor();
    await page.keyboard.press("Escape"); await page.getByRole("tooltip").waitFor({ state: "hidden" });
    await page.keyboard.press("Space"); await page.getByRole("tooltip").waitFor();
    await page.getByRole("heading", { name: /Estado por sucursal/ }).click(); await page.getByRole("tooltip").waitFor({ state: "hidden" });
    await help.scrollIntoViewIfNeeded(); const area = await help.boundingBox(); assert.ok(area); await page.touchscreen.tap(area.x + area.width / 2, area.y + area.height / 2); await page.getByRole("tooltip").waitFor();
    await page.getByRole("heading", { name: /Estado por sucursal/ }).click(); await page.getByRole("tooltip").waitFor({ state: "hidden" });
    await page.screenshot({ path: join(tmpdir(), `ep06a2-${width}-partial.png`), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    mode = "empty"; await page.getByRole("button", { name: "Actualizar" }).click(); await page.getByRole("heading", { name: "Sin EERR para este período" }).waitFor();
    assert.doesNotMatch(await page.locator("main").innerText(), /0,00 ARS/);
    fail = 409; await page.getByRole("button", { name: "Actualizar" }).click(); await page.getByText(/Los datos cambiaron mientras se preparaba/).waitFor();
    fail = 400; await page.getByRole("button", { name: "Reintentar" }).click(); await page.getByText(/El período solicitado no es válido/).waitFor();
    fail = 500; await page.getByRole("button", { name: "Reintentar" }).click(); await page.getByText(/Error simulado/).waitFor();
    fail = 0; await page.getByRole("button", { name: "Reintentar" }).click(); await page.getByRole("heading", { name: "Sin EERR para este período" }).waitFor();
    fail = 401; await page.getByRole("button", { name: "Actualizar" }).click(); await page.getByText(/Tu sesión venció/).first().waitFor();
    fail = 0; await page.reload(); await page.getByRole("heading", { name: "Sin EERR para este período" }).waitFor();
    role = "READER"; await page.reload(); await page.getByText("Consolidado de mis sucursales accesibles").waitFor(); assert.equal(await page.getByRole("button", { name: "Crear período" }).count(), 0);
    role = "EDITOR"; await page.reload(); await page.getByText("Consolidado de mis sucursales accesibles").waitFor();
    mode = "complete"; await page.reload(); await page.getByRole("link", { name: "Abrir EERR" }).click(); await page.waitForURL(`**/eerr/${eerrId}`);
    await page.goto(`${origin}/?year=bad&month=13`); await page.waitForURL("**/?year=2026&month=9");
    await page.getByRole("heading", { name: "Consolidado definitivo" }).waitFor();
    await page.getByRole("spinbutton", { name: "Año del Dashboard" }).fill("2025"); await page.getByRole("button", { name: "Ver período" }).click(); await page.waitForURL("**/?year=2025&month=9");
    await page.reload(); await page.getByRole("heading", { name: "Consolidado definitivo" }).waitFor();
    delay = 450; await page.getByRole("combobox", { name: "Mes del Dashboard" }).selectOption("8"); await page.getByRole("button", { name: "Ver período" }).click();
    await page.getByRole("combobox", { name: "Mes del Dashboard" }).selectOption("7"); await page.getByRole("button", { name: "Ver período" }).click();
    await page.getByRole("heading", { name: "Consolidado definitivo" }).waitFor();
    assert.match(page.url(), /month=7/); assert.match(await page.locator("main").innerText(), /Julio 2025/);
    await page.waitForTimeout(550); assert.match(await page.locator("main").innerText(), /7,00 ARS/); assert.doesNotMatch(await page.locator("main").innerText(), /8,00 ARS/);
    assert.deepEqual(errors, []); assert.equal(writes, 0); assert.ok(reads >= 8);
    await context.close(); console.log(`PASS dashboard ${width}x${height}`);
  }
} finally { await browser.close(); }

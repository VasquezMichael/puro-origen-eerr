// Next de producción y API simulada; nunca inicia Nest ni accede a datos reales.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dashboardFixture } from "./dashboard-browser-fixture.mts";
import { ids, branchTableFixture, branchPeriodFixture, twoBranchFixture, consolidatedFixture } from "./comparison-browser-fixture.mts";
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ executablePath: process.env.BROWSER_BINARY, headless: true });
const origin = process.env.WEB_TEST_ORIGIN ?? "http://127.0.0.1:3100";
const sizes = [[1600,900],[1440,900],[1280,720],[1024,768],[768,1024],[390,844]];
try {
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    const page = await context.newPage();
    const errors = [], requests = []; let fail = 0, delayed = false, role = "ADMIN", incomplete = false;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (url.origin !== "http://localhost:3001") { errors.push(`Origen inesperado ${url.origin}`); return route.abort(); }
      const headers = { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET,OPTIONS", "access-control-allow-headers": "content-type" };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (request.method() !== "GET") { errors.push(`Escritura inesperada ${request.method()}`); return route.abort(); }
      let body, status = 200;
      const year = Number(url.searchParams.get("year")), month = Number(url.searchParams.get("month")), referenceYear = Number(url.searchParams.get("referenceYear")), referenceMonth = Number(url.searchParams.get("referenceMonth"));
      if (url.pathname === "/auth/me") body = { user: { id: "fixture", name: "Persona", email: "persona@example.invalid", isAdmin: role === "ADMIN", branchAccesses: role === "ADMIN" ? [] : ids.slice(0, 2).map((branchId) => ({ branchId, role })), mustChangePassword: false } };
      else if (url.pathname === "/analytics/dashboard") body = dashboardFixture({ year, month, role });
      else if (url.pathname === "/analytics/branches") body = branchTableFixture(year, month, role);
      else if (url.pathname === `/analytics/branches/${ids[0]}/period-comparison` || url.pathname === `/analytics/branches/${ids[1]}/period-comparison` || url.pathname === `/analytics/branches/${ids[2]}/period-comparison`) { requests.push(url.toString()); if (delayed) await new Promise((resolve) => setTimeout(resolve, 350)); body = branchPeriodFixture(year, month, referenceYear, referenceMonth, url.pathname.split("/")[3], referenceMonth === 1 ? "zero" : referenceMonth === 2 ? "negative" : "complete"); }
      else if (url.pathname === "/analytics/branches/compare") { requests.push(url.toString()); body = twoBranchFixture(year, month, url.searchParams.get("branchId"), url.searchParams.get("referenceBranchId")); }
      else if (url.pathname === "/analytics/consolidated/compare") { requests.push(url.toString()); body = consolidatedFixture(year, month, referenceYear, referenceMonth, incomplete); }
      else { errors.push(`API inesperada ${url.pathname}`); return route.abort(); }
      if (fail && url.pathname.includes("comparison")) { status = fail; body = { message: "Error simulado" }; }
      try { await route.fulfill({ status, headers, json: body }); } catch { /* navegación abortada */ }
    });
    await page.goto(`${origin}/?year=2026&month=1`);
    await page.getByRole("heading", { name: "Consolidado definitivo" }).waitFor();
    assert.equal(requests.length, 0);
    await page.getByRole("link", { name: "Comparaciones" }).click();
    await page.waitForURL("**/?year=2026&month=1&view=comparisons");
    await page.getByRole("combobox", { name: "Sucursal analizada" }).waitFor();
    assert.equal(requests.length, 0);
    assert.equal(await page.getByRole("spinbutton", { name: "Sucursal entre períodos: año de referencia" }).inputValue(), "2025");
    assert.equal(await page.getByRole("combobox", { name: "Sucursal entre períodos: mes de referencia" }).inputValue(), "12");
    await page.getByRole("combobox", { name: "Sucursal analizada" }).selectOption(ids[0]);
    await page.getByRole("button", { name: "Comparar períodos" }).click();
    await page.getByText("Comparación actualizada.").waitFor();
    assert.match(requests.at(-1), /referenceYear=2025&referenceMonth=12/);
    assert.match(await page.locator("main").innerText(), /\+9\.007\.199\.254\.740\.983,10 ARS/);
    assert.match(await page.locator("main").innerText(), /\+10,0000 pp/);
    assert.match(await page.locator("main").innerText(), /12,5000 %/);
    const monthSelect = page.getByRole("combobox", { name: "Sucursal entre períodos: mes de referencia" });
    await monthSelect.selectOption("1");
    assert.equal(requests.length, 1); // el selector pendiente no consulta ni altera el resultado
    assert.match(await page.locator("main").innerText(), /12,5000 %/);
    await page.getByRole("button", { name: "Comparar períodos" }).click();
    await page.getByText(/referencia es cero o negativa/).first().waitFor();
    assert.doesNotMatch(await page.locator("main").innerText(), /12,5000 %/);
    await monthSelect.selectOption("2"); await page.getByRole("button", { name: "Comparar períodos" }).click();
    await page.getByText(/referencia es cero o negativa/).first().waitFor();
    fail = 409; await page.getByRole("button", { name: "Comparar períodos" }).click();
    await page.getByText(/Los datos cambiaron mientras/).waitFor();
    assert.doesNotMatch(await page.locator("main").innerText(), /9\.007\.199\.254\.740\.983,10 ARS/);
    fail = 0; await page.getByRole("button", { name: "Reintentar comparación aplicada" }).click();
    await page.getByText("Comparación actualizada.").waitFor();
    await monthSelect.selectOption("3"); const appliedRequests = requests.length;
    await page.getByRole("button", { name: "Actualizar comparación aplicada" }).click();
    await page.getByText("Comparación actualizada.").waitFor();
    assert.equal(requests.length, appliedRequests + 1);
    assert.match(requests.at(-1), /referenceMonth=2/);
    assert.equal(await monthSelect.inputValue(), "3");
    delayed = true; await page.getByRole("button", { name: "Comparar períodos" }).click();
    await page.getByRole("button", { name: "Sucursales del período" }).click();
    await page.getByRole("region", { name: "Todas las sucursales accesibles" }).waitFor();
    await page.waitForTimeout(400);
    assert.equal(await page.getByRole("region", { name: "Tabla de indicadores comparados" }).count(), 0);
    assert.equal(await page.locator("tbody tr", { hasText: "Sucursal Sin EERR" }).count(), 1);
    assert.match(await page.locator("main").innerText(), /Incompleto: importes parciales/);
    assert.equal(await page.locator("tbody tr", { hasText: "Sucursal Sin EERR" }).getByText("0,00 ARS").count(), 0);
    await page.getByRole("combobox", { name: "Sucursal analizada" }).selectOption(ids[0]);
    await page.getByRole("combobox", { name: "Sucursal de referencia" }).selectOption(ids[0]);
    assert.equal(await page.getByRole("button", { name: "Comparar sucursales" }).isDisabled(), true);
    await page.getByRole("combobox", { name: "Sucursal de referencia" }).selectOption(ids[1]);
    await page.getByRole("button", { name: "Comparar sucursales" }).click();
    await page.getByText("Comparación actualizada.").waitFor();
    assert.match(requests.at(-1), /branchId=123456789012345678901234&referenceBranchId=234567890123456789012345/);
    await page.getByRole("button", { name: "Consolidado entre períodos" }).click();
    incomplete = true; await page.getByRole("button", { name: "Comparar consolidados" }).click();
    await page.getByText(/La cobertura incompleta impide/).waitFor();
    assert.match(await page.locator("main").innerText(), /Incompletas/);
    assert.doesNotMatch(await page.locator("main").innerText(), /9\.007\.199\.254\.740\.983,10 ARS/);
    assert.doesNotMatch(await page.locator("main").innerText(), /\+10,0000 pp/);
    await page.screenshot({ path: join(tmpdir(), `ep06b2-${width}.png`), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (width > 1551) { const box = await page.locator("main > div").boundingBox(); assert.ok(box.width <= 1261); }
    await page.getByRole("link", { name: "Resumen" }).click();
    await page.waitForURL("**/?year=2026&month=1");
    await page.goBack(); await page.waitForURL("**/?year=2026&month=1&view=comparisons");
    await page.goForward(); await page.waitForURL("**/?year=2026&month=1");
    if (width === 1440) {
      role = "READER"; await page.goto(`${origin}/?year=2026&month=1&view=comparisons`);
      await page.getByRole("button", { name: "Sucursales del período" }).click();
      await page.getByRole("region", { name: "Todas las sucursales accesibles" }).waitFor();
      assert.equal(await page.locator("tbody tr", { hasText: "Sucursal Sin EERR" }).count(), 0);
      assert.equal(await page.getByText("Consolidado de mis sucursales accesibles").count() > 0, true);
      assert.equal(await page.getByRole("button", { name: /Guardar|Eliminar/ }).count(), 0);
      role = "EDITOR"; await page.reload();
      await page.getByRole("button", { name: "Sucursales del período" }).click();
      await page.getByRole("region", { name: "Todas las sucursales accesibles" }).waitFor();
      assert.equal(await page.locator("tbody tr", { hasText: "Sucursal Sin EERR" }).count(), 0);
      assert.equal(await page.getByRole("button", { name: /Guardar|Eliminar/ }).count(), 0);
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Comparaciones ${width}x${height}: OK`);
  }
} finally { await browser.close(); }

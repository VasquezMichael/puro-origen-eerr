// Chromium real con API totalmente interceptada; no inicia Nest ni usa datos reales.
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
const goal = (mode, value) => ({ mode, value, updatedAt: "2026-09-01T00:00:00.000Z", updatedBy: "fixture" });
const metric = (value, unit = "ARS", reason = null) => ({
  status: value === null ? "BLOCKED" : "COMPLETE", value, unit, reason,
});
const completeness = { loadedCount: 1, pendingCount: 0, totalCount: 1, completenessPercent: "100.00" };
const scope = (nodeId, code, name, value) => ({ nodeId, code, name, status: "COMPLETE", value, completeness });
function structure(revision) {
  return { id, revision, progress: { total: 1, loaded: 1, pending: 0, status: "CARGADO" },
    structure: { schemaVersion: 1, structureVersion: 1, nodes: [
      { nodeId: "b1", code: ROOTS[0].code, kind: "BLOCK", parentId: null, name: "INGRESOS", position: 0 },
      { nodeId: "cat", code: "cat-code", kind: "CATEGORY", parentId: "b1", name: "Ventas", position: 0 },
      { nodeId: "item", code: "item-code", kind: "ITEM", parentId: "cat", name: "Digitales", position: 0,
        amount: { state: "CARGADO", input: "100", value: "100.00", currency: "ARS", scale: 2 } },
      { nodeId: "b2", code: ROOTS[1].code, kind: "BLOCK", parentId: null, name: "COSTOS", position: 1 },
      { nodeId: "b3", code: ROOTS[2].code, kind: "BLOCK", parentId: null, name: "GASTOS GENERALES", position: 2 },
    ] } };
}
function analysis(revision, currentGoal, scenario) {
  const blocked = scenario === "pending";
  const unattainable = scenario === "unattainable";
  const reason = blocked ? "PENDING_INPUTS" : unattainable ? "TARGET_MARGIN_UNATTAINABLE" : null;
  const referenceUnit = currentGoal?.mode === "NET_PROFIT_AMOUNT" ? "PERCENT" : "ARS";
  return { eerrId: id, sourceRevision: revision, calculationVersion: 2, initialized: true, currency: "ARS",
    blocks: ROOTS.map(({ code, name }, index) => scope(`b${index + 1}`, code, name, ["100.00", "40.00", "20.00"][index])),
    categories: [{ ...scope("cat", "cat-code", "Ventas", "100.00"), parentNodeId: "b1", parentCode: ROOTS[0].code, depth: 1, position: 0 }],
    metrics: { grossMargin: metric("60.00"), grossMarginPercent: metric("60.0000", "PERCENT"),
      netResult: metric("40.00"), netResultPercent: metric("40.0000", "PERCENT") },
    salesGoal: currentGoal,
    projections: {
      breakEvenSales: metric(blocked ? null : "33.34", "ARS", blocked ? "PENDING_INPUTS" : null),
      targetSales: metric(!currentGoal || blocked || unattainable ? null : "50.00", "ARS",
        !currentGoal ? "GOAL_NOT_CONFIGURED" : reason),
      targetReference: { ...metric(!currentGoal || blocked || unattainable ? null
        : referenceUnit === "PERCENT" ? "12.3456" : "9007199254740993.10", referenceUnit,
      !currentGoal ? "GOAL_NOT_CONFIGURED" : reason), type: currentGoal?.mode ?? null },
    },
  };
}

let passed = 0;
try {
  const viewports = process.env.MUTATION_CASE ? [[1440, 900]]
    : [[1440, 900], [1280, 720], [1024, 768], [768, 1024], [390, 844]];
  for (const [width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    if (process.env.MUTATION_CASE) page.setDefaultTimeout(4000);
    const errors = [];
    let row = structure(2), currentGoal = null, scenario = "complete", role = "EDITOR";
    let conflictNext = false, staleNext = false, delayNextAnalysis = false, writes = [], reads = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (url.origin !== "http://localhost:3001") { errors.push(`External ${url.origin}`); return route.abort(); }
      const headers = { "access-control-allow-origin": origin, "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET,PUT,OPTIONS", "access-control-allow-headers": "content-type" };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const path = url.pathname;
      let body, status = 200;
      if (path === "/auth/me") body = { user: { isAdmin: role === "ADMIN", branchAccesses: [{ branchId, role }] } };
      else if (path === "/branches") body = [{ id: branchId, name: "Sucursal ficticia", active: true }];
      else if (path === `/eerr/${id}`) body = { id, branchId, year: 2026, month: 9 };
      else if (path === `/eerr/${id}/structure`) body = row;
      else if (path === `/eerr/${id}/analysis`) {
        reads++;
        body = analysis(staleNext ? row.revision - 1 : row.revision, currentGoal, scenario);
        if (delayNextAnalysis) { delayNextAnalysis = false; await new Promise((resolve) => setTimeout(resolve, 400)); }
      } else if (path === `/eerr/${id}/sales-goal` && request.method() === "PUT") {
        const input = request.postDataJSON(); writes.push(input);
        assert.equal(input.expectedRevision, row.revision);
        if (conflictNext) { conflictNext = false; status = 409; body = { message: "Revisión vencida" }; }
        else {
          const same = JSON.stringify(input.goal) === JSON.stringify(currentGoal && { mode: currentGoal.mode, value: currentGoal.value });
          if (!same) { row = structure(row.revision + 1); currentGoal = input.goal ? goal(input.goal.mode, input.goal.value) : null; }
          body = { eerrId: id, revision: row.revision, salesGoal: currentGoal };
        }
      } else { errors.push(`Unexpected API ${path}`); return route.abort(); }
      await route.fulfill({ status, headers, json: body });
    });
    const projections = page.getByRole("region", { name: "Proyecciones" });
    const open = async () => { await page.goto(`${origin}/eerr/${id}`); await projections.waitFor(); };
    await open();
    assert.equal(writes.length, 0);
    assert.match(await projections.innerText(), /Punto de Equilibrio[\s\S]*33,34 ARS/);
    assert.match(await projections.innerText(), /Configurá una meta para calcular el Objetivo de Venta/);
    assert.equal(await projections.getByText("—").count(), 2);
    await page.screenshot({ path: join(tmpdir(), `ep05b2-${width}-sin-meta.png`), fullPage: true });
    await projections.getByRole("button", { name: "Configurar meta" }).click();
    const dialog = page.getByRole("dialog", { name: "Configurar meta del EERR" });
    await dialog.waitFor();
    assert.equal(await dialog.getByRole("radio", { name: "Margen neto deseado" }).count(), 1);
    const input = dialog.locator("#sales-goal-value");
    await input.fill("10,1234");
    assert.equal(await input.evaluate((node) => node === document.activeElement), true);
    await page.screenshot({ path: join(tmpdir(), `ep05b2-${width}-modal.png`), fullPage: true });
    await page.keyboard.press("Escape");
    await dialog.getByText(/Hay cambios de la meta sin guardar/).waitFor();
    await dialog.getByRole("button", { name: "Continuar editando" }).click();
    await dialog.getByRole("button", { name: "Guardar meta" }).dblclick();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0], { expectedRevision: 2, goal: { mode: "NET_MARGIN_PERCENT", value: "10.1234" } });
    assert.match(await projections.innerText(), /10,1234 %/);
    assert.match(await projections.innerText(), /9\.007\.199\.254\.740\.993,10 ARS/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: join(tmpdir(), `ep05b2-${width}-porcentaje.png`), fullPage: true });
    await projections.getByRole("button", { name: "Cambiar meta" }).click();
    delayNextAnalysis = true;
    await page.getByRole("dialog", { name: "Cambiar meta del EERR" }).getByRole("button", { name: "Guardar meta" }).click();
    await page.waitForTimeout(80);
    assert.equal(await page.getByRole("dialog", { name: "Cambiar meta del EERR" }).count(), 1,
      "un no-op espera el análisis sincronizado");
    await page.getByRole("dialog", { name: "Cambiar meta del EERR" }).waitFor({ state: "hidden" });
    assert.equal(row.revision, 3, "no-op no aumenta la revisión");
    assert.equal(writes.length, 2);
    await projections.getByRole("button", { name: "Cambiar meta" }).click();
    const change = page.getByRole("dialog", { name: "Cambiar meta del EERR" });
    await change.locator("#sales-goal-value").fill("11");
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }), true, "el borrador activa protección de recarga");
    await change.locator("#sales-goal-value").fill("10,1234");
    await change.getByRole("radio", { name: "Ganancia neta deseada" }).click();
    await change.getByText(/no se reinterpretará/).waitFor();
    await change.getByRole("button", { name: "Cambiar modalidad y limpiar valor" }).click();
    assert.equal(await change.locator("#sales-goal-value").inputValue(), "");
    await change.locator("#sales-goal-value").fill("2.000");
    await change.getByRole("button", { name: "Guardar meta" }).click();
    await change.getByText(/sin separadores de miles|sin miles/i).first().waitFor();
    assert.equal(writes.length, 2);
    await change.locator("#sales-goal-value").fill("2000,00");
    conflictNext = true;
    await change.getByRole("button", { name: "Guardar meta" }).click();
    await change.getByText(/Conservamos tu modalidad y valor/).waitFor();
    assert.equal(await change.locator("#sales-goal-value").inputValue(), "2000,00");
    await change.getByRole("button", { name: "Actualizar datos conservando borrador" }).click();
    await page.waitForFunction(() => [...document.querySelectorAll("button")]
      .some((button) => button.textContent === "Guardar meta" && !button.disabled));
    staleNext = true;
    await change.getByRole("button", { name: "Guardar meta" }).click();
    await change.getByRole("button", { name: "Reintentar actualización" }).waitFor();
    assert.equal(await projections.count(), 0, "no muestra proyecciones de una revisión antigua");
    await page.getByRole("button", { name: "Actualizar cuadro" }).waitFor();
    assert.equal(await change.getByRole("button", { name: "Cancelar" }).isDisabled(), true);
    await page.keyboard.press("Escape");
    assert.equal(await change.count(), 1);
    staleNext = false;
    await change.getByRole("button", { name: "Reintentar actualización" }).click();
    await change.waitFor({ state: "hidden" });
    assert.deepEqual(writes.at(-1), { expectedRevision: 3, goal: { mode: "NET_PROFIT_AMOUNT", value: "2000.00" } });
    assert.match(await projections.innerText(), /Margen neto equivalente[\s\S]*12,35 %/);
    await page.screenshot({ path: join(tmpdir(), `ep05b2-${width}-monto.png`), fullPage: true });
    scenario = "unattainable"; await page.reload(); await projections.waitFor();
    assert.match(await projections.innerText(), /El margen deseado iguala o supera/);
    scenario = "pending"; await page.reload(); await projections.waitFor();
    assert.match(await projections.innerText(), /Disponible cuando se completen los importes requeridos/);
    assert.match(await projections.innerText(), /2\.000,00 ARS/);
    await page.screenshot({ path: join(tmpdir(), `ep05b2-${width}-pendiente.png`), fullPage: true });
    scenario = "complete"; await page.reload(); await projections.waitFor();
    await projections.getByRole("button", { name: "Eliminar meta" }).click();
    const remove = page.getByRole("dialog", { name: "Eliminar meta del EERR" });
    await remove.getByText(/El Punto de Equilibrio seguirá disponible/).waitFor();
    assert.equal(writes.at(-1).goal?.mode, "NET_PROFIT_AMOUNT");
    await remove.getByRole("button", { name: "Confirmar eliminación de meta" }).click();
    await remove.waitFor({ state: "hidden" });
    assert.equal(writes.at(-1).goal, null);
    assert.match(await projections.innerText(), /33,34 ARS/);
    assert.equal(await projections.getByText("—").count(), 2);
    role = "READER"; await page.reload(); await projections.waitFor();
    assert.equal(await projections.getByRole("button").count(), 0);
    role = "ADMIN"; await page.reload(); await projections.waitFor();
    assert.equal(await projections.getByRole("button", { name: "Configurar meta" }).count(), 1);
    if (width === 1440) {
      await projections.getByRole("button", { name: "Configurar meta" }).click();
      await page.getByRole("dialog", { name: "Configurar meta del EERR" }).locator("#sales-goal-value").fill("12");
      await page.waitForTimeout(100);
      await page.getByRole("link", { name: "Estados de resultados" }).first().evaluate((link) => link.click());
      const guard = page.getByRole("dialog", { name: "Borradores sin guardar" });
      await guard.waitFor();
      await guard.getByRole("button", { name: "Continuar editando" }).click();
      assert.equal(await page.getByRole("dialog", { name: "Configurar meta del EERR" }).locator("#sales-goal-value").inputValue(), "12");
    }
    assert.equal(errors.length, 0, errors.join("; "));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    passed++;
    console.log(`EP-05B.2 Chromium ${width}×${height}: OK; ${writes.length} escrituras simuladas, ${reads} análisis`);
    await context.close();
  }
} finally { await browser.close(); }
console.log(`EP-05B.2 Chromium: ${passed}/${process.env.MUTATION_CASE ? 1 : 5} tamaños aprobados`);

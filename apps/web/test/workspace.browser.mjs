// Optional real-browser smoke. Run against an isolated web server; all API requests are fixtures.
// PLAYWRIGHT_MODULE: absolute path to an installed Playwright index.mjs; BROWSER_BINARY: Chromium.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateMoneyExpression } from "../../../packages/domain/dist/index.js";
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
);
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_BINARY,
  headless: true,
});
const origin = "http://127.0.0.1:3100";
const id = "11111111-1111-4111-8111-111111111111",
  branchId = "123456789012345678901234";
const base = () => ({
  id,
  revision: 2,
  note: "Nota general\nSegunda línea",
  progress: { total: 3, loaded: 2, pending: 1, status: "PARCIAL" },
  structure: {
    schemaVersion: 1,
    structureVersion: 1,
    nodes: [
      {
        nodeId: "root",
        code: "r",
        parentId: null,
        kind: "BLOCK",
        name: "INGRESOS",
        position: 0,
      },
      {
        nodeId: "cat",
        code: "c",
        parentId: "root",
        kind: "CATEGORY",
        name: "Ventas",
        position: 0,
      },
      {
        nodeId: "sub",
        code: "s",
        parentId: "cat",
        kind: "CATEGORY",
        name: "Canales digitales",
        position: 0,
      },
      {
        nodeId: "item",
        code: "i",
        parentId: "sub",
        kind: "ITEM",
        name: "Digitales",
        position: 0,
        amount: { state: "CARGADO", value: "12.30", currency: "ARS", scale: 2 },
        note: "Primera línea\nSegunda línea",
      },
      {
        nodeId: "zero",
        code: "z",
        parentId: "cat",
        kind: "ITEM",
        name: "Mostrador",
        position: 1,
        amount: {
          state: "CARGADO",
          input: "0",
          value: "0.00",
          currency: "ARS",
          scale: 2,
        },
        quantity: { state: "CARGADO", value: "0" },
      },
      {
        nodeId: "long",
        code: "l",
        parentId: "cat",
        kind: "ITEM",
        name: "Ingresos extraordinarios por servicios y productos con un nombre muy largo para verificar la lectura",
        position: 2,
        amount: {
          state: "SIN_CARGAR",
          input: null,
          value: null,
          currency: "ARS",
          scale: 2,
        },
      },
      {
        nodeId: "cost",
        code: "co",
        parentId: null,
        kind: "BLOCK",
        name: "COSTOS",
        position: 1,
      },
      {
        nodeId: "expense",
        code: "e",
        parentId: null,
        kind: "BLOCK",
        name: "GASTOS GENERALES",
        position: 2,
      },
    ],
  },
});
let passes = 0;
try {
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [1024, 768],
    [768, 1024],
    [390, 844],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    let row = base(),
      role = "EDITOR",
      admin = false,
      denied = false,
      fail = 0,
      delay = false,
      writes = 0,
      pendingPreview;
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (url.origin !== "http://localhost:3001") {
        errors.push(`Unexpected external request ${url.origin}`);
        return route.abort();
      }
      const headers = {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET, PUT, POST, PATCH, OPTIONS",
        "access-control-allow-headers": "content-type",
      };
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      const path = url.pathname;
      let body,
        status = 200;
      if (request.method() !== "GET") {
        writes++;
        assert.ok(role === "EDITOR" || admin);
        assert.ok(!denied);
        const input = request.postDataJSON();
        if (delay) await new Promise((resolve) => setTimeout(resolve, 600));
        if (fail) {
          status = fail;
          fail = 0;
          if (status === 409) row.revision++;
          body = { message: "Conflicto o fallo simulado del campo" };
        } else {
          assert.equal(input.expectedRevision, row.revision);
          const node = row.structure?.nodes.find(
            (n) => n.nodeId === path.split("/")[4],
          );
          if (path.endsWith("/categories/preview")) {
            pendingPreview = input;
            body = {
              previewId: "offline-preview",
              operation: input.operation,
              name: input.name,
              parent: { code: "r", name: "INGRESOS" },
              year: 2026,
              month: 9,
              expiresAt: "2026-09-21T12:05:00Z",
              affected: 3,
              initialized: 2,
              uninitialized: 1,
              warning: "Cambio global del período",
            };
          } else {
            if (path.endsWith("/categories/confirm")) {
              assert.equal(input.confirm, true);
              if (pendingPreview.operation === "CREATE")
                row.structure.nodes.push({
                  nodeId: "newcat",
                  code: "newcat",
                  parentId: "root",
                  kind: "CATEGORY",
                  name: pendingPreview.name,
                  position: 4,
                });
              else
                row.structure.nodes.find(
                  (n) => n.code === pendingPreview.code,
                ).name = pendingPreview.name;
            } else if (path.endsWith("/structure/initialize"))
              row.structure = base().structure;
            else if (path.endsWith("/items"))
              row.structure.nodes.push({
                nodeId: "newitem",
                code: "newitem",
                parentId: input.parentId,
                kind: "ITEM",
                name: input.name,
                unit: input.unit,
                position: 8,
                amount: {
                  state: "SIN_CARGAR",
                  input: null,
                  value: null,
                  currency: "ARS",
                  scale: 2,
                },
              });
            else if (request.method() === "PATCH") node.name = input.name;
            else if (path.endsWith("/amount"))
              node.amount =
                input.state === "SIN_CARGAR"
                  ? {
                      state: "SIN_CARGAR",
                      input: null,
                      value: null,
                      currency: "ARS",
                      scale: 2,
                    }
                  : {
                      state: "CARGADO",
                      ...evaluateMoneyExpression(input.input),
                      currency: "ARS",
                      scale: 2,
                    };
            else if (path.endsWith("/quantity"))
              node.quantity = {
                state: input.state,
                value: input.state === "SIN_CARGAR" ? null : input.input,
              };
            else if (path === `/eerr/${id}/note`)
              row.note = input.note.trim() || null;
            else if (path.endsWith("/note"))
              node.note = input.note.trim() || null;
            else throw Error(`Unexpected write ${path}`);
            row.revision++;
            body = row;
          }
        }
      } else if (path === "/auth/me")
        body = {
          user: {
            isAdmin: admin,
            branchAccesses: denied ? [] : [{ branchId, role }],
          },
        };
      else if (path === "/branches")
        body = [{ id: branchId, name: "Sucursal de prueba", active: false }];
      else if (path === `/eerr/${id}`)
        body = { id, branchId, year: 2026, month: 9 };
      else if (path === `/eerr/${id}/structure`) {
        if (denied) {
          status = 404;
          body = { message: "EERR no accesible" };
        } else body = row;
      } else {
        errors.push(`Unexpected API ${path}`);
        return route.abort();
      }
      await route.fulfill({ status, json: body, headers });
    });
    const dialog = page.getByRole("dialog");
    const rowLocator = () => page.locator('tr[data-node-id="item"]');
    const amount = () =>
      rowLocator().getByRole("textbox", {
        name: "Importe o expresión · Digitales",
        exact: true,
      });
    const menu = async (nodeName, action) => {
      await page
        .getByRole("button", { name: `Acciones de ${nodeName}`, exact: true })
        .click();
      await page.getByRole("menuitem", { name: action, exact: true }).click();
    };
    const close = async () => {
      await dialog.getByRole("button", { name: "Cerrar ventana" }).click();
      await dialog.waitFor({ state: "hidden" });
    };
    const waitSaved = async () => {
      await page.waitForFunction(
        () => !document.querySelector('dialog[aria-busy="true"]'),
      );
      await page.waitForTimeout(80);
    };
    await page.goto(`${origin}/eerr/${id}`);
    await amount().waitFor();
    assert.equal(writes, 0);
    assert.equal(
      await page.locator('tr[data-node-id="item"]').getAttribute("data-depth"),
      "3",
    );
    await page
      .getByRole("button", { name: "Contraer Ventas", exact: true })
      .click();
    assert.equal(await rowLocator().count(), 0);
    await page
      .getByRole("button", { name: "Expandir Ventas", exact: true })
      .click();
    await amount().waitFor();
    assert.equal(writes, 0);
    assert.equal(await amount().inputValue(), "12.30");
    await amount().fill("1/0");
    assert.ok(
      await rowLocator()
        .getByRole("button", { name: "Guardar importe de Digitales" })
        .isDisabled(),
    );
    assert.match(await rowLocator().innerText(), /dividir por cero/);
    assert.equal(writes, 0);
    await amount().fill("(1000 + 500) / 3");
    assert.match(await rowLocator().innerText(), /500.00 ARS/);
    await rowLocator()
      .getByRole("button", { name: "Editar detalle de Digitales" })
      .click();
    await page.mouse.click(1, 1);
    assert.ok(await dialog.isVisible());
    await dialog
      .getByRole("textbox", { name: "Cantidad · Digitales", exact: true })
      .fill("12");
    await dialog
      .getByRole("textbox", { name: "Nota del ítem", exact: true })
      .fill("Borrador\nMultilínea");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(() =>
        document.activeElement.getAttribute("aria-label"),
      ),
      "Editar detalle de Digitales",
    );
    await page
      .getByRole("button", { name: "Nota general · con nota", exact: true })
      .click();
    await dialog
      .getByRole("textbox", { name: "Nota general", exact: true })
      .fill("General pendiente");
    await close();
    fail = 409;
    await amount().press("Enter");
    await page
      .getByText("Conflicto en Importe · Digitales.", { exact: true })
      .waitFor();
    assert.equal(await amount().inputValue(), "(1000 + 500) / 3");
    await page
      .getByRole("button", { name: "Recargar conservando borradores" })
      .click();
    await page.waitForFunction(
      () => !document.body.textContent.includes("Conflicto en Importe"),
    );
    await amount().press("Enter");
    await page.waitForFunction(
      () =>
        document.querySelector('tr[data-node-id="item"] input').value ===
          "(1000 + 500) / 3" &&
        !document.querySelector(
          'tr[data-node-id="item"] button[aria-label="Guardar importe de Digitales"]',
        ),
    );
    await rowLocator()
      .getByRole("button", { name: "Editar detalle de Digitales" })
      .click();
    assert.equal(
      await dialog
        .getByRole("textbox", { name: "Cantidad · Digitales", exact: true })
        .inputValue(),
      "12",
    );
    assert.equal(
      await dialog
        .getByRole("textbox", { name: "Nota del ítem", exact: true })
        .inputValue(),
      "Borrador\nMultilínea",
    );
    const quantitySave = dialog.getByRole("button", {
      name: "Guardar cantidad de Digitales",
    });
    delay = true;
    const before = writes;
    await quantitySave.click();
    await page.keyboard.press("Escape");
    assert.ok(await dialog.isVisible());
    assert.ok(
      await dialog.getByRole("button", { name: "Cerrar ventana" }).isDisabled(),
    );
    await quantitySave.evaluate((el) => el.click());
    await waitSaved();
    delay = false;
    assert.equal(writes, before + 1);
    fail = 500;
    await dialog
      .getByRole("button", { name: "Guardar nota", exact: true })
      .click();
    await dialog.getByRole("alert").first().waitFor();
    assert.equal(
      await dialog
        .getByRole("textbox", { name: "Nota del ítem", exact: true })
        .inputValue(),
      "Borrador\nMultilínea",
    );
    await dialog
      .getByRole("button", { name: "Guardar nota", exact: true })
      .click();
    await waitSaved();
    await close();
    await menu("Digitales", "Renombrar ítem");
    await dialog
      .getByRole("textbox", { name: "Nombre", exact: true })
      .fill("Nombre pendiente");
    await close();
    await menu("Digitales", "Renombrar ítem");
    assert.equal(
      await dialog
        .getByRole("textbox", { name: "Nombre", exact: true })
        .inputValue(),
      "Nombre pendiente",
    );
    fail = 409;
    await dialog
      .getByRole("button", { name: "Guardar nombre", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Recargar conservando borradores" })
      .waitFor();
    assert.equal(
      await dialog
        .getByRole("textbox", { name: "Nombre", exact: true })
        .inputValue(),
      "Nombre pendiente",
    );
    await dialog
      .getByRole("button", { name: "Recargar conservando borradores" })
      .click();
    await page.waitForFunction(
      () => !document.body.textContent.includes("Conflicto en Ítem"),
    );
    await dialog
      .getByRole("textbox", { name: "Nombre", exact: true })
      .fill("Digitales");
    await dialog
      .getByRole("button", { name: "Guardar nombre", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await menu("Digitales", "Cargar cero en cantidad");
    await dialog
      .getByRole("button", { name: "Confirmar cambio", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      row.structure.nodes.find((n) => n.nodeId === "item").quantity.value,
      "0",
    );
    await menu("Digitales", "Volver cantidad a sin cargar");
    await dialog
      .getByRole("button", { name: "Confirmar cambio", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      row.structure.nodes.find((n) => n.nodeId === "item").quantity.state,
      "SIN_CARGAR",
    );
    await menu("Digitales", "Cargar cero en importe");
    await close();
    await menu("Digitales", "Volver importe a sin cargar");
    await close();
    await menu("INGRESOS", "Agregar ítem");
    await dialog
      .getByRole("textbox", { name: "Nombre", exact: true })
      .fill("Ítem nuevo");
    await dialog
      .getByRole("button", { name: "Crear ítem", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.ok(row.structure.nodes.some((n) => n.name === "Ítem nuevo"));
    await menu("Ventas", "Agregar categoría global");
    await dialog
      .getByRole("textbox", { name: "Nombre", exact: true })
      .fill("Categoría nueva");
    await dialog
      .getByRole("button", { name: "Revisar alcance global" })
      .click();
    await dialog
      .getByRole("heading", { name: "Confirmar publicación global" })
      .waitFor();
    assert.match(await dialog.innerText(), /3 EERR afectados/);
    await dialog
      .getByRole("button", { name: "Confirmar cambio global" })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await menu("Ventas", "Renombrar categoría global");
    await dialog
      .getByRole("textbox", { name: "Nombre", exact: true })
      .fill("Ventas revisadas");
    await dialog
      .getByRole("button", { name: "Revisar alcance global" })
      .click();
    await dialog.getByRole("button", { name: "Volver a editar" }).click();
    assert.equal(
      await dialog
        .getByRole("textbox", { name: "Nombre", exact: true })
        .inputValue(),
      "Ventas revisadas",
    );
    await dialog
      .getByRole("button", { name: "Revisar alcance global" })
      .click();
    fail = 409;
    await dialog
      .getByRole("button", { name: "Confirmar cambio global" })
      .click();
    await dialog
      .getByRole("button", { name: "Recargar conservando borradores" })
      .click();
    await page.waitForFunction(
      () => !document.body.textContent.includes("Conflicto en Categoría"),
    );
    assert.equal(
      await dialog
        .getByRole("textbox", { name: "Nombre", exact: true })
        .inputValue(),
      "Ventas revisadas",
    );
    await dialog
      .getByRole("button", { name: "Revisar alcance global" })
      .click();
    await dialog
      .getByRole("button", { name: "Confirmar cambio global" })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Acciones de Digitales", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("End");
    assert.equal(
      await page.evaluate(() => document.activeElement.textContent),
      "Volver cantidad a sin cargar",
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page.evaluate(() =>
        document.activeElement.getAttribute("aria-label"),
      ),
      "Acciones de Digitales",
    );
    const geometry = async () =>
      page.evaluate(() => {
        const problems = [];
        if (document.documentElement.scrollWidth > innerWidth)
          problems.push("page overflow");
        for (const e of document.querySelectorAll(
          "dialog[open], [popover]:popover-open",
        )) {
          const r = e.getBoundingClientRect();
          if (
            r.left < 0 ||
            r.right > innerWidth + 1 ||
            r.top < 0 ||
            r.bottom > innerHeight + 1
          )
            problems.push("overlay outside viewport");
        }
        for (const form of document.querySelectorAll("form")) {
          if (!form.checkVisibility()) continue;
          const boxes = [...form.querySelectorAll("input,textarea,button")]
            .filter((e) => e.checkVisibility())
            .map((e) => e.getBoundingClientRect());
          for (let i = 0; i < boxes.length; i++)
            for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i],
                b = boxes[j];
              if (
                a.left < b.right - 1 &&
                a.right > b.left + 1 &&
                a.top < b.bottom - 1 &&
                a.bottom > b.top + 1
              )
                problems.push("controls overlap");
            }
        }
        return problems;
      });
    assert.deepEqual(await geometry(), []);
    await page.screenshot({
      path: join(tmpdir(), `ep04ux-${width}.png`),
      fullPage: true,
    });
    await menu("Digitales", "Editar nota");
    assert.deepEqual(await geometry(), []);
    await dialog
      .getByRole("textbox", { name: "Nota del ítem", exact: true })
      .focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    assert.notEqual(
      await dialog
        .getByRole("textbox", { name: "Nota del ítem", exact: true })
        .evaluate((e) => getComputedStyle(e).outlineStyle),
      "none",
    );
    await page.screenshot({
      path: join(tmpdir(), `ep04ux-modal-${width}.png`),
    });
    await close();
    await page
      .getByRole("button", { name: "Acciones de Digitales", exact: true })
      .click();
    assert.deepEqual(await geometry(), []);
    await page.screenshot({ path: join(tmpdir(), `ep04ux-menu-${width}.png`) });
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Nota general · con nota", exact: true })
      .click();
    assert.equal(
      await dialog
        .getByRole("textbox", { name: "Nota general", exact: true })
        .inputValue(),
      "General pendiente",
    );
    await dialog
      .getByRole("button", { name: "Guardar nota", exact: true })
      .click();
    await waitSaved();
    await close();
    role = "READER";
    await page.reload();
    await page.getByText("Solo lectura", { exact: true }).waitFor();
    assert.equal(await page.locator("input,textarea").count(), 0);
    assert.equal(
      await page.getByRole("button", { name: /Acciones de/ }).count(),
      0,
    );
    await page
      .getByRole("button", { name: "Ver detalle de Digitales" })
      .click();
    assert.match(await dialog.innerText(), /500,00 ARS/);
    assert.match(await dialog.innerText(), /Borrador/);
    assert.equal(await dialog.locator("input,textarea").count(), 0);
    await close();
    admin = true;
    await page.reload();
    await page.getByRole("link", { name: "Sucursales", exact: true }).waitFor();
    row.structure = null;
    await page.reload();
    await page
      .getByRole("button", { name: "Preparar estructura", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Confirmar preparación" }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.ok(row.structure);
    denied = true;
    admin = false;
    await page.reload();
    await page.getByText("EERR no accesible", { exact: true }).waitFor();
    assert.equal(await page.getByRole("table").count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
    passes++;
    console.log(
      `PASS ${width}x${height}: hierarchy, fields, drafts, errors/409, modals, focus, menus, roles, geometry; writes only explicit fixtures`,
    );
  }
} finally {
  await browser.close();
}
assert.equal(passes, 5);

// Real Chromium, isolated web only. Every API response is an in-memory fixture.
import { emptyAnalysis } from "./browser-analysis-fixture.mjs";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    await page.clock.setFixedTime(new Date("2026-09-22T12:00:00Z"));
    await context.addInitScript(() => {
      const listeners = new Set(),
        add = window.addEventListener.bind(window),
        remove = window.removeEventListener.bind(window);
      window.addEventListener = (type, fn, ...args) => {
        if (type === "beforeunload") listeners.add(fn);
        return add(type, fn, ...args);
      };
      window.removeEventListener = (type, fn, ...args) => {
        if (type === "beforeunload") listeners.delete(fn);
        return remove(type, fn, ...args);
      };
      window.beforeUnloadCount = () => listeners.size;
    });
    let authenticated = true,
      admin = true,
      role = "EDITOR",
      failLogout = false,
      duplicate = false;
    const writes = [],
      errors = [];
    const user = () => ({
      id: "fixture",
      name: "Persona de prueba",
      email: "persona@example.invalid",
      isAdmin: admin,
      branchAccesses: [{ branchId, role }],
      mustChangePassword: false,
    });
    let branches = [
      {
        id: branchId,
        code: "SUC-001",
        name: "Sucursal de prueba con un nombre extenso para revisar la navegación",
        active: true,
        startDate: "2025-01-01T03:00:00Z",
      },
    ];
    const row = {
      id,
      branchId,
      year: 2026,
      month: 9,
      loadStatus: "SIN_CARGAR",
      createdAt: "2026-09-01T12:00:00Z",
    };
    const structure = {
      id,
      revision: 0,
      note: null,
      progress: { total: 1, loaded: 0, pending: 1, status: "SIN_CARGAR" },
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
            nodeId: "item",
            code: "i",
            parentId: "root",
            kind: "ITEM",
            name: "Digitales",
            position: 0,
            amount: {
              state: "SIN_CARGAR",
              value: null,
              input: null,
              currency: "ARS",
              scale: 2,
            },
          },
        ],
      },
    };
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        method = request.method();
      if (url.origin === origin) return route.continue();
      if (url.origin !== "http://localhost:3001") {
        errors.push(`External request ${url.origin}`);
        return route.abort();
      }
      const path = url.pathname;
      let status = 200,
        body = {};
      const headers = {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
      };
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (method !== "GET")
        writes.push({ path, method, body: request.postDataJSON() });
      if (path === "/auth/me") {
        status = authenticated ? 200 : 401;
        body = authenticated ? { user: user() } : { message: "Sin sesión" };
      } else if (path === "/auth/login") {
        authenticated = true;
        body = { user: user() };
      } else if (path === "/auth/logout") {
        status = failLogout ? 500 : 200;
        if (!failLogout) authenticated = false;
      } else if (!authenticated) {
        status = 401;
        body = { message: "Sin sesión" };
      } else if (path === "/branches" && method === "GET") body = branches;
      else if (path.startsWith("/branches") && method !== "GET") {
        const input = request.postDataJSON();
        if (!admin) {
          status = 403;
          body = { message: "Sin permiso" };
        } else if (duplicate) {
          status = 409;
          body = { message: "Ya existe una sucursal con ese nombre." };
          duplicate = false;
        } else if (method === "POST") {
          body = {
            ...input,
            id: "new",
            code: "SUC-002",
            active: true,
            startDate: input.startDate + "T03:00:00Z",
          };
          branches.push(body);
        } else {
          const item = branches.find((b) => b.id === path.split("/")[2]);
          Object.assign(item, input);
          body = item;
        }
      } else if (path === "/eerr/context")
        body = branches.map((branch) => ({ branch, exists: true, eerr: row }));
      else if (path === "/eerr" && method === "GET") body = [row];
      else if (path === `/eerr/${id}`) body = row;
      else if (path === `/eerr/${id}/structure`) body = structure;
      else if (path === `/eerr/${id}/analysis`) body = emptyAnalysis(structure, id);
      else {
        errors.push(`Unexpected API ${method} ${path}`);
        return route.abort();
      }
      return route.fulfill({ status, json: body, headers });
    });
    const nav = page.getByRole("navigation", {
      name: "Navegación principal",
      includeHidden: true,
    });
    const openMenu = async () => {
      const button = page.getByRole("button", {
        name: "Abrir menú",
        exact: true,
      });
      if (await button.isVisible()) await button.click();
    };
    const go = async (label) => {
      await openMenu();
      await nav.getByRole("link", { name: label, exact: true }).click();
    };
    const shell = async (section) => {
      await page.locator("[data-app-shell]").waitFor();
      assert.equal(await page.locator("[data-app-shell]").count(), 1);
      assert.equal(
        await nav.locator('[aria-current="page"]').textContent(),
        section,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Overflow ${width} ${section}`,
      );
    };
    const capture = async (name) =>
      page.screenshot({
        path: join(tmpdir(), `ep04ux2-${name}-${width}.png`),
        fullPage: true,
      });
    const dialog = page.getByRole("dialog");
    const dirty = async () => {
      await page
        .getByRole("button", {
          name: "Editar importe de Digitales",
          exact: true,
        })
        .click();
      await page
        .getByRole("textbox", {
          name: "Importe o expresión · Digitales",
          exact: true,
        })
        .fill("25 + 10");
      await page.waitForFunction(() => window.beforeUnloadCount() === 1);
    };
    const workspace = async () => {
      await go("Estados de resultados");
      await page
        .getByRole("button", { name: "Ver EERR", exact: true })
        .first()
        .click();
      await page
        .getByRole("link", { name: "Abrir estructura y carga" })
        .click();
      await page.locator('tr[data-node-id="item"]').waitFor();
    };
    await page.goto(origin);
    await page
      .getByRole("heading", { name: "Dashboard", exact: true })
      .waitFor();
    await shell("Dashboard");
    assert.equal(writes.length, 0);
    assert.doesNotMatch(
      await page.locator("main").innerText(),
      /Modo Análisis|Modo Editor|¿Qué querés hacer hoy|Margen Bruto|Resultado Neto|\$[0-9]|[0-9]%/,
    );
    await capture("dashboard");
    if (width <= 800) {
      await openMenu();
      await nav.getByRole("link", { name: "Dashboard", exact: true }).focus();
      await page.keyboard.press("Escape");
      assert.equal(
        await page
          .getByRole("button", { name: "Abrir menú" })
          .getAttribute("aria-expanded"),
        "false",
      );
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent),
        "Abrir menú",
      );
      await openMenu();
      const menuColors = await page
        .getByRole("button", { name: "Cerrar menú", exact: true })
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return { foreground: style.color, background: style.backgroundColor };
        });
      assert.equal(menuColors.foreground, "rgb(246, 242, 230)");
      assert.equal(menuColors.background, "rgb(40, 85, 67)");
      await capture("menu");
    }
    await go("Estados de resultados");
    await page.getByRole("button", { name: "Ver EERR", exact: true }).waitFor();
    await shell("Estados de resultados");
    await capture("sucursal");
    await page.getByRole("radio", { name: "Pararme en un período" }).check();
    await page.getByText("EERR existente", { exact: true }).waitFor();
    await capture("periodo");
    await page
      .getByRole("button", { name: "Ver EERR", exact: true })
      .first()
      .click();
    await page
      .getByRole("link", { name: "Abrir estructura y carga" })
      .waitFor();
    await capture("contexto");
    await page.getByRole("link", { name: "Abrir estructura y carga" }).click();
    await page.locator('tr[data-node-id="item"]').waitFor();
    await shell("Estados de resultados");
    await capture("workspace");
    assert.equal(writes.length, 0);
    for (const label of ["Dashboard", "Estados de resultados", "Sucursales"]) {
      await dirty();
      await go(label);
      await dialog
        .getByRole("heading", { name: "Borradores sin guardar" })
        .waitFor();
      await dialog.getByRole("button", { name: "Continuar editando" }).click();
      assert.equal(
        await page
          .getByRole("textbox", {
            name: "Importe o expresión · Digitales",
            exact: true,
          })
          .inputValue(),
        "25 + 10",
      );
      assert.equal(await page.evaluate(() => window.beforeUnloadCount()), 1);
      await go(label);
      await dialog.getByRole("button", { name: "Descartar y salir" }).click();
      await page.waitForURL(
        label === "Dashboard"
          ? origin + "/"
          : label === "Sucursales"
            ? origin + "/admin/sucursales"
            : origin + "/eerr",
      );
      await shell(label);
      await workspace();
    }
    // Same-document history must cancel before losing state, then traverse without synthetic entries.
    await dirty();
    await page.evaluate(() => history.back());
    await dialog
      .getByRole("heading", { name: "Borradores sin guardar" })
      .waitFor();
    await dialog.getByRole("button", { name: "Continuar editando" }).click();
    assert.ok(page.url().endsWith(id));
    await page.evaluate(() => history.back());
    await dialog.getByRole("button", { name: "Descartar y salir" }).click();
    await page.waitForURL(origin + "/eerr");
    await page.evaluate(() => history.forward());
    await page.locator('tr[data-node-id="item"]').waitFor();
    assert.equal(await page.evaluate(() => window.beforeUnloadCount()), 0);
    await dirty();
    const beforeLogout = writes.length;
    await page
      .getByRole("button", { name: "Cerrar sesión", exact: true })
      .click();
    await dialog.waitFor();
    assert.equal(writes.length, beforeLogout);
    await dialog.getByRole("button", { name: "Continuar editando" }).click();
    await page
      .getByRole("button", { name: "Cerrar sesión", exact: true })
      .click();
    failLogout = true;
    await dialog.getByRole("button", { name: "Descartar y salir" }).click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(
      await page
        .getByRole("textbox", {
          name: "Importe o expresión · Digitales",
          exact: true,
        })
        .inputValue(),
      "25 + 10",
    );
    failLogout = false;
    await dialog.getByRole("button", { name: "Descartar y salir" }).click();
    await page.getByRole("heading", { name: "Bienvenido" }).waitFor();
    assert.equal(await page.locator("[data-app-shell]").count(), 0);
    await capture("login");
    await page
      .getByLabel("Email", { exact: true })
      .fill("persona@example.invalid");
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill("ClaveFicticiaDePrueba");
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page
      .getByRole("heading", { name: "Dashboard", exact: true })
      .waitFor();
    assert.equal(page.url(), origin + "/");
    await go("Sucursales");
    await page
      .getByRole("button", { name: "Nueva sucursal", exact: true })
      .waitFor();
    await shell("Sucursales");
    await capture("sucursales");
    await page
      .getByRole("button", { name: "Nueva sucursal", exact: true })
      .click();
    await page
      .getByLabel("Nombre", { exact: true })
      .fill("Sucursal nueva de prueba");
    await page.getByLabel("Fecha de inicio").fill("2026-01-01");
    duplicate = true;
    await page.getByRole("button", { name: "Guardar sucursal" }).click();
    await page
      .getByText("Ya existe una sucursal con ese nombre.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Guardar sucursal" }).click();
    await page
      .getByText("Sucursal creada correctamente.", { exact: true })
      .waitFor();
    await page
      .getByRole("button", {
        name: "Editar Sucursal nueva de prueba",
        exact: true,
      })
      .click();
    assert.equal(
      await page.getByLabel("Fecha de inicio").inputValue(),
      "2026-01-01",
    );
    await page
      .getByLabel("Nombre", { exact: true })
      .fill("Sucursal editada de prueba");
    await page.getByRole("button", { name: "Guardar sucursal" }).click();
    await page.getByText("Cambios guardados.", { exact: true }).waitFor();
    for (const action of ["Desactivar", "Reactivar"]) {
      await page
        .getByRole("button", {
          name: `${action} Sucursal editada de prueba`,
          exact: true,
        })
        .click();
      await dialog.waitFor();
      await dialog
        .getByRole("button", { name: "Confirmar cambio de estado" })
        .click();
      await dialog.waitFor({ state: "hidden" });
    }
    for (const nextRole of ["EDITOR", "READER"]) {
      admin = false;
      role = nextRole;
      await page.goto(origin);
      await page
        .getByRole("heading", { name: "Dashboard", exact: true })
        .waitFor();
      assert.equal(
        await page.locator('a[href="/admin/sucursales"]').count(),
        0,
      );
      await workspace();
      if (role === "READER")
        assert.equal(
          await page
            .getByRole("button", {
              name: "Editar importe de Digitales",
              exact: true,
            })
            .count(),
          0,
        );
      else
        assert.equal(
          await page
            .getByRole("button", {
              name: "Editar importe de Digitales",
              exact: true,
            })
            .count(),
          1,
        );
      await page.goto(origin + "/admin/sucursales");
      await page.getByRole("heading", { name: "Acceso denegado" }).waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Nueva sucursal", exact: true })
          .count(),
        0,
      );
    }
    // Clean logout sends immediately without draft confirmation.
    await page
      .getByRole("button", { name: "Cerrar sesión", exact: true })
      .click();
    await page.getByRole("heading", { name: "Bienvenido" }).waitFor();
    assert.equal(await dialog.count(), 0);
    assert.equal(await page.locator("[data-app-shell]").count(), 0);
    authenticated = false;
    for (const path of ["/", "/eerr", "/admin/sucursales", `/eerr/${id}`]) {
      await page.goto(origin + path);
      await page.getByRole("heading", { name: "Bienvenido" }).waitFor();
      assert.equal(await page.locator("[data-app-shell]").count(), 0);
    }
    assert.deepEqual(errors, []);
    await context.close();
    passes++;
    console.log(
      `Navigation ${width}x${height}: passed; all writes intercepted`,
    );
  }
} finally {
  await browser.close();
}
console.log(`${passes} navigation viewport scenarios passed`);

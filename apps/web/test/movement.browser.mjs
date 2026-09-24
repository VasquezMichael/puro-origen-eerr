// Real Chromium, isolated web server, synthetic API only. Same environment as workspace.browser.mjs.
import { emptyAnalysis } from "./browser-analysis-fixture.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  initialNodes,
  emptyAmount,
  loadProgress,
  moveNode,
  moveCategory,
} from "../../../packages/domain/dist/index.js";
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
);
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_BINARY,
  headless: true,
});
const origin = "http://127.0.0.1:3100",
  id = "11111111-1111-4111-8111-111111111111",
  branchId = "123456789012345678901234";
try {
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [1024, 768],
    [768, 1024],
    [390, 844],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const nodes = initialNodes([], randomUUID),
      root = nodes[0];
    const add = (kind, name, parentId, position) => {
      const node = {
        nodeId: randomUUID(),
        code: randomUUID(),
        kind,
        name,
        parentId,
        position,
        ...(kind === "ITEM" ? { amount: emptyAmount() } : {}),
      };
      nodes.push(node);
      return node;
    };
    const a = add("CATEGORY", "Ventas", root.nodeId, 0),
      b = add(
        "CATEGORY",
        "Canales comerciales con nombre extenso para revisar destinos y confirmación",
        root.nodeId,
        1,
      ),
      item = add("ITEM", "Digitales", a.nodeId, 0),
      other = add("ITEM", "Mostrador", a.nodeId, 1);
    let parent = b;
    for (let i = 0; i < 5; i++)
      parent = add("CATEGORY", `Nivel ${i + 1}`, parent.nodeId, 0);
    let row = {
        id,
        revision: 1,
        note: null,
        progress: loadProgress(nodes),
        structure: { schemaVersion: 1, structureVersion: 1, nodes },
      },
      pending,
      writes = 0,
      fail = 0,
      role = "EDITOR";
    await page.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (url.origin !== "http://localhost:3001") {
        errors.push("External " + url.origin);
        return route.abort();
      }
      const headers = {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
        "access-control-allow-headers": "content-type",
      };
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      const path = url.pathname;
      let body,
        status = 200;
      if (request.method() !== "GET") {
        writes++;
        const input = request.postDataJSON();
        await new Promise((r) => setTimeout(r, 250));
        if (fail) {
          status = fail;
          fail = 0;
          body = { message: "Conflicto simulado: recargá y revisá" };
          row.revision++;
        } else {
          assert.equal(input.expectedRevision, row.revision);
          if (path.endsWith("/move/preview")) {
            pending = input;
            const node = row.structure.nodes.find(
                (n) => n.nodeId === input.nodeId,
              ),
              from = row.structure.nodes.find(
                (n) => n.nodeId === node.parentId,
              ),
              to = row.structure.nodes.find((n) => n.nodeId === input.parentId);
            body = {
              previewId: randomUUID(),
              name: node.name,
              from: { name: from.name, code: from.code, position: 0 },
              to: { name: to.name, code: to.code, position: input.position },
              block: { name: root.name, code: root.code },
              year: 2026,
              month: 9,
              affected: 3,
              initialized: 2,
              uninitialized: 1,
              accessibleEerrs: [id],
              warning: "Cambio global del período",
              noOp: false,
              expiresAt: "2026-09-22T20:00:00Z",
            };
          } else {
            const category = path.endsWith("/move/confirm");
            if (category) assert.equal(input.confirm, true);
            const change = category
              ? moveCategory(
                  row.structure.nodes,
                  pending.nodeId,
                  pending.parentId,
                  pending.position,
                )
              : moveNode(
                  row.structure.nodes,
                  path.split("/")[4],
                  input.parentId,
                  input.position,
                );
            row = {
              ...row,
              revision: row.revision + (change.changed ? 1 : 0),
              structure: { ...row.structure, nodes: change.nodes },
            };
            body = row;
          }
        }
      } else if (path === "/auth/me")
        body = {
          user: { isAdmin: false, branchAccesses: [{ branchId, role }] },
        };
      else if (path === "/branches")
        body = [{ id: branchId, name: "Sucursal de prueba", active: false }];
      else if (path === `/eerr/${id}`)
        body = { id, branchId, year: 2026, month: 9 };
      else if (path === `/eerr/${id}/structure`) body = row;
      else if (path === `/eerr/${id}/analysis`) body = emptyAnalysis(row, id);
      else if (path === "/eerr") body = [];
      else {
        errors.push("Unexpected API " + path);
        return route.abort();
      }
      return route.fulfill({ status, json: body, headers });
    });
    const dialog = page.getByRole("dialog"),
      menu = async (name, action) => {
        await page
          .getByRole("button", { name: `Acciones de ${name}`, exact: true })
          .click();
        await page.getByRole("menuitem", { name: action, exact: true }).click();
      };
    const shot = async (label) => {
      await page.screenshot({
        path: join(tmpdir(), `ep04b2-${width}-${label}.png`),
        fullPage: true,
      });
      const box = await dialog.boundingBox();
      if (box)
        assert.ok(
          box.x >= -1 &&
            box.y >= -1 &&
            box.x + box.width <= width + 1 &&
            box.y + box.height <= height + 1,
        );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
    };
    await page.goto(`${origin}/eerr/${id}`);
    await page.locator(`tr[data-node-id="${item.nodeId}"]`).waitFor();
    assert.equal(writes, 0);
    await page
      .getByRole("button", { name: "Acciones de Ventas", exact: true })
      .click();
    assert.equal(
      await page.getByRole("menuitem", { name: "Subir", exact: true }).count(),
      0,
    );
    await page.keyboard.press("Escape");
    await menu("Digitales", "Mover ítem");
    await dialog.waitFor();
    await dialog.getByLabel("Nuevo padre").selectOption(b.nodeId);
    assert.equal(
      await dialog.locator(`option[value="${nodes[1].nodeId}"]`).count(),
      0,
    );
    await shot("item");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(() =>
        document.activeElement?.getAttribute("aria-label"),
      ),
      "Acciones de Digitales",
    );
    await menu("Digitales", "Mover ítem");
    assert.equal(await dialog.getByLabel("Nuevo padre").inputValue(), b.nodeId);
    fail = 409;
    await dialog
      .getByRole("button", { name: "Guardar movimiento", exact: true })
      .click();
    await dialog.getByRole("alert").first().waitFor();
    assert.equal(await dialog.getByLabel("Nuevo padre").inputValue(), b.nodeId);
    await shot("conflict");
    await dialog
      .getByRole("button", { name: "Recargar conservando borradores" })
      .click();
    await page.waitForTimeout(300);
    assert.equal(await dialog.getByLabel("Nuevo padre").inputValue(), b.nodeId);
    const before = writes;
    await dialog
      .getByRole("button", { name: "Guardar movimiento", exact: true })
      .click();
    assert.ok(
      await dialog
        .getByRole("button", { name: "Guardar movimiento", exact: true })
        .isDisabled(),
    );
    await dialog.waitFor({ state: "hidden" });
    assert.equal(writes, before + 1);
    assert.equal(
      row.structure.nodes.find((n) => n.nodeId === item.nodeId).parentId,
      b.nodeId,
    );
    await menu("Ventas", "Mover categoría");
    await dialog.getByLabel("Nuevo padre").selectOption(b.nodeId);
    const revision = row.revision;
    await dialog
      .getByRole("button", { name: "Revisar movimiento global" })
      .click();
    await dialog
      .getByRole("button", { name: "Confirmar movimiento global" })
      .waitFor();
    assert.equal(row.revision, revision);
    await shot("preview");
    await dialog
      .getByRole("button", { name: "Confirmar movimiento global" })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      row.structure.nodes.find((n) => n.nodeId === a.nodeId).parentId,
      b.nodeId,
    );
    assert.equal(
      row.structure.nodes.find((n) => n.nodeId === other.nodeId).parentId,
      a.nodeId,
    );
    await page.screenshot({
      path: join(tmpdir(), `ep04b2-${width}-result.png`),
      fullPage: true,
    });
    role = "READER";
    await page.reload();
    await page.locator(`tr[data-node-id="${item.nodeId}"]`).waitFor();
    assert.equal(
      await page.getByRole("button", { name: /Acciones de/ }).count(),
      0,
    );
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `PASS movement ${width}x${height}: modal, destinos, foco, Escape, 409, selección, preview, confirmación, lector, overflow`,
    );
  }
} finally {
  await browser.close();
}

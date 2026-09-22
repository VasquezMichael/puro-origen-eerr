import "./tsx-loader.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const { navigationItems, roleLabel } =
  await import("../src/app/session-model.ts");
const { Dashboard } = await import("../src/app/dashboard.tsx");
const { WorkspaceShell } = await import("../src/app/eerr/workspace-shell.tsx");
const { LoginForm } = await import("../src/app/login-form.tsx");
const { LoginFrame } = await import("../src/app/session-provider.tsx");
const render = (component, props) =>
  renderToStaticMarkup(React.createElement(component, props));
const user = {
  id: "fixture",
  name: "Persona de prueba",
  email: "test@example.invalid",
  isAdmin: false,
  branchAccesses: [],
  mustChangePassword: false,
};
for (const [role, admin, label] of [
  ["ADMIN", true, "Administrador"],
  ["EDITOR", false, "Editor"],
  ["READER", false, "Lector"],
]) {
  test(`Navegación y rol ${role}: solo destinos autorizados`, () => {
    const session = {
      ...user,
      isAdmin: admin,
      branchAccesses: admin ? [] : [{ branchId: "branch", role }],
    };
    assert.equal(roleLabel(session), label);
    assert.deepEqual(
      navigationItems(admin).map((item) => item.href),
      admin ? ["/", "/eerr", "/admin/sucursales"] : ["/", "/eerr"],
    );
    const html = render(Dashboard, { user: session });
    assert.equal((html.match(/data-app-shell/g) ?? []).length, 1);
    assert.match(html, /Hola, Persona de prueba/);
    assert.match(html, /href="\/eerr"/);
    assert.equal(html.includes('href="/admin/sucursales"'), admin);
    assert.doesNotMatch(
      html,
      /Modo Análisis|Modo Editor|¿Qué querés hacer hoy|Resultado Neto|Margen Bruto|\$[0-9]|[0-9]%/,
    );
    assert.match(html, /se incorporarán en una etapa posterior/);
    assert.match(html, /Cerrar sesión/);
  });
}
test("Roles mixtos conservan el alcance por sucursal y no habilitan administración", () => {
  assert.equal(
    roleLabel({
      ...user,
      branchAccesses: [
        { branchId: "a", role: "EDITOR" },
        { branchId: "b", role: "READER" },
      ],
    }),
    "Editor / Lector según sucursal",
  );
  assert.equal(roleLabel(user), "Sin sucursales asignadas");
});
for (const [section, label] of [
  ["dashboard", "Dashboard"],
  ["eerr", "Estados de resultados"],
  ["branches", "Sucursales"],
]) {
  test(`Shell identifica únicamente ${section} como página activa`, () => {
    const html = render(WorkspaceShell, {
      isAdmin: true,
      section,
      title: label,
      children: React.createElement("h1", null, label),
    });
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    assert.match(html, new RegExp(`aria-current="page"[^>]*>${label}</a>`));
    assert.match(html, /aria-label="Navegación principal"/);
    assert.match(html, /aria-expanded="false" aria-controls=/);
    assert.match(html, /Abrir menú/);
    assert.equal((html.match(/<main /g) ?? []).length, 1);
  });
}
test("Login conserva credenciales accesibles sin shell ni selección de modo", () => {
  const html = render(LoginFrame, {
    children: React.createElement(LoginForm, {
      user: null,
      onAuthenticated() {
        throw Error("No escribir al montar");
      },
      onLogout() {
        throw Error("No cerrar al montar");
      },
      loggingOut: false,
    }),
  });
  assert.match(html, /Bienvenido/);
  assert.match(html, /autoComplete="current-password"/);
  assert.doesNotMatch(
    html,
    /data-app-shell|Navegación principal|Modo Análisis|Modo Editor/,
  );
});
test("Contraseña temporal mantiene su requisito antes del Dashboard", () => {
  const html = render(LoginForm, {
    user: { ...user, mustChangePassword: true },
    onAuthenticated() {},
    onLogout() {},
    loggingOut: false,
  });
  assert.match(html, /minLength="12"/);
  assert.match(html, /Cambiar contraseña/);
  assert.doesNotMatch(html, /data-app-shell|Accesos rápidos/);
});

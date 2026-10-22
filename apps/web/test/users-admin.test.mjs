import './tsx-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime.js';

const { UsersAdmin } = await import('../src/app/admin/usuarios/users-admin.tsx');
const { SessionContext } = await import('../src/app/session-context.ts');
const { filterUsers, selectedAccesses, userError } = await import('../src/app/admin/usuarios/users-model.ts');
const adminId = '111111111111111111111111', editorId = '222222222222222222222222';
const branchA = '333333333333333333333333', branchB = '444444444444444444444444';
const branches = [{ id: branchA, name: 'CALLE 13', active: true }, { id: branchB, name: 'CALLE 59', active: false }];
const fixtureUsers = () => [
  { id: adminId, name: 'Ana Admin', email: 'ana@example.invalid', isAdmin: true, active: true, mustChangePassword: false, branchAccesses: [] },
  { id: editorId, name: 'Elena Editor', email: 'elena@example.invalid', isAdmin: false, active: true, mustChangePassword: false, branchAccesses: [{ branchId: branchA, role: 'EDITOR' }] },
];

async function mount({ admin = true, onRequest } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:3000/admin/usuarios' });
  const keys = ['window', 'self', 'document', 'HTMLElement', 'HTMLDialogElement', 'fetch', 'IS_REACT_ACT_ENVIRONMENT'];
  const old = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    HTMLDialogElement: dom.window.HTMLDialogElement, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  let users = fixtureUsers(); const calls = [];
  globalThis.fetch = async (input, options = {}) => {
    const path = new URL(input).pathname, method = options.method ?? 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, method, body });
    const special = await onRequest?.({ path, method, body, users });
    if (special) return new Response(JSON.stringify(special.body ?? {}), { status: special.status ?? 200, headers: { 'Content-Type': 'application/json' } });
    let output;
    if (path === '/users' && method === 'GET') output = structuredClone(users);
    else if (path === '/branches' && method === 'GET') output = structuredClone(branches);
    else if (path === '/users' && method === 'POST') { const created = { id: '555555555555555555555555', ...body, active: true, mustChangePassword: true }; delete created.password; users = [...users, created]; output = created; }
    else if (path.endsWith('/branch-accesses') && method === 'PATCH') { users = users.map((user) => user.id === editorId ? { ...user, branchAccesses: body.branchAccesses } : user); output = users[1]; }
    else if (path.endsWith('/status') && method === 'PATCH') { users = users.map((user) => user.id === editorId ? { ...user, active: body.active } : user); output = users[1]; }
    else if (path.endsWith('/password') && method === 'PATCH') { users = users.map((user) => user.id === editorId ? { ...user, mustChangePassword: body.requireChange } : user); output = users[1]; }
    else throw Error(`Solicitud inesperada: ${method} ${path}`);
    return new Response(JSON.stringify(output), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  const session = { user: { id: admin ? adminId : editorId, name: 'Ana', isAdmin: admin, branchAccesses: [], mustChangePassword: false }, requestLogout() {}, loggingOut: false, error: '' };
  await act(async () => root.render(React.createElement(AppRouterContext.Provider, { value: router }, React.createElement(SessionContext.Provider, { value: session }, React.createElement(UsersAdmin)))));
  const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); };
  for (let i = 0; i < 20 && admin && !dom.window.document.body.textContent.includes('Elena Editor'); i++) await settle();
  const button = (label, scope = dom.window.document) => { const found = [...scope.querySelectorAll('button')].find((item) => item.textContent.trim() === label); assert.ok(found, `Falta botón ${label}`); return found; };
  const card = (name) => { const found = [...dom.window.document.querySelectorAll('li')].find((item) => item.querySelector('h2')?.textContent === name); assert.ok(found, `Falta tarjeta ${name}`); return found; };
  const click = async (label, scope) => { await act(async () => button(label, scope).click()); await settle(); };
  const input = async (label, value) => { const element = [...dom.window.document.querySelectorAll('label')].find((item) => item.textContent.includes(label))?.querySelector('input'); assert.ok(element, `Falta campo ${label}`); await act(async () => { const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set; setter.call(element, value); element.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }); return element; };
  const submit = async () => { const form = dom.window.document.querySelector('dialog form'); assert.ok(form); await act(async () => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))); await settle(); };
  return { dom, calls, button, card, click, input, submit, settle, async close() { await act(async () => root.unmount()); dom.window.close(); Object.assign(globalThis, old); } };
}

test('solo Admin ve y carga la ruta; listado, badges, accesos e inactivas', { concurrency: false }, async () => {
  const ui = await mount();
  try {
    const text = ui.dom.window.document.body.textContent;
    assert.match(text, /Ana Admin.*Administrador/s);
    assert.match(text, /Elena Editor/);
    assert.match(text, /CALLE 13.*Editor/s);
    assert.match(text, /Usuarios/);
    assert.doesNotMatch(text, /authVersion|passwordHash/);
    await ui.click('Editar accesos', ui.card('Elena Editor'));
    assert.match(ui.dom.window.document.body.textContent, /CALLE 59.*Inactiva/s);
    assert.equal(ui.dom.window.document.querySelector('select[aria-label="Acceso a CALLE 59"]').value, 'NONE');
  } finally { await ui.close(); }
  const denied = await mount({ admin: false });
  try { assert.match(denied.dom.window.document.body.textContent, /Acceso denegado/); assert.equal(denied.calls.length, 0); assert.doesNotMatch(denied.dom.window.document.body.innerHTML, /href="\/admin\/usuarios"/); }
  finally { await denied.close(); }
});

test('búsqueda local, accesos sin duplicados y errores traducidos', () => {
  const users = fixtureUsers();
  assert.deepEqual(filterUsers(users, ' ELENA@EXAMPLE '), [users[1]]);
  assert.deepEqual(selectedAccesses(branches, { [branchA]: 'READER', [branchB]: 'EDITOR' }), [{ branchId: branchA, role: 'READER' }, { branchId: branchB, role: 'EDITOR' }]);
  for (const status of [400, 401, 403, 404, 409, 500]) assert.ok(userError(status, undefined, 'list'));
  assert.match(userError(409, 'LAST_ACTIVE_ADMIN', 'status'), /último administrador/);
  assert.match(userError(409, 'EMAIL_ALREADY_EXISTS', 'create'), /Ya existe/);
});

test('crear, editar accesos, desactivar/reactivar y reset recargan verdad del servidor', { concurrency: false }, async () => {
  const ui = await mount();
  try {
    await ui.click('Nuevo usuario');
    assert.match(ui.dom.window.document.body.textContent, /Administrador: acceso global|Accesos por sucursal/);
    await ui.input('Nombre', 'Nuevo Usuario'); await ui.input('Email', 'nuevo@example.invalid');
    await ui.input('Contraseña inicial', 'segura-inicial-123'); await ui.input('Confirmar contraseña', 'segura-inicial-123');
    await ui.submit();
    assert.ok(ui.calls.some((call) => call.path === '/users' && call.method === 'POST' && call.body.active === undefined), JSON.stringify(ui.calls) + ui.dom.window.document.body.textContent);
    assert.match(ui.dom.window.document.body.textContent, /Nuevo Usuario/);
    assert.match(ui.dom.window.document.body.textContent, /Cambio de contraseña pendiente/);
    await ui.click('Editar accesos', ui.card('Elena Editor'));
    const selector = ui.dom.window.document.querySelector('select[aria-label="Acceso a CALLE 59"]');
    await act(async () => { selector.value = 'READER'; selector.dispatchEvent(new ui.dom.window.Event('change', { bubbles: true })); });
    await ui.click('Guardar accesos');
    assert.ok(ui.calls.some((call) => call.path.endsWith('/branch-accesses') && call.body.branchAccesses.some((access) => access.branchId === branchB && access.role === 'READER')));
    await ui.click('Desactivar', ui.card('Elena Editor')); await ui.click('Confirmar desactivación');
    assert.ok(ui.calls.some((call) => call.path.endsWith('/status') && call.body.active === false));
    await ui.click('Reactivar', ui.card('Elena Editor')); await ui.click('Confirmar reactivación');
    assert.ok(ui.calls.some((call) => call.path.endsWith('/status') && call.body.active === true));
    await ui.click('Restablecer contraseña', ui.card('Elena Editor'));
    assert.equal(ui.dom.window.document.querySelector('input[type="checkbox"]').checked, true);
  } finally { await ui.close(); }
});

test('crear Administrador, validar contraseña y conservar modal ante email duplicado', { concurrency: false }, async () => {
  let duplicate = true;
  const ui = await mount({ onRequest: ({ path, method }) => {
    if (path === '/users' && method === 'POST' && duplicate) { duplicate = false; return { status: 409, body: { message: 'conflicto interno' } }; }
  } });
  try {
    await ui.click('Nuevo usuario');
    await ui.input('Nombre', 'Nuevo Admin'); await ui.input('Email', 'nuevo@example.invalid');
    const admin = ui.dom.window.document.querySelector('dialog input[type="checkbox"]');
    await act(async () => admin.click());
    assert.match(ui.dom.window.document.body.textContent, /Administrador: acceso global/);
    await ui.input('Contraseña inicial', 'corta'); await ui.input('Confirmar contraseña', 'corta');
    await ui.submit();
    assert.match(ui.dom.window.document.body.textContent, /al menos 12 caracteres/);
    assert.equal(ui.calls.filter((call) => call.method === 'POST').length, 0);
    await ui.input('Contraseña inicial', 'segura-inicial-123'); await ui.input('Confirmar contraseña', 'distinta-segura-123');
    await ui.submit();
    assert.match(ui.dom.window.document.body.textContent, /no coincide/);
    assert.equal(ui.calls.filter((call) => call.method === 'POST').length, 0);
    await ui.input('Confirmar contraseña', 'segura-inicial-123'); await ui.submit();
    assert.match(ui.dom.window.document.body.textContent, /Ya existe un usuario con ese email/);
    assert.ok(ui.dom.window.document.querySelector('dialog[open]'));
    await ui.submit();
    assert.ok(ui.calls.some((call) => call.method === 'POST' && call.body.isAdmin === true));
    assert.match(ui.dom.window.document.body.textContent, /Nuevo Admin/);
    assert.equal(ui.dom.window.document.querySelector('dialog'), null);
  } finally { await ui.close(); }
});

test('reset permite requireChange true/false y elimina contraseña al cerrar', { concurrency: false }, async () => {
  const ui = await mount();
  try {
    await ui.click('Restablecer contraseña', ui.card('Elena Editor'));
    await ui.input('Nueva contraseña', 'temporal-segura-123'); await ui.input('Confirmar contraseña', 'temporal-segura-123');
    await ui.submit();
    assert.ok(ui.calls.some((call) => call.path.endsWith('/password') && call.body.requireChange === true));
    assert.match(ui.card('Elena Editor').textContent, /Cambio de contraseña pendiente/);
    await ui.click('Restablecer contraseña', ui.card('Elena Editor'));
    assert.equal(ui.dom.window.document.querySelector('input[type="password"]').value, '');
    const checkbox = ui.dom.window.document.querySelector('dialog input[type="checkbox"]');
    await act(async () => checkbox.click());
    await ui.input('Nueva contraseña', 'estable-segura-123'); await ui.input('Confirmar contraseña', 'estable-segura-123');
    await ui.submit();
    assert.ok(ui.calls.some((call) => call.path.endsWith('/password') && call.body.requireChange === false));
    assert.doesNotMatch(ui.card('Elena Editor').textContent, /Cambio de contraseña pendiente/);
  } finally { await ui.close(); }
});

test('rechazo LAST_ACTIVE_ADMIN conserva confirmación y no transforma el error en éxito', { concurrency: false }, async () => {
  const ui = await mount({ onRequest: ({ path, method }) => path.endsWith('/status') && method === 'PATCH' ? { status: 409, body: { code: 'LAST_ACTIVE_ADMIN' } } : null });
  try {
    assert.doesNotMatch(ui.card('Ana Admin').textContent, /Desactivar/);
    await ui.click('Desactivar', ui.card('Elena Editor'));
    assert.match(ui.dom.window.document.body.textContent, /sesiones actuales quedarán invalidadas/);
    await ui.click('Confirmar desactivación');
    assert.match(ui.dom.window.document.body.textContent, /No se puede desactivar al último administrador activo/);
    assert.ok(ui.dom.window.document.querySelector('dialog[open]'));
    assert.match(ui.card('Elena Editor').textContent, /Activo/);
  } finally { await ui.close(); }
});

test('editar accesos permite Editor, Lector y quitar la sucursal inactiva', { concurrency: false }, async () => {
  const ui = await mount();
  try {
    await ui.click('Editar accesos', ui.card('Elena Editor'));
    const choose = async (branch, role) => {
      const selector = ui.dom.window.document.querySelector(`select[aria-label="Acceso a ${branch}"]`);
      await act(async () => { selector.value = role; selector.dispatchEvent(new ui.dom.window.Event('change', { bubbles: true })); });
    };
    await choose('CALLE 13', 'READER'); await choose('CALLE 59', 'EDITOR');
    await ui.click('Guardar accesos');
    assert.deepEqual(ui.calls.findLast((call) => call.path.endsWith('/branch-accesses')).body.branchAccesses,
      [{ branchId: branchA, role: 'READER' }, { branchId: branchB, role: 'EDITOR' }]);
    assert.match(ui.card('Elena Editor').textContent, /CALLE 59 · Inactiva.*Editor/s);
    await ui.click('Editar accesos', ui.card('Elena Editor'));
    await choose('CALLE 59', 'NONE'); await ui.click('Guardar accesos');
    assert.deepEqual(ui.calls.findLast((call) => call.path.endsWith('/branch-accesses')).body.branchAccesses,
      [{ branchId: branchA, role: 'READER' }]);
    assert.doesNotMatch(ui.card('Elena Editor').textContent, /CALLE 59/);
  } finally { await ui.close(); }
});

test('búsqueda en la página filtra sin otro GET; falla de red muestra mensaje humano', { concurrency: false }, async () => {
  const ui = await mount();
  try {
    const before = ui.calls.length;
    await ui.input('Buscar por nombre o email', 'ELENA@EXAMPLE');
    assert.ok(ui.card('Elena Editor'));
    assert.equal([...ui.dom.window.document.querySelectorAll('li')].some((item) => item.querySelector('h2')?.textContent === 'Ana Admin'), false);
    assert.equal(ui.calls.length, before);
  } finally { await ui.close(); }
  const offline = await mount({ onRequest: ({ path }) => { if (path === '/users') throw Error('socket interno'); } });
  try { assert.match(offline.dom.window.document.body.textContent, /No pudimos conectarnos al servidor/); assert.doesNotMatch(offline.dom.window.document.body.textContent, /socket interno/); }
  finally { await offline.close(); }
});

test('loading de creación bloquea doble submit sin bloquear búsqueda', { concurrency: false }, async () => {
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const ui = await mount({ onRequest: async ({ path, method }) => {
    if (path === '/users' && method === 'POST') { await waiting; return { status: 200, body: {} }; }
  } });
  try {
    await ui.click('Nuevo usuario');
    await ui.input('Nombre', 'Cuenta nueva'); await ui.input('Email', 'cuenta@example.invalid');
    await ui.input('Contraseña inicial', 'contraseña-segura-123'); await ui.input('Confirmar contraseña', 'contraseña-segura-123');
    const form = ui.dom.window.document.querySelector('dialog form');
    await act(async () => {
      form.dispatchEvent(new ui.dom.window.Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new ui.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.equal(ui.calls.filter((call) => call.method === 'POST').length, 1);
    assert.equal(ui.button('Guardando…').disabled, true);
    assert.equal(ui.dom.window.document.querySelector('input[type="search"]').disabled, false);
    release(); await ui.settle();
    assert.equal(ui.dom.window.document.querySelector('dialog'), null);
  } finally { release(); await ui.close(); }
});

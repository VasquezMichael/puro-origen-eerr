import test from 'node:test';
import assert from 'node:assert/strict';
import { compareEerrItems } from '../dist/index.js';
import { ROOTS } from '@puro-origen/domain';

const p = (year, month) => ({ year, month });
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function snapshot(items) {
  const roots = ROOTS.map((root, index) => ({ ...root, nodeId: id(index + 1), parentId: null, position: index, kind: 'BLOCK' }));
  return { schemaVersion: 1, structureVersion: 1, initializedAt: '2026-01-01T12:00:00Z', initializedBy: 'actor', nodes: [...roots, ...items.map((item, index) => ({
    nodeId: id(item.nodeId), code: id(item.code), parentId: roots[0].nodeId, position: index, name: item.name ?? 'Ventas', kind: 'ITEM',
    amount: { state: item.amount === null ? 'SIN_CARGAR' : 'CARGADO', value: item.amount, input: null, currency: 'ARS', scale: 2 },
    quantityEnabled: item.quantity !== undefined, unit: item.unit ?? null,
    ...(item.quantity === undefined ? {} : { quantity: { state: item.quantity === null ? 'SIN_CARGAR' : 'CARGADO', value: item.quantity } }),
  }))] };
}
const compare = (oldItems, newItems, a = p(2026, 8), b = p(2026, 9)) => compareEerrItems(
  { period: a, structure: snapshot(oldItems) }, { period: b, structure: snapshot(newItems) },
);
const item = (earlier, later) => compare(earlier ? [{ code: 201, nodeId: 301, ...earlier }] : [], later ? [{ code: 201, nodeId: 401, ...later }] : []).items[0];
const change = (status, value, reason = null) => ({ status, value, reason });

test('code alinea nodeId distintos, usa renombre reciente y orden cronológico aun con argumentos invertidos', () => {
  const old = { code: 201, nodeId: 301, name: 'Anterior', amount: '100.00', quantity: '10', unit: 'tickets' };
  const recent = { ...old, nodeId: 302, name: 'Actual', amount: '125.00', quantity: '12' };
  const result = compareEerrItems({ period: p(2026, 11), structure: snapshot([recent]) }, { period: p(2026, 8), structure: snapshot([old]) });
  assert.deepEqual(result.periods, [p(2026, 8), p(2026, 11)]);
  const compared = result.items[0];
  assert.equal(compared.name, 'Actual');
  assert.deepEqual(compared.path, ['INGRESOS']);
  assert.notEqual(compared.periods[0].nodeId, compared.periods[1].nodeId);
  assert.deepEqual(compared.amountVariation, { absoluteChange: change('COMPLETE', '25.00'), percentageChange: change('COMPLETE', '25.0000') });
  assert.deepEqual(compared.quantityVariation, { absoluteChange: change('COMPLETE', '2'), percentageChange: change('COMPLETE', '20.0000') });
});

test('referencia cero conserva diferencia absoluta y hace no calculable solo el porcentaje, en importes y cantidades', () => {
  const compared = item({ amount: '0.00', quantity: '0', unit: 'tickets' }, { amount: '10.00', quantity: '8', unit: 'tickets' });
  assert.deepEqual(compared.amountVariation, { absoluteChange: change('COMPLETE', '10.00'), percentageChange: change('NOT_CALCULABLE', null, 'REFERENCE_ZERO') });
  assert.deepEqual(compared.quantityVariation, { absoluteChange: change('COMPLETE', '8'), percentageChange: change('NOT_CALCULABLE', null, 'REFERENCE_ZERO') });
  assert.equal(compared.periods[0].amount.state, 'CARGADO');
});

for (const [label, earlier, later, reason, state, side] of [
  ['referencia SIN_CARGAR', { amount: null, quantity: null, unit: 'tickets' }, { amount: '3.00', quantity: '2', unit: 'tickets' }, 'REFERENCE_SIN_CARGAR', 'SIN_CARGAR', 0],
  ['referencia NO_EXISTIA', null, { amount: '3.00', quantity: '2', unit: 'tickets' }, 'REFERENCE_NO_EXISTIA', 'NO_EXISTIA', 0],
  ['actual SIN_CARGAR', { amount: '3.00', quantity: '2', unit: 'tickets' }, { amount: null, quantity: null, unit: 'tickets' }, 'CURRENT_SIN_CARGAR', 'SIN_CARGAR', 1],
  ['actual NO_EXISTIA', { amount: '3.00', quantity: '2', unit: 'tickets' }, null, 'CURRENT_NO_EXISTIA', 'NO_EXISTIA', 1],
]) test(`${label} conserva el estado y separa bloqueo absoluto de porcentaje no calculable`, () => {
  const compared = item(earlier, later);
  assert.equal(compared.periods[side].amount.state, state);
  assert.deepEqual(compared.amountVariation, { absoluteChange: change('BLOCKED', null, reason), percentageChange: change('NOT_CALCULABLE', null, reason) });
  assert.deepEqual(compared.quantityVariation, { absoluteChange: change('BLOCKED', null, reason), percentageChange: change('NOT_CALCULABLE', null, reason) });
  if (state === 'NO_EXISTIA' && side === 1) assert.equal(compared.inReferenceStructure, false);
});

test('unidades incompatibles bloquean ambas variaciones de cantidad sin afectar importes', () => {
  const compared = item({ amount: '2.00', quantity: '3', unit: 'pedidos' }, { amount: '3.00', quantity: '5', unit: 'tickets' });
  assert.deepEqual(compared.quantityVariation, { absoluteChange: change('NOT_CALCULABLE', null, 'UNIT_MISMATCH'), percentageChange: change('NOT_CALCULABLE', null, 'UNIT_MISMATCH') });
  assert.deepEqual(compared.amountVariation, { absoluteChange: change('COMPLETE', '1.00'), percentageChange: change('COMPLETE', '50.0000') });
});

test('cantidad no aplicable y concepto solo histórico permanecen visibles', () => {
  const result = compare(
    [{ code: 201, nodeId: 301, amount: '5.00' }, { code: 202, nodeId: 302, amount: '2.00' }],
    [{ code: 201, nodeId: 401, amount: '6.00', quantity: '8', unit: 'pedidos' }],
  );
  assert.equal(result.items[0].periods[0].quantity.state, 'NO_APLICA');
  assert.deepEqual(result.items[0].quantityVariation, { absoluteChange: change('BLOCKED', null, 'REFERENCE_NO_APLICA'), percentageChange: change('NOT_CALCULABLE', null, 'REFERENCE_NO_APLICA') });
  assert.equal(result.items[1].inReferenceStructure, false);
  assert.equal(result.items[1].periods[1].amount.state, 'NO_EXISTIA');
});

test('valores no numéricos y cantidades no enteras no producen diferencias', () => {
  const compared = item({ amount: 'no-numérico', quantity: '1.5', unit: 'tickets' }, { amount: '3.00', quantity: '2', unit: 'tickets' });
  const invalid = { absoluteChange: change('NOT_CALCULABLE', null, 'INVALID_VALUE'), percentageChange: change('NOT_CALCULABLE', null, 'INVALID_VALUE') };
  assert.deepEqual(compared.amountVariation, invalid);
  assert.deepEqual(compared.quantityVariation, invalid);
});

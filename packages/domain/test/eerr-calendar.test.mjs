import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { businessMonthAt, eerrCalendarIssue } from '../dist/index.js';

const september = { year: 2026, month: 9 };
const october = { year: 2026, month: 10 };
const start = new Date('2026-09-01T12:00:00Z');

test('01:00Z del 1 de octubre sigue siendo septiembre en Buenos Aires', () => {
  const now = new Date('2026-10-01T01:00:00Z');
  assert.deepEqual(businessMonthAt(now), september);
  assert.equal(eerrCalendarIssue(october, start, now), 'FUTURE');
  assert.equal(eerrCalendarIssue(september, start, now), null);
});

test('03:00Z del 1 de octubre habilita octubre, incluyendo el límite exacto', () => {
  assert.deepEqual(businessMonthAt(new Date('2026-10-01T02:59:59.999Z')), september);
  const now = new Date('2026-10-01T03:00:00Z');
  assert.deepEqual(businessMonthAt(now), october);
  assert.equal(eerrCalendarIssue(october, start, now), null);
});

test('el primer mes permitido proviene de la fecha de inicio convertida al negocio', () => {
  const now = new Date('2026-11-01T12:00:00Z');
  const earlyStart = new Date('2026-10-01T01:00:00Z');
  assert.equal(eerrCalendarIssue(september, earlyStart, now), null);
  assert.equal(eerrCalendarIssue({ year: 2026, month: 8 }, earlyStart, now), 'BEFORE_START');
  assert.equal(eerrCalendarIssue(september, new Date('2026-10-01T03:00:00Z'), now), 'BEFORE_START');
});

test('respeta cambios de año y fechas equivalentes con offset explícito', () => {
  assert.deepEqual(businessMonthAt(new Date('2027-01-01T01:00:00Z')), { year: 2026, month: 12 });
  assert.deepEqual(businessMonthAt(new Date('2026-09-30T22:00:00-03:00')), september);
  assert.equal(eerrCalendarIssue({ year: 2027, month: 1 }, start, new Date('2027-01-01T01:00:00Z')), 'FUTURE');
  assert.equal(eerrCalendarIssue({ year: 2025, month: 12 }, start, new Date('2027-01-01T03:00:00Z')), 'BEFORE_START');
});

test('rechaza instantes inválidos en lugar de producir un período NaN', () => {
  assert.throws(() => businessMonthAt(new Date('invalid')), RangeError);
});

for (const zone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
  test(`el calendario no depende de TZ=${zone}, en un proceso aislado`, () => {
    const moduleUrl = new URL('../dist/index.js', import.meta.url).href;
    const script = `import { businessMonthAt, eerrCalendarIssue } from ${JSON.stringify(moduleUrl)};
      console.log(JSON.stringify([
        businessMonthAt(new Date('2026-10-01T01:00:00Z')),
        businessMonthAt(new Date('2026-10-01T03:00:00Z')),
        eerrCalendarIssue({ year: 2026, month: 9 }, new Date('2026-10-01T01:00:00Z'), new Date('2026-11-01T12:00:00Z'))
      ]));`;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8', env: { ...process.env, TZ: zone },
    });
    assert.deepEqual(JSON.parse(output), [september, october, null]);
  });
}

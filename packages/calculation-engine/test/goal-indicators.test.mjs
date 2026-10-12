import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateGoalIndicators } from '../dist/index.js';

const money = (value) => ({ status: 'COMPLETE', value, unit: 'ARS', reason: null });
const unavailable = (reason) => ({ status: 'NOT_CALCULABLE', value: null, unit: 'ARS', reason });

for (const [label, income, breakEven, target, light, difference, compliance] of [
  ['below 70% of break-even', '69.99', '100.00', '150.00', 'RED', '-80.01', '46.6600'],
  ['exactly 70% of break-even', '70.00', '100.00', '150.00', 'YELLOW', '-80.00', '46.6667'],
  ['between break-even threshold and target', '120.00', '100.00', '150.00', 'YELLOW', '-30.00', '80.0000'],
  ['exactly at target', '150.00', '100.00', '150.00', 'GREEN', '0.00', '100.0000'],
  ['above target', '180.00', '100.00', '150.00', 'GREEN', '30.00', '120.0000'],
]) test(label, () => {
  const result = calculateGoalIndicators(money(income), money(breakEven), money(target));
  assert.deepEqual([result.trafficLight.value, result.targetDifference.value, result.targetCompliance.value],
    [light, difference, compliance]);
  assert.equal(result.trafficLight.status, 'COMPLETE');
});

test('unattainable target propagates its precise reason to all indicators', () => {
  const result = calculateGoalIndicators(money('100.00'), money('80.00'), unavailable('TARGET_MARGIN_UNATTAINABLE'));
  assert.equal(result.targetDifference.status, 'NOT_CALCULABLE');
  assert.equal(result.targetCompliance.status, 'NOT_CALCULABLE');
  assert.equal(result.trafficLight.value, 'NEUTRAL');
  assert.equal(result.trafficLight.reason, 'TARGET_MARGIN_UNATTAINABLE');
});

for (const [label, target, difference] of [
  ['zero', '0.00', '50.00'],
  ['negative', '-1.00', '51.00'],
]) test(`${label} target preserves the absolute difference but cannot define compliance or a light`, () => {
  const result = calculateGoalIndicators(money('50.00'), money('0.00'), money(target));
  assert.deepEqual(result.targetDifference, money(difference));
  assert.deepEqual(result.targetCompliance, {
    status: 'NOT_CALCULABLE', value: null, unit: 'PERCENT', reason: 'NON_POSITIVE_TARGET',
  });
  assert.deepEqual(result.trafficLight, {
    status: 'NOT_CALCULABLE', value: 'NEUTRAL', reason: 'NON_POSITIVE_TARGET',
  });
  assert.deepEqual(
    calculateGoalIndicators(money('50.00'), money('100.00'), money(target)),
    result,
    'el umbral rojo del equilibrio no debe reemplazar el motivo del objetivo no positivo',
  );
});

test('partial inputs and unavailable break-even do not fabricate a light', () => {
  const pending = calculateGoalIndicators(unavailable('PENDING_INPUTS'), unavailable('PENDING_INPUTS'), unavailable('PENDING_INPUTS'));
  assert.equal(pending.targetDifference.value, null);
  assert.equal(pending.trafficLight.reason, 'PENDING_INPUTS');
  const noBreakEven = calculateGoalIndicators(money('100.00'), unavailable('NON_POSITIVE_CONTRIBUTION_MARGIN'), money('150.00'));
  assert.equal(noBreakEven.targetDifference.value, '-50.00');
  assert.equal(noBreakEven.trafficLight.value, 'NEUTRAL');
  assert.equal(noBreakEven.trafficLight.reason, 'NON_POSITIVE_CONTRIBUTION_MARGIN');
});

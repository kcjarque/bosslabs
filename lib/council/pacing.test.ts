import { test } from 'node:test';
import assert from 'node:assert/strict';
import { utilization } from './pacing';

test('below underDelivering threshold (< 70%)', () => {
  const u = utilization(50_000, 100_000);
  assert.equal(u.pct, 0.5);
  assert.equal(u.underDelivering, true);
  assert.equal(u.budgetCapped, false);
});

test('exactly 70% is NOT underDelivering (boundary is exclusive)', () => {
  const u = utilization(70_000, 100_000);
  assert.equal(u.pct, 0.7);
  assert.equal(u.underDelivering, false);
  assert.equal(u.budgetCapped, false);
});

test('exactly 95% IS budgetCapped (boundary is inclusive)', () => {
  const u = utilization(95_000, 100_000);
  assert.equal(u.pct, 0.95);
  assert.equal(u.underDelivering, false);
  assert.equal(u.budgetCapped, true);
});

test('healthy mid-range utilization: neither flag', () => {
  const u = utilization(80_000, 100_000);
  assert.equal(u.pct, 0.8);
  assert.equal(u.underDelivering, false);
  assert.equal(u.budgetCapped, false);
});

test('over budget (>100%) still reads as budgetCapped, not a crash', () => {
  const u = utilization(120_000, 100_000);
  assert.ok(Math.abs(u.pct! - 1.2) < 1e-9);
  assert.equal(u.budgetCapped, true);
});

test('dailyBudgetCentavos = 0 → null pct, no divide-by-zero, both flags false', () => {
  const u = utilization(50_000, 0);
  assert.equal(u.pct, null);
  assert.equal(u.underDelivering, false);
  assert.equal(u.budgetCapped, false);
});

test('dailyBudgetCentavos = null (unknown structure) → null pct, both flags false', () => {
  const u = utilization(50_000, null);
  assert.equal(u.pct, null);
  assert.equal(u.underDelivering, false);
  assert.equal(u.budgetCapped, false);
});

test('zero spend against a real budget → pct 0, underDelivering true', () => {
  const u = utilization(0, 100_000);
  assert.equal(u.pct, 0);
  assert.equal(u.underDelivering, true);
  assert.equal(u.budgetCapped, false);
});

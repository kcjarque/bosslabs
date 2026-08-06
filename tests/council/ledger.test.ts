import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreOf, credibilityWeight, parseDirection } from '../../lib/council/ledger';

// --- scoreOf: +weight on hit, -weight on miss, 0 on push ---

test('scoreOf: hit returns +weight', () => {
  assert.equal(scoreOf('hit', 1), 1);
  assert.equal(scoreOf('hit', 2.5), 2.5);
});

test('scoreOf: miss returns -weight', () => {
  assert.equal(scoreOf('miss', 1), -1);
  assert.equal(scoreOf('miss', 0.25), -0.25);
});

test('scoreOf: push returns 0 regardless of weight', () => {
  assert.equal(scoreOf('push', 1), 0);
  assert.equal(scoreOf('push', 99), 0);
});

// --- credibilityWeight: 1 + sum(scores)*0.1, clamped [0.5, 2.0]; empty -> 1.0 ---

test('credibilityWeight: empty scores -> neutral 1.0', () => {
  assert.equal(credibilityWeight([]), 1.0);
});

test('credibilityWeight: positive scores raise the weight (unclamped middle)', () => {
  // sum=3 -> 1 + 3*0.1 = 1.3
  assert.equal(credibilityWeight([1, 1, 1]), 1.3);
});

test('credibilityWeight: negative scores lower the weight (unclamped middle)', () => {
  // sum=-2 -> 1 + (-2)*0.1 = 0.8
  assert.equal(credibilityWeight([-1, -1]), 0.8);
});

test('credibilityWeight: clamps at the 2.0 ceiling', () => {
  // sum=15 -> 1 + 1.5 = 2.5 -> clamped 2.0
  assert.equal(credibilityWeight([5, 5, 5]), 2.0);
});

test('credibilityWeight: exact ceiling boundary (sum=10) needs no clamping', () => {
  // sum=10 -> 1 + 1.0 = 2.0 exactly
  assert.equal(credibilityWeight([10]), 2.0);
});

test('credibilityWeight: clamps at the 0.5 floor', () => {
  // sum=-10 -> 1 + (-1.0) = 0 -> clamped 0.5
  assert.equal(credibilityWeight([-5, -5]), 0.5);
});

test('credibilityWeight: exact floor boundary (sum=-5) needs no clamping', () => {
  // sum=-5 -> 1 + (-0.5) = 0.5 exactly
  assert.equal(credibilityWeight([-5]), 0.5);
});

// --- parseDirection: 'lte' | 'gte' | null, read from prediction_text ---

test('parseDirection: "≤" symbol -> lte', () => {
  assert.equal(parseDirection('CPP_7d ≤ ₱600 within 7 days'), 'lte');
});

test('parseDirection: "<" symbol -> lte', () => {
  assert.equal(parseDirection('CPP will be < ₱600 by Friday'), 'lte');
});

test('parseDirection: "under" -> lte', () => {
  assert.equal(parseDirection('CPP will stay under ₱600'), 'lte');
});

test('parseDirection: "below" -> lte', () => {
  assert.equal(parseDirection('Spend share stays below 15% this week'), 'lte');
});

test('parseDirection: "≥" symbol -> gte', () => {
  assert.equal(parseDirection('Campaign CPP_7d ≥ ₱700'), 'gte');
});

test('parseDirection: ">" symbol -> gte', () => {
  assert.equal(parseDirection('CPP will be > ₱700 by Friday'), 'gte');
});

test('parseDirection: "over" -> gte', () => {
  assert.equal(parseDirection('CPP will run over ₱700'), 'gte');
});

test('parseDirection: "above" -> gte', () => {
  assert.equal(parseDirection('Spend share rises above 25%'), 'gte');
});

test('parseDirection: "exceed" -> gte', () => {
  assert.equal(parseDirection('CPP will exceed ₱700 this week'), 'gte');
});

test('parseDirection: neither marker present -> null (needs_manual)', () => {
  assert.equal(parseDirection('CPP will move around a bit'), null);
});

test('parseDirection: case-insensitive ("Under" at sentence start)', () => {
  assert.equal(parseDirection('Under 3 days, CPP settles near target'), 'lte');
});

test('parseDirection: both lte and gte markers present -> ambiguous, null', () => {
  assert.equal(parseDirection('CPP stays under 700 but never above 500'), null);
});

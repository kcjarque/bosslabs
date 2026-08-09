import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confidenceFor } from './confidence';

const CPA = 65_000; // ₱650 blended CPA

test('≥10 purchases = SOLID', () => assert.equal(confidenceFor(12, 50_000, CPA), 'SOLID'));
test('spend ≥3× CPA = SOLID', () => assert.equal(confidenceFor(1, 200_000, CPA), 'SOLID'));
test('≥3 purchases = DIRECTIONAL', () => assert.equal(confidenceFor(4, 10_000, CPA), 'DIRECTIONAL'));
test('spend ≥1× CPA (but <3×) = DIRECTIONAL', () => assert.equal(confidenceFor(1, 70_000, CPA), 'DIRECTIONAL'));
test('7_Manual2 (₱929 spend, 5 buyers) = DIRECTIONAL, not SOLID', () => {
  // 5 purchases (<10) and ₱929 spend = 92_900 (<3×CPA=195k, ≥1×CPA=65k) → DIRECTIONAL, never a scale call
  assert.equal(confidenceFor(5, 92_900, CPA), 'DIRECTIONAL');
});
test('₱250 spend, 0 buyers = NOISE', () => assert.equal(confidenceFor(0, 25_000, CPA), 'NOISE'));
test('falls back to ₱650 CPA when blended is 0/unknown', () => {
  assert.equal(confidenceFor(0, 70_000, 0), 'DIRECTIONAL'); // 70k ≥ 65k fallback
  assert.equal(confidenceFor(0, 60_000, 0), 'NOISE');       // 60k < 65k fallback
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveWeekBounds } from './pack';

test('Sunday-run week bounds: asOf Thu 08-06 → Mon 08-03..Sun 08-09', () => {
  const b = deriveWeekBounds('2026-08-06');
  assert.equal(b.weekStart, '2026-08-03');
  assert.equal(b.weekEnd, '2026-08-09');
  assert.equal(b.settledCutoff, '2026-08-06');
});

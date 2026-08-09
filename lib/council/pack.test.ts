import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveWeekBounds } from './pack';

test('Sunday-run week bounds: asOf Thu 08-06 → Mon 08-03..Sun 08-09', () => {
  const b = deriveWeekBounds('2026-08-06');
  assert.equal(b.weekStart, '2026-08-03');
  assert.equal(b.weekEnd, '2026-08-09');
  assert.equal(b.settledCutoff, '2026-08-06');
});

// Regression: deriveWeekBounds must be correct on ANY run day, not only Sunday —
// manual admin runs and /prince Q&A call assemblePack too. weekEnd must be the
// MOST RECENT Sunday ≤ today, never the upcoming one.
test('Wednesday run (asOf Sun 08-09 → today Wed 08-12): fully-settled just-finished week Mon 08-03..Sun 08-09', () => {
  const b = deriveWeekBounds('2026-08-09'); // today = 08-12 (Wed)
  assert.equal(b.weekStart, '2026-08-03');
  assert.equal(b.weekEnd, '2026-08-09');    // last Sunday, NOT the upcoming one
  assert.equal(b.settledCutoff, '2026-08-09'); // whole past week is settled
  assert.ok(b.settledCutoff >= b.weekStart, 'settledCutoff must not precede weekStart');
});

test('Monday run (asOf Fri 08-07 → today Mon 08-10): week Mon 08-03..Sun 08-09, Sat/Sun tail rough', () => {
  const b = deriveWeekBounds('2026-08-07'); // today = 08-10 (Mon)
  assert.equal(b.weekStart, '2026-08-03');
  assert.equal(b.weekEnd, '2026-08-09');
  assert.equal(b.settledCutoff, '2026-08-07');
  assert.ok(b.settledCutoff >= b.weekStart);
});

test('invariant across all 7 weekdays: weekEnd is Sunday, span is 7 days, settledCutoff never precedes weekStart', () => {
  for (const asOf of ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09']) {
    const b = deriveWeekBounds(asOf);
    assert.equal(new Date(`${b.weekEnd}T00:00:00Z`).getUTCDay(), 0, `${asOf}: weekEnd not a Sunday`);
    assert.equal((Date.parse(b.weekEnd) - Date.parse(b.weekStart)) / 86400000, 6, `${asOf}: span not 7 days`);
    assert.ok(b.settledCutoff >= b.weekStart, `${asOf}: settledCutoff precedes weekStart`);
  }
});

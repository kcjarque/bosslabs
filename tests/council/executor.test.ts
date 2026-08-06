import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPauseGuardrail, clampBudget, executeAction } from '../../lib/council/executor';

// --- checkPauseGuardrail: Ground-Truth 20%-of-daily-spend pause cap +
// never-touch-LEARNING, both enforced in code regardless of mode ---

test('checkPauseGuardrail: refuses LEARNING tier regardless of spend', () => {
  const result = checkPauseGuardrail({
    adSpend7ByAd: { a1: 100000 },
    alreadyPausedTodayCentavos: 0,
    adId: 'a1',
    tier: 'LEARNING',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'never touch learning ads');
});

test('checkPauseGuardrail: refuses over-cap pause, reason names the exact numbers', () => {
  // campaign 7d total 1,400,000c -> daily avg 200,000c = ₱2,000/day; cap 20% = ₱400/day.
  const result = checkPauseGuardrail({
    adSpend7ByAd: { a1: 700000, a2: 700000 },
    alreadyPausedTodayCentavos: 0,
    adId: 'a1', // 700,000c / 7 = 100,000c/day = ₱1,000/day
    tier: 'WATCH',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'pausing would remove ₱1,000/day, cap is ₱400/day (20%)');
});

test('checkPauseGuardrail: exact 20% boundary passes (strict greater-than, not >=)', () => {
  // campaign 7d total 700,000c -> daily avg ₱1,000/day; cap ₱200/day.
  const result = checkPauseGuardrail({
    adSpend7ByAd: { a1: 140000, a2: 560000 },
    alreadyPausedTodayCentavos: 0,
    adId: 'a1', // 140,000c / 7 = ₱200/day, exactly the cap
    tier: 'LOSER',
  });
  assert.equal(result.ok, true);
});

test('checkPauseGuardrail: comfortably under cap passes', () => {
  // Same ₱1,000/day campaign as the boundary case above (cap ₱200/day).
  const result = checkPauseGuardrail({
    adSpend7ByAd: { a1: 70000, a2: 630000 },
    alreadyPausedTodayCentavos: 0,
    adId: 'a1', // 70,000c / 7 = ₱100/day
    tier: 'WATCH',
  });
  assert.equal(result.ok, true);
});

test('checkPauseGuardrail: zero campaign spend -> cap is 0, refuses any nonzero removal', () => {
  const result = checkPauseGuardrail({
    adSpend7ByAd: { a1: 0 }, // campaign daily average is 0 -> cap = 0
    alreadyPausedTodayCentavos: 1000, // already pulled today by an earlier pause
    adId: 'a1',
    tier: 'WATCH',
  });
  assert.equal(result.ok, false);
});

test('checkPauseGuardrail: an ad under its own cap still refuses once already-paused-today accumulates past it', () => {
  // Same ₱1,000/day campaign as the under-cap case (a1 alone = ₱100/day, cap ₱200/day).
  const result = checkPauseGuardrail({
    adSpend7ByAd: { a1: 70000, a2: 630000 },
    alreadyPausedTodayCentavos: 15000, // ₱150/day already pulled today
    adId: 'a1',
    tier: 'WATCH',
  });
  assert.equal(result.ok, false);
});

// --- clampBudget: doctrine's ±20%/day budget-change cap ---

test('clampBudget: +20% clamp — request above the ceiling gets capped', () => {
  assert.equal(clampBudget(100000, 200000), 120000);
});

test('clampBudget: -20% clamp — request below the floor gets raised', () => {
  assert.equal(clampBudget(100000, 50000), 80000);
});

test('clampBudget: within-band request passes through unchanged', () => {
  assert.equal(clampBudget(100000, 110000), 110000);
});

test('clampBudget: exact ±20% boundary passes through unclamped', () => {
  assert.equal(clampBudget(100000, 120000), 120000);
  assert.equal(clampBudget(100000, 80000), 80000);
});

// --- executeAction: mode gate is the safety-critical no-op path — the only
// branch exercisable without a real Meta token / live Supabase. Everything
// past this guard makes a real network call, so it's deliberately NOT unit
// tested (verified instead by tsc + code review per the task instructions).

test('executeAction: recommend mode is a no-op — no network/DB, returns the disabled result', async () => {
  const result = await executeAction({
    brand: 'BOSS',
    sessionId: null,
    type: 'pause_ad',
    targetId: 'a1',
    mode: 'recommend',
    executedBy: 'test-suite',
  });
  assert.deepEqual(result, { ok: false, result: 'recommend mode — execution disabled' });
});

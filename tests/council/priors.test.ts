import test from 'node:test';
import assert from 'node:assert/strict';
import { computePriors } from '../../lib/council/priors';
import type { AdSeries, AdDay } from '../../lib/council/types';

// Fixture helpers copied from tests/council/verdict-engine.test.ts's style
// (kept local on purpose — tests do not import across test files).
function day(date: string, over: Partial<AdDay> = {}): AdDay {
  return { date, spendCentavos: 100000, impressions: 10000, reach: 8000, frequency: 1.2,
    ctr: 2.0, linkCtr: 1.2, cpm: 100, linkClicks: 120, purchases: 2, revenueCentavos: 199800, video3s: 0, thruplays: 0, lpViews: 0, ...over };
}
/** n days ending at endDate (inclusive), ascending. */
function daysEnding(endDate: string, n: number, over: (i: number) => Partial<AdDay> = () => ({})): AdDay[] {
  const end = new Date(endDate + 'T00:00:00Z').getTime();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end - (n - 1 - i) * 86400000).toISOString().slice(0, 10);
    return day(d, over(i));
  });
}
function series(days: AdDay[], over: Partial<AdSeries> = {}): AdSeries {
  return { brand: 'BOSS', campaignId: 'c1', campaignName: 'BOSSLABS AI | SALES',
    adsetId: 's1', adsetName: 'set', adId: 'a1', adName: 'Ads 14_24hrs', days, ...over };
}

const ASOF = '2026-08-03';

test('30 days alternating campaign CPP (P400/P600): sampleDays dedups across series, sigma>0, 7 weekday keys', () => {
  // Ad a1 carries the alternating CPP pattern across all 30 days.
  const s1 = series(
    daysEnding(ASOF, 30, (i) => (i % 2 === 0
      ? { spendCentavos: 40000, purchases: 1 }
      : { spendCentavos: 60000, purchases: 1 })),
    { adId: 'a1' },
  );
  // Ad a2 runs the same 30 days with zero spend/purchases — exercises
  // multi-series aggregation and date de-duplication without shifting CPP.
  const s2 = series(
    daysEnding(ASOF, 30, () => ({ spendCentavos: 0, purchases: 0, revenueCentavos: 0 })),
    { adId: 'a2' },
  );
  const row = computePriors('BOSS', [s1, s2]);
  assert.equal(row.sampleDays, 30);
  assert.ok(row.dailyCppSigmaPct! > 0);
  assert.equal(Object.keys(row.weekdayMultipliers!).length, 7);
});

test('winner-lifespan median: two winners spanning 10 and 20 days -> median 15', () => {
  // Winner 1: 10 lifetime purchases, spend>0 every day across a 10-day window -> span 10.
  const w1 = series(
    daysEnding(ASOF, 10, () => ({ spendCentavos: 40000, purchases: 1 })),
    { adId: 'w1' },
  );
  // Winner 2: a disjoint, earlier 20-day window (spend>0 + a purchase every
  // day) -> 20 lifetime purchases, span 20. Disjoint dates keep the combined
  // purchase-day sample >=14 without touching w1's span.
  const w2 = series(
    daysEnding('2026-07-24', 20, () => ({ spendCentavos: 40000, purchases: 1 })),
    { adId: 'w2' },
  );
  const row = computePriors('BOSS', [w1, w2]);
  assert.equal(row.medianWinnerLifespanDays, 15);
});

test('weekday bucket uses the literal Manila calendar weekday, not a UTC+8-shifted one', () => {
  // 2026-08-03 is a Monday (true weekday index 1). Give it a distinctive CPP
  // (P900) with 13 filler purchase-days at a different CPP (P500), all on
  // Wed/Thu/Fri/Sat/Sun so none of them is a Monday (key '1' under the
  // correct formula) or a Tuesday (key '1' under the old, wrong
  // +08:00-shifted formula) — isolating key '1' to only this one date.
  // Under the old formula this date bucketed to key '0' instead, leaving
  // '1' at its untouched default of 1, so this assertion fails on the old
  // code and passes on the fixed code.
  const fillerDates = [
    '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09',
    '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16',
    '2026-08-19', '2026-08-20', '2026-08-21',
  ];
  const days = [
    day('2026-08-03', { spendCentavos: 90000, purchases: 1 }),
    ...fillerDates.map((d) => day(d, { spendCentavos: 50000, purchases: 1 })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));
  const row = computePriors('BOSS', [series(days)]);
  assert.notEqual(row.weekdayMultipliers!['1'], 1);
});

test('under 14 sample days nulls every field except sampleDays', () => {
  const s = series(daysEnding(ASOF, 10));
  const row = computePriors('BOSS', [s]);
  assert.equal(row.sampleDays, 10);
  assert.equal(row.dailyCppSigmaPct, null);
  assert.equal(row.weekdayMultipliers, null);
  assert.equal(row.medianWinnerLifespanDays, null);
  assert.equal(row.cppDriftPctPerWeek, null);
});

test('zero-mean guard: 14+ purchase-days at zero spend nulls every analytical field, sampleDays still populated', () => {
  // Every day has a purchase but zero spend -> CPP 0 on every sample day ->
  // overallMean 0. All four analytical fields must go null (spec
  // consistency, not just the fields that literally divide by the mean).
  const s = series(daysEnding(ASOF, 14, () => ({ spendCentavos: 0, purchases: 1 })));
  const row = computePriors('BOSS', [s]);
  assert.equal(row.sampleDays, 14);
  assert.equal(row.dailyCppSigmaPct, null);
  assert.equal(row.weekdayMultipliers, null);
  assert.equal(row.medianWinnerLifespanDays, null);
  assert.equal(row.cppDriftPctPerWeek, null);
});

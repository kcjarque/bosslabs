import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekWindow } from './verdict-engine';
import type { AdSeries } from './types';

const day = (date: string, o: Partial<AdSeries['days'][number]> = {}): AdSeries['days'][number] => ({
  date, spendCentavos: 100_000, impressions: 10_000, reach: 8_000, frequency: 1.25,
  ctr: 1.5, linkCtr: 1.0, cpm: 100, linkClicks: 100, purchases: 2, revenueCentavos: 250_000,
  video3s: 0, thruplays: 0, lpViews: 80, ...o,
});
const series = (days: AdSeries['days']): AdSeries => ({
  brand: 'BOSS' as any, campaignId: 'c', campaignName: 'C', adsetId: 'a', adsetName: 'A',
  adId: 'ad1', adName: 'Ad 1', days,
});

test('weekWindow sums the Mon–Sun span and computes ROAS/AOV', () => {
  const s = series(['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'].map((d) => day(d)));
  const w = weekWindow(s, '2026-08-03', '2026-08-09', '2026-08-06');
  assert.equal(w.spend, 500_000);
  assert.equal(w.revenue, 1_250_000);
  assert.equal(w.purchases, 10);
  assert.ok(Math.abs((w.roas as number) - 2.5) < 1e-9);
  assert.equal(w.aov, 125_000);
  assert.equal(w.settled.spend, 400_000); // only ≤ 2026-08-06 (4 days)
});

test('weekWindow prior week = the preceding Mon–Sun', () => {
  const s = series([day('2026-07-27'), day('2026-07-28'), day('2026-08-03')]);
  const w = weekWindow(s, '2026-08-03', '2026-08-09', '2026-08-06');
  assert.equal(w.priorWeek.spend, 200_000); // Jul 27 + Jul 28 in prior Mon–Sun
});

test('gap day outside the span is excluded (calendar, not array position)', () => {
  const s = series([day('2026-08-01'), day('2026-08-04'), day('2026-08-10')]); // only 08-04 is in-week
  const w = weekWindow(s, '2026-08-03', '2026-08-09', '2026-08-06');
  assert.equal(w.spend, 100_000);
  assert.equal(w.purchases, 2);
});

test('image ad (no video plays) → hook/hold rate null, funnel rates still computed', () => {
  const s = series([day('2026-08-04', { video3s: 0, thruplays: 0 })]);
  const w = weekWindow(s, '2026-08-03', '2026-08-09', '2026-08-06');
  assert.equal(w.hookRate, null);
  assert.equal(w.holdRate, null);
  assert.ok(w.lpViewRate !== null); // funnel rates are click-based, not video
});

test('video ad (plays ≥ 10% impressions) → hook/hold rate computed', () => {
  const s = series([day('2026-08-04', { video3s: 5_000, thruplays: 2_000 })]); // 50% of 10k impr
  const w = weekWindow(s, '2026-08-03', '2026-08-09', '2026-08-06');
  assert.ok(Math.abs((w.hookRate as number) - 50) < 1e-9);
  assert.ok(Math.abs((w.holdRate as number) - 40) < 1e-9); // 2000/5000
});

test('empty week → null ratios, zero sums, no divide-by-zero', () => {
  const w = weekWindow(series([day('2026-09-01')]), '2026-08-03', '2026-08-09', '2026-08-06');
  assert.equal(w.spend, 0);
  assert.equal(w.roas, null);
  assert.equal(w.cpp, null);
  assert.equal(w.aov, null);
});

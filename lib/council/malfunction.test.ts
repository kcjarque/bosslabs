import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectMalfunctions } from './malfunction';
import type { AdSeries } from './types';

const mk = (adId: string, days: AdSeries['days']): AdSeries => ({
  brand: 'BOSS' as any, campaignId: 'c', campaignName: 'C', adsetId: 'a', adsetName: 'A', adId, adName: adId, days,
});
const d = (date: string, spend: number, purch: number, rev: number, lp = 50, clicks = 60): AdSeries['days'][number] => ({
  date, spendCentavos: spend, impressions: 5000, reach: 4000, frequency: 1.2, ctr: 1, linkCtr: 1, cpm: 80,
  linkClicks: clicks, purchases: purch, revenueCentavos: rev, video3s: 0, thruplays: 0, lpViews: lp,
});

test('WITH_ISSUES ad flagged DISAPPROVED', () => {
  const out = detectMalfunctions([mk('x', [d('2026-08-06', 100000, 2, 250000)])], new Map([['x', 'WITH_ISSUES']]), '2026-08-06');
  assert.equal(out[0].kind, 'DISAPPROVED');
});

test('spend continues but revenue cliffs to 0 = REVENUE_CLIFF', () => {
  const days = [d('2026-08-04', 100000, 3, 300000), d('2026-08-05', 100000, 3, 300000), d('2026-08-06', 100000, 0, 0)];
  const out = detectMalfunctions([mk('y', days)], new Map([['y', 'ACTIVE']]), '2026-08-06');
  assert.equal(out.find((m) => m.adId === 'y')?.kind, 'REVENUE_CLIFF');
});

test('PAUSED ad with 0 purchases today is NOT a malfunction (just history)', () => {
  const days = [d('2026-08-04', 100000, 3, 300000), d('2026-08-05', 100000, 3, 300000), d('2026-08-06', 100000, 0, 0)];
  const out = detectMalfunctions([mk('z', days)], new Map([['z', 'PAUSED']]), '2026-08-06');
  assert.equal(out.length, 0);
});

test('healthy active ad (still buying) → no flag', () => {
  const days = [d('2026-08-04', 100000, 3, 300000), d('2026-08-05', 100000, 3, 300000), d('2026-08-06', 100000, 3, 300000)];
  const out = detectMalfunctions([mk('h', days)], new Map([['h', 'ACTIVE']]), '2026-08-06');
  assert.equal(out.length, 0);
});

test('landing-page views collapse with clicks flowing = LP_COLLAPSE', () => {
  // prior lpViews 50/60 clicks ≈ 0.83; today 2/60 ≈ 0.03 (<20% of 0.83), clicks ≥30, still buying so no cliff
  const days = [d('2026-08-05', 100000, 3, 300000, 50, 60), d('2026-08-06', 100000, 3, 300000, 2, 60)];
  const out = detectMalfunctions([mk('lp', days)], new Map([['lp', 'ACTIVE']]), '2026-08-06');
  assert.equal(out.find((m) => m.adId === 'lp')?.kind, 'LP_COLLAPSE');
});

test('no asOf-day data → skipped (no crash)', () => {
  const out = detectMalfunctions([mk('n', [d('2026-08-01', 100000, 3, 300000)])], new Map([['n', 'ACTIVE']]), '2026-08-06');
  assert.equal(out.length, 0);
});

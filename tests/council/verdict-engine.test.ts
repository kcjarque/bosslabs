import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAd } from '../../lib/council/verdict-engine';
import type { AdSeries, AdDay } from '../../lib/council/types';

const SETTINGS = { brand: 'BOSS' as const, mode: 'recommend' as const, targetCppCentavos: 50000 };

function day(date: string, over: Partial<AdDay> = {}): AdDay {
  return { date, spendCentavos: 100000, impressions: 10000, reach: 8000, frequency: 1.2,
    ctr: 2.0, linkCtr: 1.2, cpm: 100, linkClicks: 120, purchases: 2, revenueCentavos: 199800, ...over };
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
function campaignFor(s: AdSeries, extraSpend7 = 0) {
  const spend7 = s.days.slice(-7).reduce((t, d) => t + d.spendCentavos, 0);
  return {
    totalSpend7Centavos: spend7 + extraSpend7,
    blendedCpp7Centavos: 45000,
    campaignSpend7ByAd: { [s.adId]: spend7, other: extraSpend7 },
    campaignSpendPrior7ByAd: { [s.adId]: s.days.slice(-14, -7).reduce((t, d) => t + d.spendCentavos, 0), other: extraSpend7 },
  };
}
const ASOF = '2026-08-03';
const BASE = { settings: SETTINGS, asOf: ASOF, prev: null, historyDays: 60 };

test('fresh ad (<72h) is LEARNING', () => {
  const s = series(daysEnding(ASOF, 2));
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s) });
  assert.equal(v.verdict, 'LEARNING');
});

test('<10 lifetime purchases is LEARNING with graduation advise', () => {
  const s = series(daysEnding(ASOF, 10, () => ({ purchases: 0 })));
  s.days[9] = { ...s.days[9], purchases: 4 };
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s) });
  assert.equal(v.verdict, 'LEARNING');
  assert.match(v.headline, /purchase/i);
});

test('healthy prospector under target CPP is WINNING', () => {
  // 2 purchases/day @ ₱1,000 spend/day → CPP ₱500 = target; freq 1.2 <1.3 prospector
  const s = series(daysEnding(ASOF, 20));
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 400000) });
  assert.equal(v.verdict, 'WINNING');
  assert.equal(v.role, 'PROSPECTOR');
});

test('single deterioration signal (CPP +15%) is WATCH, never pause language', () => {
  // prior 7d: 2 buys/day (14 total, CPP ₱500). trailing 7d: same spend, drops
  // to 12 total (pattern 2,2,2,2,2,1,1) → CPP ₱583, +16.7% — inside the WATCH
  // band (10–20%). extraSpend7 is large enough that this ad's spend share
  // (~15%) stays under the 20% top-spend red-flag proxy, so CPP is the only
  // deterioration signal present (share flat, ctr/freq unchanged).
  const s = series(daysEnding(ASOF, 20, (i) => (i >= 13 ? { purchases: i >= 18 ? 1 : 2 } : {})));
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 4000000) });
  assert.equal(v.verdict, 'WATCH');
  assert.doesNotMatch(v.headline, /pause/i);
});

test('full fatigue (CPP +25%, share down, ctr falling) is LOSER', () => {
  const s = series(daysEnding(ASOF, 20, (i) => (i >= 13
    ? { purchases: 1, spendCentavos: 60000, ctr: 1.0, frequency: 2.6 } : {})));
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 800000) });
  assert.equal(v.verdict, 'LOSER');
});

test('recovery guard: fatigued through the settled window but bouncing back in the preliminary tail → WATCH, never LOSER', () => {
  // Fatigued exactly like the LOSER case, with the window ending at ASOF…
  const fatiguedDays = daysEnding(ASOF, 20, (i) => (i >= 13
    ? { purchases: 1, spendCentavos: 60000, ctr: 1.0, frequency: 2.6 } : {}));
  // …then the ad recovers hard on the two still-preliminary days AFTER asOf.
  const recovery = [
    day('2026-08-04', { purchases: 8, spendCentavos: 160000 }), // ₱200/buyer
    day('2026-08-05', { purchases: 8, spendCentavos: 200000 }), // ₱250/buyer
  ];
  const s = series([...fatiguedDays, ...recovery]);
  // Inline campaign context: ad share collapsed (30% → 6%) so fatigue fires.
  const campaign = {
    totalSpend7Centavos: 1_000_000,
    blendedCpp7Centavos: 45000,
    campaignSpend7ByAd: { a1: 60000, other: 940000 },
    campaignSpendPrior7ByAd: { a1: 300000, other: 700000 },
  };
  const v = gradeAd({ ...BASE, series: s, campaign });
  assert.equal(v.verdict, 'WATCH');
  assert.match(v.headline, /bounced back|don.t cut/i);
});

test('recovery guard does NOT rescue a genuinely dead ad (no purchases in the tail)', () => {
  const dead = daysEnding(ASOF, 20, (i) => (i >= 13
    ? { purchases: 1, spendCentavos: 60000, ctr: 1.0, frequency: 2.6 } : {}));
  const stillDead = [
    day('2026-08-04', { purchases: 0, spendCentavos: 160000 }),
    day('2026-08-05', { purchases: 0, spendCentavos: 200000 }),
  ];
  const s = series([...dead, ...stillDead]);
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 800000) });
  assert.equal(v.verdict, 'LOSER');
});

test('zero purchases after 3x target spend post-learning is LOSER', () => {
  const s = series(daysEnding(ASOF, 10, () => ({ purchases: 0, spendCentavos: 20000 })));
  // lifetime spend ₱2,000*10... ensure > 3×₱500 = ₱1,500 ✓ and >72h old ✓ — but <10 purchases…
  // per doctrine §5.2 zero-purchase LOSER overrides the <10-purchase LEARNING gate once
  // spend > 3×target: it graduated by burning budget.
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 400000) });
  assert.equal(v.verdict, 'LOSER');
});

test('freq ≥2.0 with below-avg CPP is CLOSER and WINNING (not misgraded)', () => {
  const s = series(daysEnding(ASOF, 20, () => ({ frequency: 2.4, purchases: 3 }))); // CPP ₱333 < blended ₱450
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 400000) });
  assert.equal(v.role, 'CLOSER');
  assert.equal(v.verdict, 'WINNING');
});

test('under 14 days of campaign history → degraded, tier LEARNING only', () => {
  const s = series(daysEnding(ASOF, 20));
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 400000), historyDays: 5 });
  assert.equal(v.degraded, true);
  assert.equal(v.verdict, 'LEARNING');
});

test('daysInTier increments when verdict unchanged, changed flag on flip', () => {
  const s = series(daysEnding(ASOF, 20));
  const stay = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 400000), prev: { verdict: 'WINNING', daysInTier: 4 } });
  assert.equal(stay.daysInTier, 5);
  assert.equal(stay.changed, false);
  const flip = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 400000), prev: { verdict: 'WATCH', daysInTier: 2 } });
  assert.equal(flip.changed, true);
  assert.equal(flip.daysInTier, 1);
});

// --- fix-wave regression tests (calendar windows, signal honesty, CPP-only deterioration) ---

test('two simultaneous signals stay WATCH; headline names the worse one, interpretation lists both', () => {
  // CPP signal (~+17%, same purchases pattern as the single-signal test above)
  // plus an independent, deliberately asymmetric prior/current "other" spend
  // bucket to force a genuine >20% share decline — without touching the ad's
  // own spend, so the CPP math above stays exactly what it was.
  const s = series(daysEnding(ASOF, 20, (i) => (i >= 13 ? { purchases: i >= 18 ? 1 : 2 } : {})));
  const spend7 = s.days.slice(-7).reduce((t, d) => t + d.spendCentavos, 0);
  const spendPrior7 = s.days.slice(-14, -7).reduce((t, d) => t + d.spendCentavos, 0);
  const campaign = {
    totalSpend7Centavos: spend7 + 4000000,
    blendedCpp7Centavos: 45000,
    campaignSpend7ByAd: { [s.adId]: spend7, other: 4000000 },
    campaignSpendPrior7ByAd: { [s.adId]: spendPrior7, other: 300000 },
  };
  const v = gradeAd({ ...BASE, series: s, campaign });
  assert.equal(v.verdict, 'WATCH');
  assert.match(v.headline, /^CPP \+\d+% this week \(\+1 more\)/);
  assert.doesNotMatch(v.headline, /^One deterioration signal/);
  assert.match(v.interpretation, /2 deterioration signals/);
  assert.match(v.interpretation, /CPP \+\d+% this week/);
  assert.match(v.interpretation, /spend share down \d+%/);
});

test('CPP +27% alone (flat share, flat everything else) is WATCH, not WINNING', () => {
  // Old [10,20) WATCH band would have let this through as WINNING — the
  // WINNING copy itself claims "demotes on any single deterioration signal,"
  // which a +27% CPP swing obviously is.
  const s = series(daysEnding(ASOF, 20, (i) => (i >= 13 ? { purchases: i < 17 ? 2 : 1 } : {})));
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 4000000) });
  assert.equal(v.verdict, 'WATCH');
  assert.match(v.headline, /CPP \+\d+% this week/);
});

test('8 delivery days (thin prior window) suppresses delta signals — grades on absolutes', () => {
  // 8 contiguous days: t7 has 7 days (reliable) but p7 only overlaps the
  // ad's very first day (1 day, unreliable) — calendar-based windows expose
  // this correctly. 16 lifetime purchases clears LEARNING; cpp7 lands right
  // at target, so with no delta signals possible it grades WINNING.
  const s = series(daysEnding(ASOF, 8));
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 400000) });
  assert.equal(v.verdict, 'WINNING');
  assert.equal(v.decidingMetrics.cpp_delta_pct, null);
  assert.equal(v.decidingMetrics.spend_share_delta, null);
});

test('cpmPrior7 = 0 never produces Infinity in headline or interpretation', () => {
  const s = series(daysEnding(ASOF, 20, (i) => (i >= 6 && i <= 12 ? { cpm: 0 } : {})));
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 400000) });
  assert.equal(v.verdict, 'WINNING');
  assert.doesNotMatch(v.headline, /Infinity/);
  assert.doesNotMatch(v.interpretation, /Infinity/);
});

test('ctrFalling + elevated frequency is a standalone WATCH signal (role HYBRID)', () => {
  const s = series(daysEnding(ASOF, 20, (i) => (i >= 13 ? { ctr: 1.8, frequency: 1.6 } : {})));
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 400000) });
  assert.equal(v.role, 'HYBRID');
  assert.equal(v.verdict, 'WATCH');
  assert.match(v.headline, /frequency 1\.6 rising while CTR falls/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreOf, credibilityWeight, parseDirection, actualFor, type PredictionRow } from '../../lib/council/ledger';
import type { AdSeries, AdDay } from '../../lib/council/types';

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

// --- actualFor: machine-checkable actual value for one prediction row's
// metric, from an already-fetched series map (fixture style copied from
// tests/council/verdict-engine.test.ts's day/daysEnding/series builders) ---

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
function row(over: Partial<PredictionRow> = {}): PredictionRow {
  return {
    id: 'p1', date: '2026-08-03', brand: 'BOSS', expert: 'CHARLEY', session_id: null,
    conflict_ref: null, action_taken: false, prediction_text: 'CPP will stay under ₱600',
    metric: 'cpp_7d', threshold: 60000, target_id: 'a1', deadline: '2026-08-10',
    weight: 1.0, outcome: null, needs_manual: false, resolved_date: null, notes: '',
    ...over,
  };
}
const ASOF = '2026-08-03';

test('actualFor: cpp_7d resolves from the target ad\'s synthetic 7d window (centavos)', () => {
  const s = series(daysEnding(ASOF, 7));
  const seriesByAdId = new Map([[s.adId, s]]);
  // 7 days * spendCentavos 100000 = 700000; 7 days * purchases 2 = 14 -> cpp7 = 700000/14 = 50000c (₱500).
  const actual = actualFor(row({ metric: 'cpp_7d', target_id: s.adId }), seriesByAdId, 0, null, ASOF);
  assert.equal(actual, 50000);
});

test('actualFor: campaign_cpp_7d returns the precomputed campaign figure directly (no series lookup)', () => {
  const actual = actualFor(row({ metric: 'campaign_cpp_7d', target_id: null }), new Map(), 0, 42000, ASOF);
  assert.equal(actual, 42000);
});

test('actualFor: spend_share_7d resolves as a 0..1 fraction of campaign spend', () => {
  const s = series(daysEnding(ASOF, 7));
  const seriesByAdId = new Map([[s.adId, s]]);
  // spend7 = 700000; campaignSpend7 = 2800000 -> share = 0.25.
  const actual = actualFor(row({ metric: 'spend_share_7d', target_id: s.adId }), seriesByAdId, 2800000, null, ASOF);
  assert.equal(actual, 0.25);
  assert.ok(actual !== null && actual >= 0 && actual <= 1);
});

test('actualFor: unrecognized metric returns null', () => {
  const actual = actualFor(row({ metric: 'some_bogus_metric' }), new Map(), 0, null, ASOF);
  assert.equal(actual, null);
});

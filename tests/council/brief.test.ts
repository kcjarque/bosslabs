import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrief, dayQualityFor } from '../../lib/council/brief';
import { detectTriggers } from '../../lib/council/triggers';
import type { VerdictResult, PriorsRow } from '../../lib/council/types';

// Fixture helpers copied from tests/council/verdict-engine.test.ts's style
// (kept local on purpose — tests do not import across test files).
function verdict(over: Partial<VerdictResult> = {}): VerdictResult {
  return {
    adId: 'a1', adName: 'Ads 14_24hrs', brand: 'BOSS', date: '2026-08-05',
    verdict: 'WINNING', role: 'PROSPECTOR', daysInTier: 3, changed: false, degraded: false,
    decidingMetrics: {}, headline: 'Prospecting engine at ₱480 CPP. Do not touch.',
    interpretation: 'interp', tierFlipCondition: 'flip',
    ...over,
  };
}
function priors(over: Partial<PriorsRow> = {}): PriorsRow {
  return {
    brand: 'BOSS', dailyCppSigmaPct: 10, medianWinnerLifespanDays: 20,
    cppDriftPctPerWeek: 0, weekdayMultipliers: {}, sampleDays: 30,
    ...over,
  };
}

const BASE_ARGS = {
  brand: 'BOSS' as const,
  dateManila: '2026-08-05',
  yesterday: { spendCentavos: 550000, purchases: 10 }, // CPP ₱550
  avg7Cpp: 50000, // ₱500
  dayQuality: 'NORMAL' as const,
  verdicts: [verdict()],
  cohort: { buyers: 12, showUpPct: 92, applications: 3 },
  chairNote: "Nick's batch is earning spend; hold the course.",
  nextLine: "Nick's batch day 4/7, earning 12% spend, on track.",
};

/* --------------------------------------------------------------------- */
/* buildBrief                                                            */
/* --------------------------------------------------------------------- */


test('header + yesterday block: money in plain terms, marked rough', () => {
  const out = buildBrief(BASE_ARGS);
  assert.match(out, /ADS REVIEW — 2026-08-05/);
  assert.match(out, /Spent ₱5,500/);
  assert.match(out, /10 buyers/);
  assert.match(out, /₱550 each/);
  assert.match(out, /pricier than your usual/); // ₱550 vs ₱500 avg = 10% pricier
  assert.match(out, /treat as rough/i);
});

test('yesterday cheaper-than-usual reads as cheaper, never a bare arrow', () => {
  const out = buildBrief({ ...BASE_ARGS, yesterday: { spendCentavos: 400000, purchases: 10 }, avg7Cpp: 50000 });
  assert.match(out, /20% cheaper than your usual/);
  assert.doesNotMatch(out, /▲|▼/);
});

test('roster line uses plain tier words', () => {
  const out = buildBrief({
    ...BASE_ARGS,
    verdicts: [
      verdict({ verdict: 'WINNING' }), verdict({ verdict: 'WATCH' }),
      verdict({ verdict: 'LOSER' }), verdict({ verdict: 'LEARNING' }),
    ],
  });
  assert.match(out, /1 winning · 🟡 1 to watch · 🔴 1 to cut · 🌱 1 still learning/);
});

test('movers are plain language built from metrics, not the doctrine headline', () => {
  const watch = verdict({
    verdict: 'WATCH', changed: true, adName: 'Ads 21_Video_Test',
    decidingMetrics: { cpp_delta_pct: 55 },
    headline: 'CPP +55% this week. LOSER if the trend holds; one signal alone isn\'t actionable.',
  });
  const out = buildBrief({ ...BASE_ARGS, verdicts: [watch] });
  assert.match(out, /Ads 21 Video Test — cost per buyer up 55% this week\. Watch, no move yet\./);
  // none of the internal jargon leaks
  assert.doesNotMatch(out, /LOSER if the trend holds/);
  assert.doesNotMatch(out, /Andromeda|prospecting engine|CPP/i);
  assert.doesNotMatch(out, /→ WATCH:/);
});

test('winning mover with null CPP never prints "— CPP"', () => {
  const win = verdict({ verdict: 'WINNING', changed: true, adName: 'Ads 9_App', decidingMetrics: {} });
  const out = buildBrief({ ...BASE_ARGS, verdicts: [win] });
  assert.match(out, /Ads 9 App — now a winner\. Leave it running\./);
  assert.doesNotMatch(out, /— CPP/);
});

test('no movers → friendly "nothing changed" line', () => {
  const out = buildBrief({ ...BASE_ARGS, verdicts: [verdict({ changed: false })] });
  assert.match(out, /every ad held its spot/);
});

test('over 6 movers shows 6 + "and N more"', () => {
  const movers = Array.from({ length: 8 }, (_, i) =>
    verdict({ adId: `a${i}`, verdict: 'WATCH', changed: true, decidingMetrics: { cpp_delta_pct: 12 } }));
  const out = buildBrief({ ...BASE_ARGS, verdicts: movers });
  assert.match(out, /…and 2 more — full list in the app\./);
});

test('action: strips (ad_id …) noise + doctrine tail, keeps the instruction', () => {
  const out = buildBrief({
    ...BASE_ARGS,
    chairNote: 'Kill Ads 36_FINALCALL 4 (ad_id 120251450836640236) only — its multi-day frequency climb plus CPP +47.6% is the full §7.6 fatigue definition.',
  });
  assert.match(out, /Do this today/);
  assert.match(out, /Kill Ads 36 FINALCALL 4 only\./);
  assert.doesNotMatch(out, /ad_id/);
  assert.doesNotMatch(out, /§7\.6|fatigue definition|CPP \+/);
});

test('action: no session convened → nothing-to-do message', () => {
  const out = buildBrief({ ...BASE_ARGS, chairNote: 'Council not convened — no triggers.' });
  assert.match(out, /Nothing needs touching/);
});

test('week line shows buyers only, no show-up/applications jargon', () => {
  const out = buildBrief(BASE_ARGS);
  assert.match(out, /This week:.*12 new buyers/);
  assert.doesNotMatch(out, /show-up|applications/);
});

test('escapes HTML-significant characters in ad names', () => {
  const out = buildBrief({
    ...BASE_ARGS,
    verdicts: [verdict({ changed: true, verdict: 'WATCH', adName: 'A<b>&Test', decidingMetrics: { cpp_delta_pct: 12 } })],
  });
  assert.match(out, /A&lt;b&gt;&amp;Test/);
  assert.doesNotMatch(out, /<b>&Test/);
});

test('yesterday=null renders a waiting message, never crashes', () => {
  const out = buildBrief({ ...BASE_ARGS, yesterday: null, avg7Cpp: null, dayQuality: 'NO DATA' });
  assert.match(out, /Still waiting on the numbers/);
});

test('embedded newlines in chairNote never break the layout', () => {
  const out = buildBrief({ ...BASE_ARGS, chairNote: 'Turn off ad X\nline2\nline3' });
  assert.match(out, /Turn off ad X/);
});


/* --------------------------------------------------------------------- */
/* dayQualityFor                                                         */
/* --------------------------------------------------------------------- */

test('dayQualityFor: NORMAL inside 1 sigma', () => {
  // deviation = |55000-50000|/50000*100 = 10% <= sigma 15%
  assert.equal(dayQualityFor(55000, 50000, priors({ dailyCppSigmaPct: 15 })), 'NORMAL');
});

test('dayQualityFor: SOFT DAY beyond 1 sigma on the worse side (higher CPP)', () => {
  // deviation = 6000/50000*100 = 12% -> >10% (1σ), <=20% (2σ)
  assert.equal(dayQualityFor(56000, 50000, priors({ dailyCppSigmaPct: 10 })), 'SOFT DAY');
});

test('dayQualityFor: RED FLAG beyond 2 sigma on the worse side', () => {
  // deviation = 15000/50000*100 = 30% -> >20% (2σ)
  assert.equal(dayQualityFor(65000, 50000, priors({ dailyCppSigmaPct: 10 })), 'RED FLAG');
});

test('dayQualityFor: GOOD DAY beyond 1 sigma on the better side (yCpp lower), uncapped past 2σ', () => {
  assert.equal(dayQualityFor(44000, 50000, priors({ dailyCppSigmaPct: 10 })), 'GOOD DAY'); // 12%
  assert.equal(dayQualityFor(25000, 50000, priors({ dailyCppSigmaPct: 10 })), 'GOOD DAY'); // 50%, still GOOD DAY
});

test('dayQualityFor: NO DATA whenever an input is null', () => {
  assert.equal(dayQualityFor(null, 50000, priors()), 'NO DATA');
  assert.equal(dayQualityFor(50000, null, priors()), 'NO DATA');
  assert.equal(dayQualityFor(null, null, null), 'NO DATA');
  assert.equal(dayQualityFor(50000, 0, priors()), 'NO DATA'); // guards divide-by-zero
});

test('dayQualityFor: fallback fixed band (40/80) when priors is null — no sigma yet', () => {
  assert.equal(dayQualityFor(68000, 50000, null), 'NORMAL');   // 36% < 40%
  assert.equal(dayQualityFor(75000, 50000, null), 'SOFT DAY'); // 50%, in [40,80)
  assert.equal(dayQualityFor(95000, 50000, null), 'RED FLAG'); // 90% >= 80%
  assert.equal(dayQualityFor(25000, 50000, null), 'GOOD DAY'); // 50%, better side
});

test('dayQualityFor: fallback also applies when priors exists but dailyCppSigmaPct is null', () => {
  assert.equal(dayQualityFor(75000, 50000, priors({ dailyCppSigmaPct: null })), 'SOFT DAY');
});

/* --------------------------------------------------------------------- */
/* detectTriggers                                                        */
/* --------------------------------------------------------------------- */

const QUIET = {
  todayVerdicts: [] as VerdictResult[],
  blendedCppByDay: [] as { date: string; cpp: number | null }[],
  targetCppCentavos: 50000,
  missResolvedToday: false, windowClosedToday: false, isMondayManila: false,
};

test('detectTriggers: loser-flip fires for each LOSER ad that changed today', () => {
  const v1 = verdict({ adId: 'a1', adName: 'Ads 14_24hrs', verdict: 'LOSER', changed: true });
  const v2 = verdict({ adId: 'a2', adName: 'Ads 8_Graphics', verdict: 'WINNING', changed: true });
  const reasons = detectTriggers({ ...QUIET, todayVerdicts: [v1, v2] });
  assert.deepEqual(reasons, ['loser-flip: Ads 14_24hrs']);
});

test('detectTriggers: LOSER without changed does not trigger loser-flip', () => {
  const v = verdict({ verdict: 'LOSER', changed: false });
  const reasons = detectTriggers({ ...QUIET, todayVerdicts: [v] });
  assert.deepEqual(reasons, []);
});

test('detectTriggers: watch-flips fires when >=2 ads flip to WATCH same day', () => {
  const v1 = verdict({ adId: 'a1', verdict: 'WATCH', changed: true });
  const v2 = verdict({ adId: 'a2', verdict: 'WATCH', changed: true });
  const reasons = detectTriggers({ ...QUIET, todayVerdicts: [v1, v2] });
  assert.deepEqual(reasons, ['watch-flips: 2 same day']);
});

test('detectTriggers: a single WATCH flip alone does not trigger watch-flips', () => {
  const v1 = verdict({ verdict: 'WATCH', changed: true });
  const reasons = detectTriggers({ ...QUIET, todayVerdicts: [v1] });
  assert.deepEqual(reasons, []);
});

test('detectTriggers: cpp-breach fires when the last 3 settled days are all over target', () => {
  const reasons = detectTriggers({
    ...QUIET,
    blendedCppByDay: [
      { date: '2026-08-03', cpp: 60000 },
      { date: '2026-08-04', cpp: 55000 },
      { date: '2026-08-05', cpp: 58000 },
    ],
  });
  assert.deepEqual(reasons, ['cpp-breach: 3 days over target']);
});

test('detectTriggers: cpp-breach does not fire when one of the last 3 days is at/under target', () => {
  const reasons = detectTriggers({
    ...QUIET,
    blendedCppByDay: [
      { date: '2026-08-03', cpp: 60000 },
      { date: '2026-08-04', cpp: 45000 },
      { date: '2026-08-05', cpp: 58000 },
    ],
  });
  assert.deepEqual(reasons, []);
});

test('detectTriggers: cpp-breach does not fire when one of the last 3 days is null', () => {
  const reasons = detectTriggers({
    ...QUIET,
    blendedCppByDay: [
      { date: '2026-08-03', cpp: null },
      { date: '2026-08-04', cpp: 55000 },
      { date: '2026-08-05', cpp: 58000 },
    ],
  });
  assert.deepEqual(reasons, []);
});

test('detectTriggers: prediction-miss resolved fires on missResolvedToday', () => {
  const reasons = detectTriggers({ ...QUIET, missResolvedToday: true });
  assert.deepEqual(reasons, ['prediction-miss resolved']);
});

test('detectTriggers: action-window closed fires on windowClosedToday', () => {
  const reasons = detectTriggers({ ...QUIET, windowClosedToday: true });
  assert.deepEqual(reasons, ['action-window closed']);
});

test('detectTriggers: monday session fires on isMondayManila', () => {
  const reasons = detectTriggers({ ...QUIET, isMondayManila: true });
  assert.deepEqual(reasons, ['monday session']);
});

test('detectTriggers: returns empty array when nothing fires (council not convened)', () => {
  const v = verdict({ verdict: 'WINNING', changed: false });
  const reasons = detectTriggers({
    ...QUIET,
    todayVerdicts: [v],
    blendedCppByDay: [{ date: '2026-08-05', cpp: 40000 }],
  });
  assert.deepEqual(reasons, []);
});

test('detectTriggers: multiple simultaneous triggers all appear, in doctrine order', () => {
  const v1 = verdict({ adId: 'a1', adName: 'Ads A', verdict: 'LOSER', changed: true });
  const v2 = verdict({ adId: 'a2', verdict: 'WATCH', changed: true });
  const v3 = verdict({ adId: 'a3', verdict: 'WATCH', changed: true });
  const reasons = detectTriggers({
    todayVerdicts: [v1, v2, v3],
    blendedCppByDay: [
      { date: '2026-08-03', cpp: 60000 },
      { date: '2026-08-04', cpp: 55000 },
      { date: '2026-08-05', cpp: 58000 },
    ],
    targetCppCentavos: 50000,
    missResolvedToday: true, windowClosedToday: true, isMondayManila: true,
  });
  assert.deepEqual(reasons, [
    'loser-flip: Ads A',
    'watch-flips: 2 same day',
    'cpp-breach: 3 days over target',
    'prediction-miss resolved',
    'action-window closed',
    'monday session',
  ]);
});


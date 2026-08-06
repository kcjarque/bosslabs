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

test('brief renders <=12 lines and marks yesterday preliminary', () => {
  const out = buildBrief(BASE_ARGS);
  const lines = out.split('\n');
  assert.ok(lines.length <= 12, `expected <=12 lines, got ${lines.length}`);
  assert.match(out, /preliminary/);
});

test('header line names the brand and date exactly per doctrine §5.3', () => {
  const out = buildBrief(BASE_ARGS);
  assert.equal(out.split('\n')[0], '=== BOSS DAILY BRIEF — 2026-08-05 ===');
});

test('MOVERS lists only changed-tier ads, each with verdict and headline', () => {
  const stable = verdict({ adId: 'a1', adName: 'Ads Stable', changed: false });
  const flipped = verdict({
    adId: 'a2', adName: 'Ads Flip', verdict: 'WATCH', changed: true,
    headline: 'CPP +14% this week.',
  });
  const out = buildBrief({ ...BASE_ARGS, verdicts: [stable, flipped] });
  assert.match(out, /↳ Ads Flip → WATCH: CPP \+14% this week\./);
  assert.doesNotMatch(out, /Ads Stable/);
});

test('MOVERS falls back to "No tier changes — roster stable." when nothing changed', () => {
  const out = buildBrief({ ...BASE_ARGS, verdicts: [verdict({ changed: false })] });
  assert.match(out, /No tier changes — roster stable\./);
});

test('ROSTER counts every tier across the full verdicts array', () => {
  const out = buildBrief({
    ...BASE_ARGS,
    verdicts: [
      verdict({ adId: 'a1', verdict: 'WINNING' }),
      verdict({ adId: 'a2', verdict: 'WATCH' }),
      verdict({ adId: 'a3', verdict: 'WATCH' }),
      verdict({ adId: 'a4', verdict: 'LOSER' }),
      verdict({ adId: 'a5', verdict: 'LEARNING' }),
    ],
  });
  assert.match(out, /ROSTER: 🟢 1 Winning · 🟡 2 Watch · 🔴 1 Loser · 🔵 1 Learning/);
});

test('COHORT reports "no attendance data" when showUpPct is null', () => {
  const out = buildBrief({ ...BASE_ARGS, cohort: { buyers: 5, showUpPct: null, applications: 1 } });
  assert.match(out, /no attendance data/);
});

test('COHORT still renders buyers/applications when showUpPct is present', () => {
  const out = buildBrief(BASE_ARGS);
  assert.match(out, /COHORT: 12 buyers this week · 92% show-up · 3 applications/);
});

test('escapes HTML-significant characters in dynamic values (Telegram HTML parse mode)', () => {
  const flipped = verdict({
    adId: 'a2', adName: 'Ads A&B <test>', verdict: 'WATCH', changed: true,
    headline: 'CPP > target & rising',
  });
  const out = buildBrief({
    ...BASE_ARGS, verdicts: [flipped],
    chairNote: 'Spend & scale <carefully>',
    nextLine: 'Hold < 5 days & watch',
  });
  assert.doesNotMatch(out, /Ads A&B <test>/);
  assert.match(out, /Ads A&amp;B &lt;test&gt;/);
  assert.match(out, /CPP &gt; target &amp; rising/);
  assert.match(out, /Spend &amp; scale &lt;carefully&gt;/);
  assert.match(out, /Hold &lt; 5 days &amp; watch/);
});

test('yesterday=null and avg7Cpp=null render "—" instead of crashing', () => {
  const out = buildBrief({ ...BASE_ARGS, yesterday: null, avg7Cpp: null, dayQuality: 'NO DATA' });
  assert.match(out, /—/);
  assert.match(out, /preliminary/);
  assert.match(out, /NO DATA/);
});

test('MOVERS at exactly 5 (the un-truncated budget) shows every mover, no "+more" line', () => {
  const movers = ['a1', 'a2', 'a3', 'a4', 'a5'].map((id) =>
    verdict({ adId: id, adName: `Ads ${id}`, verdict: 'WATCH', changed: true }));
  const out = buildBrief({ ...BASE_ARGS, verdicts: movers });
  const lines = out.split('\n');
  assert.equal(lines.length, 12);
  assert.doesNotMatch(out, /more flipped/);
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) assert.match(out, new RegExp(`Ads ${id}`));
});

test('MOVERS at 6 (one over budget) truncates to 4 shown + "+2 more flipped"', () => {
  const movers = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((id) =>
    verdict({ adId: id, adName: `Ads ${id}`, verdict: 'WATCH', changed: true }));
  const out = buildBrief({ ...BASE_ARGS, verdicts: movers });
  const lines = out.split('\n');
  assert.equal(lines.length, 12);
  assert.match(out, /↳ \+2 more flipped — see \/admin\/ads/);
});

test('MOVERS at 8 truncates to exactly 12 lines, last mover line is "+4 more flipped", most severe shown', () => {
  const movers = [
    verdict({ adId: 'l1', adName: 'Loser A', verdict: 'LOSER', changed: true }),
    verdict({ adId: 'l2', adName: 'Loser B', verdict: 'LOSER', changed: true }),
    verdict({ adId: 'w1', adName: 'Watch A', verdict: 'WATCH', changed: true }),
    verdict({ adId: 'w2', adName: 'Watch B', verdict: 'WATCH', changed: true }),
    verdict({ adId: 'g1', adName: 'Winning A', verdict: 'WINNING', changed: true }),
    verdict({ adId: 'g2', adName: 'Winning B', verdict: 'WINNING', changed: true }),
    verdict({ adId: 'r1', adName: 'Learning A', verdict: 'LEARNING', changed: true }),
    verdict({ adId: 'r2', adName: 'Learning B', verdict: 'LEARNING', changed: true }),
  ];
  // Shuffle input order on purpose — output order must come from severity,
  // not from array position.
  const shuffled = [movers[6], movers[2], movers[0], movers[5], movers[7], movers[1], movers[4], movers[3]];
  const out = buildBrief({ ...BASE_ARGS, verdicts: shuffled });
  const lines = out.split('\n');
  assert.equal(lines.length, 12);
  assert.equal(lines[8], '  ↳ +4 more flipped — see /admin/ads');
  assert.equal(lines[9], 'COHORT: 12 buyers this week · 92% show-up · 3 applications');
  // Most severe (both LOSERs, both WATCHes) are shown...
  assert.match(out, /Loser A/); assert.match(out, /Loser B/);
  assert.match(out, /Watch A/); assert.match(out, /Watch B/);
  // ...least severe (WINNING, LEARNING) are folded into the "+4 more" line, not named.
  assert.doesNotMatch(out, /Winning A/); assert.doesNotMatch(out, /Winning B/);
  assert.doesNotMatch(out, /Learning A/); assert.doesNotMatch(out, /Learning B/);
});

test('chairNote/nextLine collapse embedded newlines to a single space before escaping', () => {
  const out = buildBrief({ ...BASE_ARGS, chairNote: 'line1\nline2', nextLine: 'next1\r\nnext2' });
  const lines = out.split('\n');
  assert.equal(lines.find((l) => l.startsWith("CHAIR'S NOTE:")), "CHAIR'S NOTE: line1 line2");
  assert.equal(lines.find((l) => l.startsWith('NEXT:')), 'NEXT: next1 next2');
});

test('a run of consecutive newlines in chairNote collapses to exactly one space, not one per newline', () => {
  const out = buildBrief({ ...BASE_ARGS, chairNote: 'para1\n\n\npara2' });
  const lines = out.split('\n');
  assert.equal(lines.find((l) => l.startsWith("CHAIR'S NOTE:")), "CHAIR'S NOTE: para1 para2");
});

test('embedded newlines in chairNote/nextLine never inflate the total line count', () => {
  const out = buildBrief({ ...BASE_ARGS, chairNote: 'l1\nl2\nl3\nl4', nextLine: 'n1\nn2\nn3' });
  assert.equal(out.split('\n').length, 7); // BASE_ARGS has 0 movers -> 7 fixed lines, unchanged
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

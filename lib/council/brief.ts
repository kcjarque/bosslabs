/** Ads Council daily brief — doctrine §5.3, pure + deterministic. Renders the
 *  00:02 Manila bird's-eye brief (≤12 lines) from already-computed inputs.
 *  `dayQualityFor` is exported separately so the pipeline can run it against
 *  the account's priors and pass the result in — buildBrief itself takes no
 *  priors argument and never judges data it wasn't handed.
 *  Telegram HTML parse mode: dynamic/free-text values (ad names, headlines,
 *  chair's note, next line) are escaped; static template glyphs (₱ ▲ ▼ · →)
 *  never contain < > & so they're left alone. */
import type { Brand, PriorsRow, Tier, VerdictResult } from './types';

export type DayQuality = 'GOOD DAY' | 'NORMAL' | 'SOFT DAY' | 'RED FLAG' | 'NO DATA';

const peso = (c: number) => `₱${Math.round(c / 100).toLocaleString()}`;

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** doctrine §5.3: "a day is only SOFT/RED FLAG if it exceeds the account's
 *  historical daily variance — no crying wolf over normal noise." Before the
 *  account has a real sigma (< 14 sampled days, §4.1), a fixed 40%/80% band
 *  stands in; the sigma path supersedes it once priors exist. GOOD DAY (yCpp
 *  lower = cheaper) has no more-extreme tier beyond it in either path — a
 *  day 90% cheaper than average is still just GOOD DAY, not "great day". */
export function dayQualityFor(
  yCpp: number | null,
  avg7Cpp: number | null,
  priors: PriorsRow | null,
): DayQuality {
  if (yCpp == null || avg7Cpp == null || avg7Cpp === 0) return 'NO DATA';
  const deviation = (Math.abs(yCpp - avg7Cpp) / avg7Cpp) * 100;
  const worse = yCpp > avg7Cpp; // higher CPP = worse (costs more per buyer)

  const sigma = priors?.dailyCppSigmaPct ?? null;
  if (sigma == null) {
    if (deviation < 40) return 'NORMAL';
    if (!worse) return 'GOOD DAY';
    return deviation >= 80 ? 'RED FLAG' : 'SOFT DAY';
  }
  if (deviation <= sigma) return 'NORMAL';
  if (!worse) return 'GOOD DAY';
  return deviation > 2 * sigma ? 'RED FLAG' : 'SOFT DAY';
}

function tierCounts(verdicts: VerdictResult[]): Record<Tier, number> {
  const counts: Record<Tier, number> = { WINNING: 0, WATCH: 0, LOSER: 0, LEARNING: 0 };
  for (const v of verdicts) counts[v.verdict]++;
  return counts;
}

export function buildBrief(args: {
  brand: Brand; dateManila: string;
  yesterday: { spendCentavos: number; purchases: number } | null;
  avg7Cpp: number | null;
  dayQuality: DayQuality;
  verdicts: VerdictResult[];
  cohort: { buyers: number; showUpPct: number | null; applications: number } | null;
  chairNote: string; nextLine: string;
}): string {
  const { brand, dateManila, yesterday, avg7Cpp, dayQuality, verdicts, cohort, chairNote, nextLine } = args;

  // Yesterday CPP + its delta vs the 7d average — Meta restates conversions
  // for up to 72h, so this number is always marked preliminary (§5.3 data
  // honesty note), regardless of whether data is even available yet.
  const yCpp = yesterday && yesterday.purchases > 0 ? yesterday.spendCentavos / yesterday.purchases : null;
  const pct = yCpp != null && avg7Cpp != null && avg7Cpp !== 0
    ? ((yCpp - avg7Cpp) / avg7Cpp) * 100 : null;
  const pctText = pct != null ? `${pct >= 0 ? '▲' : '▼'}${Math.round(Math.abs(pct))}%` : '—';
  const spendText = yesterday ? peso(yesterday.spendCentavos) : '—';
  const buyersText = yesterday ? String(yesterday.purchases) : '—';
  const cppText = yCpp != null ? peso(yCpp) : '—';

  const counts = tierCounts(verdicts);
  const movers = verdicts.filter((v) => v.changed);

  const cohortLine = cohort == null
    ? 'COHORT: no cohort data yet'
    : `COHORT: ${cohort.buyers} buyers this week · ` +
      `${cohort.showUpPct != null ? `${Math.round(cohort.showUpPct)}% show-up` : 'no attendance data'} · ` +
      `${cohort.applications} applications`;

  const lines = [
    `=== ${brand} DAILY BRIEF — ${dateManila} ===`,
    `YESTERDAY: ${spendText} → ${buyersText} buyers @ ${cppText} (preliminary)  (${pctText} vs 7d avg) — ${dayQuality}`,
    `ROSTER: 🟢 ${counts.WINNING} Winning · 🟡 ${counts.WATCH} Watch · 🔴 ${counts.LOSER} Loser · 🔵 ${counts.LEARNING} Learning`,
    ...(movers.length === 0
      ? ['MOVERS: No tier changes — roster stable.']
      : ['MOVERS:', ...movers.map((v) => `  ↳ ${escHtml(v.adName)} → ${v.verdict}: ${escHtml(v.headline)}`)]),
    cohortLine,
    `CHAIR'S NOTE: ${escHtml(chairNote)}`,
    `NEXT: ${escHtml(nextLine)}`,
  ];
  return lines.join('\n');
}

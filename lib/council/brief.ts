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

/** Free-text fields (chairNote, nextLine) are one sentence, one line, no
 *  matter what the source (often an LLM) emits — any run of newlines
 *  collapses to a single space, applied before escaping. */
function collapseNewlines(s: string): string {
  return s.replace(/(\r\n|\n|\r)+/g, ' ');
}

/** doctrine §5.3's 12-line ceiling is a hard limit, not a suggestion — the
 *  brief has 6 always-present lines (header, YESTERDAY, ROSTER, COHORT,
 *  CHAIR'S NOTE, NEXT) plus a "MOVERS:" header, leaving 5 lines for mover
 *  rows before the section itself has to start summarizing instead of
 *  listing. Severity order (worst tier first) so truncation always drops
 *  the least urgent movers. */
const MOVER_SEVERITY: Record<Tier, number> = { LOSER: 0, WATCH: 1, WINNING: 2, LEARNING: 3 };
const MOVERS_SHOWN = 6;

/** Meta ad names are underscore-mashed ("Ads 21_Video_MontageTesti"). Make them
 *  readable without losing the number the operator searches by. */
function cleanName(s: string): string {
  return escHtml(s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim());
}

const TIER_DOT: Record<Tier, string> = { WINNING: '🟢', WATCH: '🟡', LOSER: '🔴', LEARNING: '🌱' };

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Plain-language, jargon-free one-liner for a mover — built from the deciding
 *  metrics, NOT the engine's internal doctrine headline (that voice belongs in
 *  the app's deep-dive, not a 15-second phone glance). */
function plainMover(v: VerdictResult): string {
  const name = cleanName(v.adName);
  const dot = TIER_DOT[v.verdict];
  const m = v.decidingMetrics;
  if (v.verdict === 'WINNING') {
    const cpp = num(m.cpp_7d);
    const at = cpp != null ? ` at ${peso(cpp)} per buyer` : '';
    return `${dot} ${name} — now a winner${at}. Leave it running.`;
  }
  if (v.verdict === 'LEARNING') {
    return `${dot} ${name} — just started, still learning. No action.`;
  }
  if (v.verdict === 'LOSER') {
    return `${dot} ${name} — not making sales. On the cut list.`;
  }
  // WATCH — translate the one signal that flipped it into plain words.
  const cppDelta = num(m.cpp_delta_pct);
  const shareDelta = num(m.spend_share_delta);
  if (cppDelta != null && cppDelta >= 10) {
    return `${dot} ${name} — cost per buyer up ${Math.round(cppDelta)}% this week. Watch, no move yet.`;
  }
  if (shareDelta != null && shareDelta <= -0.2) {
    return `${dot} ${name} — Facebook is spending less on it. Watch.`;
  }
  return `${dot} ${name} — an early warning sign. Watch, no move yet.`;
}

/** Turn the Chair's verdict text into one clean instruction. The LLM tends to
 *  cram its jargon justification after an em-dash/colon ("§7.6 fatigue…") — we
 *  keep just the instruction clause when it stands on its own, strip the
 *  "(ad_id 12345…)" noise, and de-underscore ad names. */
function tidyAction(s: string, max = 220): string {
  const t = collapseNewlines(s)
    .replace(/\s*\(ad_id[^)]*\)/gi, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Prefer the instruction head (before the first " — ", " – ", or ": ").
  const head = t.split(/\s+[—–]\s+|:\s+/)[0].trim();
  if (head.length >= 12 && head.length <= 140) return head.replace(/[.;,]+$/, '') + '.';
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '));
  return lastStop > 40 ? cut.slice(0, lastStop + 1) : cut.replace(/\s+\S*$/, '') + '…';
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
  const { dateManila, yesterday, avg7Cpp, dayQuality, verdicts, cohort, chairNote } = args;

  // ── Yesterday, in plain money terms ──────────────────────────────────
  // Meta keeps restating conversions for ~72h, so yesterday is always rough.
  const yCpp = yesterday && yesterday.purchases > 0 ? yesterday.spendCentavos / yesterday.purchases : null;
  const pct = yCpp != null && avg7Cpp != null && avg7Cpp !== 0
    ? ((yCpp - avg7Cpp) / avg7Cpp) * 100 : null;

  let yesterdayBlock: string;
  if (!yesterday || yCpp == null) {
    yesterdayBlock = `💰 <b>Yesterday</b>\nStill waiting on the numbers — check back later today.`;
  } else {
    // Lower cost per buyer = good. Say it in words, never a bare arrow.
    const compare = pct == null ? ''
      : Math.abs(pct) < 3 ? ' — about the same as usual'
      : pct < 0 ? ` — ${Math.round(-pct)}% cheaper than your usual`
      : ` — ${Math.round(pct)}% pricier than your usual`;
    const tag =
      dayQuality === 'GOOD DAY' ? ' 🎉 great day' :
      dayQuality === 'SOFT DAY' ? ' ⚠️ a bit pricey' :
      dayQuality === 'RED FLAG' ? ' 🔴 expensive — worth a look' :
      '';
    yesterdayBlock =
      `💰 <b>Yesterday</b>\n` +
      `Spent ${peso(yesterday.spendCentavos)} · ${yesterday.purchases} buyers · <b>${peso(yCpp)} each</b>.\n` +
      `${compare ? compare.replace(/^ — /, '') : 'A steady day'}${tag}.\n` +
      `<i>(Meta is still finalizing these — treat as rough for ~3 days.)</i>`;
  }

  // ── Roster ───────────────────────────────────────────────────────────
  const c = tierCounts(verdicts);
  const rosterBlock =
    `📋 <b>Your ${verdicts.length} ads right now</b>\n` +
    `🟢 ${c.WINNING} winning · 🟡 ${c.WATCH} to watch · 🔴 ${c.LOSER} to cut · 🌱 ${c.LEARNING} still learning`;

  // ── What changed overnight (plain language, worst first) ─────────────
  const movers = verdicts
    .filter((v) => v.changed)
    .sort((a, b) => MOVER_SEVERITY[a.verdict] - MOVER_SEVERITY[b.verdict]);
  let moversBlock: string;
  if (movers.length === 0) {
    moversBlock = `🔀 <b>What changed overnight</b>\nNothing — every ad held its spot.`;
  } else {
    const shown = movers.slice(0, MOVERS_SHOWN).map(plainMover);
    if (movers.length > MOVERS_SHOWN) shown.push(`…and ${movers.length - MOVERS_SHOWN} more — full list in the app.`);
    moversBlock = `🔀 <b>What changed overnight</b>\n${shown.join('\n')}`;
  }

  // ── The one action ───────────────────────────────────────────────────
  const convened = chairNote && !/^council not convened/i.test(chairNote);
  const actionBlock = convened
    ? `🎯 <b>Do this today</b>\n${escHtml(tidyAction(chairNote))}`
    : `🎯 <b>Do this today</b>\nNothing needs touching — your ads are running fine.`;

  // ── This week ────────────────────────────────────────────────────────
  const weekBlock = cohort ? `📈 <b>This week:</b> ${cohort.buyers} new buyers so far.` : null;

  return [
    `📊 <b>ADS REVIEW — ${dateManila}</b>`,
    yesterdayBlock,
    rosterBlock,
    moversBlock,
    actionBlock,
    weekBlock,
  ].filter(Boolean).join('\n\n');
}

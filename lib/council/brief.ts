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

/** Prince's DAILY pulse — a deterministic heartbeat (no LLM, ₱0). Its job is
 *  to reassure ("all steady, nothing to touch") 6 days out of 7 and only raise
 *  a flag when the circuit-breaker trips (`fires` = ads bleeding money with no
 *  sales). The deep thinking is the weekly Run Analysis + on-demand /prince —
 *  the daily deliberately gives NO action list, so it can't push over-management. */
export function buildPulse(args: {
  dateManila: string;
  yesterday: { spendCentavos: number; purchases: number; revenueCentavos: number } | null;
  avg7Cpp: number | null;
  dayQuality: DayQuality;
  verdicts: VerdictResult[];
  fires: string[]; // pre-formatted "'Ad' spent ₱X with 0 sales" lines
}): string {
  const { dateManila, yesterday, avg7Cpp, dayQuality, verdicts, fires } = args;
  const yCpp = yesterday && yesterday.purchases > 0 ? yesterday.spendCentavos / yesterday.purchases : null;
  const yRoas = yesterday && yesterday.spendCentavos > 0 ? yesterday.revenueCentavos / yesterday.spendCentavos : null;
  const pct = yCpp != null && avg7Cpp != null && avg7Cpp !== 0 ? ((yCpp - avg7Cpp) / avg7Cpp) * 100 : null;

  const prettyDate = (() => {
    const d = new Date(`${dateManila}T00:00:00Z`);
    return isNaN(d.getTime())
      ? dateManila
      : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  })();

  // ── Yesterday block ──────────────────────────────────────────────────
  let yesterdayBlock: string;
  if (!yesterday || yCpp == null) {
    yesterdayBlock = `💰 <b>Yesterday</b>\nNumbers still settling — check back later.`;
  } else {
    const compare = pct == null ? ''
      : Math.abs(pct) < 8 ? ' · about usual'
      : pct < 0 ? ` · <b>${Math.round(-pct)}% cheaper</b> than usual`
      : ` · ${Math.round(pct)}% pricier than usual`;
    const roasSuffix = yRoas != null ? ` · <b>${yRoas.toFixed(2)}x</b> ROAS` : '';
    yesterdayBlock =
      `💰 <b>Yesterday</b>\n` +
      `${peso(yesterday.spendCentavos)} spent → ${yesterday.purchases} buyers\n` +
      `<b>${peso(yCpp)}</b> per buyer${compare}${roasSuffix}`;
  }

  // ── Ad-health block (2×2, easier to scan than one dense row) ──────────
  const c = tierCounts(verdicts);
  const healthBlock =
    `📊 <b>Ad health</b>\n` +
    `🟢 ${c.WINNING} winning · 🟡 ${c.WATCH} to watch\n` +
    `🔴 ${c.LOSER} to cut · 🌱 ${c.LEARNING} learning`;

  // ── Status / circuit-breaker ─────────────────────────────────────────
  const statusBlock = fires.length > 0
    ? `🔥 <b>Worth a look</b>\n${fires.map((f) => `• ${escHtml(f)}`).join('\n')}`
    : dayQuality === 'RED FLAG'
      ? `🟠 <b>A bit pricey</b> yesterday — not urgent; Sunday’s analysis will dig in.`
      : `✅ <b>All steady</b> — nothing to touch today.`;

  // Blank lines between blocks = breathing room (fixes the cramped look).
  return [
    `🤴 <b>Prince’s Pulse</b>\n<i>${prettyDate}</i>`,
    yesterdayBlock,
    healthBlock,
    statusBlock,
    `<i>Deep dive Sunday 10am · ask me anything with /prince</i>`,
  ].join('\n\n');
}

/** The v2 staged council's analysis, extracted from the persisted
 *  `council_sessions.verdict` JSONB for the weekly brief (spec §9 "render the
 *  5-stage output"). `null` from `stagedBriefFromVerdict` means a legacy
 *  (pre-v2) session with no staged fields — buildBrief falls back to the old
 *  plan/ideas render. */
export type StagedBrief = {
  degraded: boolean; degradedReason: string;
  action: string; synthesis: string;
  northStar: {
    currentDailyNetCentavos: number; netGapCentavos: number; targetNetSpendCentavos: number;
    dailyNetTargetCentavos: number; configured: boolean;
  } | null;
  problems: Array<{ type: string; headline: string; description: string; pesoImpact: number; confidence: string; evidence: string }>;
  solutions: Array<{ headline: string; fix: string }>;
  watchlist: Array<{ item: string }>;
};

/** Reads a persisted `verdict` JSONB into a StagedBrief, or returns `null`
 *  when the row predates v2 (no `synthesis`, `problems`, `watchlist`, or
 *  `degraded` flag). Fully defensive — every field is type-checked, so a
 *  malformed/partial verdict degrades to empty arrays rather than throwing. */
export function stagedBriefFromVerdict(verdict: unknown): StagedBrief | null {
  if (typeof verdict !== 'object' || verdict === null) return null;
  const v = verdict as Record<string, unknown>;
  const synthesis = typeof v.synthesis === 'string' ? v.synthesis : '';
  const degraded = v.degraded === true;
  const problemsRaw = Array.isArray(v.problems) ? v.problems : [];
  const solutionsRaw = Array.isArray(v.solutions) ? v.solutions : [];
  const watchlistRaw = Array.isArray(v.watchlist) ? v.watchlist : [];
  // Legacy (pre-v2) rows carry none of these — signal "no staged verdict".
  if (!degraded && synthesis === '' && problemsRaw.length === 0 && watchlistRaw.length === 0) return null;

  const problems = problemsRaw
    .map((p) => {
      const o = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
      const ev = (typeof o.evidence === 'object' && o.evidence !== null ? o.evidence : {}) as Record<string, unknown>;
      return {
        type: typeof o.type === 'string' ? o.type : '',
        headline: typeof o.headline === 'string' ? o.headline : '',
        description: typeof o.description === 'string' ? o.description : '',
        pesoImpact: typeof o.pesoImpact === 'number' ? o.pesoImpact : 0,
        confidence: typeof ev.confidence === 'string' ? ev.confidence : '',
        evidence: typeof ev.text === 'string' ? ev.text : '',
      };
    })
    .filter((p) => p.headline || p.description);

  const solutions = solutionsRaw
    .map((s) => {
      const o = (typeof s === 'object' && s !== null ? s : {}) as Record<string, unknown>;
      return {
        headline: typeof o.headline === 'string' ? o.headline : '',
        fix: typeof o.fix === 'string' ? o.fix : '',
      };
    })
    .filter((s) => s.fix || s.headline);

  const watchlist = watchlistRaw
    .map((w) => {
      const o = (typeof w === 'object' && w !== null ? w : {}) as Record<string, unknown>;
      return { item: typeof o.item === 'string' ? o.item : '' };
    })
    .filter((w) => w.item);

  const nsRaw = (typeof v.northStar === 'object' && v.northStar !== null ? v.northStar : null) as Record<string, unknown> | null;
  const northStar = nsRaw
    ? {
        currentDailyNetCentavos: typeof nsRaw.currentDailyNetCentavos === 'number' ? nsRaw.currentDailyNetCentavos : 0,
        netGapCentavos: typeof nsRaw.netGapCentavos === 'number' ? nsRaw.netGapCentavos : 0,
        targetNetSpendCentavos: typeof nsRaw.targetNetSpendCentavos === 'number' ? nsRaw.targetNetSpendCentavos : 0,
        dailyNetTargetCentavos: typeof nsRaw.dailyNetTargetCentavos === 'number' ? nsRaw.dailyNetTargetCentavos : 0,
        configured: nsRaw.configured === true,
      }
    : null;

  return {
    degraded,
    degradedReason: typeof v.degradedReason === 'string' ? v.degradedReason : '',
    action: typeof v.action === 'string' ? v.action : '',
    synthesis, northStar, problems, solutions, watchlist,
  };
}

/** Truncate to `n` chars with an ellipsis, cutting at a WORD boundary so it
 *  never ends mid-word ("sitting well u…"). Keeps the briefing tight (§5a). */
function trimTo(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > n * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

/** Money for the owner's eye — round to ₱k above 1,000 (₱135,000 → ₱135k). */
function pesoK(n: number): string {
  const v = Math.round(n);
  return v >= 1000 ? `₱${Math.round(v / 1000).toLocaleString()}k` : `₱${v.toLocaleString()}`;
}

/** §5a section 1 — decision first: the one-line action headline + the short
 *  synthesis paragraph under it (skipped if it merely repeats the action). */
function bottomLineBlock(s: StagedBrief): string {
  const action = collapseNewlines(s.action).trim();
  const synth = trimTo(collapseNewlines(s.synthesis), 400);
  const lines = ['🧭 <b>Bottom line</b>'];
  if (action) lines.push(`<b>${escHtml(action)}</b>`);
  if (synth && synth !== action) lines.push(escHtml(synth));
  return lines.join('\n');
}

/** §3h section 2 — the profit north star: current daily net, the gap to the
 *  target, and the spend that closes it. Rendered only when economics is
 *  configured (else there is no anchor to frame against). */
function northStarBlock(ns: StagedBrief['northStar']): string | null {
  if (!ns || !ns.configured || ns.dailyNetTargetCentavos <= 0) return null;
  // A losing week reads "losing ₱X/day", never a bare "₱-5,000/day".
  const now = ns.currentDailyNetCentavos < 0
    ? `<b>losing ${peso(-ns.currentDailyNetCentavos)}/day</b>`
    : `${peso(ns.currentDailyNetCentavos)}/day net`;
  const target = peso(ns.dailyNetTargetCentavos);
  if (ns.netGapCentavos > 0) {
    const move = ns.targetNetSpendCentavos > 0
      ? ` — reach it at ~${peso(ns.targetNetSpendCentavos)}/day spend on the 2×+ winners`
      : '';
    return `🎯 <b>Toward ${target}/day net</b>\nNow ${now} · <b>${peso(ns.netGapCentavos)} short</b>${move}.`;
  }
  return `🎯 <b>Toward ${target}/day net</b>\nNow ${now} — <b>at or above target</b>. Protect the winners.`;
}

/** §5a section 3 — above-floor problems ranked by peso impact (the persisted
 *  list is already above-floor; below-floor items live in watchlist). Each:
 *  type, one-line diagnosis, the driving numbers, DIRECTIONAL flagged. */
function problemsBlock(problems: StagedBrief['problems']): string | null {
  if (problems.length === 0) return null;
  const sorted = [...problems].sort((a, b) => b.pesoImpact - a.pesoImpact);
  const rows = sorted.slice(0, 4).map((p, i) => {
    // Bold plain headline → one plain "so what" line → clean money line. The
    // raw evidence.text (variable names / ad IDs) is deliberately NOT shown —
    // it stays in the DB for the app. Old rows without a headline fall back to
    // the description as the headline.
    const headline = collapseNewlines(p.headline || p.description);
    const lines = [`<b>${i + 1}. ${escHtml(headline)}</b>`];
    if (p.headline && p.description && p.description.trim() !== p.headline.trim()) {
      lines.push(escHtml(collapseNewlines(p.description)));
    }
    const tags: string[] = [];
    if (p.pesoImpact > 0) tags.push(`≈ ${pesoK(p.pesoImpact)}/week at stake`);
    if (p.confidence === 'DIRECTIONAL') tags.push('early read');
    if (tags.length) lines.push(`<i>${tags.join(' · ')}</i>`);
    return lines.join('\n');
  });
  const more = sorted.length > 4 ? `\n\n…and ${sorted.length - 4} more in the app.` : '';
  return `🚨 <b>What’s costing you</b>\n\n${rows.join('\n\n')}${more}`;
}

/** §5a section 4 — the executable fixes (earn-more / spend-less), one per
 *  confirmed problem. */
function solutionsBlock(solutions: StagedBrief['solutions']): string | null {
  if (solutions.length === 0) return null;
  // Same corporate rhythm as problems: bold action headline → one plain how/why
  // line. Old rows (fix only, no headline) fall back to the fix as the headline.
  const rows = solutions.slice(0, 5).map((s, i) => {
    const headline = collapseNewlines(s.headline || s.fix);
    const lines = [`<b>${i + 1}. ${escHtml(headline)}</b>`];
    if (s.headline && s.fix && s.fix.trim() !== s.headline.trim()) {
      lines.push(escHtml(collapseNewlines(s.fix)));
    }
    return lines.join('\n');
  });
  return `✅ <b>Do this</b>\n\n${rows.join('\n\n')}`;
}

/** §5a section 5 — the watchlist as ONE compact line (count + names only). */
function watchlistBlock(watchlist: StagedBrief['watchlist']): string | null {
  if (watchlist.length === 0) return null;
  // A clean bulleted list the owner skims — not a semicolon blob.
  const shown = watchlist.slice(0, 5).map((w) => `• ${escHtml(collapseNewlines(w.item).replace(/\s+/g, ' ').trim())}`);
  const more = watchlist.length > 5 ? `\n<i>+${watchlist.length - 5} more in the app</i>` : '';
  return `👀 <b>Keep an eye on (${watchlist.length})</b>\n${shown.join('\n')}${more}`;
}

/** DEGRADED render (spec §9 / B1) — leads with "analysis incomplete", NEVER a
 *  healthy/null-result message. The deterministic malfunctions (carried as
 *  problems by `degradedSession`) still surface so a real outage isn't hidden. */
function degradedBlock(s: StagedBrief): string {
  const head =
    `⚠️ <b>Analysis incomplete — Pass 1 failed, no verdict this week.</b>\n` +
    `The council couldn’t find the problems this run — re-run the weekly analysis.`;
  if (s.problems.length === 0) return head;
  const rows = s.problems.slice(0, 5).map((p) => {
    const h = collapseNewlines(p.headline || p.description);
    const detail = p.headline && p.description && p.description.trim() !== p.headline.trim()
      ? ` — ${trimTo(collapseNewlines(p.description), 140)}` : '';
    return `• ${escHtml(h)}${escHtml(detail)}`;
  });
  return `${head}\n\n🚨 <b>Auto-detected (still worth checking):</b>\n${rows.join('\n')}`;
}

export function buildBrief(args: {
  brand: Brand; dateManila: string;
  yesterday: { spendCentavos: number; purchases: number } | null;
  avg7Cpp: number | null;
  dayQuality: DayQuality;
  verdicts: VerdictResult[];
  cohort: { buyers: number; showUpPct: number | null; applications: number } | null;
  chairNote: string; nextLine: string;
  /** The council's root-cause + ranked plan (from today's session), if one ran. */
  plan?: { rootCause: string; steps: string[] } | null;
  /** Net-new creative concepts to test (from the weekly analysis). */
  ideas?: Array<{ concept: string; hook: string }> | null;
  /** The v2 staged 5-stage analysis (spec §9). When present, the weekly brief
   *  leads with it (bottom line → north star → problems → solutions →
   *  watchlist) instead of the thinner plan/action blocks; `null` (legacy
   *  sessions) falls back to the original render. */
  staged?: StagedBrief | null;
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

  // ── The plan (root cause + ranked steps the council agreed on) ───────
  const plan = args.plan;
  const planBlock = plan && plan.steps.length > 0
    ? `🧭 <b>The plan</b>\n` +
      (plan.rootCause ? `<i>${escHtml(plan.rootCause)}</i>\n` : '') +
      plan.steps.slice(0, 4).map((s, i) => `${i + 1}. ${escHtml(s)}`).join('\n')
    : null;

  // ── Creative to test next (grounded in what's winning) ───────────────
  const ideas = args.ideas;
  const ideasBlock = ideas && ideas.length > 0
    ? `💡 <b>Creative to test</b>\n` +
      ideas.slice(0, 3).map((i) => `• ${escHtml(i.concept)}${i.hook ? `\n   <i>“${escHtml(i.hook)}”</i>` : ''}`).join('\n')
    : null;

  // ── This week ────────────────────────────────────────────────────────
  const weekBlock = cohort ? `📈 <b>This week:</b> ${cohort.buyers} new buyers so far.` : null;

  // ── v2 staged analysis (spec §9) — when a staged verdict is present, lead
  // with the 5-stage output (decision-first per §5a); the deterministic
  // context (creative ideas, yesterday, roster, movers, week) follows. The
  // old action/plan blocks are superseded by synthesis + solutions here.
  const staged = args.staged;
  if (staged) {
    const analysis = staged.degraded
      ? [degradedBlock(staged)]
      : [
          bottomLineBlock(staged),
          northStarBlock(staged.northStar),
          problemsBlock(staged.problems),
          solutionsBlock(staged.solutions),
          watchlistBlock(staged.watchlist),
        ];
    return [
      `📊 <b>ADS REVIEW — ${dateManila}</b>`,
      ...analysis,
      ideasBlock,
      yesterdayBlock,
      rosterBlock,
      moversBlock,
      weekBlock,
    ].filter(Boolean).join('\n\n');
  }

  return [
    `📊 <b>ADS REVIEW — ${dateManila}</b>`,
    yesterdayBlock,
    rosterBlock,
    moversBlock,
    actionBlock,
    planBlock,
    ideasBlock,
    weekBlock,
  ].filter(Boolean).join('\n\n');
}

/** Ads Council nightly pipeline — doctrine §5/§8, the task that makes every
 *  other lib/council/*.ts module actually run on a schedule. One call,
 *  `runCouncilPipeline(brand)`, does the full 00:02 Manila sequence: sync
 *  Meta spend -> grade every active ad -> save verdicts -> weekly priors
 *  refresh -> resolve due predictions -> detect triggers -> convene a full
 *  council session if warranted -> compose the daily brief.
 *
 *  Idempotent per Manila settled-day: a second call the same day skips the
 *  sync/grade/refresh/resolve/trigger/session steps entirely and just
 *  recomposes the brief from whatever is already stored (`saveVerdicts`'s
 *  upsert also makes an accidental double-grade harmless, so this guard is
 *  belt-and-suspenders, not the only thing preventing duplicate work — the
 *  council-session step has its own independent guard, since that one
 *  actually costs real tokens).
 *
 *  Two different "today" values are in play, matching how each table is
 *  ACTUALLY stamped elsewhere in this module — get either backwards and the
 *  idempotency/dedup checks silently never fire:
 *   - `ad_verdict_history.date` is the SETTLED day (`asOf` = settledDay(),
 *     today-3 — verdict-engine.ts's `make()` stamps `date: asOf`).
 *   - `council_sessions.date` is the literal Manila CALENDAR day the
 *     session ran (session.ts's `today`, computed the same "+8h then
 *     slice" way as `settledDay()` so the two stay exactly 3 days apart
 *     with no drift).
 *  Every helper below queries whichever convention its target table uses. */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  getAdSeries, getLatestVerdicts, getCouncilSettings, getPriors, saveVerdicts, pipelineRanToday,
} from './db';
import { gradeAd, windowsFor } from './verdict-engine';
import { syncAdMetricsDaily } from './meta-sync';
import { refreshPriors } from './priors';
import { resolveDuePredictions } from './ledger';
import { detectTriggers } from './triggers';
import { runStagedCouncil, settledDay } from './session';
import { analyzeMissingCreatives } from './creative-context';
import { buildBrief, buildPulse, dayQualityFor } from './brief';
import type { AdSeries, Brand, VerdictResult } from './types';

const MS_DAY = 86400000;

/** The weekly deep-dive runs on Opus (highest-stakes call of the week, ~4×/mo);
 *  the daily path runs NO LLM at all (deterministic pulse). */
const WEEKLY_MODEL = process.env.COUNCIL_WEEKLY_MODEL || 'claude-opus-5';

/** Manila calendar "today" — same "+8h then slice UTC date" convention
 *  session.ts's `today` (and settledDay()) already use, so `asOf` and
 *  `todayManila` are always exactly 3 days apart with no zone drift. */
function manilaToday(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

/** YYYY-MM-DD `days` before `dateStr` (both plain calendar dates) — mirrors
 *  pack.ts's private `isoDaysBefore` (not exported there, so replicated). */
function isoDaysBefore(dateStr: string, days: number): string {
  return new Date(Date.parse(dateStr) - days * MS_DAY).toISOString().slice(0, 10);
}

function isMondayManila(dateManila: string): boolean {
  return new Date(`${dateManila}T00:00:00Z`).getUTCDay() === 1;
}

/** Monday-start of the week `dateStr` falls in — mirrors pack.ts's private
 *  `weekStartOf` (not exported there, so replicated). */
function weekStartOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Did a council session already run for `brand` on the Manila calendar day
 *  `todayManila`? Count-only head query, mirrors db.ts's `pipelineRanToday`
 *  style — this is the gate that stops a same-day double LLM call. */
async function sessionExistsToday(brand: Brand, todayManila: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { count, error } = await getSupabase()
    .from('council_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('brand', brand)
    .eq('date', todayManila);
  if (error) throw new Error(`sessionExistsToday: ${error.message}`);
  return (count ?? 0) > 0;
}

/** Today's council_sessions verdict.action (if any session ran on the
 *  Manila calendar day `todayManila`), for the brief's CHAIR'S NOTE line.
 *  Mirrors pack.ts's private `fetchLastVerdict` but scoped to today only
 *  (rather than "most recent ever") — the brief cares whether the Council
 *  spoke TODAY, not what it last said days ago. */
async function fetchTodaySessionAction(
  brand: Brand,
  todayManila: string,
): Promise<{
  action: string | null;
  plan: { rootCause: string; steps: string[] } | null;
  ideas: Array<{ concept: string; hook: string }> | null;
}> {
  if (!isSupabaseConfigured()) return { action: null, plan: null, ideas: null };
  const { data, error } = await getSupabase()
    .from('council_sessions')
    .select('verdict')
    .eq('brand', brand)
    .eq('date', todayManila)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`fetchTodaySessionAction: ${error.message}`);
  if (!data) return { action: null, plan: null, ideas: null };
  const verdict = (data as { verdict: unknown }).verdict as {
    action?: unknown;
    diagnosis?: { root_cause?: unknown } | null;
    action_plan?: Array<{ step?: unknown }> | null;
    creative_ideas?: Array<{ concept?: unknown; hook?: unknown }> | null;
  } | null;
  const action = verdict && typeof verdict.action === 'string' && verdict.action.length > 0 ? verdict.action : null;
  const rootCause = typeof verdict?.diagnosis?.root_cause === 'string' ? verdict.diagnosis.root_cause : '';
  const steps = Array.isArray(verdict?.action_plan)
    ? verdict!.action_plan.map((s) => (typeof s?.step === 'string' ? s.step : '')).filter(Boolean)
    : [];
  const plan = steps.length > 0 ? { rootCause, steps } : null;
  const ideas = Array.isArray(verdict?.creative_ideas)
    ? verdict!.creative_ideas
        .map((i) => ({ concept: typeof i?.concept === 'string' ? i.concept : '', hook: typeof i?.hook === 'string' ? i.hook : '' }))
        .filter((i) => i.concept)
    : [];
  return { action, plan, ideas: ideas.length > 0 ? ideas : null };
}

/** Any prediction resolved to a MISS by THIS run — `resolveDuePredictions`
 *  stamps `resolved_date: asOfSettled` on every row it resolves, so a count
 *  scoped to `resolved_date = asOf` is exactly "resolved by this run", not
 *  "ever resolved". `resolveDuePredictions` itself only returns a combined
 *  hit+miss count, so this is a small direct follow-up query — same
 *  in-file-query convention ledger.ts/pack.ts already use for
 *  `council_predictions` (no dedicated db.ts helper for this table). */
async function hasMissResolvedToday(brand: Brand, asOf: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { count, error } = await getSupabase()
    .from('council_predictions')
    .select('id', { count: 'exact', head: true })
    .eq('brand', brand)
    .eq('resolved_date', asOf)
    .eq('outcome', 'miss');
  if (error) throw new Error(`hasMissResolvedToday: ${error.message}`);
  return (count ?? 0) > 0;
}

/** Every open (`outcome is null`) prediction for `brand`, for the brief's
 *  NEXT line — count + nearest deadline, or the standing "no open
 *  predictions" line. */
async function fetchNextLine(brand: Brand): Promise<string> {
  if (!isSupabaseConfigured()) return 'No standing actions.';
  const { data, error } = await getSupabase()
    .from('council_predictions')
    .select('deadline')
    .eq('brand', brand)
    .is('outcome', null)
    .order('deadline', { ascending: true });
  if (error) throw new Error(`fetchNextLine: ${error.message}`);
  const rows = (data as { deadline: string }[]) ?? [];
  if (rows.length === 0) return 'No standing actions.';
  return `${rows.length} open prediction${rows.length === 1 ? '' : 's'} — nearest deadline ${rows[0].deadline}.`;
}

/** paid/attended signups created THIS ISO week (Monday-start, Manila),
 *  for the brief's COHORT line. Deliberately NOT `assemblePack` — that
 *  pulls `getSignups()` (the whole table) plus webinar/DFY income sums the
 *  brief doesn't need; this is a small direct query instead (controller
 *  decision). A buyer-less week is a real zero, not "no data" — `null` is
 *  reserved for "Supabase isn't configured at all". */
async function fetchCohortThisWeek(
  todayManila: string,
): Promise<{ buyers: number; showUpPct: number | null; applications: number } | null> {
  if (!isSupabaseConfigured()) return null;
  const weekStart = weekStartOf(todayManila);
  const { data, error } = await getSupabase()
    .from('signups')
    .select('status')
    .in('status', ['paid', 'attended'])
    .gte('created_at', `${weekStart}T00:00:00+08:00`);
  if (error) throw new Error(`fetchCohortThisWeek: ${error.message}`);
  const rows = (data as { status: string }[]) ?? [];
  const buyers = rows.length;
  const attended = rows.filter((r) => r.status === 'attended').length;
  // No per-week application linkage exists yet (same gap pack.ts's cohorts
  // note) — hardcoded 0 until that linkage exists.
  return { buyers, showUpPct: attended >= 1 ? (attended / buyers) * 100 : null, applications: 0 };
}

export type CouncilPipelineResult = {
  brief: string;
  graded: number;
  triggers: string[];
  sessionId: string | null;
  /** Set only when syncAdMetricsDaily threw — grading still proceeds on
   *  whatever was already synced. */
  syncError?: string;
  /** Set only when a council session ran this call and one or more of its
   *  5 prediction inserts failed (see session.ts). */
  failedPredictionInserts?: number;
};

export async function runCouncilPipeline(
  brand: Brand,
  opts: { weekly?: boolean } = {},
): Promise<CouncilPipelineResult> {
  const weekly = opts.weekly ?? false;
  const todayManila = manilaToday();
  const asOf = settledDay();
  // Verdict rows are dated `asOf` (the settled day), not `todayManila` —
  // see the module doc comment. Passing asOf here is what makes this guard
  // actually fire on a same-day re-hit.
  const alreadyRan = await pipelineRanToday(brand, asOf);

  let syncError: string | undefined;
  if (!alreadyRan) {
    try {
      await syncAdMetricsDaily({ since: isoDaysBefore(todayManila, 4), until: todayManila });
    } catch (err) {
      // A Meta failure must not kill grading — grade on whatever's already
      // synced and surface the error on the result instead of throwing.
      syncError = errMsg(err);
    }
  }

  const [series, storedVerdicts, settings, priors] = await Promise.all([
    getAdSeries(brand),
    getLatestVerdicts(brand),
    getCouncilSettings(brand),
    getPriors(brand),
  ]);

  // Single pass over every fetched ad series (mirrors pack.ts's
  // assemblePack): builds the campaign-wide per-ad spend maps gradeAd
  // needs, the campaign-wide blended CPP (also this brief's avg7Cpp), the
  // settled delivery-date count (historyDays), the last-3-settled-day
  // blended-CPP series triggers needs, and the set of ads eligible to grade
  // (>=1 delivery day in the last 21 settled days).
  const since21 = isoDaysBefore(asOf, 20);
  const campaignSpend7ByAd: Record<string, number> = {};
  const campaignSpendPrior7ByAd: Record<string, number> = {};
  let totalSpend7 = 0;
  let totalPurchases7 = 0;
  const distinctSettledDates = new Set<string>();
  const byDate = new Map<string, { spend: number; purchases: number }>();
  const eligibleSeries: AdSeries[] = [];

  for (const s of series) {
    const w = windowsFor(s, asOf);
    campaignSpend7ByAd[s.adId] = w.spend7;
    campaignSpendPrior7ByAd[s.adId] = w.spendPrior7;
    totalSpend7 += w.spend7;
    totalPurchases7 += w.purchases7;

    for (const d of s.days) {
      if (d.date > asOf) continue; // settled only
      distinctSettledDates.add(d.date);
      const agg = byDate.get(d.date) ?? { spend: 0, purchases: 0 };
      agg.spend += d.spendCentavos;
      agg.purchases += d.purchases;
      byDate.set(d.date, agg);
    }

    if (s.days.some((d) => d.date >= since21 && d.date <= asOf)) eligibleSeries.push(s);
  }

  const blendedCpp7Centavos = totalPurchases7 > 0 ? totalSpend7 / totalPurchases7 : null;
  const historyDays = distinctSettledDates.size;
  const blendedCppByDay = [2, 1, 0].map((back) => {
    const date = isoDaysBefore(asOf, back);
    const agg = byDate.get(date);
    return { date, cpp: agg && agg.purchases > 0 ? agg.spend / agg.purchases : null };
  });

  const prevByAdId = new Map(
    storedVerdicts.map((v) => [v.adId, { verdict: v.verdict, daysInTier: v.daysInTier }]),
  );

  const gradedRows: VerdictResult[] = [];
  let triggers: string[] = [];
  let sessionId: string | null = null;
  let failedPredictionInserts: number | undefined;

  if (!alreadyRan) {
    for (const s of eligibleSeries) {
      gradedRows.push(gradeAd({
        series: s,
        campaign: {
          totalSpend7Centavos: totalSpend7,
          blendedCpp7Centavos,
          campaignSpend7ByAd,
          campaignSpendPrior7ByAd,
        },
        settings,
        asOf,
        prev: prevByAdId.get(s.adId) ?? null,
        historyDays,
      }));
    }
    await saveVerdicts(gradedRows);

    if (isMondayManila(todayManila)) {
      try {
        await refreshPriors(brand);
      } catch (err) {
        console.error('[council pipeline] refreshPriors failed', errMsg(err));
      }
    }

    let resolution = { resolved: 0, manual: 0 };
    try {
      resolution = await resolveDuePredictions(brand, asOf);
    } catch (err) {
      console.error('[council pipeline] resolveDuePredictions failed', errMsg(err));
    }
    const windowClosedToday = resolution.resolved > 0;
    const missResolvedToday = resolution.resolved > 0 && (await hasMissResolvedToday(brand, asOf));

    triggers = detectTriggers({
      todayVerdicts: gradedRows,
      blendedCppByDay,
      targetCppCentavos: settings.targetCppCentavos,
      missResolvedToday,
      windowClosedToday,
      isMondayManila: isMondayManila(todayManila),
    });

    // Creative-context pickup — capped, non-blocking, AFTER the session so it
    // never delays the time-critical verdict/brief. Brand-new ads get their
    // format/angle/persona analyzed here and land in TOMORROW's council pack.
    // On Vercel there's no ffmpeg binary, so VIDEO ads classify from their
    // poster thumbnail + copy; IMAGE ads classify fully. Full-fidelity video
    // (keyframes + Whisper transcript) + changed-creative refresh is the local
    // backfill script's job. Any failure yields { failed }, logged, never thrown.
    try {
      const cc = await analyzeMissingCreatives(
        brand,
        eligibleSeries.map((s) => ({ adId: s.adId, adName: s.adName })),
      );
      if (cc.analyzed > 0 || cc.failed > 0) {
        console.log(`[council pipeline] creative-context: ${cc.analyzed} analyzed, ${cc.failed} failed`);
      }
    } catch (err) {
      console.error('[council pipeline] analyzeMissingCreatives failed', errMsg(err));
    }
  }

  // The full LLM analysis runs ONLY on the weekly path (Sunday 10am) — never
  // daily. Deliberately OUTSIDE the !alreadyRan guard: the daily pulse has
  // already graded today, so alreadyRan is true by the time the weekly cron
  // fires — but the weekly session must still convene. sessionExistsToday
  // prevents a double LLM call. Daily = deterministic pulse (no LLM); on-demand
  // goes through the admin button / runCouncilSession directly.
  if (weekly && !(await sessionExistsToday(brand, todayManila))) {
    try {
      const reasons = triggers.length > 0 ? triggers : ['Weekly scheduled analysis'];
      const result = await runStagedCouncil(brand, reasons, { model: WEEKLY_MODEL });
      sessionId = result.sessionId;
      failedPredictionInserts = result.failedPredictionInserts;
    } catch (err) {
      console.error('[council pipeline] weekly runStagedCouncil failed', errMsg(err));
    }
  }

  // Brief composition — always runs, idempotent or not, from whatever is
  // now on record (freshly graded this call, or already stored from
  // earlier today).
  const yesterdayDate = isoDaysBefore(todayManila, 1);
  let yesterdayFound = false;
  let yesterdaySpend = 0;
  let yesterdayPurchases = 0;
  for (const s of series) {
    for (const d of s.days) {
      if (d.date === yesterdayDate) {
        yesterdayFound = true;
        yesterdaySpend += d.spendCentavos;
        yesterdayPurchases += d.purchases;
      }
    }
  }
  // Deliberately unsettled (yesterday, not asOf) — buildBrief labels this
  // preliminary itself; Meta restates conversions for up to 72h.
  const yesterday = yesterdayFound ? { spendCentavos: yesterdaySpend, purchases: yesterdayPurchases } : null;
  const yCpp = yesterday && yesterday.purchases > 0 ? yesterday.spendCentavos / yesterday.purchases : null;
  const avg7Cpp = blendedCpp7Centavos;
  const dayQuality = dayQualityFor(yCpp, avg7Cpp, priors);

  const verdictsForBrief = alreadyRan ? storedVerdicts : gradedRows;

  // Circuit-breaker for the daily pulse: an ad that spent TWO target-buyers'
  // worth on the last SETTLED day yet made zero sales is genuinely bleeding.
  // 2x (not 1x) so a barely-over-target ad on one noisy day doesn't false-
  // alarm — the whole point of the pulse is to NOT trigger over-management.
  const fireFloor = settings.targetCppCentavos * 2;
  const fires: string[] = [];
  for (const s of series) {
    const day = s.days.find((d) => d.date === asOf);
    if (day && day.purchases === 0 && day.spendCentavos >= fireFloor) {
      fires.push(`${s.adName} — ₱${Math.round(day.spendCentavos / 100).toLocaleString()} spent, 0 sales`);
    }
  }

  let brief: string;
  if (weekly) {
    // Full analysis brief — root cause + ranked plan from the session just run.
    const [cohort, sessionAction, nextLine] = await Promise.all([
      fetchCohortThisWeek(todayManila),
      fetchTodaySessionAction(brand, todayManila),
      fetchNextLine(brand),
    ]);
    const chairNote = sessionAction.action != null ? sessionAction.action : 'Analysis produced no single headline action.';
    brief = buildBrief({
      brand, dateManila: todayManila, yesterday, avg7Cpp, dayQuality,
      verdicts: verdictsForBrief, cohort, chairNote, nextLine,
      plan: sessionAction.plan, ideas: sessionAction.ideas,
    });
  } else {
    // Daily pulse — deterministic heartbeat, no LLM, no action list.
    brief = buildPulse({ dateManila: todayManila, yesterday, avg7Cpp, dayQuality, verdicts: verdictsForBrief, fires });
  }

  return {
    brief,
    graded: alreadyRan ? 0 : gradedRows.length,
    triggers,
    sessionId,
    ...(syncError !== undefined ? { syncError } : {}),
    ...(failedPredictionInserts !== undefined ? { failedPredictionInserts } : {}),
  };
}

/** Ads Council data pack assembly — the single input Task 9's LLM council
 *  session reads (`assemblePack`'s result gets `JSON.stringify`'d wholesale
 *  into the prompt). Pure orchestration: every field is either read straight
 *  from an existing council/`lib/db.ts` helper or derived from data those
 *  helpers already fetched — this file never re-queries anything a
 *  lower-level helper already owns. The two tables with no dedicated `db.ts`
 *  helper yet (`council_predictions`, `council_sessions`) are queried
 *  in-file via `getSupabase()` directly, mirroring `ledger.ts`'s convention
 *  for `council_predictions`. */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getSignups, type Signup } from '@/lib/db';
import { sumWebinarIncomeCentavos } from '@/lib/retreat-crm';
import { sumDfyIncomeCentavos } from '@/lib/dfy-crm';
import { getAdSeries, getLatestVerdicts, getPriors, getCouncilSettings } from './db';
import { windowsFor, weekWindow } from './verdict-engine';
import { economicsFromSettings, dailyNetCentavos, targetNetSpendCentavos, netGapCentavos, type Economics } from './economics';
import { getExpertWeights } from './ledger';
import { getCreativeBriefs, getScripts, type CreativeBrief } from './creative-context';
import { getCampaignStructures, getRecentChanges, getAdStatuses, type CampaignStructure, type AccountChange } from '@/lib/meta-ads';
import { getWeekBreakdowns, type Row as BreakdownRow, type Funnel as WeekFunnel } from './breakdowns';
import { confidenceFor, type Confidence } from './confidence';
import { detectMalfunctions, type Malfunction } from './malfunction';
import { utilization } from './pacing';
import type { AdDay, Brand, CouncilSettingsRow, PriorsRow, Role, Tier } from './types';

const MS_DAY = 86400000;

export type CouncilPack = {
  brand: Brand; asOf: string; dataMode: 'A' | 'B';
  /** The just-finished Mon–Sun narrative window (spec §2) that `thisWeek`
   *  below is anchored to. `settledCutoff` = `asOf` (today−3); weekEnd is
   *  always the Sunday of the week containing settledCutoff+3 (today). */
  weekStart: string; weekEnd: string; settledCutoff: string;
  ads: Array<{
    adId: string; adName: string; role: Role; verdict: Tier; daysInTier: number;
    /** Which campaign + ad set this ad lives in — so recommendations respect
     *  the structure (budget is set on the campaign/ad set, never the ad). */
    campaignName: string; adSetName: string;
    /** Days the ad has been delivering — a <~5-day-old ad is too young to judge. */
    ageDays: number;
    windows: ReturnType<typeof windowsFor>; last14: AdDay[];
    /** What the creative IS (angle/persona/hook/quality) — null until analyzed. */
    creative: CreativeBrief | null;
    /** Is this ad DELIVERING right now (effective_status === 'ACTIVE')? Its
     *  metrics are always historical, so a paused ad still carries data —
     *  never recommend turning OFF (or "letting run") an ad that isn't active. */
    active: boolean;
    /** Raw Meta effective_status (ACTIVE / PAUSED / ADSET_PAUSED /
     *  CAMPAIGN_PAUSED / WITH_ISSUES / …). '' if Meta was unreachable. */
    status: string;
  }>;
  /** Live campaign structure (CBO/ABO/Advantage+ + budgets + ad sets + each ad
   *  set's LEARNING status) so the council prescribes EXECUTABLE moves and never
   *  judges an ad still in learning. Empty if Meta is unreachable. */
  structure: CampaignStructure[];
  /** Operational MOVEMENT — budgets moved, ads on/off, new ads/ad sets built in
   *  the last ~week (from Meta's activity log) — so shifts are attributed to
   *  real edits, not guessed. Empty if Meta is unreachable. */
  recentChanges: AccountChange[];
  /** The current WINNERS' actual scripts — cheapest per-buyer ads with real
   *  volume, plus their hook + transcript — so new creative ideas are grounded
   *  in what's PROVEN to convert, not generic advice. */
  winningCreatives: Array<{
    adName: string; creativeTag: string; angle: string; persona: string;
    cpp: number | null; cvr: number | null; hook: string; transcript: string;
  }>;
  campaign: {
    totalSpend7: number; blendedCpp7: number | null; blendedCppPrior7: number | null;
    daysSinceLastCreativeLaunch: number | null;
    /** Campaign-level CPP decomposition (audience/creative/offer levers) — a
     *  high CPM points at AUDIENCE, low link-CTR at CREATIVE, low CVR at the
     *  OFFER/post-click. Blended across all ads (audience is shared, so these
     *  read at the campaign level). */
    blendedCpm7: number | null; blendedLinkCtr7: number | null; blendedCvr7: number | null;
    avgFrequency7: number | null; totalReach7: number;
  };
  /** The Mon–Sun NARRATIVE week (spec §2/§3a) — separate from the settled
   *  trailing-7 `ads[]`/`campaign` above, which stay untouched for back-compat
   *  during the Phase-3 prompt migration (new prompts read `thisWeek`).
   *  `campaign` blends `weekWindow` across every ad with delivery this week;
   *  `ads[].week` is each ad's own `weekWindow` result; `northStar` is the
   *  §3h profit-anchor read (current daily net vs `dailyNetTargetCentavos`). */
  thisWeek: {
    campaign: {
      spend: number; revenue: number; roas: number | null; cpp: number | null;
      aov: number | null; cpm: number | null; linkCtr: number | null; cvr: number | null;
      reach: number; freq: number | null;
      /** cpp omitted here (unlike `settled` below) — weekWindow's per-ad
       *  `priorWeek` exposes roas/cpp but not the underlying purchase count
       *  needed to blend cpp across ads; roas blends cleanly from summed
       *  revenue/spend, cpp does not. */
      priorWeek: { spend: number; revenue: number; roas: number | null };
      settled: { spend: number; revenue: number; purchases: number; roas: number | null; cpp: number | null };
    };
    ads: Array<{
      adId: string; adName: string;
      /** Same `adStatus` map already fetched for the back-compat `ads[]`
       *  above — reused, not re-fetched. */
      active: boolean; status: string;
      week: ReturnType<typeof weekWindow>;
      /** How much this-week evidence backs this ad (spec §0b minimum-signal
       *  rule) — SOLID/DIRECTIONAL/NOISE, from `week.purchases`/`week.spend`
       *  vs the blended this-week CPP. NOISE-tier evidence may never justify
       *  a cut/scale/exclude. */
      confidence: Confidence;
    }>;
    /** Placement + audience breakdowns for the week (spec §3e/§3f) — live
     *  best-effort Meta pulls, BOSS-scoped (see breakdowns.ts's isBoss).
     *  CONTEXT like everything else outside `ads[]`/`campaign` above: point
     *  at a placement/segment lever, never the sole basis for a per-ad cut.
     *  [] on fetch failure. */
    breakdowns: { placement: BreakdownRow[]; audience: BreakdownRow[] };
    /** Micro-conversion funnel for the week (spec §3g): linkClicks ->
     *  lpViews -> addToCart -> initiateCheckout -> purchases, so a
     *  mid-funnel leak can be named instead of a vague "CVR problem".
     *  Zeros on fetch failure. */
    funnel: WeekFunnel;
    northStar: { currentDailyNetCentavos: number; targetNetSpendCentavos: number; netGapCentavos: number };
    /** Pacing / budget utilization (spec §3c) — this week's average daily
     *  spend joined to the declared budget, per campaign (CBO/ADVANTAGE+) or
     *  per ad set (ABO — budget sits there instead). Tells "weak results"
     *  apart from "under-delivering" (or "budget-capped, ready to scale").
     *  Best-effort: [] when `structure` is empty (Meta unreachable). */
    pacing: Array<{
      scope: 'campaign' | 'adset'; name: string; budgetType: CampaignStructure['budgetType'];
      dailyBudgetCentavos: number | null; avgDailySpendCentavos: number;
      utilizationPct: number | null; underDelivering: boolean; budgetCapped: boolean;
    }>;
  };
  /** Day-of-week rhythm (spec §3d) — per-weekday (Mon..Sun) blended
   *  cpp/roas/spend-share over the 4-week CONTEXT window (last ~28 days ≤
   *  asOfSettled, ~4 samples/weekday), NOT the single analyzed week. Same
   *  CONTEXT status as weeklyTrend/pastPlans/etc: useful only to spot RHYTHM
   *  ("weekends run pricier"), never a per-ad cut reason — capped at
   *  DIRECTIONAL confidence by construction (§0b minimum-signal rule; too
   *  few samples per weekday to ever be SOLID). roas a ratio; spendSharePct
   *  a 0..1 fraction of the window's total spend (both null on 0 spend that
   *  weekday). */
  context: {
    dayOfWeek: Array<{ weekday: string; cppCentavos: number | null; roas: number | null; spendSharePct: number | null }>;
  };
  /** Deterministic "is it just broken?" pre-check (spec §0b Stage 1) —
   *  DISAPPROVED/REVENUE_CLIFF/LP_COLLAPSE candidates the council must rule
   *  out BEFORE prescribing creative/audience fixes. Best-effort: [] if the
   *  check throws. */
  malfunctions: Malfunction[];
  cohorts: Array<{
    weekStart: string; buyers: number; showUpPct: number | null;
    applications: number; frontRevenueCentavos: number; adSpendCentavos: number;
    cohortProfitCentavos: number | null;
  }>;
  /** 4-week arc so the weekly analysis sees the month, not just this week —
   *  the trend that makes the advice compound. cpp/spend in centavos; cpm in
   *  pesos; linkCtr/cvr as percentages. Oldest → newest. */
  weeklyTrend: Array<{
    weekStart: string; spendCentavos: number; cpp: number | null;
    cpm: number | null; linkCtr: number | null; cvr: number | null;
    roas: number | null; revenue: number;
  }>;
  /** The last few analyses + whether their predictions came true — Prince
   *  grades his OWN past advice ("we cut X two weeks ago; did CPP drop?"). */
  pastPlans: Array<{
    date: string; lever: string; rootCause: string; steps: string[];
    predictionsHit: number; predictionsMiss: number;
  }>;
  priors: PriorsRow | null;
  weights: Record<'CHARLEY' | 'NICK' | 'BEN' | 'DARA' | 'CHAIR', number>;
  openPredictions: Array<{ expert: string; text: string; deadline: string }>;
  lastVerdict: { action: string; killSwitch: string; date: string } | null;
  settings: CouncilSettingsRow & { economics: Economics };
  /** Lifetime back-end income totals — NOT cohort-attributed (see the note on
   *  `cohorts[].cohortProfitCentavos` below). Surfaced so the council has
   *  backend-income context even though per-cohort linkage doesn't exist yet. */
  backEnd: { webinarIncomeCentavos: number; dfyIncomeCentavos: number };
};

/** YYYY-MM-DD `days` before `dateStr` — both plain calendar dates, UTC-
 *  midnight arithmetic, same convention `verdict-engine.ts`'s `slice7` uses
 *  for its t7/p7 windows. */
function isoDaysBefore(dateStr: string, days: number): string {
  return new Date(Date.parse(dateStr) - days * MS_DAY).toISOString().slice(0, 10);
}

/** Mon–Sun bounds of the just-finished narrative week (spec §2), derived from
 *  `asOfSettled` (= today−3, the settled cutoff). The weekly cron runs
 *  Sunday, so "today" for bounds purposes is `asOfSettled+3`; weekEnd is the
 *  Sunday of today's ISO week, weekStart the Monday 6 days before. Exported
 *  (pure, no network) so `pack.test.ts` can unit-test the math directly. */
export function deriveWeekBounds(asOfSettled: string): { weekStart: string; weekEnd: string; settledCutoff: string } {
  const today = new Date(Date.parse(asOfSettled) + 3 * MS_DAY).toISOString().slice(0, 10);
  const d = new Date(`${today}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  // weekEnd = the MOST RECENT Sunday ≤ today (the just-finished Mon–Sun). On a
  // Sunday run that is today itself (Fri–Sun are the rough <72h tail); on any
  // other day (manual run / /prince Q&A, which call assemblePack too) it is last
  // Sunday, a fully-settled just-finished week. Never the upcoming Sunday —
  // going forward would put unelapsed days in the window and invert settledCutoff.
  d.setUTCDate(d.getUTCDate() - dow);
  const weekEnd = d.toISOString().slice(0, 10);
  const weekStart = isoDaysBefore(weekEnd, 6);
  return { weekStart, weekEnd, settledCutoff: asOfSettled };
}

/** Monday-start of the week `dateStr` falls in. Mirrors `lib/ads-results.ts`'s
 *  `weekStart` (not imported — that module isn't part of this task's
 *  interface list, and the rule is 4 lines). */
function weekStartOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD calendar date of an ISO timestamp in Asia/Manila. Mirrors
 *  `lib/ads-results.ts`'s `manilaDate`. */
function manilaDateOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

type Cohort = CouncilPack['cohorts'][number];

/** Last 6 Monday-anchored weeks (oldest -> newest, ending on the week
 *  containing `asOfSettled`) over paid/attended signups, bucketed by PAYMENT
 *  day (`metadata.confirmationSent` fallback `createdAt`), Manila. Every
 *  week key is generated up front so a buyer-less week still renders as a
 *  real zeroed row instead of a gap. `spendByWeek` is precomputed by the
 *  caller from the same `getAdSeries` result already fetched for
 *  `ads`/`campaign` — no extra query. */
function buildCohorts(
  signups: Signup[],
  asOfSettled: string,
  spendByWeek: Map<string, number>,
): Cohort[] {
  const currentWeek = weekStartOf(asOfSettled);
  const weekKeys: string[] = [];
  for (let i = 5; i >= 0; i--) weekKeys.push(isoDaysBefore(currentWeek, i * 7));

  type Bucket = { paid: number; attended: number; frontRevenueCentavos: number };
  const buckets = new Map<string, Bucket>(
    weekKeys.map((k) => [k, { paid: 0, attended: 0, frontRevenueCentavos: 0 }]),
  );

  for (const s of signups) {
    if (s.status !== 'paid' && s.status !== 'attended') continue;
    const meta = (s.metadata ?? {}) as {
      confirmationSent?: string; otoConfirmed?: string; otoAmount?: number;
    };
    const payDay = manilaDateOf(meta.confirmationSent ?? s.createdAt);
    if (payDay > asOfSettled) continue; // keep the whole pack one settled (D-3) snapshot
    const bucket = buckets.get(weekStartOf(payDay));
    if (!bucket) continue; // payment fell outside the 6-week window
    if (s.status === 'attended') bucket.attended++; else bucket.paid++;
    // Same math as components/SignupsTable.tsx's totalPaidCentavos: main
    // amount + confirmed OTO upsell (a separate invoice, stored in PHP not
    // centavos on metadata.otoAmount).
    const otoCentavos =
      meta.otoConfirmed && typeof meta.otoAmount === 'number' ? Math.round(meta.otoAmount * 100) : 0;
    bucket.frontRevenueCentavos += (s.amountCentavos ?? 0) + otoCentavos;
  }

  return weekKeys.map((weekStart) => {
    const b = buckets.get(weekStart)!;
    const buyers = b.paid + b.attended;
    const showUpPct = b.attended >= 1 ? (b.attended / buyers) * 100 : null;
    const adSpendCentavos = spendByWeek.get(weekStart) ?? 0;
    return {
      weekStart,
      buyers,
      showUpPct,
      // No per-week application linkage exists yet — no column/table ties a
      // Retreat/DFY application back to a signup's buy week — so this is
      // hardcoded until that linkage exists (controller decision).
      applications: 0,
      frontRevenueCentavos: b.frontRevenueCentavos,
      adSpendCentavos,
      // Doctrine's full Cohort Profit also adds attributed Retreat/DFY
      // revenue for the cohort; that attribution doesn't exist yet either
      // (no column ties a retreat/dfy payment back to a signup's buy week),
      // so this is the interim front-revenue-minus-spend figure, not full
      // CP. Lifetime (unattributed) back-end income is exposed separately
      // via the pack-level `backEnd` field for context only — deliberately
      // not folded in here per controller decision.
      cohortProfitCentavos: b.frontRevenueCentavos - adSpendCentavos,
    };
  });
}

type SessionRow = { date: string; verdict: unknown };

/** Newest `council_sessions` row for `brand`, defensively parsed — the
 *  `verdict` jsonb column has no compile-time shape (Task 9 is what starts
 *  writing it, and no session has ever run yet). No dedicated `db.ts` helper
 *  exists for this table, mirroring `ledger.ts`'s in-file-query convention
 *  for `council_predictions`. */
async function fetchLastVerdict(brand: Brand): Promise<CouncilPack['lastVerdict']> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabase()
    .from('council_sessions')
    .select('date, verdict, created_at')
    .eq('brand', brand)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`assemblePack: fetchLastVerdict: ${error.message}`);
  if (!data) return null;
  const row = data as SessionRow;
  const verdict = (row.verdict ?? {}) as { action?: unknown; kill_switch?: { text?: unknown } | null };
  return {
    action: typeof verdict.action === 'string' ? verdict.action : '',
    killSwitch: typeof verdict.kill_switch?.text === 'string' ? verdict.kill_switch.text : '',
    date: row.date,
  };
}

type OpenPredictionRow = { expert: string; prediction_text: string; deadline: string };

/** Every unresolved (`outcome is null`) prediction for `brand`, soonest
 *  deadline first. No `needs_manual` filter — unlike `resolveDuePredictions`,
 *  this is a display list for the council to see what's still outstanding,
 *  not the auto-grader's work queue. */
async function fetchOpenPredictions(brand: Brand): Promise<CouncilPack['openPredictions']> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('council_predictions')
    .select('expert, prediction_text, deadline')
    .eq('brand', brand)
    .is('outcome', null)
    .order('deadline', { ascending: true });
  if (error) throw new Error(`assemblePack: fetchOpenPredictions: ${error.message}`);
  return ((data as OpenPredictionRow[]) ?? []).map((r) => ({
    expert: r.expert, text: r.prediction_text, deadline: r.deadline,
  }));
}

/** The last 4 analyses' diagnosis + plan + how their predictions resolved —
 *  the self-grading memory. hit/miss counts come from council_predictions
 *  joined by session_id, so the weekly council can see whether its OWN past
 *  calls worked and adjust (compounding). */
async function fetchPastPlans(brand: Brand): Promise<CouncilPack['pastPlans']> {
  if (!isSupabaseConfigured()) return [];
  const { data: sessions } = await getSupabase()
    .from('council_sessions')
    .select('id, date, verdict')
    .eq('brand', brand)
    .order('date', { ascending: false })
    .limit(4);
  const rows = (sessions ?? []) as { id: string; date: string; verdict: Record<string, unknown> | null }[];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const { data: preds } = await getSupabase()
    .from('council_predictions')
    .select('session_id, outcome')
    .in('session_id', ids);
  const tally = new Map<string, { hit: number; miss: number }>();
  for (const p of (preds ?? []) as { session_id: string; outcome: string | null }[]) {
    const t = tally.get(p.session_id) ?? { hit: 0, miss: 0 };
    if (p.outcome === 'hit') t.hit++;
    else if (p.outcome === 'miss') t.miss++;
    tally.set(p.session_id, t);
  }
  return rows.map((r) => {
    const v = (r.verdict ?? {}) as { diagnosis?: { lever?: unknown; root_cause?: unknown }; action_plan?: Array<{ step?: unknown }> };
    const steps = Array.isArray(v.action_plan)
      ? v.action_plan.map((s) => (typeof s?.step === 'string' ? s.step : '')).filter(Boolean)
      : [];
    const g = tally.get(r.id) ?? { hit: 0, miss: 0 };
    return {
      date: r.date,
      lever: typeof v.diagnosis?.lever === 'string' ? v.diagnosis.lever : '',
      rootCause: typeof v.diagnosis?.root_cause === 'string' ? v.diagnosis.root_cause : '',
      steps,
      predictionsHit: g.hit,
      predictionsMiss: g.miss,
    };
  });
}

/** Assembles the full council data pack — everything Task 9 hands the LLM.
 *  Every fetch below is independent of every other, so they all run
 *  concurrently. `getSignups()` is the one heavy call (~2k rows) — called
 *  exactly once, here. */
export async function assemblePack(brand: Brand, asOfSettled: string): Promise<CouncilPack> {
  // Mon–Sun bounds of the just-finished narrative week (spec §2) — derived
  // up front (pure, no network) so the best-effort breakdowns call below AND
  // the `thisWeek` narrative built further down can share one derivation.
  const { weekStart, weekEnd, settledCutoff } = deriveWeekBounds(asOfSettled);
  const [series, verdicts, priors, settings, weights, signups,
    webinarIncomeCentavos, dfyIncomeCentavos, openPredictions, lastVerdict, creativeBriefs, pastPlans] = await Promise.all([
    getAdSeries(brand),
    getLatestVerdicts(brand),
    getPriors(brand),
    getCouncilSettings(brand),
    getExpertWeights(brand),
    getSignups(),
    sumWebinarIncomeCentavos(),
    sumDfyIncomeCentavos(),
    fetchOpenPredictions(brand),
    fetchLastVerdict(brand),
    getCreativeBriefs(brand),
    fetchPastPlans(brand),
  ]);
  // Live structure (CBO/ABO/Advantage+ + learning phase), the operational
  // change feed, and the placement/audience/funnel breakdowns (spec
  // §3e/§3f/§3g) — separate best-effort calls; a Meta hiccup must never sink
  // the whole pack, so they're not in the Promise.all above.
  const [structure, recentChanges, adStatus, weekBreakdowns] = await Promise.all([
    getCampaignStructures().catch(() => [] as CampaignStructure[]),
    getRecentChanges().catch(() => [] as AccountChange[]),
    getAdStatuses().catch(() => new Map<string, string>()),
    getWeekBreakdowns(weekStart, weekEnd).catch(() => ({
      placement: [] as BreakdownRow[], audience: [] as BreakdownRow[],
      funnel: { linkClicks: 0, lpViews: 0, addToCart: 0, initiateCheckout: 0, purchases: 0 } as WeekFunnel,
    })),
  ]);
  // Malfunction pre-check (spec §0b Stage 1) — pure/sync, but best-effort like
  // the Meta calls above: a bad series shape must never sink the whole pack.
  let malfunctions: Malfunction[] = [];
  try {
    malfunctions = detectMalfunctions(series, adStatus, asOfSettled);
  } catch {
    malfunctions = [];
  }

  const verdictByAdId = new Map(verdicts.map((v) => [v.adId, v]));
  const since21 = isoDaysBefore(asOfSettled, 20); // 21-day trailing window, inclusive of asOfSettled
  const since14 = isoDaysBefore(asOfSettled, 13); // 14-day trailing window, inclusive of asOfSettled
  const since28 = isoDaysBefore(asOfSettled, 27); // 28-day (4-week) trailing window for context.dayOfWeek (§3d)

  // Single pass over every fetched ad series: computes windowsFor once per
  // ad, folding the result into BOTH the campaign totals (every ad
  // necessarily contributes, since an ad with 0 delivery days in the last 21
  // days trivially has 0 spend/purchases in the narrower 7-day windows too)
  // and `ads[]` (only ads with >=1 delivery day in the last 21 days).
  const ads: CouncilPack['ads'] = [];
  let totalSpend7 = 0, totalPurchases7 = 0, totalSpendPrior7 = 0, totalPurchasesPrior7 = 0;
  let totalImpressions7 = 0, totalLinkClicks7 = 0, totalReach7 = 0;
  let newestFirstDelivery: string | null = null;
  for (const s of series) {
    const w = windowsFor(s, asOfSettled);
    totalSpend7 += w.spend7;
    totalPurchases7 += w.purchases7;
    totalSpendPrior7 += w.spendPrior7;
    totalPurchasesPrior7 += w.purchasesPrior7;
    totalImpressions7 += w.impressions7;
    totalLinkClicks7 += w.linkClicks7;
    totalReach7 += w.reach7;

    // s.days is ascending, so s.days[0] is the ad's true first-ever day —
    // but getAdSeries fetches relative to wall-clock "today", not
    // asOfSettled, so a brand-new ad's first day can be AFTER the settled
    // cutoff (still-unsettled). Excluding those keeps this field bounded to
    // the same "as of asOfSettled" snapshot every other field respects;
    // without the guard a just-launched ad produces a negative day count.
    const first = s.days[0]?.date;
    if (first && first <= asOfSettled && (newestFirstDelivery == null || first > newestFirstDelivery)) {
      newestFirstDelivery = first;
    }

    if (s.days.some((d) => d.date >= since21 && d.date <= asOfSettled)) {
      const v = verdictByAdId.get(s.adId);
      ads.push({
        adId: s.adId, adName: s.adName,
        role: v?.role ?? 'HYBRID',
        verdict: v?.verdict ?? 'LEARNING',
        daysInTier: v?.daysInTier ?? 0,
        campaignName: s.campaignName ?? '', adSetName: s.adsetName ?? '',
        ageDays: w.ageDays,
        windows: w,
        last14: s.days.filter((d) => d.date >= since14 && d.date <= asOfSettled),
        creative: creativeBriefs.get(s.adId) ?? null,
        active: (adStatus.get(s.adId) ?? '') === 'ACTIVE',
        status: adStatus.get(s.adId) ?? '',
      });
    }
  }

  const campaign = {
    totalSpend7,
    blendedCpp7: totalPurchases7 > 0 ? totalSpend7 / totalPurchases7 : null,
    blendedCppPrior7: totalPurchasesPrior7 > 0 ? totalSpendPrior7 / totalPurchasesPrior7 : null,
    daysSinceLastCreativeLaunch: newestFirstDelivery == null
      ? null
      : Math.floor((Date.parse(asOfSettled) - Date.parse(newestFirstDelivery)) / MS_DAY),
    // CPP decomposition, blended across all ads. spend is centavos → /100 for
    // the peso CPM; link-CTR and CVR are percentages.
    blendedCpm7: totalImpressions7 > 0 ? (totalSpend7 / 100 / totalImpressions7) * 1000 : null,
    blendedLinkCtr7: totalImpressions7 > 0 ? (totalLinkClicks7 / totalImpressions7) * 100 : null,
    blendedCvr7: totalLinkClicks7 > 0 ? (totalPurchases7 / totalLinkClicks7) * 100 : null,
    avgFrequency7: totalReach7 > 0 ? totalImpressions7 / totalReach7 : null,
    totalReach7,
  };

  // One more pass over every fetched day, bounded to <= asOfSettled (again —
  // getAdSeries fetches relative to wall-clock "today", not asOfSettled, so
  // without this guard both figures below would silently include unsettled
  // days Meta hasn't finished attributing yet):
  //  - dataMode: union of distinct settled delivery dates across every ad.
  //  - spendByWeek: ad spend per ISO week, feeding cohorts[].adSpendCentavos
  //    below — this also means the CURRENT (in-progress) cohort week only
  //    counts its settled days so far, not the full calendar week.
  //  - weekdayAgg: same days, additionally bucketed by weekday (Mon=0..Sun=6)
  //    when within the trailing 28-day window — feeds context.dayOfWeek (§3d).
  const distinctDates = new Set<string>();
  const spendByWeek = new Map<string, number>();
  // Rich per-ISO-week aggregate for the 4-week trend (spend/impr/clicks/purch).
  type WeekAgg = { spend: number; impr: number; clicks: number; purch: number; rev: number };
  const weekAgg = new Map<string, WeekAgg>();
  type WeekdayAgg = { spend: number; purch: number; rev: number };
  const weekdayAgg = new Map<number, WeekdayAgg>();
  for (const s of series) {
    for (const d of s.days) {
      if (d.date > asOfSettled) continue;
      distinctDates.add(d.date);
      const wk = weekStartOf(d.date);
      spendByWeek.set(wk, (spendByWeek.get(wk) ?? 0) + d.spendCentavos);
      const a = weekAgg.get(wk) ?? { spend: 0, impr: 0, clicks: 0, purch: 0, rev: 0 };
      a.spend += d.spendCentavos;
      a.impr += d.impressions;
      a.clicks += d.linkClicks;
      a.purch += d.purchases;
      a.rev += d.revenueCentavos;
      weekAgg.set(wk, a);

      if (d.date >= since28) {
        const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
        const idx = dow === 0 ? 6 : dow - 1; // Mon=0..Sun=6
        const wd = weekdayAgg.get(idx) ?? { spend: 0, purch: 0, rev: 0 };
        wd.spend += d.spendCentavos;
        wd.purch += d.purchases;
        wd.rev += d.revenueCentavos;
        weekdayAgg.set(idx, wd);
      }
    }
  }
  const dataMode: 'A' | 'B' = distinctDates.size >= 14 ? 'B' : 'A';
  const cohorts = buildCohorts(signups, asOfSettled, spendByWeek);

  // Day-of-week rhythm (§3d) — Mon..Sun labels over the 28-day window just
  // aggregated above. spendSharePct is each weekday's share of the WINDOW's
  // total spend (0..1), not of any single week.
  const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const totalWindowSpend = Array.from(weekdayAgg.values()).reduce((a, w) => a + w.spend, 0);
  const dayOfWeek: CouncilPack['context']['dayOfWeek'] = WEEKDAY_LABELS.map((weekday, idx) => {
    const w = weekdayAgg.get(idx) ?? { spend: 0, purch: 0, rev: 0 };
    return {
      weekday,
      cppCentavos: w.purch > 0 ? w.spend / w.purch : null,
      roas: w.spend > 0 ? w.rev / w.spend : null,
      spendSharePct: totalWindowSpend > 0 ? w.spend / totalWindowSpend : null,
    };
  });

  // Last 4 ISO weeks (oldest → newest) — the month arc for the weekly analysis.
  const currentWeek = weekStartOf(asOfSettled);
  const weeklyTrend = [3, 2, 1, 0].map((back) => {
    const weekStart = isoDaysBefore(currentWeek, back * 7);
    const a = weekAgg.get(weekStart) ?? { spend: 0, impr: 0, clicks: 0, purch: 0, rev: 0 };
    return {
      weekStart,
      spendCentavos: a.spend,
      cpp: a.purch > 0 ? a.spend / a.purch : null,
      cpm: a.impr > 0 ? (a.spend / 100 / a.impr) * 1000 : null,
      linkCtr: a.impr > 0 ? (a.clicks / a.impr) * 100 : null,
      cvr: a.clicks > 0 ? (a.purch / a.clicks) * 100 : null,
      roas: a.spend > 0 ? a.rev / a.spend : null,
      revenue: a.rev,
    };
  });

  // Winners = cheapest per-buyer ads with real volume (>=3 buyers in 7d).
  // Pull their actual scripts so new creative ideas copy what converts.
  const winners = ads
    .filter((a) => a.windows.cpp7 != null && a.windows.purchases7 >= 3)
    .sort((a, b) => (a.windows.cpp7 as number) - (b.windows.cpp7 as number))
    .slice(0, 5);
  const scripts = await getScripts(winners.map((a) => a.adId)).catch(() => new Map());
  const winningCreatives = winners.map((a) => {
    const sc = scripts.get(a.adId);
    return {
      adName: a.adName,
      creativeTag: a.creative?.creativeTag ?? '',
      angle: a.creative?.angle ?? '',
      persona: a.creative?.persona ?? '',
      cpp: a.windows.cpp7 ?? null,
      cvr: a.windows.cvr7 ?? null,
      hook: sc?.hook ?? a.creative?.hook ?? '',
      transcript: sc?.transcript ?? '',
    };
  });

  // Mon–Sun narrative week (spec §2/§3a) + §3h profit-anchor north star.
  // Blends `weekWindow` (imported, not recreated) across every ad with
  // delivery this week, alongside the settled-trailing-7 `ads`/`campaign`
  // built above (kept as-is for back-compat). weekStart/weekEnd/settledCutoff
  // were already derived at the top of this function.
  const econ = economicsFromSettings(settings);
  const weekAds = series
    .map((s) => ({ s, w: weekWindow(s, weekStart, weekEnd, settledCutoff) }))
    .filter(({ w }) => w.spend > 0 || w.impressions > 0);
  const twSpend = weekAds.reduce((a, { w }) => a + w.spend, 0);
  const twRev = weekAds.reduce((a, { w }) => a + w.revenue, 0);
  const twPurch = weekAds.reduce((a, { w }) => a + w.purchases, 0);
  const twImpr = weekAds.reduce((a, { w }) => a + w.impressions, 0);
  const twClicks = weekAds.reduce((a, { w }) => a + w.linkClicks, 0);
  const twReach = weekAds.reduce((a, { w }) => a + w.reach, 0);
  const blendedRoas = twSpend > 0 ? twRev / twSpend : null;
  const priorSpend = weekAds.reduce((a, { w }) => a + w.priorWeek.spend, 0);
  const priorRevenue = weekAds.reduce((a, { w }) => a + w.priorWeek.revenue, 0);
  const settledSpend = weekAds.reduce((a, { w }) => a + w.settled.spend, 0);
  const settledRevenue = weekAds.reduce((a, { w }) => a + w.settled.revenue, 0);
  const settledPurchases = weekAds.reduce((a, { w }) => a + w.settled.purchases, 0);

  const days = Math.max(1, (Date.parse(weekEnd) - Date.parse(weekStart)) / MS_DAY + 1);
  const currentDailyNet = blendedRoas != null ? dailyNetCentavos(twSpend / days, blendedRoas, econ.processingFeePct) : 0;
  const northStar = {
    currentDailyNetCentavos: Math.round(currentDailyNet),
    targetNetSpendCentavos: targetNetSpendCentavos(econ.dailyNetTargetCentavos, econ.targetRoas, econ.processingFeePct),
    netGapCentavos: netGapCentavos(Math.round(currentDailyNet), econ.dailyNetTargetCentavos),
  };

  // Pacing / budget utilization (§3c) — this week's actual spend per
  // campaign/ad set, joined to the structure's declared budget. ABO budgets
  // live on the ad set; CBO/ADVANTAGE+/unknown on the campaign. Best-effort:
  // `structure` is [] when Meta is unreachable, so this naturally becomes [].
  const spendByCampaignName = new Map<string, number>();
  const spendByAdSetName = new Map<string, number>();
  for (const { s, w } of weekAds) {
    spendByCampaignName.set(s.campaignName, (spendByCampaignName.get(s.campaignName) ?? 0) + w.spend);
    spendByAdSetName.set(s.adsetName, (spendByAdSetName.get(s.adsetName) ?? 0) + w.spend);
  }
  const pacing: CouncilPack['thisWeek']['pacing'] = [];
  for (const c of structure) {
    if (c.budgetType === 'ABO') {
      for (const as of c.adSets) {
        const avgDailySpendCentavos = (spendByAdSetName.get(as.name) ?? 0) / days;
        const u = utilization(avgDailySpendCentavos, as.dailyBudgetCentavos);
        pacing.push({
          scope: 'adset', name: as.name, budgetType: c.budgetType,
          dailyBudgetCentavos: as.dailyBudgetCentavos, avgDailySpendCentavos,
          utilizationPct: u.pct, underDelivering: u.underDelivering, budgetCapped: u.budgetCapped,
        });
      }
    } else {
      // CBO / ADVANTAGE+ / unknown: budget sits on the campaign.
      const avgDailySpendCentavos = (spendByCampaignName.get(c.name) ?? 0) / days;
      const u = utilization(avgDailySpendCentavos, c.dailyBudgetCentavos);
      pacing.push({
        scope: 'campaign', name: c.name, budgetType: c.budgetType,
        dailyBudgetCentavos: c.dailyBudgetCentavos, avgDailySpendCentavos,
        utilizationPct: u.pct, underDelivering: u.underDelivering, budgetCapped: u.budgetCapped,
      });
    }
  }

  // This-week blended CPP (centavos) — the confidenceFor denominator for every
  // ad below; confidenceFor itself falls back to the ₱650 target when this is
  // null/0 (no purchases yet this week).
  const thisWeekCpp = twPurch > 0 ? twSpend / twPurch : null;
  const blendedThisWeekCppCentavos = thisWeekCpp ?? 0;

  const thisWeek: CouncilPack['thisWeek'] = {
    campaign: {
      spend: twSpend, revenue: twRev, roas: blendedRoas,
      cpp: thisWeekCpp,
      aov: twPurch > 0 ? Math.round(twRev / twPurch) : null,
      cpm: twImpr > 0 ? (twSpend / 100 / twImpr) * 1000 : null,
      linkCtr: twImpr > 0 ? (twClicks / twImpr) * 100 : null,
      cvr: twClicks > 0 ? (twPurch / twClicks) * 100 : null,
      reach: twReach,
      freq: twReach > 0 ? twImpr / twReach : null,
      priorWeek: {
        spend: priorSpend, revenue: priorRevenue,
        roas: priorSpend > 0 ? priorRevenue / priorSpend : null,
      },
      settled: {
        spend: settledSpend, revenue: settledRevenue, purchases: settledPurchases,
        roas: settledSpend > 0 ? settledRevenue / settledSpend : null,
        cpp: settledPurchases > 0 ? settledSpend / settledPurchases : null,
      },
    },
    ads: weekAds.map(({ s, w }) => ({
      adId: s.adId, adName: s.adName,
      active: (adStatus.get(s.adId) ?? '') === 'ACTIVE',
      status: adStatus.get(s.adId) ?? '',
      week: w,
      confidence: confidenceFor(w.purchases, w.spend, blendedThisWeekCppCentavos),
    })),
    breakdowns: { placement: weekBreakdowns.placement, audience: weekBreakdowns.audience },
    funnel: weekBreakdowns.funnel,
    northStar,
    pacing,
  };

  return {
    brand, asOf: asOfSettled, dataMode,
    weekStart, weekEnd, settledCutoff,
    ads, campaign, thisWeek, malfunctions, cohorts,
    structure, recentChanges, winningCreatives,
    weeklyTrend, pastPlans, context: { dayOfWeek },
    priors, weights, openPredictions, lastVerdict,
    settings: { ...settings, economics: econ },
    backEnd: { webinarIncomeCentavos, dfyIncomeCentavos },
  };
}

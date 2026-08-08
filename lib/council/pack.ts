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
import { windowsFor } from './verdict-engine';
import { getExpertWeights } from './ledger';
import { getCreativeBriefs, type CreativeBrief } from './creative-context';
import type { AdDay, Brand, CouncilSettingsRow, PriorsRow, Role, Tier } from './types';

const MS_DAY = 86400000;

export type CouncilPack = {
  brand: Brand; asOf: string; dataMode: 'A' | 'B';
  ads: Array<{
    adId: string; adName: string; role: Role; verdict: Tier; daysInTier: number;
    windows: ReturnType<typeof windowsFor>; last14: AdDay[];
    /** What the creative IS (angle/persona/hook/quality) — null until analyzed. */
    creative: CreativeBrief | null;
  }>;
  campaign: {
    totalSpend7: number; blendedCpp7: number | null; blendedCppPrior7: number | null;
    daysSinceLastCreativeLaunch: number | null;
  };
  cohorts: Array<{
    weekStart: string; buyers: number; showUpPct: number | null;
    applications: number; frontRevenueCentavos: number; adSpendCentavos: number;
    cohortProfitCentavos: number | null;
  }>;
  priors: PriorsRow | null;
  weights: Record<'CHARLEY' | 'NICK' | 'BEN' | 'DARA' | 'CHAIR', number>;
  openPredictions: Array<{ expert: string; text: string; deadline: string }>;
  lastVerdict: { action: string; killSwitch: string; date: string } | null;
  settings: CouncilSettingsRow;
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

/** Assembles the full council data pack — everything Task 9 hands the LLM.
 *  Every fetch below is independent of every other, so they all run
 *  concurrently. `getSignups()` is the one heavy call (~2k rows) — called
 *  exactly once, here. */
export async function assemblePack(brand: Brand, asOfSettled: string): Promise<CouncilPack> {
  const [series, verdicts, priors, settings, weights, signups,
    webinarIncomeCentavos, dfyIncomeCentavos, openPredictions, lastVerdict, creativeBriefs] = await Promise.all([
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
  ]);

  const verdictByAdId = new Map(verdicts.map((v) => [v.adId, v]));
  const since21 = isoDaysBefore(asOfSettled, 20); // 21-day trailing window, inclusive of asOfSettled
  const since14 = isoDaysBefore(asOfSettled, 13); // 14-day trailing window, inclusive of asOfSettled

  // Single pass over every fetched ad series: computes windowsFor once per
  // ad, folding the result into BOTH the campaign totals (every ad
  // necessarily contributes, since an ad with 0 delivery days in the last 21
  // days trivially has 0 spend/purchases in the narrower 7-day windows too)
  // and `ads[]` (only ads with >=1 delivery day in the last 21 days).
  const ads: CouncilPack['ads'] = [];
  let totalSpend7 = 0, totalPurchases7 = 0, totalSpendPrior7 = 0, totalPurchasesPrior7 = 0;
  let newestFirstDelivery: string | null = null;
  for (const s of series) {
    const w = windowsFor(s, asOfSettled);
    totalSpend7 += w.spend7;
    totalPurchases7 += w.purchases7;
    totalSpendPrior7 += w.spendPrior7;
    totalPurchasesPrior7 += w.purchasesPrior7;

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
        windows: w,
        last14: s.days.filter((d) => d.date >= since14 && d.date <= asOfSettled),
        creative: creativeBriefs.get(s.adId) ?? null,
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
  };

  // One more pass over every fetched day, bounded to <= asOfSettled (again —
  // getAdSeries fetches relative to wall-clock "today", not asOfSettled, so
  // without this guard both figures below would silently include unsettled
  // days Meta hasn't finished attributing yet):
  //  - dataMode: union of distinct settled delivery dates across every ad.
  //  - spendByWeek: ad spend per ISO week, feeding cohorts[].adSpendCentavos
  //    below — this also means the CURRENT (in-progress) cohort week only
  //    counts its settled days so far, not the full calendar week.
  const distinctDates = new Set<string>();
  const spendByWeek = new Map<string, number>();
  for (const s of series) {
    for (const d of s.days) {
      if (d.date > asOfSettled) continue;
      distinctDates.add(d.date);
      const wk = weekStartOf(d.date);
      spendByWeek.set(wk, (spendByWeek.get(wk) ?? 0) + d.spendCentavos);
    }
  }
  const dataMode: 'A' | 'B' = distinctDates.size >= 14 ? 'B' : 'A';
  const cohorts = buildCohorts(signups, asOfSettled, spendByWeek);

  return {
    brand, asOf: asOfSettled, dataMode,
    ads, campaign, cohorts,
    priors, weights, openPredictions, lastVerdict, settings,
    backEnd: { webinarIncomeCentavos, dfyIncomeCentavos },
  };
}

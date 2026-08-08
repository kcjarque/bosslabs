/** Ads Council DB access layer — read/write for the council tables
 *  (ad_metrics_daily, ad_verdict_history, council_settings, ad_account_priors).
 *  Every later task (pipeline, pack, UI) reads/writes council data through
 *  here; nothing else touches these tables directly. Mirrors lib/db.ts
 *  conventions: snake_case rows, `rowTo*` converters, getSupabase() /
 *  isSupabaseConfigured() guards returning empty/defaults when unconfigured. */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type {
  AdSeries, AdDay, VerdictResult, CouncilSettingsRow, PriorsRow, Brand, Tier, Role, Mode,
} from './types';

const MS_DAY = 86400000;
/** ISO date (YYYY-MM-DD) `days` before today, floored to the day — matches the
 *  `new Date().toISOString().slice(0, 10)` "today" convention already used by
 *  meta-sync.ts and the backfill route. */
function isoDaysAgo(days: number): string {
  const todayMs = Date.parse(new Date().toISOString().slice(0, 10));
  return new Date(todayMs - days * MS_DAY).toISOString().slice(0, 10);
}

/* --------------------------------------------------------------------- */
/* ad_metrics_daily -> AdSeries                                          */
/* --------------------------------------------------------------------- */

type AdMetricsRow = {
  campaign_id: string; campaign_name: string;
  adset_id: string; adset_name: string;
  ad_id: string; ad_name: string;
  date: string;
  spend_centavos: number; impressions: number; reach: number;
  frequency: number | null; ctr: number | null; link_ctr: number | null; cpm: number | null;
  link_clicks: number; purchases: number; revenue_centavos: number;
  video_3s?: number | null; thruplays?: number | null; lp_views?: number | null;
};

function rowToAdDay(r: AdMetricsRow): AdDay {
  return {
    date: r.date,
    spendCentavos: r.spend_centavos,
    impressions: r.impressions,
    reach: r.reach,
    frequency: r.frequency,
    ctr: r.ctr,
    linkCtr: r.link_ctr,
    cpm: r.cpm,
    linkClicks: r.link_clicks,
    purchases: r.purchases,
    revenueCentavos: r.revenue_centavos,
    video3s: r.video_3s ?? 0,
    thruplays: r.thruplays ?? 0,
    lpViews: r.lp_views ?? 0,
  };
}

/** All ad-day rows for `brand` since (today - sinceDays), grouped into one
 *  AdSeries per ad_id with `days` ascending. Campaign/adset/ad names come
 *  from the LATEST row of each ad — rows arrive ordered ad_id asc, date asc,
 *  so within a given ad_id's run the last row seen is simply the newest; no
 *  separate max() pass needed. Paginated: PostgREST caps a single response at
 *  1000 rows and 120 days x dozens of ads blows past that. */
export async function getAdSeries(brand: Brand, sinceDays = 120): Promise<AdSeries[]> {
  if (!isSupabaseConfigured()) return [];
  const sinceIso = isoDaysAgo(sinceDays);
  const sb = getSupabase();
  const PAGE = 1000;
  const out: AdMetricsRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('ad_metrics_daily')
      .select('*')
      .eq('brand', brand)
      .gte('date', sinceIso)
      .order('ad_id', { ascending: true })
      .order('date', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`getAdSeries: ${error.message}`);
    const rows = (data as AdMetricsRow[]) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }

  const bySeries = new Map<string, AdSeries>();
  for (const r of out) {
    let s = bySeries.get(r.ad_id);
    if (!s) {
      s = {
        brand,
        campaignId: r.campaign_id, campaignName: r.campaign_name,
        adsetId: r.adset_id, adsetName: r.adset_name,
        adId: r.ad_id, adName: r.ad_name,
        days: [],
      };
      bySeries.set(r.ad_id, s);
    } else {
      // Later row for the same ad (still ascending date) — refresh names.
      s.campaignId = r.campaign_id; s.campaignName = r.campaign_name;
      s.adsetId = r.adset_id; s.adsetName = r.adset_name; s.adName = r.ad_name;
    }
    s.days.push(rowToAdDay(r));
  }
  return [...bySeries.values()];
}

/* --------------------------------------------------------------------- */
/* ad_verdict_history -> VerdictResult                                   */
/* --------------------------------------------------------------------- */

type VerdictRow = {
  brand: string; ad_id: string; ad_name: string; date: string;
  verdict: string; role: string;
  days_in_tier: number; changed: boolean; degraded: boolean;
  deciding_metrics: Record<string, number | null>;
  headline_advice: string; full_interpretation: string; tier_flip_condition: string;
};

function rowToVerdict(r: VerdictRow): VerdictResult {
  return {
    adId: r.ad_id, adName: r.ad_name, brand: r.brand as Brand,
    date: r.date,
    verdict: r.verdict as Tier, role: r.role as Role,
    daysInTier: r.days_in_tier, changed: r.changed, degraded: r.degraded,
    decidingMetrics: r.deciding_metrics ?? {},
    headline: r.headline_advice,
    interpretation: r.full_interpretation,
    tierFlipCondition: r.tier_flip_condition,
  };
}

/** Newest verdict row per ad for `brand`. PostgREST has no per-group "latest"
 *  query, so this pulls the last 7 days (paginated — same 1000-row cap) and
 *  keeps the newest row per ad_id in JS; every ad grades at least daily so 7
 *  days always covers the current verdict for every still-active ad. */
export async function getLatestVerdicts(brand: Brand): Promise<VerdictResult[]> {
  if (!isSupabaseConfigured()) return [];
  const sinceIso = isoDaysAgo(7);
  const sb = getSupabase();
  const PAGE = 1000;
  const out: VerdictRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('ad_verdict_history')
      .select('*')
      .eq('brand', brand)
      .gte('date', sinceIso)
      .order('date', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`getLatestVerdicts: ${error.message}`);
    const rows = (data as VerdictRow[]) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  const byAd = new Map<string, VerdictRow>();
  for (const r of out) byAd.set(r.ad_id, r); // ascending date -> last write wins = newest
  return [...byAd.values()].map(rowToVerdict);
}

/** One ad's verdict history, newest first, capped at `limit` (bounded by the
 *  caller so it never needs pagination). */
export async function getVerdictHistory(adId: string, limit = 60): Promise<VerdictResult[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('ad_verdict_history')
    .select('*')
    .eq('ad_id', adId)
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getVerdictHistory: ${error.message}`);
  return ((data as VerdictRow[]) ?? []).map(rowToVerdict);
}

/** Upsert one grading run's worth of verdicts, keyed (ad_id, date). */
export async function saveVerdicts(rows: VerdictResult[]): Promise<void> {
  if (!isSupabaseConfigured() || rows.length === 0) return;
  const payload = rows.map((v) => ({
    brand: v.brand, ad_id: v.adId, ad_name: v.adName, date: v.date,
    verdict: v.verdict, role: v.role,
    days_in_tier: v.daysInTier, changed: v.changed, degraded: v.degraded,
    deciding_metrics: v.decidingMetrics,
    headline_advice: v.headline,
    full_interpretation: v.interpretation,
    tier_flip_condition: v.tierFlipCondition,
  }));
  const { error } = await getSupabase()
    .from('ad_verdict_history')
    .upsert(payload, { onConflict: 'ad_id,date' });
  if (error) throw new Error(`saveVerdicts: ${error.message}`);
}

/** Any verdict row for `brand` dated `dateManila` — i.e. "did the pipeline
 *  already run today?" Head-count query, no rows fetched. */
export async function pipelineRanToday(brand: Brand, dateManila: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { count, error } = await getSupabase()
    .from('ad_verdict_history')
    .select('ad_id', { count: 'exact', head: true })
    .eq('brand', brand)
    .eq('date', dateManila);
  if (error) throw new Error(`pipelineRanToday: ${error.message}`);
  return (count ?? 0) > 0;
}

/* --------------------------------------------------------------------- */
/* council_settings                                                      */
/* --------------------------------------------------------------------- */

type CouncilSettingsRowDb = { brand: string; mode: string; target_cpp_centavos: number };

export async function getCouncilSettings(brand: Brand): Promise<CouncilSettingsRow> {
  if (!isSupabaseConfigured()) return { brand, mode: 'recommend', targetCppCentavos: 50000 };
  const { data, error } = await getSupabase()
    .from('council_settings')
    .select('*')
    .eq('brand', brand)
    .maybeSingle();
  if (error) throw new Error(`getCouncilSettings: ${error.message}`);
  if (!data) return { brand, mode: 'recommend', targetCppCentavos: 50000 };
  const r = data as CouncilSettingsRowDb;
  return { brand: r.brand as Brand, mode: r.mode as Mode, targetCppCentavos: r.target_cpp_centavos };
}

export async function saveCouncilSettings(row: CouncilSettingsRow): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const payload = {
    brand: row.brand,
    mode: row.mode,
    target_cpp_centavos: row.targetCppCentavos,
    updated_at: new Date().toISOString(),
  };
  const { error } = await getSupabase()
    .from('council_settings')
    .upsert(payload, { onConflict: 'brand' });
  if (error) throw new Error(`saveCouncilSettings: ${error.message}`);
}

/* --------------------------------------------------------------------- */
/* ad_account_priors                                                     */
/* --------------------------------------------------------------------- */

type PriorsRowDb = {
  brand: string;
  daily_cpp_sigma_pct: number | null;
  median_winner_lifespan_days: number | null;
  cpp_drift_pct_per_week: number | null;
  weekday_multipliers: Record<string, number> | null;
  sample_days: number;
};

function rowToPriors(r: PriorsRowDb): PriorsRow {
  return {
    brand: r.brand as Brand,
    dailyCppSigmaPct: r.daily_cpp_sigma_pct,
    medianWinnerLifespanDays: r.median_winner_lifespan_days,
    cppDriftPctPerWeek: r.cpp_drift_pct_per_week,
    weekdayMultipliers: r.weekday_multipliers,
    sampleDays: r.sample_days,
  };
}

export async function getPriors(brand: Brand): Promise<PriorsRow | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabase()
    .from('ad_account_priors')
    .select('*')
    .eq('brand', brand)
    .maybeSingle();
  if (error) throw new Error(`getPriors: ${error.message}`);
  return data ? rowToPriors(data as PriorsRowDb) : null;
}

export async function savePriors(row: PriorsRow): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const payload = {
    brand: row.brand,
    daily_cpp_sigma_pct: row.dailyCppSigmaPct,
    median_winner_lifespan_days: row.medianWinnerLifespanDays,
    cpp_drift_pct_per_week: row.cppDriftPctPerWeek,
    weekday_multipliers: row.weekdayMultipliers,
    sample_days: row.sampleDays,
    computed_at: new Date().toISOString(),
  };
  const { error } = await getSupabase()
    .from('ad_account_priors')
    .upsert(payload, { onConflict: 'brand' });
  if (error) throw new Error(`savePriors: ${error.message}`);
}

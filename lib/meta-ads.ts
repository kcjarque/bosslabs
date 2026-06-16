/**
 * Meta Ads — live insights for the BOSSLABS AI | SALES campaign.
 *
 * Server-only. Fetches the campaign + its ad sets + its ads from the Graph API
 * (one call per level, entity attributes + nested insights via field expansion)
 * and normalises every metric the dashboard/table shows. No data is stored —
 * the page reads this live, so it's always current. Matches how BrandHub pulls
 * Meta, minus all the AI/advisor/recommendation logic.
 *
 * Needs META_ADS_TOKEN (System-User token, ads_read on the SSA Back up 2
 * account). Without it, getAdsReport returns { configured: false } and the page
 * shows a connect-token prompt instead of erroring.
 */

import { unstable_cache } from 'next/cache';
import { upsertAdSpendDay } from './db';

/**
 * Cached view of getAdsReport for the /admin/ads page. The raw report fires 3
 * live Graph API calls (1–3s each); without caching, every nav to the page paid
 * that cost. Cached 120s per range and tagged 'ads-report' so the page's Refresh
 * button (which calls revalidateTag) still forces a fresh pull on demand.
 */
export function getAdsReportCached(rangeKey: AdsRangeKey = 'all'): Promise<AdsReport> {
  return unstable_cache(() => getAdsReport(rangeKey), ['ads-report', rangeKey], {
    revalidate: 120,
    tags: ['ads-report'],
  })();
}

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';
const CAMPAIGN_ID = process.env.META_ADS_CAMPAIGN_ID || '120247301997590236';
const CAMPAIGN_NAME = 'BOSSLABS AI | SALES';

/** Date windows the page can request → Graph date_preset. */
export const ADS_RANGES = [
  { key: 'today', label: 'Today', preset: 'today' },
  { key: '7d', label: '7 days', preset: 'last_7d' },
  { key: '30d', label: '30 days', preset: 'last_30d' },
  { key: '90d', label: '90 days', preset: 'last_90d' },
  { key: 'all', label: 'All time', preset: 'maximum' },
] as const;

export type AdsRangeKey = (typeof ADS_RANGES)[number]['key'];

export type AdMetrics = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  results: number;
  costPerResult: number | null;
  linkCtr: number | null; // % (inline link-click CTR)
  ctr: number | null; // % (all clicks)
  cpm: number | null;
  frequency: number | null;
  roas: number | null;
};

export type AdEntity = AdMetrics & {
  level: 'campaign' | 'adset' | 'ad';
  id: string;
  name: string;
  status: string; // raw effective_status
  active: boolean;
  parentId?: string; // ad → adset id
};

export type AdsReport =
  | { configured: false }
  | {
      configured: true;
      campaign: AdEntity | null;
      adsets: AdEntity[];
      ads: AdEntity[];
      rangeLabel: string;
      error?: string;
    };

/* ── parse helpers (Graph shapes are messy: strings, arrays, nested) ──────── */

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** results / cost_per_result arrive as [{indicator, values:[{value}]}] (raw) or
 *  {value:[...]} (some clients). Missing `values` = zero results that window. */
function nestedMetric(field: unknown): number | null {
  if (field == null) return null;
  let arr: unknown = field;
  if (!Array.isArray(arr) && typeof arr === 'object' && arr && 'value' in arr) {
    arr = (arr as { value: unknown }).value;
  }
  if (Array.isArray(arr)) {
    const v = (arr[0] as { values?: Array<{ value?: unknown }> } | undefined)?.values?.[0]?.value;
    return v == null ? null : num(v);
  }
  return num(field);
}

/** purchase_roas: [{action_type, value}] (raw) | "Not available" | number. */
function roasVal(field: unknown): number | null {
  if (field == null) return null;
  if (Array.isArray(field)) {
    const v = (field[0] as { value?: unknown } | undefined)?.value;
    return v == null ? null : num(v);
  }
  if (typeof field === 'string') {
    if (/not available/i.test(field)) return null;
    const n = parseFloat(field);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof field === 'number') return field;
  return null;
}

type RawInsights = { data?: Array<Record<string, unknown>> };

function metricsFrom(insights: RawInsights | undefined): AdMetrics {
  const d = insights?.data?.[0] ?? {};
  return {
    spend: num(d.spend),
    impressions: num(d.impressions),
    reach: num(d.reach),
    clicks: num(d.clicks),
    results: nestedMetric(d.results) ?? 0,
    costPerResult: nestedMetric(d.cost_per_result),
    linkCtr: d.inline_link_click_ctr != null ? num(d.inline_link_click_ctr) : null,
    ctr: d.ctr != null ? num(d.ctr) : null,
    cpm: d.cpm != null ? num(d.cpm) : null,
    frequency: d.frequency != null ? num(d.frequency) : null,
    roas: roasVal(d.purchase_roas),
  };
}

const INSIGHT_FIELDS =
  'spend,impressions,reach,clicks,ctr,cpm,frequency,inline_link_click_ctr,results,cost_per_result,purchase_roas';

async function graph(path: string, fields: string): Promise<unknown> {
  const token = process.env.META_ADS_TOKEN as string;
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${path}` +
    `?fields=${encodeURIComponent(fields)}&limit=500&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { cache: 'no-store' });
  return res.json();
}

/**
 * Current budget configured in Ads Manager (centavos — Meta returns budgets in
 * the account's minor currency unit). Handles CBO (budget on the campaign) and
 * ABO (sum of the ACTIVE ad sets' budgets). Best-effort: any failure → nulls so
 * the caller degrades gracefully. Used to show set-vs-spent budget progression.
 */
export async function getCampaignBudget(): Promise<{
  dailyCentavos: number | null;
  lifetimeCentavos: number | null;
}> {
  if (!process.env.META_ADS_TOKEN) return { dailyCentavos: null, lifetimeCentavos: null };
  try {
    const campRaw = (await graph(CAMPAIGN_ID, 'id,daily_budget,lifetime_budget')) as {
      daily_budget?: string;
      lifetime_budget?: string;
    };
    let daily = campRaw.daily_budget ? Number(campRaw.daily_budget) : 0;
    let lifetime = campRaw.lifetime_budget ? Number(campRaw.lifetime_budget) : 0;
    // CBO has no campaign budget → fall back to ABO (active ad sets).
    if (!daily && !lifetime) {
      const adsetsRaw = (await graph(
        `${CAMPAIGN_ID}/adsets`,
        'id,effective_status,daily_budget,lifetime_budget',
      )) as { data?: Array<Record<string, unknown>> };
      for (const a of adsetsRaw?.data ?? []) {
        if (String(a.effective_status ?? '').toUpperCase() !== 'ACTIVE') continue;
        daily += a.daily_budget ? Number(a.daily_budget) : 0;
        lifetime += a.lifetime_budget ? Number(a.lifetime_budget) : 0;
      }
    }
    return { dailyCentavos: daily || null, lifetimeCentavos: lifetime || null };
  } catch {
    return { dailyCentavos: null, lifetimeCentavos: null };
  }
}

/**
 * Live report for the BOSSLABS campaign at the given window. Best-effort: any
 * Graph failure returns { configured:true, error } with whatever resolved, so
 * the page degrades instead of 500-ing.
 */
export async function getAdsReport(rangeKey: AdsRangeKey = 'all'): Promise<AdsReport> {
  if (!process.env.META_ADS_TOKEN) return { configured: false };

  const range = ADS_RANGES.find((r) => r.key === rangeKey) ?? ADS_RANGES[ADS_RANGES.length - 1];
  const win = `insights.date_preset(${range.preset}){${INSIGHT_FIELDS}}`;

  try {
    const [campRaw, adsetsRaw, adsRaw] = await Promise.all([
      graph(CAMPAIGN_ID, `id,name,effective_status,${win}`),
      graph(`${CAMPAIGN_ID}/adsets`, `id,name,effective_status,${win}`),
      graph(`${CAMPAIGN_ID}/ads`, `id,name,effective_status,adset{id,name},${win}`),
    ]);

    const firstError =
      (campRaw as { error?: { message?: string } })?.error?.message ||
      (adsetsRaw as { error?: { message?: string } })?.error?.message ||
      (adsRaw as { error?: { message?: string } })?.error?.message;

    const c = campRaw as {
      id?: string;
      name?: string;
      effective_status?: string;
      insights?: RawInsights;
    };
    const campaign: AdEntity | null = c?.id
      ? {
          level: 'campaign',
          id: c.id,
          name: c.name || CAMPAIGN_NAME,
          status: c.effective_status || '',
          active: (c.effective_status || '').toUpperCase() === 'ACTIVE',
          ...metricsFrom(c.insights),
        }
      : null;

    const adsets: AdEntity[] = (
      (adsetsRaw as { data?: Array<Record<string, unknown>> })?.data ?? []
    ).map((a) => ({
      level: 'adset' as const,
      id: String(a.id),
      name: String(a.name ?? ''),
      status: String(a.effective_status ?? ''),
      active: String(a.effective_status ?? '').toUpperCase() === 'ACTIVE',
      ...metricsFrom(a.insights as RawInsights | undefined),
    }));

    const ads: AdEntity[] = (
      (adsRaw as { data?: Array<Record<string, unknown>> })?.data ?? []
    ).map((a) => ({
      level: 'ad' as const,
      id: String(a.id),
      name: String(a.name ?? ''),
      status: String(a.effective_status ?? ''),
      active: String(a.effective_status ?? '').toUpperCase() === 'ACTIVE',
      parentId: (a.adset as { id?: string } | undefined)?.id,
      ...metricsFrom(a.insights as RawInsights | undefined),
    }));

    return { configured: true, campaign, adsets, ads, rangeLabel: range.label, error: firstError };
  } catch (err) {
    return {
      configured: true,
      campaign: null,
      adsets: [],
      ads: [],
      rangeLabel: range.label,
      error: String(err),
    };
  }
}

/** YYYY-MM-DD in Manila for a ms timestamp. */
function manilaDate(ms: number): string {
  return new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Asia/Manila' });
}

/**
 * Pull daily campaign spend for the last `daysBack` days THROUGH today and
 * upsert into ad_spend_daily, OVERWRITING each day. Re-running corrects a
 * partial day (today, or a yesterday that was synced before midnight) to the
 * full day's total — that's why the Refresh button re-pulls a wide window.
 * Shared by the nightly cron and the Refresh button. Best-effort.
 */
export async function syncAdSpendDaily(
  daysBack = 3,
): Promise<{ synced: string[]; error?: string }> {
  const token = process.env.META_ADS_TOKEN;
  if (!token) return { synced: [], error: 'META_ADS_TOKEN not configured' };

  const now = Date.now();
  const since = manilaDate(now - daysBack * 86400_000);
  const until = manilaDate(now); // include today so partial days get refreshed
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${CAMPAIGN_ID}/insights` +
    `?fields=spend,impressions,clicks,reach&level=campaign&time_increment=1` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
    `&access_token=${encodeURIComponent(token)}`;

  // Snapshot the CURRENT set budget so each synced (recent) day records what was
  // configured. Meta has no per-day budget history, so this captures it forward:
  // every nightly run stamps the live budget onto the recent days it overwrites.
  const { dailyCentavos: budgetSetCentavos } = await getCampaignBudget().catch(() => ({
    dailyCentavos: null,
  }));

  const synced: string[] = [];
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const json = (await res.json()) as {
      data?: Array<{
        date_start?: string;
        spend?: string;
        impressions?: string;
        clicks?: string;
        reach?: string;
      }>;
      error?: { message?: string };
    };
    if (json.error) return { synced, error: json.error.message };
    for (const row of json.data ?? []) {
      if (!row.date_start) continue;
      const ok = await upsertAdSpendDay({
        date: row.date_start,
        spendCentavos: Math.round(parseFloat(row.spend ?? '0') * 100),
        impressions: parseInt(row.impressions ?? '0', 10) || 0,
        clicks: parseInt(row.clicks ?? '0', 10) || 0,
        reach: parseInt(row.reach ?? '0', 10) || 0,
        campaignId: CAMPAIGN_ID,
        budgetSetCentavos,
      });
      if (ok) synced.push(row.date_start);
    }
    return { synced };
  } catch (err) {
    return { synced, error: String(err) };
  }
}

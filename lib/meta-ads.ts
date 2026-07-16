/**
 * Meta Ads — live insights for every tracked campaign (see tracked_campaigns
 * in lib/db.ts, managed from the Ads → Settings tab).
 *
 * Server-only. Fetches each tracked campaign + its ad sets + its ads from the
 * Graph API (one call per level, entity attributes + nested insights via field
 * expansion) and normalises every metric the dashboard/table shows, then sums
 * across campaigns for the summary cards. No data is stored — the page reads
 * this live, so it's always current. Matches how BrandHub pulls Meta, minus
 * all the AI/advisor/recommendation logic.
 *
 * Needs META_ADS_TOKEN (System-User token, ads_read on the SSA Back up 2
 * account). Without it, getAdsReport returns { configured: false } and the page
 * shows a connect-token prompt instead of erroring.
 */

import { unstable_cache } from 'next/cache';
import { upsertAdSpendDay, getTrackedCampaigns } from './db';

/**
 * Cached view of getAdsReport for the /admin/ads page. The raw report fires 3
 * live Graph API calls per tracked campaign (1–3s each); without caching,
 * every nav to the page paid that cost. Cached 120s per range and tagged
 * 'ads-report' so the page's Refresh button and the Settings save action
 * (which both call revalidateTag) still force a fresh pull on demand.
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
const ACCOUNT_ID = process.env.META_ADS_ACCOUNT_ID || '118264717761938';

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
  /** Only populated for level='ad'. Small creative thumbnail from Meta,
   *  shown next to the ad name so admins can eyeball what's running before
   *  opening the full preview modal. Null when the ad has no image creative
   *  (rare — usually happens for pure text or DPA ads). */
  thumbnailUrl?: string | null;
};

export type AdsReport =
  | { configured: false }
  | {
      configured: true;
      /** One row per tracked campaign (Ads → Settings). */
      campaigns: AdEntity[];
      /** Aggregate across all tracked campaigns, for the summary cards. */
      totals: AdEntity | null;
      /** adset.parentId = campaign id */
      adsets: AdEntity[];
      /** ad.parentId = adset id */
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

/** Combine several campaigns' metrics into one total. Rates (CTR, CPM,
 *  frequency, ROAS) are recomputed from the summed raw numbers rather than
 *  averaged, so the result matches what a single combined campaign would
 *  report — not just a mean of means. */
function sumMetrics(list: AdMetrics[]): AdMetrics {
  const spend = list.reduce((s, m) => s + m.spend, 0);
  const impressions = list.reduce((s, m) => s + m.impressions, 0);
  const reach = list.reduce((s, m) => s + m.reach, 0);
  const clicks = list.reduce((s, m) => s + m.clicks, 0);
  const results = list.reduce((s, m) => s + m.results, 0);
  const revenue = list.reduce((s, m) => s + (m.roas != null ? m.roas * m.spend : 0), 0);
  const linkClicksWeighted = list.reduce(
    (s, m) => s + (m.linkCtr != null ? m.linkCtr * m.impressions : 0),
    0,
  );
  return {
    spend,
    impressions,
    reach,
    clicks,
    results,
    costPerResult: results > 0 ? spend / results : null,
    linkCtr: impressions > 0 ? linkClicksWeighted / impressions : null,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    frequency: reach > 0 ? impressions / reach : null,
    roas: spend > 0 ? revenue / spend : null,
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

/** Tracked campaigns (Ads → Settings), or the legacy single campaign when
 *  none are configured yet / everything got unchecked. */
async function resolveTrackedTargets(): Promise<{ id: string; name: string }[]> {
  const tracked = await getTrackedCampaigns();
  const on = tracked.filter((c) => c.tracked).map((c) => ({ id: c.campaignId, name: c.campaignName }));
  return on.length > 0 ? on : [{ id: CAMPAIGN_ID, name: CAMPAIGN_NAME }];
}

/**
 * Live report across all tracked campaigns at the given window. Best-effort:
 * a single campaign's Graph failure doesn't blank out the others — it's
 * skipped and surfaced via `error`, so the page degrades instead of 500-ing.
 */
export async function getAdsReport(rangeKey: AdsRangeKey = 'all'): Promise<AdsReport> {
  if (!process.env.META_ADS_TOKEN) return { configured: false };

  const range = ADS_RANGES.find((r) => r.key === rangeKey) ?? ADS_RANGES[ADS_RANGES.length - 1];
  const win = `insights.date_preset(${range.preset}){${INSIGHT_FIELDS}}`;
  const targets = await resolveTrackedTargets();

  try {
    const perCampaign = await Promise.all(
      targets.map(async (t) => {
        try {
          const [campRaw, adsetsRaw, adsRaw] = await Promise.all([
            graph(t.id, `id,name,effective_status,${win}`),
            graph(`${t.id}/adsets`, `id,name,effective_status,${win}`),
            graph(
              `${t.id}/ads`,
              `id,name,effective_status,adset{id,name},creative{thumbnail_url,image_url},${win}`,
            ),
          ]);
          return { target: t, campRaw, adsetsRaw, adsRaw, fetchError: undefined as string | undefined };
        } catch (err) {
          return { target: t, campRaw: null, adsetsRaw: null, adsRaw: null, fetchError: String(err) };
        }
      }),
    );

    let firstError: string | undefined;
    const campaigns: AdEntity[] = [];
    const adsets: AdEntity[] = [];
    const ads: AdEntity[] = [];

    for (const { target, campRaw, adsetsRaw, adsRaw, fetchError } of perCampaign) {
      firstError =
        firstError ||
        fetchError ||
        (campRaw as { error?: { message?: string } } | null)?.error?.message ||
        (adsetsRaw as { error?: { message?: string } } | null)?.error?.message ||
        (adsRaw as { error?: { message?: string } } | null)?.error?.message;
      if (!campRaw) continue;

      const c = campRaw as {
        id?: string;
        name?: string;
        effective_status?: string;
        insights?: RawInsights;
      };
      if (c?.id) {
        campaigns.push({
          level: 'campaign',
          id: c.id,
          name: c.name || target.name,
          status: c.effective_status || '',
          active: (c.effective_status || '').toUpperCase() === 'ACTIVE',
          ...metricsFrom(c.insights),
        });
      }

      for (const a of (adsetsRaw as { data?: Array<Record<string, unknown>> } | null)?.data ?? []) {
        adsets.push({
          level: 'adset',
          id: String(a.id),
          name: String(a.name ?? ''),
          status: String(a.effective_status ?? ''),
          active: String(a.effective_status ?? '').toUpperCase() === 'ACTIVE',
          parentId: target.id,
          ...metricsFrom(a.insights as RawInsights | undefined),
        });
      }

      for (const a of (adsRaw as { data?: Array<Record<string, unknown>> } | null)?.data ?? []) {
        const creative = a.creative as { thumbnail_url?: string; image_url?: string } | undefined;
        ads.push({
          level: 'ad',
          id: String(a.id),
          name: String(a.name ?? ''),
          status: String(a.effective_status ?? ''),
          active: String(a.effective_status ?? '').toUpperCase() === 'ACTIVE',
          parentId: (a.adset as { id?: string } | undefined)?.id,
          // Prefer the small thumbnail; fall back to the full image_url when
          // Meta doesn't ship a thumbnail (some creatives skip it).
          thumbnailUrl: creative?.thumbnail_url ?? creative?.image_url ?? null,
          ...metricsFrom(a.insights as RawInsights | undefined),
        });
      }
    }

    const totals: AdEntity | null =
      campaigns.length > 0
        ? {
            level: 'campaign',
            id: 'totals',
            name: campaigns.length === 1 ? campaigns[0].name : `${campaigns.length} tracked campaigns`,
            status: '',
            active: campaigns.some((c) => c.active),
            ...sumMetrics(campaigns),
          }
        : null;

    return { configured: true, campaigns, totals, adsets, ads, rangeLabel: range.label, error: firstError };
  } catch (err) {
    return {
      configured: true,
      campaigns: [],
      totals: null,
      adsets: [],
      ads: [],
      rangeLabel: range.label,
      error: String(err),
    };
  }
}

/* ── Ad preview HTML (Meta's official iframe render) ────────────────────── */

// Format enum lives in a separate client-safe file so client components can
// import it without dragging lib/db.ts (and its Node `fs` deps) into the
// browser bundle. Re-exported here so server-side callers still get one import.
export { AD_PREVIEW_FORMATS, type AdPreviewFormat } from './meta-ads-formats';
import type { AdPreviewFormat } from './meta-ads-formats';

/** Meta returns `<iframe src="..." width="..." height="...">…</iframe>` in a
 *  body field. We extract src + width + height so we can render our own
 *  sandboxed iframe (safer than dangerouslySetInnerHTML). Any regex miss
 *  falls back to the raw HTML string. */
function parsePreviewIframe(html: string): { src?: string; width?: number; height?: number; raw: string } {
  const src = /src=["']([^"']+)["']/i.exec(html)?.[1];
  const width = Number(/width=["']?(\d+)/i.exec(html)?.[1]) || undefined;
  const height = Number(/height=["']?(\d+)/i.exec(html)?.[1]) || undefined;
  return { src, width, height, raw: html };
}

export async function getAdPreview(
  adId: string,
  format: AdPreviewFormat = 'DESKTOP_FEED_STANDARD',
): Promise<{ ok: false; error: string } | { ok: true; src?: string; width?: number; height?: number; raw: string }> {
  const token = process.env.META_ADS_TOKEN;
  if (!token) return { ok: false, error: 'META_ADS_TOKEN not configured' };
  // /previews takes ad_format as its own query param — NOT inside ?fields=,
  // so we bypass the graph() helper (which is shaped for ?fields=…).
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${adId}/previews` +
    `?ad_format=${encodeURIComponent(format)}` +
    `&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const json = (await res.json()) as {
      data?: Array<{ body?: string }>;
      error?: { message?: string };
    };
    if (json.error) return { ok: false, error: json.error.message ?? 'Meta error' };
    const body = json.data?.[0]?.body;
    if (!body) return { ok: false, error: 'No preview returned for this ad + format.' };
    return { ok: true, ...parsePreviewIframe(body) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** YYYY-MM-DD in Manila for a ms timestamp. */
function manilaDate(ms: number): string {
  return new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Asia/Manila' });
}

/** List all campaigns in the ad account for the Settings picker. */
export type CampaignSummary = { id: string; name: string; status: string };

export async function getAccountCampaigns(): Promise<CampaignSummary[]> {
  const token = process.env.META_ADS_TOKEN;
  if (!token) return [];
  try {
    const url =
      `https://graph.facebook.com/${GRAPH_VERSION}/act_${ACCOUNT_ID}/campaigns` +
      `?fields=id,name,effective_status&limit=50&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { cache: 'no-store' });
    const json = (await res.json()) as {
      data?: Array<{ id: string; name: string; effective_status: string }>;
      error?: { message: string };
    };
    if (json.error) return [];
    return (json.data ?? []).map((c) => ({ id: c.id, name: c.name, status: c.effective_status }));
  } catch {
    return [];
  }
}

/** Pull daily spend for one campaign and upsert rows. Returns synced dates. */
async function syncOneCampaign(
  campaignId: string,
  token: string,
  since: string,
  until: string,
): Promise<string[]> {
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${campaignId}/insights` +
    `?fields=spend,impressions,clicks,reach&level=campaign&time_increment=1` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
    `&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const json = (await res.json()) as {
      data?: Array<{ date_start?: string; spend?: string; impressions?: string; clicks?: string; reach?: string }>;
      error?: { message?: string };
    };
    if (json.error) return [];
    const synced: string[] = [];
    for (const row of json.data ?? []) {
      if (!row.date_start) continue;
      const ok = await upsertAdSpendDay({
        date: row.date_start,
        spendCentavos: Math.round(parseFloat(row.spend ?? '0') * 100),
        impressions: parseInt(row.impressions ?? '0', 10) || 0,
        clicks: parseInt(row.clicks ?? '0', 10) || 0,
        reach: parseInt(row.reach ?? '0', 10) || 0,
        campaignId,
      });
      if (ok) synced.push(row.date_start);
    }
    return synced;
  } catch {
    return [];
  }
}

/**
 * Pull daily campaign spend for the last `daysBack` days THROUGH today and
 * upsert into ad_spend_daily, OVERWRITING each day. Loops over all provided
 * campaignIds (or falls back to the default env campaign). Shared by the
 * nightly cron and the Refresh button. Best-effort.
 */
export async function syncAdSpendDaily(
  daysBack = 3,
  campaignIds: string[] = [],
): Promise<{ synced: string[]; error?: string }> {
  const token = process.env.META_ADS_TOKEN;
  if (!token) return { synced: [], error: 'META_ADS_TOKEN not configured' };

  const ids = campaignIds.length > 0 ? campaignIds : [CAMPAIGN_ID];
  const now = Date.now();
  const since = manilaDate(now - daysBack * 86400_000);
  const until = manilaDate(now);

  const allSynced: string[] = [];
  let firstError: string | undefined;
  for (const id of ids) {
    try {
      const dates = await syncOneCampaign(id, token, since, until);
      allSynced.push(...dates);
    } catch (err) {
      firstError = firstError ?? String(err);
    }
  }
  return { synced: allSynced, ...(firstError ? { error: firstError } : {}) };
}

/** One ad's metrics for a single day. Revenue = pixel-tracked purchase value
 *  (action_values, which equals spend × purchase_roas). Amounts in pesos. */
export type AdDailyRow = {
  date: string; // YYYY-MM-DD
  adId: string;
  adName: string;
  impressions: number;
  spend: number;
  revenue: number;
};

/**
 * Per-AD daily insights for a specific set of ads (level=ad, time_increment=1),
 * filtered server-side to the given ad ids. Powers the affiliate dashboard's
 * "your ads" view: daily impressions + pixel-tracked revenue for the ads linked
 * to that affiliate. Live (no storage) — returns [] if the token is missing or
 * no ids are given. Follows Graph paging.
 */
export async function getAdDailyInsights(
  adIds: string[],
  preset: 'last_7d' | 'last_30d' | 'last_90d' | 'maximum' = 'last_30d',
): Promise<AdDailyRow[]> {
  const token = process.env.META_ADS_TOKEN;
  if (!token || adIds.length === 0) return [];
  const filtering = JSON.stringify([{ field: 'ad.id', operator: 'IN', value: adIds }]);
  const fields = 'ad_id,ad_name,impressions,spend,action_values';
  let url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${CAMPAIGN_ID}/insights` +
    `?level=ad&time_increment=1&date_preset=${preset}` +
    `&fields=${encodeURIComponent(fields)}` +
    `&filtering=${encodeURIComponent(filtering)}` +
    `&limit=500&access_token=${encodeURIComponent(token)}`;
  const out: AdDailyRow[] = [];
  try {
    for (let guard = 0; guard < 25 && url; guard++) {
      const res = await fetch(url, { cache: 'no-store' });
      const j = (await res.json()) as {
        data?: Array<Record<string, unknown>>;
        paging?: { next?: string };
        error?: unknown;
      };
      if (j.error || !Array.isArray(j.data)) break;
      for (const r of j.data) {
        const av = r.action_values as Array<{ action_type?: string; value?: unknown }> | undefined;
        const purchase = av?.find((x) => x.action_type === 'purchase' || x.action_type === 'omni_purchase');
        out.push({
          date: String(r.date_start ?? ''),
          adId: String(r.ad_id ?? ''),
          adName: String(r.ad_name ?? r.ad_id ?? ''),
          impressions: num(r.impressions),
          spend: num(r.spend),
          revenue: purchase ? num(purchase.value) : 0,
        });
      }
      url = j.paging?.next ?? '';
    }
  } catch {
    /* live fetch failed — return whatever we gathered (possibly []) */
  }
  return out;
}

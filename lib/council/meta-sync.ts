/** Per-ad daily insights → ad_metrics_daily. Backfill + nightly incremental
 *  share this one function; (ad_id,date) upsert makes it idempotent. */
import { getSupabase } from '@/lib/supabase';
import type { Brand } from './types';

const GRAPH = process.env.META_GRAPH_VERSION || 'v23.0';
const ACCOUNT = process.env.META_ADS_ACCOUNT_ID || '118264717761938';

const num = (x: unknown): number => { const n = Number(x); return Number.isFinite(n) ? n : 0; };

export function brandFromCampaignName(name: string): Brand | null {
  const up = name.toUpperCase();
  if (up.startsWith('BOSSLABS')) return 'BOSS';
  if (up.startsWith('MEDIA') || up.startsWith('CONEX')) return 'CONX';
  if (up.startsWith('AHENTE') || up.startsWith('LEO')) return 'LEO';
  return null;
}

type InsightRow = {
  date_start: string; campaign_id: string; campaign_name: string;
  adset_id: string; adset_name: string; ad_id: string; ad_name: string;
  spend?: string; impressions?: string; reach?: string; frequency?: string;
  ctr?: string; inline_link_click_ctr?: string; cpm?: string; inline_link_clicks?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
};

function purchasesOf(r: InsightRow): number {
  const a = r.actions ?? [];
  const pick = (t: string) => a.find((x) => x.action_type === t)?.value;
  const v = pick('omni_purchase') ?? pick('purchase') ?? pick('offsite_conversion.fb_pixel_purchase');
  return v ? Math.round(num(v)) : 0;
}
function revenueOf(r: InsightRow): number {
  const a = r.action_values ?? [];
  const pick = (t: string) => a.find((x) => x.action_type === t)?.value;
  const v = pick('omni_purchase') ?? pick('purchase') ?? pick('offsite_conversion.fb_pixel_purchase');
  return v ? Math.round(num(v) * 100) : 0;
}

/** Pull ad-level daily insights for [since, until] (YYYY-MM-DD, inclusive) and upsert. */
export async function syncAdMetricsDaily(opts: { since: string; until: string }): Promise<{ rows: number; ads: number }> {
  const token = process.env.META_ADS_TOKEN;
  if (!token) throw new Error('META_ADS_TOKEN not set');
  const fields = [
    'date_start', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
    'spend', 'impressions', 'reach', 'frequency', 'ctr', 'inline_link_click_ctr', 'cpm',
    'inline_link_clicks', 'actions', 'action_values',
  ].join(',');
  let url: string | null =
    `https://graph.facebook.com/${GRAPH}/act_${ACCOUNT}/insights` +
    `?level=ad&time_increment=1&limit=500&fields=${fields}` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since: opts.since, until: opts.until }))}` +
    `&access_token=${token}`;
  const rows: Record<string, unknown>[] = [];
  const adIds = new Set<string>();
  for (let guard = 0; guard < 25 && url; guard++) {
    const res = await fetch(url, { cache: 'no-store' });
    const json = (await res.json()) as { data?: InsightRow[]; paging?: { next?: string }; error?: { message: string } };
    if (json.error) throw new Error(`Meta insights: ${json.error.message}`);
    for (const r of json.data ?? []) {
      const brand = brandFromCampaignName(r.campaign_name ?? '');
      if (brand !== 'BOSS') continue; // launch scope: BOSS only (spec decision 2)
      adIds.add(r.ad_id);
      rows.push({
        brand, campaign_id: r.campaign_id, campaign_name: r.campaign_name,
        adset_id: r.adset_id ?? '', adset_name: r.adset_name ?? '',
        ad_id: r.ad_id, ad_name: r.ad_name ?? '', date: r.date_start,
        spend_centavos: Math.round(num(r.spend ?? 0) * 100),
        impressions: num(r.impressions ?? 0), reach: num(r.reach ?? 0),
        frequency: r.frequency != null ? num(r.frequency) : null,
        ctr: r.ctr != null ? num(r.ctr) : null,
        link_ctr: r.inline_link_click_ctr != null ? num(r.inline_link_click_ctr) : null,
        cpm: r.cpm != null ? num(r.cpm) : null,
        link_clicks: num(r.inline_link_clicks ?? 0),
        purchases: purchasesOf(r), revenue_centavos: revenueOf(r),
        synced_at: new Date().toISOString(),
      });
    }
    url = json.paging?.next ?? null;
  }
  const sb = getSupabase();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from('ad_metrics_daily').upsert(rows.slice(i, i + 500), { onConflict: 'ad_id,date' });
    if (error) throw new Error(`ad_metrics_daily upsert: ${error.message}`);
  }
  return { rows: rows.length, ads: adIds.size };
}

/**
 * Affiliate ↔ Meta ad links + the live stats an affiliate sees for the ads we
 * assigned them. Admins pick the ads (the FB connection is manual — only we can
 * see the ad account); the affiliate dashboard then reads impressions +
 * pixel-tracked revenue live from Meta and pays a % commission on that revenue.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { getAdDailyInsights, type AdDailyRow } from './meta-ads';

export type AdLink = { adId: string; adName: string };

/** Ads currently linked to one affiliate. */
export async function listAffiliateAdLinks(affiliateId: string): Promise<AdLink[]> {
  if (!isSupabaseConfigured() || !affiliateId) return [];
  const { data, error } = await getSupabase()
    .from('affiliate_ad_links')
    .select('ad_id, ad_name')
    .eq('affiliate_id', affiliateId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return (data as Array<{ ad_id: string; ad_name: string | null }>).map((r) => ({
    adId: r.ad_id,
    adName: r.ad_name ?? r.ad_id,
  }));
}

/** All links across affiliates — lets the admin picker show which ads are taken. */
export async function listAllAdLinks(): Promise<Array<{ affiliateId: string; adId: string }>> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase().from('affiliate_ad_links').select('affiliate_id, ad_id');
  if (error || !data) return [];
  return (data as Array<{ affiliate_id: string; ad_id: string }>).map((r) => ({
    affiliateId: r.affiliate_id,
    adId: r.ad_id,
  }));
}

/** Replace an affiliate's linked-ads set with exactly `ads` (delete-then-insert). */
export async function setAffiliateAds(affiliateId: string, ads: AdLink[]): Promise<void> {
  if (!isSupabaseConfigured() || !affiliateId) return;
  const sb = getSupabase();
  await sb.from('affiliate_ad_links').delete().eq('affiliate_id', affiliateId);
  if (ads.length === 0) return;
  const rows = ads.map((a) => ({ affiliate_id: affiliateId, ad_id: a.adId, ad_name: a.adName || null }));
  const { error } = await sb.from('affiliate_ad_links').insert(rows);
  if (error) throw new Error(`setAffiliateAds: ${error.message}`);
}

export type AffiliateAdStats = {
  windowLabel: string;
  totals: { impressions: number; revenue: number; commission: number };
  perAd: Array<{ adId: string; adName: string; impressions: number; revenue: number; commission: number }>;
  daily: Array<{ date: string; impressions: number; revenue: number; commission: number }>;
};

const WINDOW_DAYS = 90;

/** Last N calendar dates (UTC) as YYYY-MM-DD, oldest first — fills gaps so the
 *  chart has a continuous axis even on days an ad didn't deliver. */
function lastNDates(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Live per-ad stats for an affiliate's linked ads over the last 90 days, plus a
 * gap-filled daily series. Revenue is Meta's pixel-tracked purchase value;
 * commission = revenue × ratePct%. Returns null when no ads are linked.
 */
export async function getAffiliateAdStats(adIds: string[], ratePct: number): Promise<AffiliateAdStats | null> {
  if (adIds.length === 0) return null;
  const rate = (Number.isFinite(ratePct) ? ratePct : 5) / 100;
  // Read the twice-daily snapshot first (fast); fall back to a live Meta pull
  // if nothing's stored yet (before the first cron, or an ad just linked).
  let rows = await readStoredAdInsights(adIds);
  if (rows.length === 0) rows = await getAdDailyInsights(adIds, 'last_90d');

  const perAdMap: Record<string, { adName: string; impressions: number; revenue: number }> = {};
  const dailyMap: Record<string, { impressions: number; revenue: number }> = {};
  let tImp = 0;
  let tRev = 0;
  for (const r of rows) {
    const a = (perAdMap[r.adId] ??= { adName: r.adName, impressions: 0, revenue: 0 });
    a.impressions += r.impressions;
    a.revenue += r.revenue;
    const d = (dailyMap[r.date] ??= { impressions: 0, revenue: 0 });
    d.impressions += r.impressions;
    d.revenue += r.revenue;
    tImp += r.impressions;
    tRev += r.revenue;
  }

  const daily = lastNDates(WINDOW_DAYS).map((date) => {
    const v = dailyMap[date] ?? { impressions: 0, revenue: 0 };
    return { date, impressions: v.impressions, revenue: v.revenue, commission: v.revenue * rate };
  });
  const perAd = Object.entries(perAdMap)
    .map(([adId, v]) => ({
      adId,
      adName: v.adName,
      impressions: v.impressions,
      revenue: v.revenue,
      commission: v.revenue * rate,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    windowLabel: 'Last 90 days',
    totals: { impressions: tImp, revenue: tRev, commission: tRev * rate },
    perAd,
    daily,
  };
}

/** Read the last-90-day per-ad snapshot from ad_insights_daily (money → pesos),
 *  shaped like the live Meta rows so getAffiliateAdStats aggregates either. */
async function readStoredAdInsights(adIds: string[]): Promise<AdDailyRow[]> {
  if (!isSupabaseConfigured() || adIds.length === 0) return [];
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await getSupabase()
    .from('ad_insights_daily')
    .select('ad_id, date, ad_name, impressions, spend_centavos, revenue_centavos')
    .in('ad_id', adIds)
    .gte('date', since);
  if (error || !data) return [];
  return (
    data as Array<{
      ad_id: string;
      date: string;
      ad_name: string | null;
      impressions: number;
      spend_centavos: number;
      revenue_centavos: number;
    }>
  ).map((r) => ({
    date: r.date,
    adId: r.ad_id,
    adName: r.ad_name ?? r.ad_id,
    impressions: Number(r.impressions),
    spend: Number(r.spend_centavos) / 100,
    revenue: Number(r.revenue_centavos) / 100,
  }));
}

/**
 * Refresh ad_insights_daily for every ad currently linked to an affiliate —
 * one live Meta pull for the whole set, upserted per (ad_id, date). Run twice a
 * day by /api/cron/affiliate-ads so dashboards read storage, not Meta. Money
 * stored as centavos.
 */
export async function syncAffiliateAdInsights(): Promise<{ ads: number; rows: number }> {
  if (!isSupabaseConfigured()) return { ads: 0, rows: 0 };
  const sb = getSupabase();
  const { data } = await sb.from('affiliate_ad_links').select('ad_id');
  const adIds = [...new Set((data ?? []).map((r) => (r as { ad_id: string }).ad_id).filter(Boolean))];
  if (adIds.length === 0) return { ads: 0, rows: 0 };

  const rows = await getAdDailyInsights(adIds, 'last_90d');
  if (rows.length === 0) return { ads: adIds.length, rows: 0 };

  const now = new Date().toISOString();
  const upserts = rows.map((r) => ({
    ad_id: r.adId,
    date: r.date,
    ad_name: r.adName,
    impressions: Math.round(r.impressions),
    spend_centavos: Math.round(r.spend * 100),
    revenue_centavos: Math.round(r.revenue * 100),
    synced_at: now,
  }));
  for (let i = 0; i < upserts.length; i += 500) {
    await sb.from('ad_insights_daily').upsert(upserts.slice(i, i + 500), { onConflict: 'ad_id,date' });
  }
  return { ads: adIds.length, rows: upserts.length };
}

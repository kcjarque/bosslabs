/**
 * Ads sync cron — pulls daily Meta spend for the BOSSLABS AI | SALES campaign
 * into ad_spend_daily, which powers the dashboard's Ad spend + ROAS metric.
 *
 * Schedule: 00:01 Asia/Manila = 16:01 UTC (vercel.json). Runs just after the
 * Manila day rolls over so "yesterday" is final.
 *
 * Each run syncs the last 3 Manila days (yesterday in full + the prior two) so
 * Meta's late attribution adjustments get corrected. Upsert is idempotent on
 * date, so re-running is safe.
 *
 * Requires META_ADS_TOKEN (a Meta System-User token with ads_read on the SSA
 * Back up 2 account). Until that's set, the route no-ops cleanly — the backfill
 * already covers history, so the dashboard works without it.
 */

import { NextResponse } from 'next/server';
import { upsertAdSpendDay } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TZ = 'Asia/Manila';
// BOSSLABS AI | SALES on ad account SSA Back up 2 (118264717761938).
const DEFAULT_CAMPAIGN_ID = '120247301997590236';

/** YYYY-MM-DD in Manila for a Date. */
function manilaDate(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: TZ });
}

export async function GET(req: Request) {
  // Vercel cron auth.
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const token = process.env.META_ADS_TOKEN;
  const campaignId = process.env.META_ADS_CAMPAIGN_ID || DEFAULT_CAMPAIGN_ID;
  const version = process.env.META_GRAPH_VERSION || 'v23.0';
  if (!token) {
    // No Meta token configured yet — no-op so the cron never errors. Add
    // META_ADS_TOKEN to enable the daily sync; history is already backfilled.
    return NextResponse.json({ ok: true, skipped: 'no META_ADS_TOKEN configured' });
  }

  // Last 3 Manila days: yesterday (final) + prior two (absorb late attribution).
  const now = Date.now();
  const since = manilaDate(new Date(now - 3 * 86400_000));
  const until = manilaDate(new Date(now - 1 * 86400_000));

  const url =
    `https://graph.facebook.com/${version}/${campaignId}/insights` +
    `?fields=spend,impressions,clicks,reach` +
    `&level=campaign&time_increment=1` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
    `&access_token=${encodeURIComponent(token)}`;

  const synced: string[] = [];
  try {
    const res = await fetch(url);
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
    if (json.error) {
      return NextResponse.json({ ok: false, error: json.error.message }, { status: 502 });
    }
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
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 502 });
  }

  return NextResponse.json({ ok: true, synced, count: synced.length });
}

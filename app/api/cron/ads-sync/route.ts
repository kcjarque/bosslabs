/**
 * Ads sync cron — pulls daily Meta spend for the BOSSLABS AI | SALES campaign
 * into ad_spend_daily, which powers the dashboard's Ad spend + ROAS metric.
 *
 * Schedule: 00:01 Asia/Manila = 16:01 UTC (vercel.json). Runs just after the
 * Manila day rolls over so "yesterday" is final. Syncs the last 3 days through
 * today (overwriting), so any partial day gets corrected to the full total.
 *
 * Requires META_ADS_TOKEN; no-ops cleanly until it's set (history is backfilled,
 * and the dashboard works without it). The actual fetch/upsert lives in
 * lib/meta-ads.ts (syncAdSpendDaily) so the Refresh button reuses it.
 */

import { NextResponse } from 'next/server';
import { syncAdSpendDaily } from '@/lib/meta-ads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Vercel cron auth.
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await syncAdSpendDaily(3);
  if (result.error) {
    if (result.error.includes('not configured')) {
      return NextResponse.json({ ok: true, skipped: result.error });
    }
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, synced: result.synced, count: result.synced.length });
}

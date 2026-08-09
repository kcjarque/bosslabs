/**
 * Affiliate-ads sync cron — refreshes ad_insights_daily for every Meta ad
 * currently linked to an affiliate, so their dashboards read stored earnings
 * (fast) instead of pulling Meta live on each load.
 *
 * Schedule: 12nn + midnight Asia/Manila = 04:00 + 16:00 UTC (vercel.json).
 * Requires META_ADS_TOKEN; no-ops cleanly when no ads are linked.
 */
import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron';
import { syncAffiliateAdInsights } from '@/lib/affiliate-ads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const result = await syncAffiliateAdInsights();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 502 });
  }
}

/**
 * GET /api/admin/council/ad-history?adId=<ad_id>
 *
 * Verdict history for one ad (newest first, up to 60 rows) — powers the
 * Advise drawer on /admin/ads. Admin-gated, same pattern as
 * /api/admin/ads/preview (the sibling read route on this same page).
 */
import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { getVerdictHistory } from '@/lib/council/db';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const adId = url.searchParams.get('adId');
  if (!adId) return NextResponse.json({ error: 'adId required' }, { status: 400 });
  const history = await getVerdictHistory(adId, 60);
  return NextResponse.json(history);
}

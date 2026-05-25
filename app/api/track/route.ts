/**
 * /api/track — public pageview beacon endpoint.
 *
 * The PageviewTracker client component fires `navigator.sendBeacon`
 * with `{ path, sessionId, referrer }` on every page mount. We log one
 * row to page_views; the admin dashboard reads aggregates to compute
 * the Visits → Checkout → Paid funnel.
 *
 * Trade-offs we accepted:
 *   - No bot filtering. Real bots usually don't run JS, so sendBeacon
 *     filters out 95%+ of crawler noise just by requiring a working
 *     browser. The remaining noise is fine at our scale.
 *   - No per-IP rate limiting. The beacon fires once per page mount;
 *     a script-kiddie POSTing in a loop could pollute the table but
 *     wouldn't change conversion math meaningfully (uniqueSessions
 *     still gates the funnel).
 *   - Always returns 204. Beacons are fire-and-forget; we never want
 *     to surface tracking failures to the buyer's browser.
 */

import { NextResponse } from 'next/server';
import { addPageView } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // Beacons send `application/json` or text/plain; parse defensively.
  let body: { path?: string; sessionId?: string; referrer?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    try {
      const text = await req.text();
      body = JSON.parse(text);
    } catch {
      // Fall through with empty body — we won't log this beacon.
    }
  }

  const path = typeof body.path === 'string' ? body.path.slice(0, 200) : '';
  if (!path) return new NextResponse(null, { status: 204 });

  try {
    await addPageView({
      path,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId.slice(0, 64) : null,
      referrer: typeof body.referrer === 'string' ? body.referrer.slice(0, 500) : null,
      userAgent: req.headers.get('user-agent')?.slice(0, 500) ?? null,
    });
  } catch (err) {
    // Swallow — tracking failures never block the page. Log to server
    // console so an oncall can spot a misconfigured Supabase.
    console.warn('[track] addPageView failed:', err instanceof Error ? err.message : err);
  }

  return new NextResponse(null, { status: 204 });
}

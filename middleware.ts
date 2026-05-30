import { NextRequest, NextResponse } from 'next/server';
import {
  REF_COOKIE,
  REF_TOUCH_COOKIE,
  REF_SUB_COOKIE,
  REF_MAX_AGE_SECONDS,
} from '@/lib/ref-cookie';

/**
 * Referral capture for `?ref=<code>` links (e.g. ad destinations). Sets the
 * first-touch attribution cookie if the visitor doesn't already have one —
 * cookie-only, no DB, so it's edge-safe. The /r/<code> route handles the
 * pretty share link + click logging.
 */
export function middleware(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref');
  if (!ref) return NextResponse.next();

  const res = NextResponse.next();
  // First-touch wins — never overwrite an existing referral cookie.
  if (!req.cookies.get(REF_COOKIE)) {
    const code = ref.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    if (code) {
      const opts = { maxAge: REF_MAX_AGE_SECONDS, httpOnly: true, sameSite: 'lax' as const, path: '/' };
      res.cookies.set(REF_COOKIE, code, opts);
      res.cookies.set(REF_TOUCH_COOKIE, Date.now().toString(), opts);
      // Optional campaign tag (?sub=) for the affiliate's own tracking.
      const sub = (req.nextUrl.searchParams.get('sub') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
      if (sub) res.cookies.set(REF_SUB_COOKIE, sub, opts);
    }
  }
  return res;
}

export const config = {
  // Run on real pages only — skip Next internals, API routes, and assets.
  matcher: ['/((?!_next/|api/|favicon.ico|robots.txt|sitemap.xml).*)'],
};

import { NextRequest, NextResponse } from 'next/server';
import {
  getAffiliateByCode,
  logAffiliateClick,
  REF_COOKIE,
  REF_TOUCH_COOKIE,
  REF_MAX_AGE_SECONDS,
} from '@/lib/affiliates';
import { REF_SUB_COOKIE } from '@/lib/ref-cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Affiliate share link: /r/<code>. Sets the first-touch attribution cookie,
 * logs a click, and redirects to the homepage — preserving any ad/UTM params.
 */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = (params.code || '').toLowerCase();
  const url = new URL(req.url);
  const dest = new URL('/', url.origin);
  url.searchParams.forEach((v, k) => dest.searchParams.set(k, v)); // forward utm/fbclid

  const res = NextResponse.redirect(dest, { status: 302 });

  const aff = await getAffiliateByCode(code);
  if (!aff || !aff.active) return res; // unknown/inactive → just go home

  const sub = (url.searchParams.get('sub') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);

  // Best-effort click log (every visit).
  try {
    await logAffiliateClick({ affiliateId: aff.id, landingPath: '/', referrer: req.headers.get('referer') ?? '', sub });
  } catch {
    /* never block the redirect */
  }

  // First-touch only: set the cookie if the visitor doesn't already have one.
  if (!req.cookies.get(REF_COOKIE)) {
    const opts = { maxAge: REF_MAX_AGE_SECONDS, httpOnly: true, sameSite: 'lax' as const, path: '/' };
    res.cookies.set(REF_COOKIE, aff.code, opts);
    res.cookies.set(REF_TOUCH_COOKIE, Date.now().toString(), opts);
    if (sub) res.cookies.set(REF_SUB_COOKIE, sub, opts);
  }
  return res;
}

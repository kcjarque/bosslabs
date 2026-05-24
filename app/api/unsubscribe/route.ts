/**
 * /api/unsubscribe — handles both the user-clicked confirm form (POST
 * with form-urlencoded body) AND the Gmail/Yahoo one-click POST (per the
 * RFC 8058 List-Unsubscribe-Post: List-Unsubscribe=One-Click standard).
 *
 * Token is HMAC-signed in lib/admin-auth — see signUnsubscribeToken().
 * Verified email gets its signup status flipped to 'unsubscribed' so
 * future cron sends + the webhook confirmation skip them.
 *
 * Idempotent: hitting this twice for the same email is fine.
 */

import { NextResponse } from 'next/server';
import { verifyUnsubscribeToken } from '@/lib/admin-auth';
import { findSignupByEmail, updateSignup } from '@/lib/db';
import { siteUrl } from '@/lib/site';

export const runtime = 'nodejs';

async function handleUnsubscribe(req: Request, token: string | null) {
  const email = verifyUnsubscribeToken(token);
  if (!email) {
    return NextResponse.json({ error: 'invalid token' }, { status: 400 });
  }

  // Find + flip status. Missing record = harmless (idempotent + privacy-safe).
  const signup = await findSignupByEmail(email);
  if (signup && signup.status !== 'unsubscribed') {
    await updateSignup(signup.id, {
      status: 'unsubscribed',
      metadata: {
        ...(signup.metadata ?? {}),
        unsubscribedAt: new Date().toISOString(),
      },
    });
  }

  return { email, ok: true };
}

/** Form submit path — redirects to /unsubscribe?done=1. */
export async function POST(req: Request) {
  // Form posts come URL-encoded, JSON posts come application/json.
  const ct = req.headers.get('content-type') || '';
  let token: string | null = null;

  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    const form = await req.formData();
    token = String(form.get('t') ?? '');
  } else if (ct.includes('application/json')) {
    const body = (await req.json().catch(() => ({}))) as { t?: string };
    token = body.t ?? null;
  } else {
    // Gmail/Yahoo one-click sends `List-Unsubscribe=One-Click` in the body
    // with no content-type sometimes — fall back to URL param.
    const url = new URL(req.url);
    token = url.searchParams.get('t');
  }

  const result = await handleUnsubscribe(req, token);
  if (result instanceof NextResponse) return result;

  // If this is a one-click POST from Gmail (no Accept: text/html), return JSON.
  // Otherwise, the user submitted the form — redirect to the done page.
  const accept = req.headers.get('accept') || '';
  if (accept.includes('text/html')) {
    const base = siteUrl(req);
    return NextResponse.redirect(`${base}/unsubscribe?done=1`, { status: 303 });
  }
  return NextResponse.json({ ok: true });
}

/** GET fallback — some email clients send a GET instead of POST. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('t');
  const result = await handleUnsubscribe(req, token);
  if (result instanceof NextResponse) return result;
  const base = siteUrl(req);
  return NextResponse.redirect(`${base}/unsubscribe?done=1`, { status: 303 });
}

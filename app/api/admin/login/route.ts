import { NextResponse } from 'next/server';
import { adminPassword, buildSessionCookie, safeEqual, ADMIN_COOKIE } from '@/lib/admin-auth';

export const runtime = 'nodejs';

// Tiny in-memory throttle to slow down brute-force attempts. This survives
// only within a single serverless instance, but Vercel keeps instances
// warm long enough that determined scripts hit the same hot lambda.
// For full protection, set up Vercel WAF or Upstash rate-limit.
const ATTEMPTS = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_ATTEMPTS = 10;

function checkThrottle(key: string): boolean {
  const now = Date.now();
  const entry = ATTEMPTS.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    ATTEMPTS.set(key, { count: 1, firstAt: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_ATTEMPTS;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  if (!checkThrottle(ip)) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait a minute, then try again.' },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { password?: string };
  // Constant-time compare — leaking timing info on a short password is
  // a real attack vector on serverless cold-start variance.
  if (!body.password || !safeEqual(body.password, adminPassword())) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  // Clear the throttle on success so a legit admin who fat-fingered earlier
  // doesn't stay locked out.
  ATTEMPTS.delete(ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, buildSessionCookie(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

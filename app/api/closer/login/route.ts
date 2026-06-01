import { NextResponse } from 'next/server';
import { verifyCloserLogin } from '@/lib/closers';
import { buildCloserCookie, CLOSER_COOKIE, CLOSER_COOKIE_MAX_AGE } from '@/lib/closer-auth';

export const runtime = 'nodejs';

// Per-IP throttle (same shape as the admin login).
const ATTEMPTS = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS = 10;
function allow(key: string): boolean {
  const now = Date.now();
  const e = ATTEMPTS.get(key);
  if (!e || now - e.firstAt > WINDOW_MS) {
    ATTEMPTS.set(key, { count: 1, firstAt: now });
    return true;
  }
  e.count += 1;
  return e.count <= MAX_ATTEMPTS;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  if (!allow(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Wait a minute.' }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  if (!body.username || !body.password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
  }

  const closer = await verifyCloserLogin(body.username, body.password);
  if (!closer) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  ATTEMPTS.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CLOSER_COOKIE, buildCloserCookie(closer.id), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: CLOSER_COOKIE_MAX_AGE,
  });
  return res;
}

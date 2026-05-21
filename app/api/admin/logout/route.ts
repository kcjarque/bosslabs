import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, isSameOrigin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

// POST only (never GET) so cross-origin <img> / <link> can't log a user out.
// Mirror login cookie attrs on delete so browsers reliably remove it.
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
  });
  return res;
}

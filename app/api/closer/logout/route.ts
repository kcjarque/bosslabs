import { NextResponse } from 'next/server';
import { CLOSER_COOKIE } from '@/lib/closer-auth';

export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CLOSER_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}

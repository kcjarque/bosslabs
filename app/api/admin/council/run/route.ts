import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { runCouncilSession } from '@/lib/council/session';
import type { Brand } from '@/lib/council/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** POST { brand?: 'BOSS' } — on-demand council session run (§5 full debate). */
export async function POST(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { brand?: Brand };
  const brand = body.brand ?? 'BOSS';
  const { sessionId } = await runCouncilSession(brand, ['manual run']);
  return NextResponse.json({ ok: true, sessionId });
}

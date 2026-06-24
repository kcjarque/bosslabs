import { NextResponse } from 'next/server';
import { findActiveBootcampCode } from '@/lib/bootcamp';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { code?: string };
    const code = String(body.code ?? '').trim();
    if (!code) return NextResponse.json({ ok: false, reason: 'Code is required.' });
    const found = await findActiveBootcampCode(code);
    if (!found) {
      return NextResponse.json({ ok: false, reason: 'Code not found or already expired.' });
    }
    return NextResponse.json({
      ok: true,
      perSeatCentavos: found.perSeatCentavos,
      expiresAt: found.expiresAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ ok: false, reason: msg }, { status: 500 });
  }
}

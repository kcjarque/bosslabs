import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { createBootcampCode, deactivateBootcampCode } from '@/lib/bootcamp';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? '');
    if (action === 'create') {
      const code = String(body.code ?? '').trim();
      const perSeatCentavos = Number(body.perSeatCentavos);
      const expiresAt = String(body.expiresAt ?? '');
      const note = String(body.note ?? '');
      if (!code) return NextResponse.json({ error: 'Code is required.' }, { status: 400 });
      if (!Number.isFinite(perSeatCentavos) || perSeatCentavos <= 0) {
        return NextResponse.json({ error: 'Per-seat amount invalid.' }, { status: 400 });
      }
      if (!expiresAt) return NextResponse.json({ error: 'Expiry required.' }, { status: 400 });
      const created = await createBootcampCode({ code, perSeatCentavos: Math.round(perSeatCentavos), expiresAt, note });
      return NextResponse.json({ ok: true, code: created });
    }
    if (action === 'disable') {
      const id = String(body.id ?? '');
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      await deactivateBootcampCode(id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

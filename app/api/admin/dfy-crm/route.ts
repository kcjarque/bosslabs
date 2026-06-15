import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { listDfyCards, addDfyCard, updateDfyCard, deleteDfyCard, listDfyCandidates } from '@/lib/dfy-crm';

export const runtime = 'nodejs';

export async function GET() {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [cards, customers] = await Promise.all([listDfyCards(), listDfyCandidates()]);
  return NextResponse.json({ cards, customers });
}

export async function POST(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    switch (body.action) {
      case 'add': {
        const card = await addDfyCard(
          body.card as { name: string; phone?: string; email?: string; amountCentavos?: number | null },
        );
        return NextResponse.json({ card });
      }
      case 'update':
        await updateDfyCard(String(body.id), body.patch as Record<string, never>);
        return NextResponse.json({ ok: true });
      case 'delete':
        await deleteDfyCard(String(body.id));
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

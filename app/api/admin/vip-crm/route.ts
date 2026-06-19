import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import {
  listVipCards,
  listVipCandidates,
  addVipCard,
  updateVipCard,
  deleteVipCard,
} from '@/lib/vip-crm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [cards, customers] = await Promise.all([listVipCards(), listVipCandidates()]);
  return NextResponse.json({ cards, customers });
}

export async function POST(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const body = (await req.json()) as Record<string, unknown>;
    switch (body.action) {
      case 'add': {
        const card = await addVipCard(body.card as { name: string });
        return NextResponse.json({ card });
      }
      case 'update':
        await updateVipCard(String(body.id), body.patch as Record<string, never>);
        return NextResponse.json({ ok: true });
      case 'delete':
        await deleteVipCard(String(body.id));
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

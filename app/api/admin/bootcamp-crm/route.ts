import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import {
  addBootcampCard,
  deleteBootcampCard,
  listBootcampCandidates,
  listBootcampCards,
  updateBootcampCard,
  type BootcampStage,
} from '@/lib/bootcamp-crm';

export const runtime = 'nodejs';

export async function GET() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [cards, candidates] = await Promise.all([listBootcampCards(), listBootcampCandidates()]);
  return NextResponse.json({ cards, candidates });
}

export async function POST(req: Request) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? '');
    if (action === 'add') {
      const card = await addBootcampCard({
        name: String(body.name ?? ''),
        email: body.email ? String(body.email) : undefined,
        phone: body.phone ? String(body.phone) : undefined,
        company: body.company ? String(body.company) : undefined,
        stage: body.stage ? (String(body.stage) as BootcampStage) : undefined,
      });
      return NextResponse.json({ ok: true, card });
    }
    if (action === 'update') {
      await updateBootcampCard(String(body.id ?? ''), body as never);
      return NextResponse.json({ ok: true });
    }
    if (action === 'delete') {
      await deleteBootcampCard(String(body.id ?? ''));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

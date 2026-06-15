import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import {
  listRetreatCrmCards,
  listRetreatCrmCandidates,
  addRetreatCrmCard,
  updateRetreatCrmCard,
  deleteRetreatCrmCard,
  getRetreatCrmTemplate,
  saveRetreatCrmTemplate,
  setRetreatDealAmount,
  logRetreatPayment,
  markRetreatPaidInFull,
} from '@/lib/retreat-crm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [cards, template, customers] = await Promise.all([
    listRetreatCrmCards(),
    getRetreatCrmTemplate(),
    listRetreatCrmCandidates(),
  ]);
  return NextResponse.json({ cards, template, customers });
}

export async function POST(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const body = (await req.json()) as Record<string, unknown>;
    switch (body.action) {
      case 'add': {
        const card = await addRetreatCrmCard(body.card as { name: string });
        return NextResponse.json({ card });
      }
      case 'update':
        await updateRetreatCrmCard(String(body.id), body.patch as Record<string, never>);
        return NextResponse.json({ ok: true });
      case 'delete':
        await deleteRetreatCrmCard(String(body.id));
        return NextResponse.json({ ok: true });
      case 'template':
        await saveRetreatCrmTemplate(String(body.template ?? ''));
        return NextResponse.json({ ok: true });
      case 'deal-amount':
        await setRetreatDealAmount(String(body.id), Number(body.centavos) || 0);
        return NextResponse.json({ ok: true });
      case 'log-payment':
        await logRetreatPayment(String(body.id), Number(body.centavos) || 0, body.note ? String(body.note) : undefined);
        return NextResponse.json({ ok: true });
      case 'mark-paid-full':
        await markRetreatPaidInFull(String(body.id));
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

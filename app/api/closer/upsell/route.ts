import { NextResponse } from 'next/server';
import { getCloserSession } from '@/lib/closer-auth';
import {
  listUpsellPool,
  listMyUpsellLeads,
  claimUpsellLead,
  releaseUpsellLead,
  setUpsellStage,
  setUpsellNote,
  createPromoAndSend,
  isUpsellProduct,
} from '@/lib/closer-upsell';

export const runtime = 'nodejs';

export async function GET() {
  const closer = await getCloserSession();
  if (!closer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [pool, leads] = await Promise.all([listUpsellPool(), listMyUpsellLeads(closer.id)]);
  return NextResponse.json({ pool, leads });
}

export async function POST(req: Request) {
  const closer = await getCloserSession();
  if (!closer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    switch (body.action) {
      case 'claim': {
        const res = await claimUpsellLead(String(body.signupId), closer.id);
        return NextResponse.json(res, { status: res.ok ? 200 : 409 });
      }
      case 'release':
        await releaseUpsellLead(String(body.leadId), closer.id);
        return NextResponse.json({ ok: true });
      case 'stage':
        await setUpsellStage(String(body.leadId), closer.id, String(body.stage));
        return NextResponse.json({ ok: true });
      case 'note':
        await setUpsellNote(String(body.leadId), closer.id, String(body.note ?? ''));
        return NextResponse.json({ ok: true });
      case 'promoSend': {
        const product = String(body.product);
        if (!isUpsellProduct(product)) return NextResponse.json({ error: 'Unknown product' }, { status: 400 });
        const discountType = body.discountType === 'fixed' ? 'fixed' : 'percent';
        const res = await createPromoAndSend({
          leadId: String(body.leadId),
          closerId: closer.id,
          closerName: closer.name,
          closerUsername: closer.username,
          product,
          discountType,
          discountValue: Number(body.discountValue),
          channels: { email: body.email !== false, sms: body.sms !== false },
        });
        return NextResponse.json(res, { status: res.ok ? 200 : 400 });
      }
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

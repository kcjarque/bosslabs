/**
 * /api/checkout/promo — public read-only promo lookup.
 *
 * The buyer types a code on /checkout and hits Apply. We answer with the
 * discount preview (final amount, percent off, whether it's free) without
 * incrementing uses_count. The actual redemption happens later, atomically,
 * inside /api/checkout when the buyer claims the seat.
 *
 * "Public" here means same-origin only — we don't auth the buyer, but we
 * refuse cross-origin posts to keep a leaked code from being enumerated
 * from arbitrary referrers. Real abuse protection is the per-code maxUses
 * cap in the schema.
 */

import { NextResponse } from 'next/server';
import { findPromoCode, computeDiscountCentavos } from '@/lib/db';
import { OFFER } from '@/lib/config';
import { isSameOrigin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    code?: string;
    bump?: boolean;
  };
  const code = (body.code ?? '').trim();
  if (!code) return NextResponse.json({ error: 'Code required' }, { status: 400 });

  const promo = await findPromoCode(code);
  if (!promo || !promo.active) {
    return NextResponse.json({ valid: false, reason: 'invalid' }, { status: 200 });
  }
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() <= Date.now()) {
    return NextResponse.json({ valid: false, reason: 'expired' }, { status: 200 });
  }
  if (promo.maxUses != null && promo.usesCount >= promo.maxUses) {
    return NextResponse.json({ valid: false, reason: 'exhausted' }, { status: 200 });
  }

  const bumped = Boolean(body.bump);
  const totalCentavos =
    OFFER.main.priceCentavos + (bumped ? OFFER.oto.priceCentavos : 0);
  const discountCentavos = computeDiscountCentavos(promo, totalCentavos);
  const finalCentavos = Math.max(0, totalCentavos - discountCentavos);

  return NextResponse.json({
    valid: true,
    code: promo.code,
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    totalCentavos,
    discountCentavos,
    finalCentavos,
    isFree: finalCentavos === 0,
  });
}

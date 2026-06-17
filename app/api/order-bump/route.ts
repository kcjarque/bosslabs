/**
 * /api/order-bump — standalone order-bump (₱1,997 1:1 AI Integration Audit)
 * checkout for webinar attendees who already bought the ₱999 ticket and want
 * to add the upgrade afterwards.
 *
 * Identify-by-email: look up the buyer's PAID ticket, then create a
 * BL-OTO-<mainOrder> invoice scoped to their chosen payment method. The
 * existing Xendit OTO webhook (handleOtoPaid) then attaches the bump to their
 * record — so it shows "with bump" and counts as an OTO, exactly like the
 * post-checkout flow. No webhook changes needed.
 */

import { NextResponse } from 'next/server';
import { OFFER } from '@/lib/config';
import { createInvoice, resolvePaymentMethods, type PaymentMethodGroup } from '@/lib/xendit';
import {
  findSignupByEmail,
  findPromoCode,
  computeDiscountCentavos,
  redeemPromoCode,
  updateSignup,
} from '@/lib/db';
import { closeLeadAndRecordCommission } from '@/lib/closers';
import { siteUrl } from '@/lib/site';

export const runtime = 'nodejs';

const PAID = new Set(['paid', 'attended']);
const GROUPS = ['GCASH', 'CREDIT_CARD', 'BANKS'];

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      paymentMethod?: string;
      promoCode?: string;
      /** Which upgrade to buy: 'oto2' = ₱3,997 1:1 Build Session, else ₱999 Vault. */
      product?: 'oto' | 'oto2';
    };
    const offer = body.product === 'oto2' ? OFFER.oto2 : OFFER.oto;
    const email = (body.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });
    }

    const parent = await findSignupByEmail(email);
    const mainOrder = (parent?.metadata as { externalId?: string } | undefined)?.externalId;

    // Must have a PAID ₱999 ticket on file to add the bump.
    if (!parent || !PAID.has(parent.status) || !mainOrder?.startsWith('BL-MAIN-')) {
      return NextResponse.json(
        {
          error:
            "We couldn't find a paid ticket for that email. Please use the same email you registered with for the webinar.",
        },
        { status: 404 },
      );
    }

    // Already have the bump? Don't let them pay twice.
    if ((parent.metadata as { otoConfirmed?: string } | undefined)?.otoConfirmed) {
      return NextResponse.json(
        { error: 'Your order bump is already active on this ticket — no need to pay again.' },
        { status: 409 },
      );
    }

    const group = GROUPS.includes(body.paymentMethod ?? '')
      ? (body.paymentMethod as PaymentMethodGroup)
      : undefined;
    const externalId = `BL-OTO-${mainOrder}-${Date.now()}`;
    const base = siteUrl(req);

    // Promo code (optional) — same codes as the main checkout, priced against
    // the ₱1,997 OTO. Validate, then redeem atomically (so the use is claimed
    // when the invoice is created, matching /api/checkout's behaviour).
    let amountCentavos = offer.priceCentavos;
    let promoApplied: string | null = null;
    const promoCode = (body.promoCode || '').trim();
    if (promoCode) {
      const promo = await findPromoCode(promoCode);
      if (!promo || !promo.active) {
        return NextResponse.json({ error: 'Promo code is invalid.' }, { status: 400 });
      }
      if (promo.expiresAt && new Date(promo.expiresAt).getTime() <= Date.now()) {
        return NextResponse.json({ error: 'This promo code has expired.' }, { status: 400 });
      }
      if (promo.maxUses != null && promo.usesCount >= promo.maxUses) {
        return NextResponse.json({ error: 'This promo code has been fully claimed.' }, { status: 409 });
      }
      const discount = computeDiscountCentavos(promo, offer.priceCentavos);
      const redeemed = await redeemPromoCode(promo.code);
      if (!redeemed) {
        return NextResponse.json(
          { error: 'Promo code is no longer available (expired or fully claimed).' },
          { status: 409 },
        );
      }
      amountCentavos = Math.max(0, offer.priceCentavos - discount);
      promoApplied = redeemed.code;
    }

    // 100%-off code → no Xendit invoice. Attach the bump directly (mirrors the
    // OTO webhook's confirmation), then send them to the thank-you page.
    if (amountCentavos === 0) {
      await updateSignup(parent.id, {
        bumped: true,
        metadata: {
          ...(parent.metadata ?? {}),
          otoConfirmed: new Date().toISOString(),
          otoExternalId: externalId,
          otoAmount: 0,
          otoPromoCode: promoApplied,
        },
      });
      await closeLeadAndRecordCommission(parent.id).catch(() => {});
      return NextResponse.json({ redirectUrl: `${base}/thank-you?order=${mainOrder}&oto=1`, free: true });
    }

    const invoice = await createInvoice({
      externalId,
      amount: amountCentavos / 100,
      description: promoApplied ? `${offer.name} (promo ${promoApplied})` : offer.name,
      payerEmail: parent.email,
      successRedirectUrl: `${base}/thank-you?order=${mainOrder}&oto=1`,
      failureRedirectUrl: `${base}/order-bump?status=failed`,
      customer: {
        givenNames: parent.firstName,
        email: parent.email,
        mobileNumber: parent.phone || undefined,
      },
      paymentMethods: resolvePaymentMethods(group),
    });

    return NextResponse.json({ redirectUrl: invoice.invoiceUrl, demo: invoice.demo });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * /api/oto — creates the standalone OTO invoice (the 1:1 Build Session upsell,
 * OFFER.oto2 / ₱3,997) for a buyer who didn't bump at checkout.
 *
 * Looks up the parent signup so we can pre-fill payer email + customer info on
 * the Xendit hosted page. Supports an optional promo code (priced against the
 * ₱3,997 1:1) — a 100%-off code attaches the upgrade with no invoice.
 */

import { NextResponse } from 'next/server';
import { OFFER } from '@/lib/config';
import { createInvoice } from '@/lib/xendit';
import {
  findSignupByExternalId,
  findPromoCode,
  computeDiscountCentavos,
  redeemPromoCode,
  updateSignup,
} from '@/lib/db';
import { closeLeadAndRecordCommission } from '@/lib/closers';
import { buildOtoExternalId } from '@/lib/oto-external';
import { getWebinarInfo, templateVarsForSignup } from '@/lib/webinar';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { siteUrl } from '@/lib/site';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { orderId?: string; promoCode?: string };
    const mainOrder = (body.orderId || '').trim();

    // Hard-validate the parent order ID — without a real BL-MAIN-* parent,
    // the OTO can't be attributed back to a buyer.
    if (!mainOrder.startsWith('BL-MAIN-')) {
      return NextResponse.json({ error: 'orderId missing or invalid' }, { status: 400 });
    }

    const parent = await findSignupByExternalId(mainOrder);
    if (!parent) {
      return NextResponse.json({ error: 'parent order not found' }, { status: 404 });
    }

    // One OTO per order: don't create a second invoice the webhook would drop
    // (handleOtoPaid bails on meta.otoConfirmed → money taken, nothing delivered).
    if ((parent.metadata as { otoConfirmed?: string } | undefined)?.otoConfirmed) {
      return NextResponse.json(
        { error: 'This order already has an upgrade — no need to pay again.' },
        { status: 409 },
      );
    }

    const externalId = buildOtoExternalId('oto2', mainOrder);
    const base = siteUrl(req);

    // Promo code (optional) — same codes as checkout, priced against the ₱3,997
    // 1:1. Validate, then redeem atomically so the use is claimed when the
    // invoice / free grant is created.
    let amountCentavos = OFFER.oto2.priceCentavos;
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
      const discount = computeDiscountCentavos(promo, OFFER.oto2.priceCentavos);
      const redeemed = await redeemPromoCode(promo.code);
      if (!redeemed) {
        return NextResponse.json(
          { error: 'Promo code is no longer available (expired or fully claimed).' },
          { status: 409 },
        );
      }
      amountCentavos = Math.max(0, OFFER.oto2.priceCentavos - discount);
      promoApplied = redeemed.code;
    }

    // 100%-off → no Xendit invoice. Attach the OTO directly (mirrors the webhook
    // confirmation) and send the 1:1 confirmation, then go to thank-you.
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
      try {
        const webinar = await getWebinarInfo();
        const vars = { ...(await templateVarsForSignup(parent, webinar)), amount: 'PHP 0' };
        await sendEmail({ to: parent.email, templateId: 'oto_confirmation', vars }).catch(() => null);
        if (parent.phone) {
          await sendSms({ to: parent.phone, templateId: 'oto_confirmation', vars }).catch(() => null);
        }
      } catch {
        /* confirmation is best-effort — never block the free upgrade */
      }
      return NextResponse.json({ redirectUrl: `${base}/thank-you?order=${mainOrder}&oto=1`, free: true });
    }

    const invoice = await createInvoice({
      externalId,
      amount: amountCentavos / 100,
      description: promoApplied ? `${OFFER.oto2.name} (promo ${promoApplied})` : OFFER.oto2.name,
      payerEmail: parent.email,
      successRedirectUrl: `${base}/thank-you?order=${mainOrder}&oto=1`,
      failureRedirectUrl: `${base}/thank-you?order=${mainOrder}&oto=failed`,
      customer: {
        givenNames: parent.firstName,
        email: parent.email,
        mobileNumber: parent.phone || undefined,
      },
    });

    return NextResponse.json({ redirectUrl: invoice.invoiceUrl, demo: invoice.demo });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

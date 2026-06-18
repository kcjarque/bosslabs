/**
 * /api/oto — creates the OTO invoice for the 1:1 Build Session (OFFER.oto2 /
 * ₱3,997). Two modes:
 *
 *  1. POST-PURCHASE (default): `{ orderId: 'BL-MAIN-…', promoCode? }` — the
 *     upsell shown after the webinar checkout. Looks up the parent signup to
 *     pre-fill the buyer + attribute the upgrade back to them.
 *
 *  2. STANDALONE: `{ standalone: true, name, email, phone, promoCode?, meta? }`
 *     — someone buying the 1:1 directly from a shared /oto link (no prior
 *     webinar purchase). Collects the buyer, persists a lead row keyed by a
 *     `BL-OTOX-` externalId, and lets the webhook confirm it. The promo is
 *     redeemed at webhook-confirm time (not here) so abandoned standalone
 *     checkouts don't burn a capped influencer code.
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
  addSignup,
} from '@/lib/db';
import { closeLeadAndRecordCommission } from '@/lib/closers';
import { isSameOrigin } from '@/lib/admin-auth';
import { buildOtoExternalId, buildStandaloneOtoExternalId } from '@/lib/oto-external';
import { getWebinarInfo, templateVarsForSignup } from '@/lib/webinar';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { siteUrl } from '@/lib/site';

export const runtime = 'nodejs';

type Body = {
  orderId?: string;
  promoCode?: string;
  standalone?: boolean;
  name?: string;
  email?: string;
  phone?: string;
  meta?: { fbp?: string; fbc?: string; sourceUrl?: string };
};

export async function POST(req: Request) {
  try {
    // Public buyer endpoint — only our own pages should POST here.
    if (!isSameOrigin(req)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const promoCode = (body.promoCode || '').trim();

    if (body.standalone === true) {
      return handleStandalone(req, body, promoCode);
    }

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

/* --------------------------------------------------------------------- */
/* STANDALONE 1:1 purchase — no parent webinar order                     */
/* --------------------------------------------------------------------- */
async function handleStandalone(req: Request, body: Body, promoCode: string) {
  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const phone = (body.phone || '').trim();
  if (!name || !email.includes('@')) {
    return NextResponse.json({ error: 'Please enter your name and a valid email.' }, { status: 400 });
  }

  const externalId = buildStandaloneOtoExternalId('oto2');
  const base = siteUrl(req);

  // Promo: validate + redeem ATOMICALLY here (same as every other money route).
  // redeemPromoCode is the authoritative cap gate — refuse on failure so a
  // capped influencer code can never be over-redeemed. (Abandoned checkouts
  // burn a use; that's the fail-safe tradeoff the whole codebase already makes.)
  let amountCentavos = OFFER.oto2.priceCentavos;
  let promoApplied: string | null = null;
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

  // Meta match-quality data — cookies captured client-side + IP/UA server-side.
  const metaStash = {
    fbp: body.meta?.fbp,
    fbc: body.meta?.fbc,
    sourceUrl: body.meta?.sourceUrl,
    clientUserAgent: req.headers.get('user-agent') || undefined,
    clientIp: (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || undefined,
  };

  // 100%-off → no invoice. The promo is already redeemed above; create the
  // paid row + confirm immediately (there's no payment webhook to defer to).
  if (amountCentavos === 0) {
    const signup = await addSignup({
      firstName: name,
      email,
      phone,
      source: 'paid',
      status: 'paid',
      amountCentavos: 0,
      bumped: true,
      eventId: null,
      metadata: {
        externalId,
        standaloneOto: true,
        otoProduct: 'oto2',
        otoConfirmed: new Date().toISOString(),
        otoAmount: 0,
        otoPromoCode: promoApplied,
        meta: metaStash,
      },
    });
    try {
      const webinar = await getWebinarInfo();
      const vars = { ...(await templateVarsForSignup(signup, webinar)), amount: 'PHP 0' };
      await sendEmail({ to: email, templateId: 'oto_confirmation', vars }).catch(() => null);
      if (phone) await sendSms({ to: phone, templateId: 'oto_confirmation', vars }).catch(() => null);
    } catch {
      /* best-effort */
    }
    return NextResponse.json({ redirectUrl: `${base}/thank-you?order=${externalId}&oto=1`, free: true });
  }

  // Persist the lead row up front (keyed by externalId) so the webhook can
  // recover the buyer + has a durable home for the otoConfirmed idempotency
  // marker. Status flips to 'paid' on the confirmed webhook.
  await addSignup({
    firstName: name,
    email,
    phone,
    source: 'paid',
    status: 'registered',
    amountCentavos,
    bumped: true,
    eventId: null,
    metadata: {
      externalId,
      standaloneOto: true,
      otoProduct: 'oto2',
      otoPromoCode: promoApplied,
      meta: metaStash,
    },
  });

  const invoice = await createInvoice({
    externalId,
    amount: amountCentavos / 100,
    description: promoApplied ? `${OFFER.oto2.name} (promo ${promoApplied})` : OFFER.oto2.name,
    payerEmail: email,
    successRedirectUrl: `${base}/thank-you?order=${externalId}&oto=1`,
    failureRedirectUrl: `${base}/thank-you?order=${externalId}&oto=failed`,
    customer: {
      givenNames: name,
      email,
      mobileNumber: phone || undefined,
    },
  });

  return NextResponse.json({ redirectUrl: invoice.invoiceUrl, demo: invoice.demo });
}

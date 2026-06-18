/**
 * /api/oto — creates the OTO invoice for whichever upsell the buyer picked on
 * /oto: OFFER.oto2 (the ₱3,997 1:1 Build Session) or OFFER.oto (the ₱999 AI
 * Secrets Builder Vault). Two modes:
 *
 *  1. POST-PURCHASE (default): `{ orderId: 'BL-MAIN-…', product?, promoCode? }`
 *     — the upsell shown after the webinar checkout. Attributes the upgrade to
 *     the parent signup.
 *  2. STANDALONE: `{ standalone: true, product?, name, email, phone, promoCode?, meta? }`
 *     — buying the upsell directly from a shared /oto link (no prior purchase).
 *     Persists a lead row keyed by a `BL-OTOX-` externalId; the webhook confirms it.
 *
 * `product` defaults to 'oto2' for back-compat. The webhook reads the product
 * from the externalId marker (VAULT vs 1ON1) to send the right confirmation.
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
import { buildOtoExternalId, buildStandaloneOtoExternalId, type OtoProduct } from '@/lib/oto-external';
import { getWebinarInfo, templateVarsForSignup } from '@/lib/webinar';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { siteUrl } from '@/lib/site';

export const runtime = 'nodejs';

type Body = {
  orderId?: string;
  product?: OtoProduct;
  promoCode?: string;
  standalone?: boolean;
  name?: string;
  email?: string;
  phone?: string;
  meta?: { fbp?: string; fbc?: string; sourceUrl?: string };
};

/** Resolve the picked product → its offer + confirmation template. */
function resolve(body: Body) {
  const product: OtoProduct = body.product === 'oto' ? 'oto' : 'oto2';
  const offer = OFFER[product];
  const confirmTemplate = product === 'oto' ? 'vault_confirmation' : 'oto_confirmation';
  return { product, offer, confirmTemplate };
}

export async function POST(req: Request) {
  try {
    // Public buyer endpoint — only our own pages should POST here.
    if (!isSameOrigin(req)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const promoCode = (body.promoCode || '').trim();
    const { product, offer, confirmTemplate } = resolve(body);

    if (body.standalone === true) {
      return handleStandalone(req, body, promoCode, product, offer, confirmTemplate);
    }

    const mainOrder = (body.orderId || '').trim();
    if (!mainOrder.startsWith('BL-MAIN-')) {
      return NextResponse.json({ error: 'orderId missing or invalid' }, { status: 400 });
    }

    const parent = await findSignupByExternalId(mainOrder);
    if (!parent) {
      return NextResponse.json({ error: 'parent order not found' }, { status: 404 });
    }

    // One upsell per order: don't create a second invoice the webhook would drop
    // (the otoConfirmed marker → money taken, nothing delivered).
    if ((parent.metadata as { otoConfirmed?: string } | undefined)?.otoConfirmed) {
      return NextResponse.json(
        { error: 'This order already has an upgrade — no need to pay again.' },
        { status: 409 },
      );
    }

    const externalId = buildOtoExternalId(product, mainOrder);
    const base = siteUrl(req);

    // Promo (optional) — priced against the picked offer; redeemed atomically.
    let amountCentavos = offer.priceCentavos;
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

    // 100%-off → no Xendit invoice. Attach the upgrade directly + confirm.
    if (amountCentavos === 0) {
      await updateSignup(parent.id, {
        bumped: true,
        metadata: {
          ...(parent.metadata ?? {}),
          otoConfirmed: new Date().toISOString(),
          otoExternalId: externalId,
          otoAmount: 0,
          otoProduct: product,
          otoPromoCode: promoApplied,
        },
      });
      await closeLeadAndRecordCommission(parent.id).catch(() => {});
      try {
        const webinar = await getWebinarInfo();
        const vars = { ...(await templateVarsForSignup(parent, webinar)), amount: 'PHP 0' };
        await sendEmail({ to: parent.email, templateId: confirmTemplate, vars }).catch(() => null);
        if (parent.phone) {
          await sendSms({ to: parent.phone, templateId: confirmTemplate, vars }).catch(() => null);
        }
      } catch {
        /* confirmation is best-effort — never block the free upgrade */
      }
      return NextResponse.json({ redirectUrl: `${base}/thank-you?order=${mainOrder}&oto=1`, free: true });
    }

    const invoice = await createInvoice({
      externalId,
      amount: amountCentavos / 100,
      description: promoApplied ? `${offer.name} (promo ${promoApplied})` : offer.name,
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
/* STANDALONE purchase — no parent webinar order                         */
/* --------------------------------------------------------------------- */
async function handleStandalone(
  req: Request,
  body: Body,
  promoCode: string,
  product: OtoProduct,
  offer: (typeof OFFER)['oto'] | (typeof OFFER)['oto2'],
  confirmTemplate: string,
) {
  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const phone = (body.phone || '').trim();
  if (!name || !email.includes('@')) {
    return NextResponse.json({ error: 'Please enter your name and a valid email.' }, { status: 400 });
  }

  const externalId = buildStandaloneOtoExternalId(product);
  const base = siteUrl(req);

  // Promo: validate + redeem ATOMICALLY (same as every other money route).
  let amountCentavos = offer.priceCentavos;
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

  const metaStash = {
    fbp: body.meta?.fbp,
    fbc: body.meta?.fbc,
    sourceUrl: body.meta?.sourceUrl,
    clientUserAgent: req.headers.get('user-agent') || undefined,
    clientIp: (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || undefined,
  };

  // 100%-off → no invoice. Promo already redeemed; create the paid row + confirm.
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
        otoProduct: product,
        otoConfirmed: new Date().toISOString(),
        otoAmount: 0,
        otoPromoCode: promoApplied,
        meta: metaStash,
      },
    });
    try {
      const webinar = await getWebinarInfo();
      const vars = { ...(await templateVarsForSignup(signup, webinar)), amount: 'PHP 0' };
      await sendEmail({ to: email, templateId: confirmTemplate, vars }).catch(() => null);
      if (phone) await sendSms({ to: phone, templateId: confirmTemplate, vars }).catch(() => null);
    } catch {
      /* best-effort */
    }
    return NextResponse.json({ redirectUrl: `${base}/thank-you?order=${externalId}&oto=1`, free: true });
  }

  // Persist the lead row up front (keyed by externalId) so the webhook can
  // recover the buyer + has a home for the otoConfirmed idempotency marker.
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
      otoProduct: product,
      otoPromoCode: promoApplied,
      meta: metaStash,
    },
  });

  const invoice = await createInvoice({
    externalId,
    amount: amountCentavos / 100,
    description: promoApplied ? `${offer.name} (promo ${promoApplied})` : offer.name,
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

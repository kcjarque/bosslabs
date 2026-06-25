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
import { signVaultOrder } from '@/lib/vault-token';

/**
 * Build the success redirect URL for an OTO purchase. Vault buyers (product
 * 'oto' or 'both') land on /thank-you/vault, which renders the Hub password.
 * That URL carries an HMAC token of the order id so a leaked or guessed
 * order id alone can't expose the password.
 */
function buildOtoSuccessUrl(base: string, order: string, isVault: boolean): string {
  if (!isVault) return `${base}/thank-you?order=${order}&oto=1`;
  const t = signVaultOrder(order);
  return `${base}/thank-you/vault?order=${order}&oto=1${t ? `&t=${t}` : ''}`;
}

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

/** Resolve the picked product → price, description, confirmation templates.
 *  For 'both' we synthesize a combined "offer" for invoice purposes; the
 *  webhook sends both per-product confirmation emails on clear.
 *  Throws when product is missing/unknown so a case typo never silently
 *  charges the wrong upsell. The POST handler catches and 400s. */
function resolve(body: Body): { product: OtoProduct; priceCentavos: number; description: string; confirmTemplates: readonly string[] } {
  const raw = body.product;
  if (raw !== 'oto' && raw !== 'oto2' && raw !== 'both') {
    throw new Error(`Invalid product "${String(raw)}". Expected 'oto' | 'oto2' | 'both'.`);
  }
  const product: OtoProduct = raw;

  if (product === 'both') {
    const priceCentavos = OFFER.oto.priceCentavos + OFFER.oto2.priceCentavos;
    const description = `${OFFER.oto2.name} + ${OFFER.oto.name}`;
    // The webhook handles the dual-template send; this return shape just keeps
    // the route's free-promo branch using one template.
    return {
      product,
      priceCentavos,
      description,
      confirmTemplates: ['oto_confirmation', 'vault_confirmation'] as const,
    };
  }

  const offer = OFFER[product];
  const confirmTemplate = product === 'oto' ? 'vault_confirmation' : 'oto_confirmation';
  return {
    product,
    priceCentavos: offer.priceCentavos,
    description: offer.name,
    confirmTemplates: [confirmTemplate] as const,
  };
}

export async function POST(req: Request) {
  try {
    // Public buyer endpoint — only our own pages should POST here.
    if (!isSameOrigin(req)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const promoCode = (body.promoCode || '').trim();
    let resolved;
    try {
      resolved = resolve(body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid product';
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const { product, priceCentavos, description, confirmTemplates } = resolved;

    // Promo codes are scoped to a single product — when the buyer picks the
    // combined bundle we refuse the code (clearer than silently dropping it).
    if (product === 'both' && promoCode) {
      return NextResponse.json(
        { error: 'Promo codes only apply to a single upgrade — uncheck one to use the code.' },
        { status: 400 },
      );
    }

    if (body.standalone === true) {
      return handleStandalone(req, body, promoCode, product, priceCentavos, description, confirmTemplates);
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
    // 'both' product short-circuits above so this branch never runs for bundles.
    let amountCentavos = priceCentavos;
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
      const discount = computeDiscountCentavos(promo, priceCentavos);
      const redeemed = await redeemPromoCode(promo.code);
      if (!redeemed) {
        return NextResponse.json(
          { error: 'Promo code is no longer available (expired or fully claimed).' },
          { status: 409 },
        );
      }
      amountCentavos = Math.max(0, priceCentavos - discount);
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
        for (const tpl of confirmTemplates) {
          await sendEmail({ to: parent.email, templateId: tpl, vars }).catch(() => null);
          if (parent.phone) {
            await sendSms({ to: parent.phone, templateId: tpl, vars }).catch(() => null);
          }
        }
      } catch {
        /* confirmation is best-effort — never block the free upgrade */
      }
      // Vault buyers (product='oto' or 'both') land on the Vault-specific
      // thank-you page so they see their Hub credentials immediately. The
      // URL is HMAC-signed so the password isn't fetchable by order-id alone.
      const isVault = product === 'oto' || product === 'both';
      return NextResponse.json({ redirectUrl: buildOtoSuccessUrl(base, mainOrder, isVault), free: true });
    }

    const isVault = product === 'oto' || product === 'both';
    const invoice = await createInvoice({
      externalId,
      amount: amountCentavos / 100,
      description: promoApplied ? `${description} (promo ${promoApplied})` : description,
      payerEmail: parent.email,
      successRedirectUrl: buildOtoSuccessUrl(base, mainOrder, isVault),
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
  basePriceCentavos: number,
  description: string,
  confirmTemplates: readonly string[],
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
  // 'both' product short-circuits earlier in POST so this branch never runs for bundles.
  let amountCentavos = basePriceCentavos;
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
    const discount = computeDiscountCentavos(promo, basePriceCentavos);
    const redeemed = await redeemPromoCode(promo.code);
    if (!redeemed) {
      return NextResponse.json(
        { error: 'Promo code is no longer available (expired or fully claimed).' },
        { status: 409 },
      );
    }
    amountCentavos = Math.max(0, basePriceCentavos - discount);
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
      for (const tpl of confirmTemplates) {
        await sendEmail({ to: email, templateId: tpl, vars }).catch(() => null);
        if (phone) await sendSms({ to: phone, templateId: tpl, vars }).catch(() => null);
      }
    } catch {
      /* best-effort */
    }
    // Vault buyers (standalone, free via 100%-off promo) → Vault thank-you,
    // HMAC-gated for password reveal.
    const isVault = product === 'oto' || product === 'both';
    return NextResponse.json({ redirectUrl: buildOtoSuccessUrl(base, externalId, isVault), free: true });
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

  // Vault buyers (standalone OTOX) → Vault thank-you with HMAC-signed password reveal.
  const isVault = product === 'oto' || product === 'both';
  const invoice = await createInvoice({
    externalId,
    amount: amountCentavos / 100,
    description: promoApplied ? `${description} (promo ${promoApplied})` : description,
    payerEmail: email,
    successRedirectUrl: buildOtoSuccessUrl(base, externalId, isVault),
    failureRedirectUrl: `${base}/thank-you?order=${externalId}&oto=failed`,
    customer: {
      givenNames: name,
      email,
      mobileNumber: phone || undefined,
    },
  });

  return NextResponse.json({ redirectUrl: invoice.invoiceUrl, demo: invoice.demo });
}

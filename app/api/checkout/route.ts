import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { REF_COOKIE, REF_TOUCH_COOKIE, REF_SUB_COOKIE } from '@/lib/ref-cookie';
import { OFFER } from '@/lib/config';
import {
  createInvoice,
  PAYMENT_METHOD_GROUPS,
  resolvePaymentMethods,
  type PaymentMethodGroup,
} from '@/lib/xendit';
import {
  addSignup,
  computeDiscountCentavos,
  countPaidOrders,
  findPromoCode,
  findSignupByEmail,
  redeemPromoCode,
  updateSignup,
} from '@/lib/db';
import { extractClientIp, extractFbCookies, sendCapiEvent } from '@/lib/meta';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { getWebinarInfo, resolveOtoOffer } from '@/lib/webinar';
import { siteUrl } from '@/lib/site';
import { sendTelegram, esc } from '@/lib/telegram';
import { syncCrmCardForSignup } from '@/lib/crm';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      mobile?: string;
      bump?: boolean;
      paymentMethod?: PaymentMethodGroup;
      promoCode?: string;
      meta?: {
        eventId?: string;
        fbp?: string;
        fbc?: string;
        sourceUrl?: string;
      };
    };

    if (!body.email || !body.name) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
    }

    // Validate paymentMethod group — accept only known keys, fall back to default mix.
    const group =
      body.paymentMethod && body.paymentMethod in PAYMENT_METHOD_GROUPS
        ? body.paymentMethod
        : undefined;
    const paymentMethods = resolvePaymentMethods(group);

    // BL- prefix → orderko's webhook router fans this into bosslabs.
    // Keep the prefix in sync with backend/routes/public.js in orderko.
    const externalId = `BL-MAIN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const base = siteUrl(req);
    const bumped = Boolean(body.bump);

    // OTO price flips before/after the webinar (₱1,997 → ₱3,997) — resolved
    // server-side so the buyer is billed the same amount the page showed.
    const oto = await resolveOtoOffer();
    const baseAmountCentavos =
      OFFER.main.priceCentavos + (bumped ? oto.centavos : 0);

    // Promo path: validate first (preview), then atomically redeem. If the
    // atomic redeem fails (race lost or just turned exhausted between the
    // preview and the claim), refuse the checkout with a clear error rather
    // than silently letting the buyer through at full price.
    let promoApplied: {
      code: string;
      discountType: 'free' | 'percent' | 'fixed';
      discountCentavos: number;
    } | null = null;
    let amountCentavos = baseAmountCentavos;

    if (body.promoCode && body.promoCode.trim()) {
      const promo = await findPromoCode(body.promoCode);
      if (!promo || !promo.active) {
        return NextResponse.json({ error: 'Promo code is invalid.' }, { status: 400 });
      }
      const previewDiscount = computeDiscountCentavos(promo, baseAmountCentavos);
      const redeemed = await redeemPromoCode(promo.code);
      if (!redeemed) {
        return NextResponse.json(
          { error: 'Promo code is no longer available (expired or fully claimed).' },
          { status: 409 },
        );
      }
      promoApplied = {
        code: redeemed.code,
        discountType: redeemed.discountType,
        discountCentavos: previewDiscount,
      };
      amountCentavos = Math.max(0, baseAmountCentavos - previewDiscount);
    }

    const description = bumped
      ? `${OFFER.main.name} + ${OFFER.oto.name}`
      : OFFER.main.name;

    const [firstName, ...rest] = body.name.trim().split(' ');
    // Capture Meta matching data here so the webhook (which has none of
    // this) can fire a properly-matched Purchase CAPI event later.
    const headerFb = extractFbCookies(req);
    const fbp = body.meta?.fbp ?? headerFb.fbp;
    const fbc = body.meta?.fbc ?? headerFb.fbc;
    const clientIp = extractClientIp(req);
    const clientUserAgent = req.headers.get('user-agent') ?? undefined;
    const icEventId = body.meta?.eventId ?? `ic_${Date.now()}`;
    const purchaseEventId = `purchase_${externalId}`;

    // Affiliate attribution — read the first-touch referral cookie and stamp
    // it onto the signup so even abandoned carts are credited; the Xendit
    // webhook turns it into a commission once the invoice clears.
    const refJar = cookies();
    const affiliateCode = refJar.get(REF_COOKIE)?.value || undefined;
    const affiliateMeta = affiliateCode
      ? {
          affiliateCode,
          affiliateSub: refJar.get(REF_SUB_COOKIE)?.value || '',
          affiliateFirstTouchAt: new Date(
            Number(refJar.get(REF_TOUCH_COOKIE)?.value) || Date.now(),
          ).toISOString(),
        }
      : {};

    // Free-seat path: skip Xendit entirely. The buyer goes straight to
    // /accepted, we mark them paid for ₱0, and we manually fire the
    // paid_confirmation email + SMS (the Xendit webhook normally does
    // this, but there's no invoice to webhook on).
    if (promoApplied && amountCentavos === 0) {
      const acceptedSlug = externalId;
      const existing = await findSignupByEmail(body.email);
      const baseMeta = {
        externalId: acceptedSlug,
        ...affiliateMeta,
        demo: false as boolean,
        paymentMethodGroup: 'FREE',
        promoCode: promoApplied.code,
        promoDiscountCentavos: promoApplied.discountCentavos,
        meta: {
          fbp,
          fbc,
          clientIp,
          clientUserAgent,
          purchaseEventId,
          sourceUrl: body.meta?.sourceUrl,
        },
      };

      let signupId: string;
      if (existing) {
        signupId = existing.id;
        await updateSignup(existing.id, {
          firstName,
          lastName: rest.join(' ') || undefined,
          phone: body.mobile || existing.phone,
          status: 'paid',
          amountCentavos: 0,
          bumped,
          metadata: {
            ...(existing.metadata ?? {}),
            ...baseMeta,
            confirmationSent: new Date().toISOString(),
          },
        });
      } else {
        const created = await addSignup({
          firstName,
          lastName: rest.join(' ') || undefined,
          email: body.email,
          phone: body.mobile || '',
          source: 'paid',
          status: 'paid',
          amountCentavos: 0,
          bumped,
          metadata: {
            ...baseMeta,
            confirmationSent: new Date().toISOString(),
          },
        });
        signupId = created.id;
      }

      // Send the same confirmation as a normal paid signup so the buyer
      // gets Zoom link + replay + community access. Don't block the
      // redirect on send failures — the buyer can still hit /accepted.
      const webinar = await getWebinarInfo();
      const vars = {
        firstName,
        webinarName: webinar.name,
        webinarDate: webinar.date,
        webinarTime: webinar.time,
        webinarTimezone: webinar.timezone,
        zoomJoinUrl: webinar.zoomJoinUrl,
        zoomRegisterUrl: webinar.zoomRegisterUrl,
        messengerGroupUrl: webinar.messengerGroupUrl,
        replayUrl: webinar.replayUrl,
      };
      void sendEmail({
        to: body.email,
        templateId: 'paid_confirmation',
        vars,
      });
      if (body.mobile) {
        void sendSms({ to: body.mobile, templateId: 'paid_confirmation', vars });
      }

      // No Purchase CAPI on a free order (Meta optimizes ad spend on
      // revenue events; firing $0 Purchase events would poison the
      // optimization signal). Still fire CompleteRegistration so we
      // see the conversion in Ads Manager.
      void sendCapiEvent({
        eventName: 'CompleteRegistration',
        eventId: `freereg_${externalId}`,
        eventSourceUrl: body.meta?.sourceUrl,
        userData: {
          email: body.email,
          phone: body.mobile,
          firstName,
          lastName: rest.join(' ') || undefined,
          fbp,
          fbc,
          clientIp,
          clientUserAgent,
          country: 'ph',
          externalId,
        },
        customData: {
          value: 0,
          currency: 'PHP',
          contentName: `${OFFER.main.name} (promo: ${promoApplied.code})`,
          contentIds: [OFFER.main.sku],
        },
      });

      // Auto-add this paid customer to the order-bump CRM board (idempotent;
      // never throws). Keeps the board in sync without a manual import.
      await syncCrmCardForSignup({
        signupId,
        name: `${firstName} ${rest.join(' ')}`.trim(),
        phone: body.mobile || '',
        email: body.email,
      });

      // TG notification — free-seat promo purchase (already marked paid).
      // Awaited to guarantee delivery before the serverless function exits.
      const orders = await countPaidOrders();
      await sendTelegram(
        `💰 <b>Free promo purchase!</b>\n\n` +
        `<b>${esc(firstName)} ${esc(rest.join(' '))}</b>\n` +
        `${esc(body.email)}\n` +
        `📱 ${body.mobile ? esc(body.mobile) : '—'}\n` +
        `Promo: <code>${esc(promoApplied.code)}</code>\n` +
        `Amount: <b>₱0</b>${bumped ? ' (with bump)' : ''}\n` +
        `🧾 Paid orders: <b>${orders.total}</b> total · <b>${orders.today}</b> today` +
          (orders.recoveredToday > 0 ? ` · <b>${orders.recoveredToday}</b> recovered` : ''),
      );

      return NextResponse.json({
        redirectUrl: `/accepted?order=${acceptedSlug}`,
        free: true,
        signupId,
      });
    }

    // Paid path (full price or partial-discount): standard Xendit flow.
    const invoice = await createInvoice({
      externalId,
      amount: amountCentavos / 100,
      description: promoApplied
        ? `${description} (promo: ${promoApplied.code})`
        : description,
      payerEmail: body.email,
      successRedirectUrl: `${base}/oto?order=${externalId}${bumped ? '&bumped=1' : ''}`,
      failureRedirectUrl: `${base}/checkout?status=failed`,
      customer: {
        givenNames: body.name,
        email: body.email,
        mobileNumber: body.mobile,
      },
      paymentMethods,
    });

    // Persist the lead immediately (pending status). The Xendit webhook will
    // later flip status → 'paid' once the invoice clears.
    //
    // Dedupe: if this email already has a row, update it instead of
    // creating a new one. Stops the "filled the form 4 times during a
    // failed GCash QR loop" problem from polluting the signups table.
    const existing = await findSignupByEmail(body.email);
    const sharedMetadata = {
      externalId,
      ...affiliateMeta,
      demo: invoice.demo,
      paymentMethodGroup: group ?? 'ALL',
      ...(promoApplied
        ? {
            promoCode: promoApplied.code,
            promoDiscountCentavos: promoApplied.discountCentavos,
          }
        : {}),
      // Stash everything the Xendit webhook needs to fire a deduped CAPI
      // Purchase event when the invoice clears. Hashed at send-time.
      meta: {
        fbp,
        fbc,
        clientIp,
        clientUserAgent,
        purchaseEventId,
        sourceUrl: body.meta?.sourceUrl,
      },
    };

    if (existing && existing.status === 'registered') {
      // Same buyer retrying — point the existing row at the new Xendit
      // invoice. Preserve their CAPI event ID + match keys from any
      // earlier attempt so InitiateCheckout deduplicates cleanly.
      await updateSignup(existing.id, {
        firstName,
        lastName: rest.join(' ') || undefined,
        phone: body.mobile || existing.phone,
        amountCentavos,
        bumped,
        metadata: {
          ...(existing.metadata ?? {}),
          ...sharedMetadata,
          retryCount: ((existing.metadata as { retryCount?: number } | undefined)?.retryCount ?? 0) + 1,
          firstAttemptAt:
            (existing.metadata as { firstAttemptAt?: string } | undefined)?.firstAttemptAt ??
            existing.createdAt,
        },
      });
    } else {
      await addSignup({
        firstName,
        lastName: rest.join(' ') || undefined,
        email: body.email,
        phone: body.mobile || '',
        source: 'paid',
        status: 'registered',
        amountCentavos,
        bumped,
        metadata: sharedMetadata,
      });
    }

    // Fire InitiateCheckout CAPI — deduped with the pixel event via icEventId.
    // Best-effort; never blocks the redirect even on failure.
    void sendCapiEvent({
      eventName: 'InitiateCheckout',
      eventId: icEventId,
      eventSourceUrl: body.meta?.sourceUrl,
      userData: {
        email: body.email,
        phone: body.mobile,
        firstName,
        lastName: rest.join(' ') || undefined,
        fbp,
        fbc,
        clientIp,
        clientUserAgent,
        country: 'ph',
        externalId,
      },
      customData: {
        value: amountCentavos / 100,
        currency: 'PHP',
        contentName: OFFER.main.name,
        contentIds: [bumped ? `${OFFER.main.sku}+${OFFER.oto.sku}` : OFFER.main.sku],
        numItems: bumped ? 2 : 1,
      },
    });

    // Note: We DON'T send a TG notification here. Registered = checkout
    // started but not paid yet, which is normal in-flight. Abandonment
    // is detected by /api/cron/abandoned after a 30-min grace period.
    return NextResponse.json({ redirectUrl: invoice.invoiceUrl, demo: invoice.demo });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

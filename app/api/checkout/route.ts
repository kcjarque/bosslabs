import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { REF_COOKIE, REF_TOUCH_COOKIE, REF_SUB_COOKIE } from '@/lib/ref-cookie';
import { readAbTest, resolveAbVariant } from '@/lib/ab';
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
  getFunnels,
  getSettings,
  promoAllowedForProduct,
  redeemPromoCode,
  updateSignup,
} from '@/lib/db';
import { extractClientIp, extractFbCookies, sendCapiEvent } from '@/lib/meta';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { getWebinarInfo } from '@/lib/webinar';
import { siteUrl } from '@/lib/site';
import { sendSalesTeam, esc } from '@/lib/telegram';
import { syncCrmCardForSignup } from '@/lib/crm';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      mobile?: string;
      bump?: boolean;
      bump2?: boolean;
      paymentMethod?: PaymentMethodGroup;
      promoCode?: string;
      /** The webinar event the buyer selected on the /checkout picker.
       *  When null/omitted, the API falls back to settings.active_event_id. */
      webinarEventId?: string | null;
      meta?: {
        eventId?: string;
        fbp?: string;
        fbc?: string;
        sourceUrl?: string;
        sessionId?: string;
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
    // Two independent order bumps. `bumped` = took ANY bump (drives the column,
    // Telegram label, and /oto redirect); the amount/description use each flag.
    const bumpVault = Boolean(body.bump);
    const bumpSession = Boolean(body.bump2);
    const bumped = bumpVault || bumpSession;

    const baseAmountCentavos =
      OFFER.main.priceCentavos +
      (bumpVault ? OFFER.oto.priceCentavos : 0) +
      (bumpSession ? OFFER.oto2.priceCentavos : 0);

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
      // A closer-issued code is scoped to an upsell product (Retreat / Vault /
      // Build Session) — it must not apply to the main webinar ticket.
      if (!promoAllowedForProduct(promo, 'main')) {
        return NextResponse.json({ error: 'This code is not valid for the webinar ticket.' }, { status: 400 });
      }
      // Discount ONLY the webinar-ticket line — bumps are separate products
      // and always charged full price. Computing against the bump-inclusive
      // total let a 100%-off code (PATIENCEISAVIRTUE) zero the whole cart,
      // handing out free Vaults/1:1s; capping the discount base at the ticket
      // price closes that while keeping the ticket itself fully discountable.
      const previewDiscount = computeDiscountCentavos(promo, OFFER.main.priceCentavos);
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

    const description = [
      OFFER.main.name,
      bumpVault ? OFFER.oto.name : null,
      bumpSession ? OFFER.oto2.name : null,
    ]
      .filter(Boolean)
      .join(' + ');

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

    // A/B test attribution — which homepage design did this buyer come through?
    // Resolved from the SAME config + sticky cookie the homepage router uses
    // (lib/ab.ts), so the tag matches what they actually saw. We store BOTH the
    // arm ('a'/'b') and the design key, so past sales stay attributable after
    // the variants are swapped for a later test.
    let homeVariant: 'a' | 'b' = 'b';
    let homeVariantKey: string = 'd';
    try {
      const funnels = await getFunnels();
      const abCfg = funnels.find((f) => f.slug === 'webinar')?.config as
        | Record<string, unknown>
        | undefined;
      const r = resolveAbVariant(readAbTest(abCfg), refJar.get('bl_ab_roll')?.value);
      homeVariant = r.arm;
      homeVariantKey = r.variant;
    } catch {
      /* attribution is best-effort — never block a checkout */
    }

    // Free-seat path: skip Xendit entirely. The buyer goes straight to
    // /accepted, we mark them paid for ₱0, and we manually fire the
    // paid_confirmation email + SMS (the Xendit webhook normally does
    // this, but there's no invoice to webhook on).
    if (promoApplied && amountCentavos === 0) {
      const acceptedSlug = externalId;
      const existing = await findSignupByEmail(body.email);
      const baseMeta = {
        externalId: acceptedSlug,
        // Products in this order (line items) — trigger off the product, not price.
        bumpVault,
        bumpSession,
        ...affiliateMeta,
        homeVariant, // A/B arm
      homeVariantKey, // the actual design served
        // Session-replay id — links this signup to its recording.
        ...(body.meta?.sessionId ? { blSessionId: body.meta.sessionId } : {}),
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

      // A free seat must NEVER overwrite money already collected. Updating an
      // ALREADY-PAID row set amount_centavos to 0 and wiped the original sale
      // from revenue (₱92,910 across 61 rows before this guard). A returning
      // customer claiming a free seat is a NEW order — record it like the paid
      // path does (its own row), leaving the earlier sale intact.
      // Reusing the row is still right for an UNPAID one: that's an abandoned
      // cart converting, not a second order.
      const existingIsPaid =
        existing && (existing.status === 'paid' || existing.status === 'attended');
      const reusable = existing && !existingIsPaid ? existing : null;

      let signupId: string;
      if (reusable) {
        signupId = reusable.id;
        // Re-tag to the buyer's chosen event (picker) or the active event
        // (fallback) so a returning lead who claims a free seat for the NEW
        // event lands on its list and gets this event's reminders.
        const activeEventId = (await getSettings().catch(() => null))?.activeEventId ?? null;
        const chosenEventId = body.webinarEventId ?? activeEventId;
        await updateSignup(reusable.id, {
          firstName,
          lastName: rest.join(' ') || undefined,
          phone: body.mobile || reusable.phone,
          status: 'paid',
          amountCentavos: 0,
          bumped,
          ...(chosenEventId ? { eventId: chosenEventId } : {}),
          metadata: {
            ...(reusable.metadata ?? {}),
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
          eventId: body.webinarEventId ?? undefined,
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

      // TG notification — free-seat promo purchase (already marked paid). A
      // webinar-ticket sale, so it goes to the all-sales chat only (same as
      // every other webinar sale — see handleMainPaid in the Xendit webhook).
      // Awaited to guarantee delivery before the serverless function exits.
      const orders = await countPaidOrders();
      await sendSalesTeam(
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
      // Products in this order (ecommerce-style line items) — the source of
      // truth for "what they bought", so downstream (1-on-1 board, provisioning)
      // triggers off the product, never the price.
      bumpVault,
      bumpSession,
      ...affiliateMeta,
      homeVariant, // A/B arm
      homeVariantKey, // the actual design served
      // Session-replay id — links this signup to its recording.
      ...(body.meta?.sessionId ? { blSessionId: body.meta.sessionId } : {}),
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

    if (existing && (existing.status === 'paid' || existing.status === 'attended')) {
      // Already a paying customer who reopened checkout and re-submitted.
      // Do NOT spawn a new 'registered' row — that becomes a phantom
      // abandoned cart that pollutes the closer pool + win-back drips and
      // makes the same person show up twice (e.g. "calling" + "Closed —
      // Won"). Leave their paid order's financials untouched; only refresh
      // the CAPI match metadata in case they do complete another purchase.
      await updateSignup(existing.id, {
        metadata: { ...(existing.metadata ?? {}), ...sharedMetadata },
      });
    } else if (existing && existing.status === 'registered') {
      // Same buyer retrying — point the existing row at the new Xendit
      // invoice. Preserve their CAPI event ID + match keys from any
      // earlier attempt so InitiateCheckout deduplicates cleanly.
      //
      // CRITICAL: re-tag them to the CURRENTLY active event. A returning lead
      // who registered for a PAST event (never paid) and now checks out for the
      // new one must move to the new event's list — otherwise they'd stay on
      // the old list and never get this event's reminders / Zoom link. No-op
      // when the active event hasn't changed.
      const activeEventId = (await getSettings().catch(() => null))?.activeEventId ?? null;
      const chosenEventId = body.webinarEventId ?? activeEventId;
      await updateSignup(existing.id, {
        firstName,
        lastName: rest.join(' ') || undefined,
        phone: body.mobile || existing.phone,
        amountCentavos,
        bumped,
        ...(chosenEventId ? { eventId: chosenEventId } : {}),
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
        eventId: body.webinarEventId ?? undefined,
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

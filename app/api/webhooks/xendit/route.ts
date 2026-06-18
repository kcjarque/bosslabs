/**
 * Xendit webhook — fan-out target for orderko (BL- prefix → forwarded here).
 *
 * Handles two invoice shapes:
 *
 *   - BL-MAIN-<rand>: the main ₱999 / ₱2,996 (bumped) webinar purchase.
 *     Flip the signup status, send the paid_confirmation email/SMS, and
 *     fire a CAPI Purchase event.
 *
 *   - BL-OTO-<mainOrderId>-<ts>: the standalone OTO (1:1 Audit) invoice
 *     when a buyer didn't bump at checkout but opted in on the /oto page.
 *     Marks the parent signup as bumped=true and fires a SECOND CAPI
 *     Purchase event for the OTO amount so Meta sees the full LTV.
 *
 * Side-effects are idempotent: every send is gated on a marker that's
 * written BEFORE the send. Concurrent webhook deliveries from Xendit
 * (which retries on its end) can't double-send emails or fire two CAPI
 * events for the same invoice.
 */

import { NextResponse } from 'next/server';
import { verifyWebhook } from '@/lib/xendit';
import {
  findSignupByExternalId,
  updateSignup,
  countPaidOrders,
  getRetreatReservation,
  markRetreatReservationPaid,
} from '@/lib/db';
import { recordCommission } from '@/lib/affiliates';
import { syncCrmCardForSignup } from '@/lib/crm';
import { closeLeadAndRecordCommission, getCloserForSignup } from '@/lib/closers';
import { getWebinarInfo, templateVarsForSignup } from '@/lib/webinar';
import { parseOtoExternalId, parseStandaloneOtoProduct } from '@/lib/oto-external';
import { logRetreatCardPayment } from '@/lib/retreat-crm';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { sendCapiEvent } from '@/lib/meta';
import { OFFER } from '@/lib/config';
import { sendTelegram, sendAbandonedTeam, esc } from '@/lib/telegram';

export const runtime = 'nodejs';
export const maxDuration = 30;

type XenditEvent = {
  id?: string;
  external_id?: string;
  status?: 'PAID' | 'EXPIRED' | 'PENDING' | 'FAILED';
  amount?: number;
};

function redact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  // Vercel function logs are searchable. Strip PII before logging.
  const out: Record<string, unknown> = { ...obj };
  for (const k of ['payer_email', 'email', 'phone', 'mobile_number']) {
    if (k in out) out[k] = '[redacted]';
  }
  return out as Partial<T>;
}

export async function POST(req: Request) {
  const token = req.headers.get('x-callback-token');
  if (!verifyWebhook(token)) {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  }

  const event = (await req.json().catch(() => ({}))) as XenditEvent;
  console.log('[xendit-webhook]', redact(event));

  if (event.status !== 'PAID' || !event.external_id) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Route by externalId prefix. BL-OTOX- (standalone) is checked before BL-OTO-
  // (post-purchase upsell) — they're mutually exclusive, but order keeps it
  // obvious that a standalone id never falls into the parent-lookup handler.
  if (event.external_id.startsWith('BL-OTOX-')) {
    return handleStandaloneOtoPaid(event);
  }
  if (event.external_id.startsWith('BL-OTO-')) {
    return handleOtoPaid(event);
  }
  if (event.external_id.startsWith('BL-RETREAT-')) {
    return handleRetreatPaid(event);
  }
  if (event.external_id.startsWith('BL-MAIN-')) {
    return handleMainPaid(event);
  }
  return NextResponse.json({ ok: true, unknownPrefix: true });
}

/* --------------------------------------------------------------------- */
/* MAIN purchase — ₱999 webinar (+ optional bump baked into single invoice) */
/* --------------------------------------------------------------------- */
async function handleMainPaid(event: XenditEvent) {
  const externalId = event.external_id!;
  const signup = await findSignupByExternalId(externalId);
  if (!signup) {
    console.warn('[xendit-webhook] no signup matched', externalId);
    return NextResponse.json({ ok: true, matched: false });
  }

  const meta = (signup.metadata ?? {}) as {
    confirmationSent?: string;
    meta?: {
      fbp?: string;
      fbc?: string;
      clientIp?: string;
      clientUserAgent?: string;
      purchaseEventId?: string;
      sourceUrl?: string;
    };
  };

  // Idempotency: if already processed, bail without re-sending.
  if (signup.status === 'paid' && meta.confirmationSent) {
    return NextResponse.json({ ok: true, alreadyPaid: true });
  }

  // Write the marker FIRST, then do side-effects. A retried webhook that
  // arrives mid-flight sees the marker and bails cleanly.
  const paidMeta = {
    ...(signup.metadata ?? {}),
    confirmationSent: new Date().toISOString(),
    xenditInvoiceId: event.id,
    paidAmount: event.amount,
  };
  await updateSignup(signup.id, { status: 'paid', metadata: paidMeta });

  // Affiliate commission — if this buyer was referred, record the payout
  // (idempotent; computed on the total paid incl. any OTO bump).
  const refMeta = signup.metadata as { affiliateCode?: string; affiliateSub?: string } | undefined;
  if (refMeta?.affiliateCode) {
    const saleCentavos = event.amount ? event.amount * 100 : signup.amountCentavos ?? 0;
    await recordCommission({
      affiliateCode: refMeta.affiliateCode,
      signupId: signup.id,
      saleCentavos,
      sub: refMeta.affiliateSub || '',
    }).catch(() => {});
  }

  const webinar = await getWebinarInfo();
  // Resolves the per-event Zoom link from the signup's event, else global.
  const vars = await templateVarsForSignup(signup, webinar);

  const emailRes = await sendEmail({
    to: signup.email,
    templateId: 'paid_confirmation',
    vars,
  });
  const smsRes = signup.phone
    ? await sendSms({ to: signup.phone, templateId: 'paid_confirmation', vars })
    : null;
  // Record confirmation markers: the email message-id (so the SES delivery
  // webhook can stamp delivered/bounced) + the SMS send outcome (so the
  // comms history shows the confirmation SMS too).
  await updateSignup(signup.id, {
    metadata: {
      ...paidMeta,
      ...(emailRes.ok && emailRes.id
        ? { confirmationMessageId: emailRes.id, confirmationStatus: 'sent' }
        : { confirmationStatus: 'failed' }),
      ...(smsRes
        ? {
            confirmationSmsSent: new Date().toISOString(),
            confirmationSmsOk: smsRes.ok,
            confirmationSmsId: smsRes.ok ? smsRes.id : null,
            confirmationSmsStatus: smsRes.ok ? 'sent' : 'failed',
          }
        : {}),
    },
  }).catch(() => {});

  // CAPI Purchase event for the main invoice (₱999 or ₱2,996 if bumped).
  const bumped = Boolean(signup.bumped);
  const amountPhp = (event.amount ?? signup.amountCentavos ?? 0) / (event.amount ? 1 : 100);
  void sendCapiEvent({
    eventName: 'Purchase',
    eventId: meta.meta?.purchaseEventId ?? `purchase_${externalId}`,
    eventSourceUrl: meta.meta?.sourceUrl,
    userData: {
      email: signup.email,
      phone: signup.phone,
      firstName: signup.firstName,
      lastName: signup.lastName,
      fbp: meta.meta?.fbp,
      fbc: meta.meta?.fbc,
      clientIp: meta.meta?.clientIp,
      clientUserAgent: meta.meta?.clientUserAgent,
      country: 'ph',
      externalId,
    },
    customData: {
      value: amountPhp,
      currency: 'PHP',
      contentName: bumped ? `${OFFER.main.name} + ${OFFER.oto.name}` : OFFER.main.name,
      contentIds: [bumped ? `${OFFER.main.sku}+${OFFER.oto.sku}` : OFFER.main.sku],
      numItems: bumped ? 2 : 1,
    },
  });

  // Telegram notification — AWAITED, not void. In a Vercel serverless
  // function, void promises can be killed mid-flight when the response
  // returns. The ~200ms latency cost is fine — Xendit doesn't care about
  // webhook response time as long as we return 200.
  // Auto-add this new paid customer to the order-bump CRM board (idempotent;
  // never throws). Keeps the board in sync without a manual import.
  await syncCrmCardForSignup({
    signupId: signup.id,
    name: `${signup.firstName} ${signup.lastName ?? ''}`.trim(),
    phone: signup.phone ?? '',
    email: signup.email,
  });

  // If a sales closer claimed this lead, auto-close it + record their
  // commission (no-op otherwise; never throws).
  await closeLeadAndRecordCommission(signup.id);

  const amtFmt = `₱${amountPhp.toLocaleString()}`;
  // Running tally of paid orders (includes this one — status was set to
  // 'paid' above). Best-effort; never blocks the alert.
  const orders = await countPaidOrders();
  // Is THIS sale a recovery? (a closer claimed the lead, OR it was
  // abandoned-then-paid — paid a later Manila day than signup.) If so,
  // celebrate it + credit the closer who worked it.
  const manilaDay = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Manila' });
  const closer = await getCloserForSignup(signup.id);
  const isRecovered =
    !!closer || manilaDay(new Date()) > manilaDay(new Date(signup.createdAt));
  const header = isRecovered
    ? `🎉 <b>New Recovered Lead — Paid! Good job Team!</b>`
    : `💰 <b>New payment!</b>`;
  const paymentMsg =
    `${header}\n\n` +
    `<b>${esc(signup.firstName)} ${esc(signup.lastName ?? '')}</b>\n` +
    `${esc(signup.email)}\n` +
    `📱 ${signup.phone ? esc(signup.phone) : '—'}\n` +
    `Amount: <b>${amtFmt}</b>${bumped ? ' (with bump)' : ''}\n` +
    (closer ? `Confirmed by: <b>${esc(closer.name)}</b>\n` : '') +
    `Invoice: <code>${externalId}</code>\n` +
    `🧾 Paid orders: <b>${orders.total}</b> total · <b>${orders.today}</b> today` +
    (orders.recoveredToday > 0 ? ` · <b>${orders.recoveredToday}</b> recovered` : '');
  await sendTelegram(paymentMsg);
  // Mirror RECOVERED sales (and only those — never regular new payments) to the
  // abandoned-cart sales team chat. Best-effort add-on.
  if (isRecovered) await sendAbandonedTeam(paymentMsg).catch(() => {});

  return NextResponse.json({ ok: true, emailOk: emailRes.ok });
}

/* --------------------------------------------------------------------- */
/* OTO purchase — standalone 1:1 audit invoice (bought after main checkout) */
/* --------------------------------------------------------------------- */
async function handleOtoPaid(event: XenditEvent) {
  // Decode the product + parent order from the externalId (marker-aware;
  // legacy unmarked IDs resolve to the 1:1).
  const { product: otoProduct, mainOrderId } = parseOtoExternalId(event.external_id!);
  const otoOffer = otoProduct === 'oto' ? OFFER.oto : OFFER.oto2;

  const signup = await findSignupByExternalId(mainOrderId);
  if (!signup) {
    console.warn('[xendit-webhook] OTO has no parent signup', mainOrderId);
    return NextResponse.json({ ok: true, matched: false });
  }

  const meta = (signup.metadata ?? {}) as {
    otoConfirmed?: string;
    meta?: {
      fbp?: string;
      fbc?: string;
      clientIp?: string;
      clientUserAgent?: string;
      sourceUrl?: string;
    };
  };

  // Idempotency for the OTO leg.
  if (meta.otoConfirmed) {
    return NextResponse.json({ ok: true, alreadyOto: true });
  }

  const amountPhp = event.amount ?? otoOffer.priceCentavos / 100;

  // Product-specific confirmation email + SMS (Vault = instant access, 1:1 =
  // we'll schedule). `amount` is GSM-7-safe (no ₱) so the SMS stays one segment.
  const otoTemplateId = otoProduct === 'oto' ? 'vault_confirmation' : 'oto_confirmation';
  const webinar = await getWebinarInfo();
  const baseVars = await templateVarsForSignup(signup, webinar);
  const otoVars = {
    ...baseVars,
    amount: `PHP ${amountPhp.toLocaleString('en-PH')}`,
  };
  const otoEmailRes = await sendEmail({
    to: signup.email,
    templateId: otoTemplateId,
    vars: otoVars,
  });
  const otoSmsRes = signup.phone
    ? await sendSms({ to: signup.phone, templateId: otoTemplateId, vars: otoVars })
    : null;

  await updateSignup(signup.id, {
    bumped: true,
    metadata: {
      ...(signup.metadata ?? {}),
      otoConfirmed: new Date().toISOString(),
      otoInvoiceId: event.id,
      otoExternalId: event.external_id,
      otoAmount: event.amount,
      otoConfirmationStatus: otoEmailRes.ok ? 'sent' : 'failed',
      ...(otoEmailRes.ok ? { otoConfirmationMessageId: otoEmailRes.id } : {}),
      ...(otoSmsRes
        ? { otoConfirmationSmsOk: otoSmsRes.ok, otoConfirmationSmsId: otoSmsRes.ok ? otoSmsRes.id : null }
        : {}),
    },
  });

  // Top up the closer's commission to include the OTO (no-op if no closer
  // claimed this lead; recomputes against the now-larger total paid).
  await closeLeadAndRecordCommission(signup.id);

  // Fire a separate CAPI Purchase for the OTO so Meta attributes the
  // upsell revenue. Distinct eventId from the main invoice — these are
  // two separate purchases in Meta's eyes.
  void sendCapiEvent({
    eventName: 'Purchase',
    eventId: `purchase_${event.external_id}`,
    eventSourceUrl: meta.meta?.sourceUrl,
    userData: {
      email: signup.email,
      phone: signup.phone,
      firstName: signup.firstName,
      lastName: signup.lastName,
      fbp: meta.meta?.fbp,
      fbc: meta.meta?.fbc,
      clientIp: meta.meta?.clientIp,
      clientUserAgent: meta.meta?.clientUserAgent,
      country: 'ph',
      externalId: event.external_id,
    },
    customData: {
      value: amountPhp,
      currency: 'PHP',
      contentName: otoOffer.name,
      contentIds: [otoOffer.sku],
      numItems: 1,
    },
  });

  // AWAITED — see note in handleMainPaid.
  await sendTelegram(
    `💰 <b>OTO upsell paid!</b>\n\n` +
    `<b>${esc(signup.firstName)} ${esc(signup.lastName ?? '')}</b>\n` +
    `${esc(signup.email)}\n` +
    `📱 ${signup.phone ? esc(signup.phone) : '—'}\n` +
    `Amount: <b>₱${amountPhp.toLocaleString()}</b>\n` +
    `OTO invoice: <code>${event.external_id}</code>`,
  );

  return NextResponse.json({ ok: true, oto: true });
}

/* --------------------------------------------------------------------- */
/* STANDALONE OTO — the 1:1 bought directly from a shared /oto link        */
/* (no parent BL-MAIN order; buyer + lead row created by /api/oto)         */
/* --------------------------------------------------------------------- */
async function handleStandaloneOtoPaid(event: XenditEvent) {
  const externalId = event.external_id!;
  // /api/oto persisted a lead row keyed by metadata.externalId = this id.
  const signup = await findSignupByExternalId(externalId);
  if (!signup) {
    console.warn('[xendit-webhook] standalone OTO has no lead row', externalId);
    return NextResponse.json({ ok: true, matched: false });
  }

  const meta = (signup.metadata ?? {}) as {
    otoConfirmed?: string;
    otoPromoCode?: string;
    meta?: {
      fbp?: string;
      fbc?: string;
      clientIp?: string;
      clientUserAgent?: string;
      sourceUrl?: string;
    };
  };

  // Idempotency — a retried webhook bails here.
  if (meta.otoConfirmed) {
    return NextResponse.json({ ok: true, alreadyOto: true });
  }

  // Which product this standalone purchase was for (VAULT vs 1ON1 in the id).
  const product = parseStandaloneOtoProduct(externalId);
  const offer = product === 'oto' ? OFFER.oto : OFFER.oto2;
  const confirmTemplate = product === 'oto' ? 'vault_confirmation' : 'oto_confirmation';
  const amountPhp = event.amount ?? offer.priceCentavos / 100;

  const webinar = await getWebinarInfo();
  const otoVars = {
    ...(await templateVarsForSignup(signup, webinar)),
    amount: `PHP ${amountPhp.toLocaleString('en-PH')}`,
  };
  const emailRes = await sendEmail({ to: signup.email, templateId: confirmTemplate, vars: otoVars });
  const smsRes = signup.phone
    ? await sendSms({ to: signup.phone, templateId: confirmTemplate, vars: otoVars })
    : null;

  // NOTE: the promo was already redeemed atomically at invoice-create in
  // /api/oto (same as every other money route) — do NOT redeem again here.
  // The full sale lives in amountCentavos; we deliberately do NOT write
  // metadata.otoAmount, because the dashboard sums amountCentavos + otoAmount
  // for confirmed OTOs (correct for the post-purchase parent row, but it would
  // double-count a standalone row where amountCentavos already IS the sale).
  await updateSignup(signup.id, {
    status: 'paid',
    bumped: true,
    amountCentavos: Math.round(amountPhp * 100),
    metadata: {
      ...(signup.metadata ?? {}),
      otoConfirmed: new Date().toISOString(),
      otoInvoiceId: event.id,
      otoExternalId: externalId,
      otoConfirmationStatus: emailRes.ok ? 'sent' : 'failed',
      ...(emailRes.ok ? { otoConfirmationMessageId: emailRes.id } : {}),
      ...(smsRes
        ? { otoConfirmationSmsOk: smsRes.ok, otoConfirmationSmsId: smsRes.ok ? smsRes.id : null }
        : {}),
    },
  });

  // CAPI Purchase for the standalone 1:1.
  void sendCapiEvent({
    eventName: 'Purchase',
    eventId: `purchase_${externalId}`,
    eventSourceUrl: meta.meta?.sourceUrl,
    userData: {
      email: signup.email,
      phone: signup.phone,
      firstName: signup.firstName,
      lastName: signup.lastName,
      fbp: meta.meta?.fbp,
      fbc: meta.meta?.fbc,
      clientIp: meta.meta?.clientIp,
      clientUserAgent: meta.meta?.clientUserAgent,
      country: 'ph',
      externalId,
    },
    customData: {
      value: amountPhp,
      currency: 'PHP',
      contentName: offer.name,
      contentIds: [offer.sku],
      numItems: 1,
    },
  });

  await sendTelegram(
    `💰 <b>1:1 Build Session paid (standalone)!</b>\n\n` +
    `<b>${esc(signup.firstName)} ${esc(signup.lastName ?? '')}</b>\n` +
    `${esc(signup.email)}\n` +
    `📱 ${signup.phone ? esc(signup.phone) : '—'}\n` +
    `Amount: <b>₱${amountPhp.toLocaleString()}</b>` +
    (meta.otoPromoCode ? `\nPromo: <code>${esc(meta.otoPromoCode)}</code>` : '') +
    `\nInvoice: <code>${externalId}</code>`,
  );

  return NextResponse.json({ ok: true, standaloneOto: true });
}

/* --------------------------------------------------------------------- */
/* RETREAT reservation — card payment for the VibeCode Retreat            */
/* --------------------------------------------------------------------- */
async function handleRetreatPaid(event: XenditEvent) {
  // externalId pattern: BL-RETREAT-<uuid>-<ts>. The reservation id is a UUID,
  // so pull it out with a regex (robust against the trailing timestamp).
  const uuid = event.external_id!.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  )?.[0];
  if (!uuid) {
    console.warn('[xendit-webhook] retreat externalId has no uuid', event.external_id);
    return NextResponse.json({ ok: true, matched: false });
  }

  const r = await getRetreatReservation(uuid);
  if (!r) {
    console.warn('[xendit-webhook] no retreat reservation matched', uuid);
    return NextResponse.json({ ok: true, matched: false });
  }

  // Idempotency — Xendit retries; don't double-confirm or double-notify.
  if (r.status === 'paid') {
    return NextResponse.json({ ok: true, alreadyPaid: true });
  }

  await markRetreatReservationPaid(uuid, {
    invoiceId: event.id,
    paidAtIso: new Date().toISOString(),
  });

  const amountPhp = event.amount ?? (r.amountDueCentavos ?? 0) / 100;

  // Payment confirmation to the customer (email + SMS) — the retreat flow
  // previously sent nothing to the buyer, only Telegram to the team.
  const retreatFirstName = r.name.split(/\s+/)[0] || r.name;
  const retreatVars = {
    firstName: retreatFirstName,
    amount: `PHP ${amountPhp.toLocaleString('en-PH')}`,
  };
  await sendEmail({ to: r.email, templateId: 'retreat_confirmation', vars: retreatVars }).catch(() => null);
  if (r.phone) {
    await sendSms({ to: r.phone, templateId: 'retreat_confirmation', vars: retreatVars }).catch(() => null);
  }

  // Log the payment onto the CRM card so it counts as VCR income (dashboard +
  // P&L) and stamps the card paid — so a later "mark paid in full" won't
  // re-send the confirmation. Idempotent on the invoice id.
  await logRetreatCardPayment(
    r.id,
    Math.round(amountPhp * 100),
    event.id ?? event.external_id ?? '',
  ).catch(() => undefined);

  // AWAITED — void promises can be killed when the serverless fn returns.
  await sendTelegram(
    `🏕️ <b>VibeCode Retreat — card payment confirmed!</b>\n\n` +
      `<b>${esc(r.name)}</b>\n` +
      `${esc(r.email)}\n` +
      `📱 ${r.phone ? esc(r.phone) : '—'}\n` +
      `Amount: <b>₱${amountPhp.toLocaleString()}</b>\n` +
      `Invoice: <code>${esc(event.external_id ?? '')}</code>`,
  );

  return NextResponse.json({ ok: true, retreat: true });
}

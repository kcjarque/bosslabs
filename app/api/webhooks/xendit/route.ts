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
import { findSignupByExternalId, updateSignup, countPaidOrders } from '@/lib/db';
import { recordCommission } from '@/lib/affiliates';
import { syncCrmCardForSignup } from '@/lib/crm';
import { closeLeadAndRecordCommission, getCloserForSignup } from '@/lib/closers';
import { getWebinarInfo, templateVarsForSignup } from '@/lib/webinar';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { sendCapiEvent } from '@/lib/meta';
import { OFFER } from '@/lib/config';
import { sendTelegram, esc } from '@/lib/telegram';

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

  // Route by externalId prefix.
  if (event.external_id.startsWith('BL-OTO-')) {
    return handleOtoPaid(event);
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
  await updateSignup(signup.id, {
    status: 'paid',
    metadata: {
      ...(signup.metadata ?? {}),
      confirmationSent: new Date().toISOString(),
      xenditInvoiceId: event.id,
      paidAmount: event.amount,
    },
  });

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
  if (signup.phone) {
    await sendSms({ to: signup.phone, templateId: 'paid_confirmation', vars });
  }

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
  await sendTelegram(
    `${header}\n\n` +
    `<b>${esc(signup.firstName)} ${esc(signup.lastName ?? '')}</b>\n` +
    `${esc(signup.email)}\n` +
    `📱 ${signup.phone ? esc(signup.phone) : '—'}\n` +
    `Amount: <b>${amtFmt}</b>${bumped ? ' (with bump)' : ''}\n` +
    (closer ? `Confirmed by: <b>${esc(closer.name)}</b>\n` : '') +
    `Invoice: <code>${externalId}</code>\n` +
    `🧾 Paid orders: <b>${orders.total}</b> total · <b>${orders.today}</b> today` +
      (orders.recoveredToday > 0 ? ` · <b>${orders.recoveredToday}</b> recovered` : ''),
  );

  return NextResponse.json({ ok: true, emailOk: emailRes.ok });
}

/* --------------------------------------------------------------------- */
/* OTO purchase — standalone 1:1 audit invoice (bought after main checkout) */
/* --------------------------------------------------------------------- */
async function handleOtoPaid(event: XenditEvent) {
  // OTO externalId pattern: BL-OTO-<mainOrderId>-<ts>
  // Extract the main order ID by stripping prefix + the trailing -<ts>.
  const stripped = event.external_id!.replace(/^BL-OTO-/, '');
  const lastDash = stripped.lastIndexOf('-');
  const mainOrderId = lastDash > 0 ? stripped.slice(0, lastDash) : stripped;

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

  await updateSignup(signup.id, {
    bumped: true,
    metadata: {
      ...(signup.metadata ?? {}),
      otoConfirmed: new Date().toISOString(),
      otoInvoiceId: event.id,
      otoExternalId: event.external_id,
      otoAmount: event.amount,
    },
  });

  // Top up the closer's commission to include the OTO (no-op if no closer
  // claimed this lead; recomputes against the now-larger total paid).
  await closeLeadAndRecordCommission(signup.id);

  // Fire a separate CAPI Purchase for the OTO so Meta attributes the
  // upsell revenue. Distinct eventId from the main invoice — these are
  // two separate purchases in Meta's eyes.
  const amountPhp = event.amount ?? OFFER.oto.priceCentavos / 100;
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
      contentName: OFFER.oto.name,
      contentIds: [OFFER.oto.sku],
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

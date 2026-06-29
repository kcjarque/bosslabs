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
import { applyBootcampPayment, getBootcampReservation, tierById } from '@/lib/bootcamp';
import { provisionHubAccount } from '@/lib/hub-provision';
import { sendHubCredentialsEmail } from '@/lib/hub-credentials-email';

/**
 * Provision a BossLabs Hub account for a Vault buyer + save credentials on
 * the signup metadata for the thank-you page to read. Awaited so the page
 * has the creds ready when the redirect lands. Failures are logged but
 * never fail the payment flow.
 */
/** Shape of the hubAccount field we write into signup.metadata. Returned by
 *  provisionVaultBuyerHub so callers can merge it into their in-memory
 *  paidMeta variable — preventing subsequent updateSignup calls (email
 *  confirmation status, SMS status, etc.) from clobbering it. */
type HubAccountMeta = {
  email: string;
  password: string | null;
  userId: string | undefined;
  provisionedAt: string;
  existed: boolean;
};

async function provisionVaultBuyerHub(signup: {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  metadata?: unknown;
}): Promise<HubAccountMeta | null> {
  // Skip if we already have hubAccount in metadata (proper record exists).
  const existing = (signup.metadata as { hubAccount?: HubAccountMeta } | undefined)?.hubAccount;
  if (existing) return existing;

  const fullName = [signup.firstName, signup.lastName].filter(Boolean).join(' ').trim();
  let result = await provisionHubAccount({ email: signup.email, fullName });
  if (!result?.ok) return null; // helper already logged

  // ORPHAN RECOVERY: Hub user exists but our signup metadata has no
  // hubAccount. The first webhook fire's createUser succeeded at Hub but
  // the metadata write didn't persist (function timeout / DB transient).
  // Force-reset to mint a fresh password we can deliver, then write metadata.
  // Without this branch the buyer is permanently stuck — webhook idempotency
  // would never retry, and existed:true would never produce a new password.
  if (result.existed) {
    const reset = await provisionHubAccount({
      email: signup.email,
      fullName,
      forceReset: true,
    });
    if (!reset?.ok || !reset.password) return null;
    result = reset;
  }

  const hubAccount: HubAccountMeta = {
    email: result.email,
    password: result.password ?? null,
    userId: result.userId,
    provisionedAt: new Date().toISOString(),
    existed: result.existed,
  };

  await updateSignup(signup.id, {
    metadata: {
      ...(signup.metadata as Record<string, unknown> | undefined),
      hubAccount,
    },
  });

  // Auto-send credentials email so new Vault buyers don't depend on the
  // /thank-you/vault page being open. Best-effort; failures are logged but
  // don't block the webhook (buyer can also see creds on the success page,
  // and the admin backfill endpoint can re-send on demand).
  if (result.password) {
    void sendHubCredentialsEmail({
      firstName: signup.firstName || signup.email.split('@')[0],
      email: signup.email,
      hubPassword: result.password,
    }).then((res) => {
      if (!res.ok) console.warn('[hub-provision] auto-email failed', res.error);
    });
  }

  // Return so the caller can merge into its in-memory paidMeta — otherwise
  // a subsequent updateSignup call (email confirmation, SMS status, etc.)
  // would spread stale paidMeta and overwrite this very hubAccount.
  return hubAccount;
}
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
  if (event.external_id.startsWith('BL-BOOTCAMP-')) {
    return handleBootcampPaid(event);
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

  // Idempotency: if already processed, bail without re-sending. BUT still
  // retry Vault Hub provisioning — it's idempotent on its own and the first
  // fire could have left the buyer in an orphan state (Hub user created but
  // signup metadata missing the hubAccount marker).
  if (signup.status === 'paid' && meta.confirmationSent) {
    if (Boolean(signup.bumped)) {
      await provisionVaultBuyerHub({
        id: signup.id,
        email: signup.email,
        firstName: signup.firstName,
        lastName: signup.lastName,
        metadata: signup.metadata,
      });
    }
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

  // Vault bumped at checkout (₱999 main + ₱999 Vault in one invoice) →
  // provision a Hub account immediately so the thank-you page can show
  // username + password. Merge the returned hubAccount into paidMeta so
  // the post-confirmation updateSignup call below doesn't spread a stale
  // paidMeta and silently overwrite the hubAccount we just persisted.
  if (Boolean(signup.bumped)) {
    const hubAccount = await provisionVaultBuyerHub({
      id: signup.id,
      email: signup.email,
      firstName: signup.firstName,
      lastName: signup.lastName,
      metadata: paidMeta,
    });
    if (hubAccount) (paidMeta as Record<string, unknown>).hubAccount = hubAccount;
  }

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
    `Order: <code>${externalId}</code>\n` +
    (event.id ? `Xendit invoice: <code>${esc(event.id)}</code>\n` : '') +
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
  // legacy unmarked IDs resolve to the 1:1). 'both' = the bundle.
  const { product: otoProduct, mainOrderId } = parseOtoExternalId(event.external_id!);
  const productLabel =
    otoProduct === 'both' ? `${OFFER.oto2.name} + ${OFFER.oto.name}` :
    (otoProduct === 'oto' ? OFFER.oto : OFFER.oto2).name;

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

  // Idempotency for the OTO leg. Still retry Vault Hub provisioning in case
  // the first fire orphaned the buyer (Hub user created, metadata write
  // failed). Helper is itself idempotent.
  if (meta.otoConfirmed) {
    if (otoProduct === 'oto' || otoProduct === 'both') {
      await provisionVaultBuyerHub({
        id: signup.id,
        email: signup.email,
        firstName: signup.firstName,
        lastName: signup.lastName,
        metadata: signup.metadata,
      });
    }
    return NextResponse.json({ ok: true, alreadyOto: true });
  }

  const fallbackCentavos =
    otoProduct === 'both' ? OFFER.oto.priceCentavos + OFFER.oto2.priceCentavos :
    (otoProduct === 'oto' ? OFFER.oto.priceCentavos : OFFER.oto2.priceCentavos);
  const amountPhp = event.amount ?? fallbackCentavos / 100;

  // Vault buyer (product='oto' or 'both') → provision a Hub account NOW so
  // the thank-you redirect can show username + password. Capture the
  // returned hubAccount so we can merge it into the final metadata write
  // below; otherwise that later updateSignup spreads stale signup.metadata
  // and silently clobbers the hubAccount provision just persisted.
  let hubAccount: HubAccountMeta | null = null;
  if (otoProduct === 'oto' || otoProduct === 'both') {
    hubAccount = await provisionVaultBuyerHub({
      id: signup.id,
      email: signup.email,
      firstName: signup.firstName,
      lastName: signup.lastName,
      metadata: signup.metadata,
    });
  }

  // Product-specific confirmation email + SMS (Vault = instant access, 1:1 =
  // we'll schedule). For 'both' send BOTH templates so the buyer gets
  // delivery details for each product. `amount` is GSM-7-safe.
  const templates =
    otoProduct === 'both'
      ? (['oto_confirmation', 'vault_confirmation'] as const)
      : ([otoProduct === 'oto' ? 'vault_confirmation' : 'oto_confirmation'] as const);
  const webinar = await getWebinarInfo();
  const baseVars = await templateVarsForSignup(signup, webinar);
  const otoVars = {
    ...baseVars,
    amount: `PHP ${amountPhp.toLocaleString('en-PH')}`,
  };
  // Send EVERY template — for 'both' that's two emails (one per product). Track
  // each result so a partial failure (1st ok, 2nd fail) doesn't silently report
  // success. ok=true only when ALL succeeded.
  const emailResults = await Promise.all(
    templates.map((tpl) => sendEmail({ to: signup.email, templateId: tpl, vars: otoVars })),
  );
  const emailIds = emailResults.flatMap((r) => (r.ok && r.id ? [r.id] : []));
  const emailErrors = emailResults
    .map((r, i) => (!r.ok ? `${templates[i]}: ${r.error}` : ''))
    .filter(Boolean);
  const allEmailsOk = emailResults.every((r) => r.ok);
  if (!allEmailsOk) console.warn('[xendit-webhook] OTO email partial failure', { templates, emailErrors });

  let smsResults: Awaited<ReturnType<typeof sendSms>>[] = [];
  if (signup.phone) {
    smsResults = await Promise.all(
      templates.map((tpl) => sendSms({ to: signup.phone!, templateId: tpl, vars: otoVars })),
    );
    const smsErrors = smsResults.map((r, i) => (!r.ok ? `${templates[i]}: ${r.error}` : '')).filter(Boolean);
    if (smsErrors.length) console.warn('[xendit-webhook] OTO sms partial failure', { templates, smsErrors });
  }
  const smsIds = smsResults.flatMap((r) => (r.ok && r.id ? [r.id] : []));
  const allSmsOk = !signup.phone || smsResults.every((r) => r.ok);

  await updateSignup(signup.id, {
    bumped: true,
    metadata: {
      ...(signup.metadata ?? {}),
      // Preserve the hubAccount provisionVaultBuyerHub just wrote (above).
      // Without this spread the final update would overwrite the metadata
      // column with a stale snapshot that doesn't include hubAccount.
      ...(hubAccount ? { hubAccount } : {}),
      otoConfirmed: new Date().toISOString(),
      otoInvoiceId: event.id,
      otoExternalId: event.external_id,
      otoAmount: event.amount,
      otoConfirmationStatus: allEmailsOk ? 'sent' : 'failed_partial',
      otoConfirmationMessageIds: emailIds,
      ...(emailErrors.length ? { otoConfirmationEmailErrors: emailErrors } : {}),
      ...(signup.phone
        ? {
            otoConfirmationSmsOk: allSmsOk,
            otoConfirmationSmsIds: smsIds,
          }
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
      contentName: productLabel,
      contentIds: otoProduct === 'both' ? [OFFER.oto2.sku, OFFER.oto.sku] : [(otoProduct === 'oto' ? OFFER.oto : OFFER.oto2).sku],
      numItems: otoProduct === 'both' ? 2 : 1,
    },
  });

  // AWAITED — see note in handleMainPaid.
  await sendTelegram(
    `💰 <b>OTO upsell paid!</b>\n\n` +
    `<b>${esc(signup.firstName)} ${esc(signup.lastName ?? '')}</b>\n` +
    `${esc(signup.email)}\n` +
    `📱 ${signup.phone ? esc(signup.phone) : '—'}\n` +
    `Product: ${esc(productLabel)}\n` +
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

  // Parse the product first so the idempotency path below can also retry
  // Vault Hub provisioning (it needs `product` to decide whether this row
  // should have a Hub account).
  const product = parseStandaloneOtoProduct(externalId);

  // Idempotency — a retried webhook bails here. Still retry Vault Hub
  // provisioning in case the first fire orphaned the buyer.
  if (meta.otoConfirmed) {
    if (product === 'oto' || product === 'both') {
      await provisionVaultBuyerHub({
        id: signup.id,
        email: signup.email,
        firstName: signup.firstName,
        lastName: signup.lastName,
        metadata: signup.metadata,
      });
    }
    return NextResponse.json({ ok: true, alreadyOto: true });
  }
  const productLabel =
    product === 'both' ? `${OFFER.oto2.name} + ${OFFER.oto.name}` :
    (product === 'oto' ? OFFER.oto : OFFER.oto2).name;
  const fallbackCentavos =
    product === 'both' ? OFFER.oto.priceCentavos + OFFER.oto2.priceCentavos :
    (product === 'oto' ? OFFER.oto.priceCentavos : OFFER.oto2.priceCentavos);
  const amountPhp = event.amount ?? fallbackCentavos / 100;

  // Vault buyer (product='oto' or 'both') → provision Hub account NOW.
  // Capture the returned hubAccount so we can merge it into the final
  // metadata write below — otherwise that update spreads stale
  // signup.metadata and silently clobbers the hubAccount we just persisted.
  let hubAccount: HubAccountMeta | null = null;
  if (product === 'oto' || product === 'both') {
    hubAccount = await provisionVaultBuyerHub({
      id: signup.id,
      email: signup.email,
      firstName: signup.firstName,
      lastName: signup.lastName,
      metadata: signup.metadata,
    });
  }

  const templates =
    product === 'both'
      ? (['oto_confirmation', 'vault_confirmation'] as const)
      : ([product === 'oto' ? 'vault_confirmation' : 'oto_confirmation'] as const);
  const webinar = await getWebinarInfo();
  const otoVars = {
    ...(await templateVarsForSignup(signup, webinar)),
    amount: `PHP ${amountPhp.toLocaleString('en-PH')}`,
  };
  // Send EVERY template — for 'both' that's two emails (one per product). Track
  // each result so a partial failure (1st ok, 2nd fail) doesn't silently report
  // success. ok=true only when ALL succeeded.
  const emailResults = await Promise.all(
    templates.map((tpl) => sendEmail({ to: signup.email, templateId: tpl, vars: otoVars })),
  );
  const emailIds = emailResults.flatMap((r) => (r.ok && r.id ? [r.id] : []));
  const emailErrors = emailResults
    .map((r, i) => (!r.ok ? `${templates[i]}: ${r.error}` : ''))
    .filter(Boolean);
  const allEmailsOk = emailResults.every((r) => r.ok);
  if (!allEmailsOk) console.warn('[xendit-webhook] standalone OTO email partial failure', { templates, emailErrors });

  let smsResults: Awaited<ReturnType<typeof sendSms>>[] = [];
  if (signup.phone) {
    smsResults = await Promise.all(
      templates.map((tpl) => sendSms({ to: signup.phone!, templateId: tpl, vars: otoVars })),
    );
    const smsErrors = smsResults.map((r, i) => (!r.ok ? `${templates[i]}: ${r.error}` : '')).filter(Boolean);
    if (smsErrors.length) console.warn('[xendit-webhook] standalone OTO sms partial failure', { templates, smsErrors });
  }
  const smsIds = smsResults.flatMap((r) => (r.ok && r.id ? [r.id] : []));
  const allSmsOk = !signup.phone || smsResults.every((r) => r.ok);

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
      // Preserve the hubAccount provisionVaultBuyerHub just wrote (above)
      // — same anti-clobber spread as handleMainPaid / handleOtoPaid.
      ...(hubAccount ? { hubAccount } : {}),
      otoConfirmed: new Date().toISOString(),
      otoInvoiceId: event.id,
      otoExternalId: externalId,
      otoConfirmationStatus: allEmailsOk ? 'sent' : 'failed_partial',
      otoConfirmationMessageIds: emailIds,
      ...(emailErrors.length ? { otoConfirmationEmailErrors: emailErrors } : {}),
      ...(signup.phone
        ? {
            otoConfirmationSmsOk: allSmsOk,
            otoConfirmationSmsIds: smsIds,
          }
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
      contentName: productLabel,
      contentIds:
        product === 'both' ? [OFFER.oto2.sku, OFFER.oto.sku] :
        [(product === 'oto' ? OFFER.oto : OFFER.oto2).sku],
      numItems: product === 'both' ? 2 : 1,
    },
  });

  await sendTelegram(
    `💰 <b>${product === 'both' ? 'Bundle' : '1:1 Build Session'} paid (standalone)!</b>\n\n` +
    `<b>${esc(signup.firstName)} ${esc(signup.lastName ?? '')}</b>\n` +
    `${esc(signup.email)}\n` +
    `📱 ${signup.phone ? esc(signup.phone) : '—'}\n` +
    `Product: ${esc(productLabel)}\n` +
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

/* --------------------------------------------------------------------- */
/* BOOTCAMP reservation — card downpayment for AI Founder's Bootcamp     */
/* --------------------------------------------------------------------- */
async function handleBootcampPaid(event: XenditEvent) {
  // externalId pattern: BL-BOOTCAMP-<uuid>-<ts>.
  const uuid = event.external_id!.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  )?.[0];
  if (!uuid) {
    console.warn('[xendit-webhook] bootcamp externalId has no uuid', event.external_id);
    return NextResponse.json({ ok: true, matched: false });
  }

  const r = await getBootcampReservation(uuid);
  if (!r) {
    console.warn('[xendit-webhook] no bootcamp reservation matched', uuid);
    return NextResponse.json({ ok: true, matched: false });
  }

  // The amount fallback when Xendit omits it depends on whether this is the
  // first payment (DP expected) or a later one (balance expected). Without a
  // reliable event.amount we can't infer which — fall back to the smaller of
  // the two and log so on-call can recover. In practice Xendit always sends
  // amount on PAID, so this fallback is defensive only.
  const fallbackCentavos = r.status === 'paid' ? r.balanceDueCentavos : r.amountDueCentavos;
  const paidCentavos =
    event.amount != null
      ? Math.round(event.amount * 100)
      : (console.warn('[xendit-webhook] BOOTCAMP missing event.amount, using fallback', { uuid, fallbackCentavos }), fallbackCentavos);

  const result = await applyBootcampPayment(uuid, paidCentavos, {
    invoiceId: event.id,
    paidAtIso: new Date().toISOString(),
  });

  if (result.alreadyProcessed) {
    return NextResponse.json({ ok: true, alreadyProcessed: true });
  }

  const amountPhp = paidCentavos / 100;
  const isFullyPaid = result.fullyPaid;
  const tierLabel = tierById(r.tier)?.label ?? r.tier;
  const firstName = r.name.split(/\s+/)[0] || r.name;
  const remainingBalanceCentavos = result.newBalanceCentavos;

  // Customer confirmation — different copy when fully paid vs DP-only.
  const subject = isFullyPaid
    ? `Bootcamp seat fully paid — see you on event day`
    : `Bootcamp seat locked — see you on event day`;
  const paidLabel = isFullyPaid ? 'payment in full' : 'downpayment';
  const balanceLine =
    remainingBalanceCentavos > 0
      ? `<p>The balance of <strong>₱${(remainingBalanceCentavos / 100).toLocaleString('en-PH')}</strong> is due before event day — the team will reach out with the easiest way to settle it. <em>The downpayment portion is non-refundable.</em></p>`
      : `<p>You're fully paid — nothing left to settle. Just show up and ship.</p>`;
  const html = `
<p>Hi ${firstName},</p>
<p>Confirmed! Your ${paidLabel} of <strong>₱${amountPhp.toLocaleString('en-PH')}</strong> cleared.
Your <strong>${tierLabel}</strong> is locked in.</p>
<p>We'll send the exact venue + schedule + prep checklist a few days before the bootcamp.</p>
${balanceLine}
<p>Get ready to ship.</p>
<p>— BossLabs AI</p>`;
  await sendEmail({ to: r.email, subject, html }).catch(() => null);
  if (r.phone) {
    const smsTail = isFullyPaid ? `fully paid` : `DP of PHP ${amountPhp.toLocaleString('en-PH')}`;
    await sendSms({
      to: r.phone,
      body: `Confirmed! AI Founder's Bootcamp ${smsTail} cleared. Your ${tierLabel} is locked. We'll send event details soon.`,
    }).catch(() => null);
  }

  await sendTelegram(
    `🎯 <b>AI Founder's Bootcamp — ${isFullyPaid ? 'FULLY PAID' : 'downpayment'} confirmed!</b>\n\n` +
      `<b>${esc(r.name)}</b>${r.company ? ` (${esc(r.company)})` : ''}\n` +
      `${esc(r.email)}\n` +
      `📱 ${r.phone ? esc(r.phone) : '—'}\n` +
      `🎟️ ${esc(tierLabel)} — ${r.seats} seat${r.seats === 1 ? '' : 's'}\n` +
      `💰 Paid: <b>₱${amountPhp.toLocaleString('en-PH')}</b> (${paidLabel})\n` +
      `📋 Balance due: ₱${(remainingBalanceCentavos / 100).toLocaleString('en-PH')}\n` +
      `Order: <code>${esc(event.external_id ?? '')}</code>\n` +
      `Xendit invoice: <code>${esc(event.id ?? '')}</code>`,
  );

  return NextResponse.json({ ok: true, bootcamp: true });
}

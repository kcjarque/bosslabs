/**
 * Manual payment — confirm an abandoned cart as paid (e.g. a closer or admin
 * verified a bank-transfer / GCash screenshot). Fires the SAME downstream
 * flow a real Xendit payment does: paid_confirmation email + SMS, Telegram
 * alert, order-bump CRM sync, affiliate commission, and (if a closer claimed
 * the lead) auto-close + closer commission.
 *
 * Only abandoned carts (status 'registered') can be confirmed — never a free
 * signup or an already-paid order. Idempotent + best-effort on side-effects.
 */
import { getSignupById, updateSignup, countPaidOrders, getSettings, getEvent } from './db';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { sendEmail } from './email';
import { sendSms } from './sms';
import { sendAbandonedTeam, sendSalesTeam, sendSalesTeamPhoto, esc } from './telegram';
import { getWebinarInfo, templateVarsForSignup } from './webinar';
import { syncCrmCardForSignup } from './crm';
import { closeLeadAndRecordCommission } from './closers';
import { recordCommission } from './affiliates';
import { OFFER } from './config';

const BUCKET = 'email-assets';

/** Upload a payment-proof screenshot → public URL. */
export async function uploadPaymentProof(file: Blob, name: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const ext = (name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const key = `payment-proofs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sb = getSupabase();
  const { error } = await sb.storage.from(BUCKET).upload(key, bytes, {
    contentType: (file as File).type || 'image/jpeg',
    upsert: false,
  });
  if (error) return null;
  return sb.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
}

/** What the customer is actually paying for. Drives the amount charged AND the
 *  downstream entitlements (Vault → Hub access), instead of trusting whatever
 *  price was frozen on the signup row when they first abandoned. */
export type ManualProducts = {
  /** The webinar ticket itself. */
  main: boolean;
  /** The AI Secrets Builder Vault (includes BossLabs Hub access). */
  vault: boolean;
  /** The 1:1 Build Session. */
  session: boolean;
};

/** Line-item total at TODAY's prices (lib/config OFFER), never the stale
 *  amount stored on the signup. */
export function manualProductsTotalCentavos(p: ManualProducts): number {
  return (
    (p.main ? OFFER.main.priceCentavos : 0) +
    (p.vault ? OFFER.oto.priceCentavos : 0) +
    (p.session ? OFFER.oto2.priceCentavos : 0)
  );
}

/** Read the product picker + amount override off a mark-paid FormData.
 *  Returns `products: undefined` when the caller sent no picker at all, which
 *  keeps the legacy (stored-amount) behaviour for any older client. */
export function parseManualPaymentForm(form: FormData): {
  products?: ManualProducts;
  amountCentavosOverride?: number | null;
} {
  const has = (k: string) => form.get(k) != null;
  const on = (k: string) => {
    const v = String(form.get(k) ?? '').toLowerCase();
    return v === 'true' || v === 'on' || v === '1';
  };
  const products =
    has('productMain') || has('productVault') || has('productSession')
      ? { main: on('productMain'), vault: on('productVault'), session: on('productSession') }
      : undefined;

  // Amount arrives in PESOS from the form (what the operator typed).
  const raw = String(form.get('amountPhp') ?? '').replace(/[^0-9.]/g, '');
  const php = raw ? Number(raw) : NaN;
  const amountCentavosOverride =
    Number.isFinite(php) && php >= 0 ? Math.round(php * 100) : null;

  return { products, amountCentavosOverride };
}

export function manualProductsLabel(p: ManualProducts): string {
  const parts: string[] = [];
  if (p.main) parts.push(OFFER.main.name);
  if (p.vault) parts.push(OFFER.oto.name);
  if (p.session) parts.push(OFFER.oto2.name);
  return parts.join(' + ') || '—';
}

export async function markAbandonedCartPaid(
  signupId: string,
  opts: {
    proofUrl?: string | null;
    /** Raw screenshot bytes — sent to Telegram as a photo so the team can
     *  eyeball the actual proof inline. */
    proofBytes?: ArrayBuffer | null;
    proofFilename?: string;
    paidBy?: string;
    method?: string;
    /** Which products this payment covers. When omitted we fall back to the
     *  legacy behaviour (stored cart amount, webinar ticket only). */
    products?: ManualProducts;
    /** Exact amount received, in centavos. Overrides the product total — bank
     *  transfers rarely match to the peso. */
    amountCentavosOverride?: number | null;
    /** Site origin, used to build the signed Vault thank-you link in the
     *  credentials email when the Vault is part of this payment. */
    baseUrl?: string;
  } = {},
): Promise<{ ok: boolean; error?: string; alreadyPaid?: boolean; amountCentavos?: number }> {
  const signup = await getSignupById(signupId);
  if (!signup) return { ok: false, error: 'Customer not found.' };
  if (signup.status === 'paid' || signup.status === 'attended') {
    return { ok: false, alreadyPaid: true, error: 'This customer is already paid.' };
  }
  if (signup.status !== 'registered') {
    return { ok: false, error: 'Only abandoned carts (registered, unpaid) can be marked paid.' };
  }

  // Amount priority: explicit override → today's price for the chosen products
  // → (legacy) the amount frozen on the signup row. The stored amount is the
  // LAST resort because it can be a stale price from an old offer (e.g. a
  // ₱1,997-era signup confirmed after the price moved back to ₱999).
  const products = opts.products;
  const productTotal = products ? manualProductsTotalCentavos(products) : 0;
  const amountCentavos =
    opts.amountCentavosOverride != null && opts.amountCentavosOverride >= 0
      ? Math.round(opts.amountCentavosOverride)
      : products && productTotal > 0
        ? productTotal
        : (signup.amountCentavos ?? OFFER.main.priceCentavos);
  const amountPhp = amountCentavos / 100;
  const now = new Date().toISOString();

  // Re-tag stale returning leads to the active event. Someone can register for
  // one webinar, then have their bank transfer confirmed AFTER that event ran —
  // which leaves them stuck on a dead event's list (no future reminders). If
  // their event has already passed (or is unset), move them to the current
  // active event, mirroring what the Xendit checkout does via activeEventId.
  let reTagEventId: string | null = null;
  try {
    const activeEventId = (await getSettings().catch(() => null))?.activeEventId ?? null;
    if (activeEventId && signup.eventId !== activeEventId) {
      const current = signup.eventId ? await getEvent(signup.eventId) : null;
      const passed = !current?.startsAtIso || new Date(current.startsAtIso).getTime() < Date.now();
      if (passed) reTagEventId = activeEventId;
    }
  } catch {
    /* re-tag is best-effort — never block the payment confirmation */
  }

  // 1) Mark paid + stamp the manual-payment record (idempotency marker).
  // When products were picked, record them as the order's line items so
  // downstream entitlement checks (Vault → Hub, 1:1 → board) see the truth
  // instead of inferring from a price that may have changed.
  const productMeta = products
    ? {
        bumpVault: products.vault,
        bumpSession: products.session,
        manualProducts: products,
        manualProductsLabel: manualProductsLabel(products),
      }
    : {};
  const paidMeta = {
    ...(signup.metadata ?? {}),
    ...productMeta,
    confirmationSent: now,
    paidAmount: amountPhp,
    manualPayment: true,
    manualPaymentAt: now,
    manualPaymentBy: opts.paidBy ?? 'admin',
    manualPaymentMethod: opts.method ?? null,
    manualPaymentProof: opts.proofUrl ?? null,
  };
  await updateSignup(signup.id, {
    status: 'paid',
    // `bumped` is the legacy "took ANY bump" flag other code keys off.
    ...(products ? { bumped: products.vault || products.session } : {}),
    // Keep the row's amount in sync with what was actually collected, so
    // revenue/AOV/commission all read the real figure.
    amountCentavos,
    ...(reTagEventId ? { eventId: reTagEventId } : {}),
    metadata: paidMeta,
  });

  // 2) Affiliate commission (if this buyer was referred).
  const refMeta = signup.metadata as { affiliateCode?: string; affiliateSub?: string } | undefined;
  if (refMeta?.affiliateCode) {
    await recordCommission({
      affiliateCode: refMeta.affiliateCode,
      signupId: signup.id,
      saleCentavos: amountCentavos,
      sub: refMeta.affiliateSub || '',
    }).catch(() => {});
  }

  // 3) Order-bump CRM sync + closer auto-close + commission.
  await syncCrmCardForSignup({
    signupId: signup.id,
    name: `${signup.firstName} ${signup.lastName ?? ''}`.trim(),
    phone: signup.phone ?? '',
    email: signup.email,
  });
  await closeLeadAndRecordCommission(signup.id);

  // 3b) Vault in this order → provision BossLabs Hub access + email the
  // credentials, exactly like a Xendit-paid Vault buyer gets. Without this a
  // manually-confirmed Vault buyer pays but never receives their login.
  // Best-effort: a Hub outage must not roll back a confirmed payment.
  let hubProvisioned: boolean | null = null;
  if (products?.vault) {
    try {
      const { provisionAndEmailBuyer } = await import('./hub-backfill');
      const externalId = String(
        (signup.metadata as { externalId?: string } | undefined)?.externalId ?? '',
      );
      const r = await provisionAndEmailBuyer(
        {
          signupId: signup.id,
          email: signup.email,
          firstName: signup.firstName || signup.email.split('@')[0],
          externalId,
          amountCentavos,
        },
        { baseUrl: opts.baseUrl ?? 'https://www.bosslabs.live' },
      );
      hubProvisioned = r.provisioned;
    } catch (err) {
      hubProvisioned = false;
      console.warn(
        '[manual-payment] Vault Hub provisioning failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  // 4) Paid confirmation email + SMS (best-effort).
  const webinar = await getWebinarInfo();
  const vars = await templateVarsForSignup(signup, webinar);
  const emailRes = await sendEmail({ to: signup.email, templateId: 'paid_confirmation', vars }).catch(
    () => null,
  );
  const smsRes = signup.phone
    ? await sendSms({ to: signup.phone, templateId: 'paid_confirmation', vars }).catch(() => null)
    : null;
  // Record confirmation markers: email message-id (for SES delivery tracking)
  // + SMS send outcome (so the comms history shows the confirmation SMS too).
  await updateSignup(signup.id, {
    metadata: {
      ...paidMeta,
      ...(emailRes?.ok && emailRes.id
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

  // 5) Telegram alert — send the actual proof screenshot as a photo (caption
  //    carries the details) so the team can verify it inline. Falls back to a
  //    text message + link when no image is available.
  const orders = await countPaidOrders();
  const caption =
    `💰 <b>Manual payment confirmed!</b>\n\n` +
    `<b>${esc(signup.firstName)} ${esc(signup.lastName ?? '')}</b>\n` +
    `${esc(signup.email)}\n` +
    `📱 ${signup.phone ? esc(signup.phone) : '—'}\n` +
    (products ? `Bought: <b>${esc(manualProductsLabel(products))}</b>\n` : '') +
    `Amount: <b>₱${amountPhp.toLocaleString()}</b>\n` +
    (hubProvisioned === true ? `🔑 Hub access provisioned + creds emailed\n` : '') +
    (hubProvisioned === false ? `⚠️ Vault paid but Hub provisioning FAILED — needs manual fix\n` : '') +
    `Confirmed by: <b>${esc(opts.paidBy ?? 'admin')}</b>${opts.method ? ` · ${esc(opts.method)}` : ''}\n` +
    `🧾 Paid orders: <b>${orders.total}</b> total · <b>${orders.today}</b> today` +
      (orders.recoveredToday > 0 ? ` · <b>${orders.recoveredToday}</b> recovered` : '');
  // Manually-recovered abandoned carts are webinar-ticket sales — all-sales
  // chat only, same as every other webinar sale (see handleMainPaid).
  if (opts.proofBytes) {
    await sendSalesTeamPhoto(opts.proofBytes, opts.proofFilename || 'payment-proof.jpg', caption);
  } else {
    await sendSalesTeam(caption + (opts.proofUrl ? `\n📎 <a href="${esc(opts.proofUrl)}">View proof</a>` : ''));
  }
  // A manual payment confirms an abandoned cart → it's a RECOVERED sale. Mirror
  // it to the abandoned-cart sales team chat (best-effort add-on).
  await sendAbandonedTeam(caption).catch(() => {});

  return { ok: true, amountCentavos };
}

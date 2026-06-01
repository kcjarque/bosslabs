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
import { getSignupById, updateSignup, countPaidOrders } from './db';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { sendEmail } from './email';
import { sendSms } from './sms';
import { sendTelegram, esc } from './telegram';
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

export async function markAbandonedCartPaid(
  signupId: string,
  opts: { proofUrl?: string | null; paidBy?: string; method?: string } = {},
): Promise<{ ok: boolean; error?: string; alreadyPaid?: boolean }> {
  const signup = await getSignupById(signupId);
  if (!signup) return { ok: false, error: 'Customer not found.' };
  if (signup.status === 'paid' || signup.status === 'attended') {
    return { ok: false, alreadyPaid: true, error: 'This customer is already paid.' };
  }
  if (signup.status !== 'registered') {
    return { ok: false, error: 'Only abandoned carts (registered, unpaid) can be marked paid.' };
  }

  const amountCentavos = signup.amountCentavos ?? OFFER.main.priceCentavos;
  const amountPhp = amountCentavos / 100;
  const now = new Date().toISOString();

  // 1) Mark paid + stamp the manual-payment record (idempotency marker).
  await updateSignup(signup.id, {
    status: 'paid',
    metadata: {
      ...(signup.metadata ?? {}),
      confirmationSent: now,
      paidAmount: amountPhp,
      manualPayment: true,
      manualPaymentAt: now,
      manualPaymentBy: opts.paidBy ?? 'admin',
      manualPaymentMethod: opts.method ?? null,
      manualPaymentProof: opts.proofUrl ?? null,
    },
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

  // 4) Paid confirmation email + SMS (best-effort).
  const webinar = await getWebinarInfo();
  const vars = await templateVarsForSignup(signup, webinar);
  await sendEmail({ to: signup.email, templateId: 'paid_confirmation', vars }).catch(() => {});
  if (signup.phone) {
    await sendSms({ to: signup.phone, templateId: 'paid_confirmation', vars }).catch(() => {});
  }

  // 5) Telegram alert.
  const orders = await countPaidOrders();
  await sendTelegram(
    `💰 <b>Manual payment confirmed!</b>\n\n` +
    `<b>${esc(signup.firstName)} ${esc(signup.lastName ?? '')}</b>\n` +
    `${esc(signup.email)}\n` +
    `📱 ${signup.phone ? esc(signup.phone) : '—'}\n` +
    `Amount: <b>₱${amountPhp.toLocaleString()}</b>\n` +
    `Confirmed by: <b>${esc(opts.paidBy ?? 'admin')}</b>${opts.method ? ` · ${esc(opts.method)}` : ''}\n` +
    `🧾 Paid orders: <b>${orders.total}</b> total · <b>${orders.today}</b> today` +
    (opts.proofUrl ? `\n📎 <a href="${esc(opts.proofUrl)}">View proof</a>` : ''),
  );

  return { ok: true };
}

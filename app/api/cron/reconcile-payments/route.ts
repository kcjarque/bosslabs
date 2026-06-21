/**
 * Payment reconciliation cron — the safety net for dropped Xendit webhooks.
 *
 * The confirmation flow is Xendit → orderko (fan-out) → /api/webhooks/xendit.
 * If any hop drops an event, a paying customer is left status='registered' with
 * no confirmation + no Zoom link, silently, forever (until a human notices). On
 * 2026-06-21 three real ₱-payments (Helen, JC, Jeffrey) were stuck this way.
 *
 * This runs every 15 min: for each recently-registered signup whose Xendit
 * invoice is actually PAID, it marks the signup paid and sends the SAME
 * paid_confirmation email/SMS the webhook would — so a missed webhook self-heals
 * within minutes, no matter which hop dropped it. Idempotent (re-checks status
 * before acting) and email-matched (only confirms when the Xendit payer email
 * matches the signup) so it can never confirm the wrong person.
 *
 * Deliberately does NOT credit a closer: a customer who paid their own Xendit
 * invoice is not a closer "recovery", so reconciled payments must not generate
 * a closer commission (the webhook does credit closers; this path must not).
 * Affiliate commission IS recorded — a referral is valid regardless of timing.
 */

import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getSignupById, updateSignup } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { getWebinarInfo, templateVarsForSignup } from '@/lib/webinar';
import { recordCommission } from '@/lib/affiliates';
import { sendTelegram, esc } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// A genuinely-paid invoice stays PAID at Xendit forever; an unpaid one EXPIRES
// in ~24h. So a real miss is always caught on the first tick after payment — a
// short lookback keeps the per-tick Xendit calls bounded (older 'registered'
// rows are truly abandoned, with expired invoices, and never become paid).
const LOOKBACK_DAYS = 3;
const BATCH = 5;

async function xenditPaidInvoice(
  externalId: string,
): Promise<{ id: string; amount: number; payerEmail: string } | null> {
  const key = process.env.XENDIT_SECRET_KEY;
  if (!key) return null;
  const auth = Buffer.from(`${key}:`).toString('base64');
  try {
    const r = await fetch(
      `https://api.xendit.co/v2/invoices?external_id=${encodeURIComponent(externalId)}`,
      { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(10_000) },
    );
    if (!r.ok) return null;
    const arr = JSON.parse(await r.text()) as Array<{
      id: string;
      status: string;
      amount: number;
      payer_email?: string;
    }>;
    const paid = (Array.isArray(arr) ? arr : []).find(
      (i) => i.status === 'PAID' || i.status === 'SETTLED',
    );
    return paid ? { id: paid.id, amount: paid.amount, payerEmail: (paid.payer_email ?? '').toLowerCase() } : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSupabaseConfigured()) return NextResponse.json({ skipped: 'no db' });

  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data } = await getSupabase()
    .from('signups')
    .select('id, email, metadata')
    .eq('status', 'registered')
    .gte('created_at', sinceIso);
  const candidates = ((data ?? []) as { id: string; email: string; metadata: Record<string, unknown> | null }[])
    .filter((r) => {
      const ext = (r.metadata as { externalId?: string } | null)?.externalId;
      return Boolean(ext && ext.startsWith('BL-MAIN-'));
    });

  const healed: { name: string; email: string; amount: number }[] = [];
  let checked = 0;

  for (let i = 0; i < candidates.length; i += BATCH) {
    await Promise.all(
      candidates.slice(i, i + BATCH).map(async (c) => {
        checked++;
        const ext = (c.metadata as { externalId?: string }).externalId!;
        const paid = await xenditPaidInvoice(ext);
        if (!paid) return;
        // Safety: only confirm when the Xendit payer matches our signup email.
        if (paid.payerEmail && paid.payerEmail !== c.email.trim().toLowerCase()) return;

        // Re-read fresh + re-check status: another tick (or a late webhook) may
        // have confirmed it in the meantime. Marker-first so a concurrent run bails.
        const s = await getSignupById(c.id);
        if (!s || s.status === 'paid' || s.status === 'attended') return;

        const now = new Date().toISOString();
        const paidMeta = {
          ...(s.metadata ?? {}),
          confirmationSent: now,
          xenditInvoiceId: paid.id,
          paidAmount: paid.amount,
          reconciledAt: now, // audit: this was healed by the reconciler, not the webhook
        };
        await updateSignup(s.id, { status: 'paid', metadata: paidMeta });

        // Affiliate commission (valid regardless of timing). NO closer credit.
        const ref = s.metadata as { affiliateCode?: string; affiliateSub?: string } | undefined;
        if (ref?.affiliateCode) {
          await recordCommission({
            affiliateCode: ref.affiliateCode,
            signupId: s.id,
            saleCentavos: paid.amount * 100,
            sub: ref.affiliateSub || '',
          }).catch(() => {});
        }

        // Same paid_confirmation email/SMS (with Zoom link) the webhook sends.
        const webinar = await getWebinarInfo();
        const vars = await templateVarsForSignup(s, webinar);
        const emailRes = await sendEmail({ to: s.email, templateId: 'paid_confirmation', vars }).catch(() => null);
        const smsRes = s.phone
          ? await sendSms({ to: s.phone, templateId: 'paid_confirmation', vars }).catch(() => null)
          : null;
        await updateSignup(s.id, {
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

        healed.push({
          name: `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || s.email,
          email: s.email,
          amount: paid.amount,
        });
      }),
    );
  }

  if (healed.length) {
    const lines = healed.map((h) => `• ${esc(h.name)} — ₱${h.amount.toLocaleString()}`).join('\n');
    await sendTelegram(
      `🛟 <b>Payment auto-reconciled: ${healed.length}</b>\n` +
        `Paid at Xendit but the webhook never confirmed them — auto-fixed (marked paid + confirmation sent):\n${lines}`,
    ).catch(() => {});
  }

  return NextResponse.json({ checked, healed: healed.length, recovered: healed });
}

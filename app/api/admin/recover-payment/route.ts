/**
 * /api/admin/recover-payment — fires a templated recovery message to a
 * stuck buyer via Resend and/or OneWaySMS, using their actual Xendit
 * invoice URL so they can resume payment without re-filling the form.
 *
 * Channel can be 'email' | 'sms' | 'both' (default 'email'). Each channel
 * stamps its own metadata marker (recoveryEmailSent / recoverySmsSent) so
 * the UI can show per-channel status, and so a retry against one channel
 * never clobbers the other's record.
 *
 * Flow:
 *   1. Auth (admin session + same-origin) + per-IP throttle
 *   2. Look up signup by id
 *   3. Pull the still-active Xendit invoice URL via the external_id
 *   4. For each requested channel, send via the production transport →
 *      email gets reply-to + List-Unsubscribe + DKIM headers; SMS goes
 *      through OneWaySMS with normalized PH phone format
 *   5. Stamp the per-channel metadata so we never spam the same buyer
 *      with duplicates
 */

import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { getSignups, updateSignup, type Signup } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Coarse per-lambda throttle so a compromised admin session can't turn
// this into a spam cannon. Genuine admin testing usually < 10 sends/min.
const HITS: { ts: number }[] = [];
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 20;

function tooMany(): boolean {
  const now = Date.now();
  while (HITS.length && now - HITS[0].ts > WINDOW_MS) HITS.shift();
  if (HITS.length >= MAX_PER_WINDOW) return true;
  HITS.push({ ts: now });
  return false;
}

type Channel = 'email' | 'sms' | 'both';

async function getXenditInvoiceUrl(externalId: string): Promise<string | null> {
  const key = process.env.XENDIT_SECRET_KEY;
  if (!key) return null;
  const auth = Buffer.from(`${key}:`).toString('base64');
  try {
    const res = await fetch(
      `https://api.xendit.co/v2/invoices?external_id=${encodeURIComponent(externalId)}`,
      { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    // Xendit response sometimes has stray control chars — strip before parse.
    const raw = await res.text();
    const clean = Array.from(raw)
      .filter((c) => c >= ' ' || c === '\n' || c === '\r' || c === '\t')
      .join('');
    const data = JSON.parse(clean) as Array<{ status?: string; invoice_url?: string }>;
    if (!Array.isArray(data) || data.length === 0) return null;
    const inv = data[0];
    // Only return the URL if the invoice is still alive — no point sending
    // a recovery message pointing at an expired or paid invoice.
    if (inv.status !== 'PENDING') return null;
    return inv.invoice_url ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (tooMany()) return NextResponse.json({ error: 'Slow down — 20 sends/min' }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as {
    signupId?: string;
    channel?: Channel;
  };
  const id = (body.signupId ?? '').trim();
  if (!id) return NextResponse.json({ error: 'signupId required' }, { status: 400 });
  const channel: Channel = body.channel ?? 'email';
  if (channel !== 'email' && channel !== 'sms' && channel !== 'both') {
    return NextResponse.json({ error: 'channel must be email | sms | both' }, { status: 400 });
  }

  const all = await getSignups();
  const signup: Signup | undefined = all.find((s) => s.id === id);
  if (!signup) return NextResponse.json({ error: 'Signup not found' }, { status: 404 });

  // Refuse to message people who've already paid or unsubscribed.
  if (signup.status !== 'registered') {
    return NextResponse.json(
      { error: `Signup status is "${signup.status}" — only registered/abandoned buyers can be sent recovery messages.` },
      { status: 400 },
    );
  }

  const wantSms = channel === 'sms' || channel === 'both';
  if (wantSms && !signup.phone) {
    return NextResponse.json(
      { error: 'Buyer has no phone number on file — cannot send SMS.' },
      { status: 400 },
    );
  }

  const meta = (signup.metadata as Record<string, unknown> | undefined) ?? {};
  const externalId = (meta.externalId as string | undefined) ?? '';
  if (!externalId) {
    return NextResponse.json({ error: 'Signup has no Xendit externalId' }, { status: 400 });
  }

  const invoiceUrl = await getXenditInvoiceUrl(externalId);
  if (!invoiceUrl) {
    return NextResponse.json(
      {
        error:
          'No active Xendit invoice found for this signup. The invoice may have already expired (24h TTL) — ask the buyer to start a fresh checkout instead.',
      },
      { status: 410 },
    );
  }

  // Fire both legs in parallel — they're independent and the admin is
  // waiting on the request, so serializing would double the latency.
  const wantEmail = channel === 'email' || channel === 'both';
  const [emailRes, smsRes] = await Promise.all([
    wantEmail
      ? sendEmail({
          to: signup.email,
          templateId: 'payment_recovery',
          vars: {
            firstName: signup.firstName,
            invoiceUrl,
          },
        })
      : Promise.resolve(null),
    wantSms
      ? sendSms({
          to: signup.phone,
          // Try the dedicated SMS template first; fall back to a hardcoded
          // body if the admin hasn't seeded one yet. Keeps the feature
          // usable on a fresh deploy without a manual template step.
          body: `Hi ${signup.firstName}! Finish your BOSSLABS payment here: ${invoiceUrl} — link expires in 24h.`,
          vars: {
            firstName: signup.firstName,
            invoiceUrl,
          },
        })
      : Promise.resolve(null),
  ]);

  // Bail if every requested leg failed — nothing got delivered, the admin
  // should see the error rather than a misleading "ok".
  const emailFailed = wantEmail && emailRes && !emailRes.ok;
  const smsFailed = wantSms && smsRes && !smsRes.ok;
  if (
    (channel === 'email' && emailFailed) ||
    (channel === 'sms' && smsFailed) ||
    (channel === 'both' && emailFailed && smsFailed)
  ) {
    return NextResponse.json(
      {
        error: [
          emailFailed && emailRes && !emailRes.ok ? `email: ${emailRes.error}` : null,
          smsFailed && smsRes && !smsRes.ok ? `sms: ${smsRes.error}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      },
      { status: 502 },
    );
  }

  // Build the metadata patch — only stamp markers for channels that
  // actually succeeded, leaving the other channel's prior state alone.
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { ...(signup.metadata ?? {}) };
  if (emailRes?.ok) {
    patch.recoveryEmailSent = nowIso;
    patch.recoveryEmailMessageId = emailRes.id;
    patch.recoveryEmailStatus = 'sent';
  }
  if (smsRes?.ok) {
    patch.recoverySmsSent = nowIso;
    patch.recoverySmsMessageId = smsRes.id;
  }

  await updateSignup(signup.id, { metadata: patch });

  return NextResponse.json({
    ok: true,
    channel,
    invoiceUrl,
    recipient: { email: signup.email, phone: signup.phone || null },
    email: emailRes
      ? emailRes.ok
        ? { ok: true, id: emailRes.id, provider: emailRes.provider }
        : { ok: false, error: emailRes.error }
      : null,
    sms: smsRes
      ? smsRes.ok
        ? { ok: true, id: smsRes.id, provider: smsRes.provider }
        : { ok: false, error: smsRes.error }
      : null,
  });
}

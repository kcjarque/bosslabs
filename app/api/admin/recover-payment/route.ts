/**
 * /api/admin/recover-payment — fires a templated recovery email to a
 * stuck buyer via Resend (production email pipeline), using their actual
 * Xendit invoice URL so they can resume payment without re-filling the
 * form.
 *
 * Flow:
 *   1. Auth (admin session + same-origin) + per-IP throttle
 *   2. Look up signup by id
 *   3. Pull the still-active Xendit invoice URL via the external_id
 *   4. Send the `payment_recovery` email template via sendEmail() →
 *      gets reply-to, List-Unsubscribe, DKIM, all the deliverability
 *      headers we already wired up
 *   5. Stamp metadata.recoveryEmailSent so we never spam the same buyer
 *      with duplicates
 */

import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { getSignups, updateSignup, type Signup } from '@/lib/db';
import { sendEmail } from '@/lib/email';

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
    // a recovery email pointing at an expired or paid invoice.
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

  const body = (await req.json().catch(() => ({}))) as { signupId?: string };
  const id = (body.signupId ?? '').trim();
  if (!id) return NextResponse.json({ error: 'signupId required' }, { status: 400 });

  const all = await getSignups();
  const signup: Signup | undefined = all.find((s) => s.id === id);
  if (!signup) return NextResponse.json({ error: 'Signup not found' }, { status: 404 });

  // Refuse to email people who've already paid or unsubscribed.
  if (signup.status !== 'registered') {
    return NextResponse.json(
      { error: `Signup status is "${signup.status}" — only registered/abandoned buyers can be sent recovery emails.` },
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

  // Fire via the production sendEmail path so we get reply-to, List-
  // Unsubscribe, DKIM, and the auto-injected {{unsubscribeUrl}}.
  const result = await sendEmail({
    to: signup.email,
    templateId: 'payment_recovery',
    vars: {
      firstName: signup.firstName,
      invoiceUrl,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  // Stamp so the UI can show "Sent N min ago" and prevent re-fire spam.
  await updateSignup(signup.id, {
    metadata: {
      ...(signup.metadata ?? {}),
      recoveryEmailSent: new Date().toISOString(),
      recoveryEmailMessageId: result.id,
    },
  });

  return NextResponse.json({
    ok: true,
    provider: result.provider,
    id: result.id,
    invoiceUrl,
    recipient: signup.email,
  });
}

/**
 * Resend webhook — receives delivery lifecycle events from
 * https://resend.com/webhooks and stamps the outcome onto the matching
 * signup's metadata so the admin /pending-payments page can show whether
 * a recovery email actually landed, bounced, or got marked as spam.
 *
 * Resend signs webhook payloads with Svix-compatible headers:
 *   svix-id, svix-timestamp, svix-signature
 * The signature is HMAC-SHA256(`${id}.${timestamp}.${body}`) using a base64
 * secret prefixed with `whsec_`. We verify it here so a bad actor can't
 * spoof "delivered" events to suppress real bounce signals.
 *
 * Env vars:
 *   RESEND_WEBHOOK_SECRET — copy from the Resend dashboard after creating
 *     the webhook endpoint. Format: whsec_<base64>.
 *
 * Configure at https://resend.com/webhooks pointing at
 *   https://<your-domain>/api/webhooks/resend
 * and subscribe to: email.delivered, email.bounced, email.complained.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { findSignupByRecoveryMessageId, updateSignup } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 15;

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    bounce?: { type?: string; message?: string };
  };
};

/** Verify the Svix-style signature Resend uses on every webhook delivery. */
function verifySignature(req: Request, rawBody: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed in prod, but allow through in local dev when the secret
    // isn't set so the admin can still smoke-test the handler.
    return process.env.NODE_ENV !== 'production';
  }
  const id = req.headers.get('svix-id');
  const timestamp = req.headers.get('svix-timestamp');
  const signatureHeader = req.headers.get('svix-signature');
  if (!id || !timestamp || !signatureHeader) return false;

  // Svix secrets are formatted "whsec_<base64>" — the actual HMAC key is
  // the base64-decoded portion after the prefix.
  const keyB64 = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(keyB64, 'base64');
  } catch {
    return false;
  }

  const toSign = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', key).update(toSign).digest('base64');

  // Header looks like "v1,sig1 v1,sig2" — Svix can include multiple to
  // support rotation. Accept any version-prefixed match.
  for (const part of signatureHeader.split(' ')) {
    const [, sig] = part.split(',');
    if (!sig) continue;
    if (
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      return true;
    }
  }
  return false;
}

/** Map a Resend event type to the status we want to store. */
function statusFromEvent(type: string | undefined): string | null {
  switch (type) {
    case 'email.sent':
      return 'sent';
    case 'email.delivered':
      return 'delivered';
    case 'email.bounced':
      return 'bounced';
    case 'email.complained':
      return 'complained';
    case 'email.opened':
      return 'opened';
    case 'email.clicked':
      return 'clicked';
    default:
      return null;
  }
}

// Status ordering — never downgrade. A 'delivered' event arriving after an
// 'opened' (out-of-order webhook delivery is allowed by Resend) shouldn't
// blow away the richer signal.
const STATUS_RANK: Record<string, number> = {
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
  bounced: 10,
  complained: 10,
};

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifySignature(req, rawBody)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const newStatus = statusFromEvent(event.type);
  const emailId = event.data?.email_id;
  if (!newStatus || !emailId) {
    // Acknowledge so Resend doesn't retry — we just don't care about this
    // event type (e.g. email.delivery_delayed).
    return NextResponse.json({ ok: true, ignored: true });
  }

  const signup = await findSignupByRecoveryMessageId(emailId);
  if (!signup) {
    // Not a recovery email we sent — could be a paid_confirmation or a
    // pre-webhook send. Ack without action.
    return NextResponse.json({ ok: true, matched: false });
  }

  const meta = (signup.metadata ?? {}) as Record<string, unknown>;
  const currentStatus = (meta.recoveryEmailStatus as string | undefined) ?? null;
  const currentRank = currentStatus ? STATUS_RANK[currentStatus] ?? 0 : 0;
  const newRank = STATUS_RANK[newStatus] ?? 0;
  if (newRank < currentRank) {
    return NextResponse.json({ ok: true, skipped: 'downgrade' });
  }

  await updateSignup(signup.id, {
    metadata: {
      ...meta,
      recoveryEmailStatus: newStatus,
      recoveryEmailStatusAt: event.created_at || new Date().toISOString(),
      ...(newStatus === 'bounced'
        ? { recoveryEmailBounce: event.data?.bounce?.message || event.data?.bounce?.type || 'bounced' }
        : {}),
    },
  });

  return NextResponse.json({ ok: true, status: newStatus });
}

/**
 * Xendit webhook — fan-out target for orderko (BL- prefix → forwarded here).
 *
 * On status === 'PAID':
 *   1. Find the signup by externalId (stored in metadata when /api/checkout ran)
 *   2. Flip status → 'paid'
 *   3. Fire `paid_confirmation` email + SMS so the buyer gets their Zoom link
 *      immediately (don't wait for the next cron tick).
 *
 * On status === 'EXPIRED' | 'FAILED': leave the signup as 'registered' so the
 * admin can manually follow up. We don't auto-cancel — sometimes Xendit
 * marks expired and the buyer pays via a different invoice.
 */

import { NextResponse } from 'next/server';
import { verifyWebhook } from '@/lib/xendit';
import { getSignups, updateSignup } from '@/lib/db';
import { getWebinarInfo } from '@/lib/webinar';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  const token = req.headers.get('x-callback-token');
  if (!verifyWebhook(token)) {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  }

  const event = (await req.json()) as {
    id?: string;
    external_id?: string;
    status?: 'PAID' | 'EXPIRED' | 'PENDING' | 'FAILED';
    amount?: number;
  };

  console.log('[xendit-webhook]', event);

  if (event.status !== 'PAID' || !event.external_id) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Find the signup by externalId stored in metadata during checkout.
  const signups = await getSignups();
  const signup = signups.find((s) => {
    const meta = s.metadata as { externalId?: string } | undefined;
    return meta?.externalId === event.external_id;
  });

  if (!signup) {
    console.warn('[xendit-webhook] no signup matched', event.external_id);
    return NextResponse.json({ ok: true, matched: false });
  }

  // Idempotency — if we already marked paid + sent confirmation, bail.
  const meta = (signup.metadata ?? {}) as { confirmationSent?: string };
  if (signup.status === 'paid' && meta.confirmationSent) {
    return NextResponse.json({ ok: true, alreadyPaid: true });
  }

  const webinar = await getWebinarInfo();
  const vars = {
    firstName: signup.firstName,
    webinarName: webinar.name,
    webinarDate: webinar.date,
    webinarTime: webinar.time,
    webinarTimezone: webinar.timezone,
    zoomJoinUrl: webinar.zoomJoinUrl,
    zoomRegisterUrl: webinar.zoomRegisterUrl,
    messengerGroupUrl: webinar.messengerGroupUrl,
    replayUrl: webinar.replayUrl,
  };

  // Best-effort sends — don't break the webhook if one provider fails.
  const emailRes = await sendEmail({
    to: signup.email,
    templateId: 'paid_confirmation',
    vars,
  });
  if (signup.phone) {
    await sendSms({ to: signup.phone, templateId: 'paid_confirmation', vars });
  }

  await updateSignup(signup.id, {
    status: 'paid',
    metadata: {
      ...(signup.metadata ?? {}),
      confirmationSent: new Date().toISOString(),
      xenditInvoiceId: event.id,
      paidAmount: event.amount,
    },
  });

  return NextResponse.json({ ok: true, emailOk: emailRes.ok });
}

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
import { sendCapiEvent } from '@/lib/meta';
import { OFFER } from '@/lib/config';

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

  // CAPI Purchase event — the highest-value signal for Meta Ads. Fires
  // server-side from the webhook so ad blockers + iOS ATT can't drop it.
  // Dedupes with the pixel Purchase event fired on /thank-you via shared
  // event_id (stored in metadata.meta.purchaseEventId during /api/checkout).
  const metaStash = (signup.metadata as { meta?: {
    fbp?: string;
    fbc?: string;
    clientIp?: string;
    clientUserAgent?: string;
    purchaseEventId?: string;
    sourceUrl?: string;
  } } | undefined)?.meta;
  const bumped = Boolean(signup.bumped);
  const amountPhp = (event.amount ?? signup.amountCentavos ?? 0) / (event.amount ? 1 : 100);

  void sendCapiEvent({
    eventName: 'Purchase',
    eventId: metaStash?.purchaseEventId ?? `purchase_${event.external_id}`,
    eventSourceUrl: metaStash?.sourceUrl,
    userData: {
      email: signup.email,
      phone: signup.phone,
      firstName: signup.firstName,
      lastName: signup.lastName,
      fbp: metaStash?.fbp,
      fbc: metaStash?.fbc,
      clientIp: metaStash?.clientIp,
      clientUserAgent: metaStash?.clientUserAgent,
      country: 'ph',
      externalId: event.external_id,
    },
    customData: {
      value: amountPhp,
      currency: 'PHP',
      contentName: bumped ? `${OFFER.main.name} + ${OFFER.oto.name}` : OFFER.main.name,
      contentIds: [bumped ? `${OFFER.main.sku}+${OFFER.oto.sku}` : OFFER.main.sku],
      numItems: bumped ? 2 : 1,
    },
  });

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

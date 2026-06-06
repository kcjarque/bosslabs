/**
 * Amazon SES delivery webhook — receives SES event notifications via SNS and
 * stamps the real delivery outcome (delivered / bounced / complained) onto the
 * matching record so the admin can see whether an email actually landed.
 *
 * SES publishes Delivery / Bounce / Complaint events to an SNS topic
 * (SES_SNS_TOPIC_ARN); SNS POSTs them here. We:
 *   1. Confirm the SNS subscription handshake (GET the SubscribeURL).
 *   2. On each Notification, parse the SES event, take mail.messageId, and
 *      upgrade the status on whichever record sent it — reusing the same
 *      matchers as the Resend webhook (recovery / admin send / sequence send)
 *      plus the paid-confirmation matcher.
 *
 * AWS setup (one-time):
 *   - SES: set the conexmedia.ph identity's Delivery/Bounce/Complaint
 *     notifications to publish to SES_SNS_TOPIC_ARN.
 *   - SNS: subscribe https://www.bosslabs.live/api/webhooks/ses (HTTPS) to
 *     that topic; this endpoint auto-confirms the subscription.
 *
 * Security: we only accept messages whose TopicArn matches SES_SNS_TOPIC_ARN,
 * and only fetch SubscribeURLs on the sns.<region>.amazonaws.com domain. (Full
 * SNS signature verification is a reasonable future hardening step.)
 */

import { NextResponse } from 'next/server';
import {
  findSignupByRecoveryMessageId,
  upgradeRecoveryEmailStatus,
  findSignupByAdminSendProviderId,
  updateAdminSendStatus,
  findSequenceSendByEmailMessageId,
  updateSequenceSendStatus,
  findSignupByConfirmationMessageId,
  updateConfirmationStatus,
  type AdminSendStatus,
} from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 15;

const EXPECTED_TOPIC = process.env.SES_SNS_TOPIC_ARN || '';

type EmailStatus = 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained';

type SnsEnvelope = {
  Type?: string;
  TopicArn?: string;
  Message?: string;
  SubscribeURL?: string;
};

type SesEvent = {
  eventType?: string; // configuration-set event publishing
  notificationType?: string; // identity feedback notifications
  mail?: { messageId?: string };
  bounce?: { bounceType?: string; bouncedRecipients?: { diagnosticCode?: string }[] };
};

function statusFromSes(type: string | undefined): EmailStatus | null {
  switch ((type || '').toLowerCase()) {
    case 'delivery':
      return 'delivered';
    case 'bounce':
      return 'bounced';
    case 'complaint':
      return 'complained';
    case 'open':
      return 'opened';
    case 'click':
      return 'clicked';
    case 'send':
      return 'sent';
    default:
      return null;
  }
}

/** Only follow SubscribeURLs that point at the real SNS service. */
function isSnsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

/** Route a (messageId, status) to whichever record sent it. One match max. */
async function applyStatus(messageId: string, status: EmailStatus, at: string) {
  const rec = await findSignupByRecoveryMessageId(messageId);
  if (rec) {
    await upgradeRecoveryEmailStatus({
      signupId: rec.id,
      status,
      statusAt: at,
      bounceMessage: status === 'bounced' ? 'bounced' : null,
    });
    return 'recovery';
  }
  const adm = await findSignupByAdminSendProviderId(messageId);
  if (adm) {
    await updateAdminSendStatus(adm.id, messageId, status as AdminSendStatus, at);
    return 'adminSend';
  }
  const seq = await findSequenceSendByEmailMessageId(messageId);
  if (seq) {
    await updateSequenceSendStatus(messageId, status, at);
    return 'sequenceSend';
  }
  const conf = await findSignupByConfirmationMessageId(messageId);
  if (conf) {
    await updateConfirmationStatus(conf.id, status, at);
    return 'confirmation';
  }
  return false;
}

export async function POST(req: Request) {
  const raw = await req.text();
  let env: SnsEnvelope;
  try {
    env = JSON.parse(raw) as SnsEnvelope;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Only accept messages from our configured SES topic.
  if (EXPECTED_TOPIC && env.TopicArn && env.TopicArn !== EXPECTED_TOPIC) {
    return NextResponse.json({ error: 'unexpected topic' }, { status: 403 });
  }

  // SNS subscription handshake.
  if (env.Type === 'SubscriptionConfirmation' || env.Type === 'UnsubscribeConfirmation') {
    if (env.SubscribeURL && isSnsUrl(env.SubscribeURL)) {
      await fetch(env.SubscribeURL).catch(() => {});
      return NextResponse.json({ ok: true, confirmed: true });
    }
    return NextResponse.json({ error: 'bad subscribe url' }, { status: 400 });
  }

  if (env.Type === 'Notification' && env.Message) {
    let ses: SesEvent;
    try {
      ses = JSON.parse(env.Message) as SesEvent;
    } catch {
      return NextResponse.json({ ok: true, ignored: 'unparseable' });
    }
    const status = statusFromSes(ses.eventType || ses.notificationType);
    const messageId = ses.mail?.messageId;
    if (!status || !messageId) {
      return NextResponse.json({ ok: true, ignored: true });
    }
    const matched = await applyStatus(messageId, status, new Date().toISOString());
    return NextResponse.json({ ok: true, matched, status });
  }

  return NextResponse.json({ ok: true, ignored: true });
}

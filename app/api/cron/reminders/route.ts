/**
 * Reminder cron — runs every 10 minutes (see vercel.json).
 *
 * Six-step sequence fired for every paid/registered seat:
 *   T-60h → email only   (reminder_60h)
 *   T-48h → email only   (reminder_48h)
 *   T-36h → email only   (reminder_36h)
 *   T-24h → email + SMS  (reminder_24h)
 *   T-12h → email only   (reminder_12h)
 *   T-1h  → email + SMS  (reminder_1h)
 *
 * Each window is ±15 min wide so a 10-min cron can't miss it.
 * State tracked in signup.metadata.reminders.{h60|h48|h36|h24|h12|h1}.
 */

import { NextResponse } from 'next/server';
import { getSignups, updateSignup, type Signup } from '@/lib/db';
import { getWebinarInfo } from '@/lib/webinar';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import {
  hasReminderSent,
  markReminderSent,
  minutesUntilWebinar,
  verifyCronAuth,
  type ReminderKey,
} from '@/lib/cron';

export const runtime = 'nodejs';
// Crons can run longer than a normal request — bump the function timeout
// (Vercel Pro lets us go to 300s; 60s is plenty for our scale).
export const maxDuration = 60;

type Window = {
  key: ReminderKey;
  minLo: number;
  minHi: number;
  emailTemplate: string;
  smsTemplate: string | null; // null = email only
  label: string;
};

const H = 60; // minutes per hour shorthand
const PAD = 15; // ±15 min window so a 10-min cron can't miss any slot

const WINDOWS: Window[] = [
  { key: 'h60', minLo: 60 * H - PAD, minHi: 60 * H + PAD, emailTemplate: 'reminder_60h', smsTemplate: null,        label: '60h' },
  { key: 'h48', minLo: 48 * H - PAD, minHi: 48 * H + PAD, emailTemplate: 'reminder_48h', smsTemplate: null,        label: '48h' },
  { key: 'h36', minLo: 36 * H - PAD, minHi: 36 * H + PAD, emailTemplate: 'reminder_36h', smsTemplate: null,        label: '36h' },
  { key: 'h24', minLo: 24 * H - PAD, minHi: 24 * H + PAD, emailTemplate: 'reminder_24h', smsTemplate: 'reminder_24h', label: '24h' },
  { key: 'h12', minLo: 12 * H - PAD, minHi: 12 * H + PAD, emailTemplate: 'reminder_12h', smsTemplate: null,        label: '12h' },
  { key: 'h1',  minLo:  1 * H - PAD, minHi:  1 * H + PAD, emailTemplate: 'reminder_1h',  smsTemplate: 'reminder_1h',  label: '1h'  },
];

function templateVars(signup: Signup, webinar: Awaited<ReturnType<typeof getWebinarInfo>>) {
  return {
    firstName: signup.firstName,
    lastName: signup.lastName ?? '',
    webinarName: webinar.name,
    webinarDate: webinar.date,
    webinarTime: webinar.time,
    webinarTimezone: webinar.timezone,
    zoomJoinUrl: webinar.zoomJoinUrl,
    zoomRegisterUrl: webinar.zoomRegisterUrl,
    messengerGroupUrl: webinar.messengerGroupUrl,
    replayUrl: webinar.replayUrl,
  };
}

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const webinar = await getWebinarInfo();
  const minsLeft = minutesUntilWebinar(webinar.startsAtIso);
  if (minsLeft === null) {
    return NextResponse.json({ skipped: 'webinar startsAtIso not configured' });
  }

  // Decide which window (if any) we're inside right now.
  const active = WINDOWS.find((w) => minsLeft >= w.minLo && minsLeft <= w.minHi);
  if (!active) {
    return NextResponse.json({ minsLeft, skipped: 'outside reminder windows' });
  }

  const signups = await getSignups();
  // Only message live, paying-or-registered seats — skip refunded/unsub'd.
  const eligible = signups.filter((s) => ['registered', 'paid', 'attended'].includes(s.status));

  const sent: { email: number; sms: number; alreadySent: number; failed: number } = {
    email: 0,
    sms: 0,
    alreadySent: 0,
    failed: 0,
  };

  for (const signup of eligible) {
    if (hasReminderSent(signup.metadata, active.key)) {
      sent.alreadySent += 1;
      continue;
    }

    const vars = templateVars(signup, webinar);

    // Email — best effort, never throws.
    const emailRes = await sendEmail({ to: signup.email, templateId: active.emailTemplate, vars });
    if (emailRes.ok) sent.email += 1;
    else sent.failed += 1;

    // SMS — only for 24h and 1h windows, and only if phone on file.
    if (active.smsTemplate && signup.phone) {
      const smsRes = await sendSms({ to: signup.phone, templateId: active.smsTemplate, vars });
      if (smsRes.ok) sent.sms += 1;
    }

    // Mark sent regardless of provider success — prevents infinite retry loops
    // on bad email/phone. Admin can inspect failures in Resend dashboard.
    await updateSignup(signup.id, {
      metadata: markReminderSent(signup.metadata, active.key),
    });
  }

  return NextResponse.json({
    window: active.label,
    minsLeft,
    eligible: eligible.length,
    ...sent,
  });
}

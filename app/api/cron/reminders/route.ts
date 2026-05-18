/**
 * Reminder cron — runs every 10 minutes (see vercel.json).
 *
 * For each signup with status registered/paid/attended:
 *   • T-24h ± 15min  → send `reminder_24h` (email + SMS)
 *   • T-1h  ± 15min  → send `reminder_1h`  (email + SMS)
 *
 * State is tracked in signup.metadata.reminders.{h24|h1} so we never
 * double-send. Returns a JSON summary for the Vercel Cron log.
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

type Window = { key: ReminderKey; minLo: number; minHi: number; templateId: string; label: string };

const WINDOWS: Window[] = [
  // T-24h reminder: fires when we're between 23h45m and 24h15m out.
  { key: 'h24', minLo: 24 * 60 - 15, minHi: 24 * 60 + 15, templateId: 'reminder_24h', label: '24h' },
  // T-1h reminder: fires when we're between 45m and 1h15m out.
  { key: 'h1', minLo: 60 - 15, minHi: 60 + 15, templateId: 'reminder_1h', label: '1h' },
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
    const emailRes = await sendEmail({ to: signup.email, templateId: active.templateId, vars });
    if (emailRes.ok) sent.email += 1;
    else sent.failed += 1;

    // SMS — only if phone present.
    if (signup.phone) {
      const smsRes = await sendSms({ to: signup.phone, templateId: active.templateId, vars });
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

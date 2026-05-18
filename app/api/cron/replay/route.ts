/**
 * Replay cron — runs hourly (see vercel.json).
 *
 * Sends the `replay` email + SMS to every live signup once we're between
 * 4 and 48 hours past the webinar start. Uses signup.metadata.reminders.replay
 * to ensure each person gets it exactly once.
 *
 * Why 4h post-start? Webinar is ~90min; replay link goes out a couple
 * hours later. The 48h ceiling stops us from spamming people if the
 * admin forgets to update startsAtIso for the next webinar.
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
} from '@/lib/cron';

export const runtime = 'nodejs';
export const maxDuration = 60;

function templateVars(signup: Signup, webinar: Awaited<ReturnType<typeof getWebinarInfo>>) {
  return {
    firstName: signup.firstName,
    webinarName: webinar.name,
    replayUrl: webinar.replayUrl,
    messengerGroupUrl: webinar.messengerGroupUrl,
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

  // Replay window: 4h to 48h after start. minsLeft is negative once we're past it.
  const minutesSinceStart = -minsLeft;
  const inWindow = minutesSinceStart >= 4 * 60 && minutesSinceStart <= 48 * 60;
  if (!inWindow) {
    return NextResponse.json({ minutesSinceStart, skipped: 'outside replay window' });
  }

  if (!webinar.replayUrl) {
    return NextResponse.json({ skipped: 'no replayUrl configured in /admin/settings' });
  }

  const signups = await getSignups();
  const eligible = signups.filter((s) =>
    ['registered', 'paid', 'attended', 'no-show'].includes(s.status),
  );

  const sent = { email: 0, sms: 0, alreadySent: 0, failed: 0 };

  for (const signup of eligible) {
    if (hasReminderSent(signup.metadata, 'replay')) {
      sent.alreadySent += 1;
      continue;
    }

    const vars = templateVars(signup, webinar);

    const emailRes = await sendEmail({ to: signup.email, templateId: 'replay', vars });
    if (emailRes.ok) sent.email += 1;
    else sent.failed += 1;

    if (signup.phone) {
      const smsRes = await sendSms({ to: signup.phone, templateId: 'replay', vars });
      if (smsRes.ok) sent.sms += 1;
    }

    await updateSignup(signup.id, {
      metadata: markReminderSent(signup.metadata, 'replay'),
    });
  }

  return NextResponse.json({
    minutesSinceStart,
    eligible: eligible.length,
    ...sent,
  });
}

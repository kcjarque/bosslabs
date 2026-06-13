/**
 * Replay cron — runs hourly (see vercel.json).
 *
 * Sends the `replay` email + SMS to the JUST-FINISHED webinar's registrants,
 * once each, between 4 and 48 hours after that webinar started.
 *
 * Keyed off the most-recent PAST event — NOT settings.startsAtIso — so the
 * weekly rollover (which flips settings to the NEXT webinar right after the
 * current one) can't break it. Dedup is per-event (`replay_<eventId>`) so a
 * repeat weekly attendee gets EACH week's replay.
 *
 * Why 4h post-start? Webinar is ~90min; replay link goes out a couple hours
 * later. The 48h ceiling stops late/duplicate sends once the window passes.
 */

import { NextResponse } from 'next/server';
import { getSignups, getEvents, updateSignup, type Signup } from '@/lib/db';
import { getWebinarInfo } from '@/lib/webinar';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import {
  hasReminderSent,
  markReminderSent,
  verifyCronAuth,
  type ReminderKey,
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

  // The just-finished webinar = the most-recent event whose start is in the
  // past. Decoupled from settings.startsAtIso (which the rollover points at the
  // NEXT webinar), so rolling over never suppresses the prior replay.
  const now = Date.now();
  const lastWebinar = (await getEvents())
    .filter((e) => e.startsAtIso && Date.parse(e.startsAtIso) < now)
    .sort((a, b) => Date.parse(b.startsAtIso) - Date.parse(a.startsAtIso))[0];
  if (!lastWebinar) {
    return NextResponse.json({ skipped: 'no past webinar' });
  }

  // Replay window: 4h to 48h after that webinar's start.
  const minutesSinceStart = Math.round((now - Date.parse(lastWebinar.startsAtIso)) / 60_000);
  const inWindow = minutesSinceStart >= 4 * 60 && minutesSinceStart <= 48 * 60;
  if (!inWindow) {
    return NextResponse.json({
      webinar: lastWebinar.name,
      minutesSinceStart,
      skipped: 'outside replay window',
    });
  }

  const webinar = await getWebinarInfo();
  if (!webinar.replayUrl) {
    return NextResponse.json({ skipped: 'no replayUrl configured in /admin/settings' });
  }

  // Audience = THIS webinar's registrants only (not other weeks').
  const replayKey = `replay_${lastWebinar.id}` as ReminderKey;
  const signups = await getSignups();
  const eligible = signups.filter(
    (s) =>
      s.eventId === lastWebinar.id &&
      ['registered', 'paid', 'attended', 'no-show'].includes(s.status),
  );

  const sent = { email: 0, sms: 0, alreadySent: 0, failed: 0 };

  for (const signup of eligible) {
    if (hasReminderSent(signup.metadata, replayKey)) {
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
      metadata: markReminderSent(signup.metadata, replayKey),
    });
  }

  return NextResponse.json({
    webinar: lastWebinar.name,
    minutesSinceStart,
    eligible: eligible.length,
    ...sent,
  });
}

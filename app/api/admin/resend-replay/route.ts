/**
 * POST /api/admin/resend-replay
 *
 * One-off recovery for the July-23 replay: the hourly replay cron only emails
 * signups tagged to the just-finished event (July 23). But the weekly auto-
 * rollover + the checkout session-picker tagged a batch of people who actually
 * attended July 23 to the NEXT event (July 29), so the cron skipped them — they
 * paid, attended, and never got the replay link (Rajie Abdelgafur et al.).
 *
 * This endpoint sends the same `replay` template (email only) to that precise
 * misrouted cohort: PAID + tagged to July 29 + created BEFORE today (so they
 * existed when the July-23 replay went out) + no replay flag yet. It marks the
 * July-23 replay flag on each so nobody is double-sent and a re-run is a no-op.
 *
 * Auth: Bearer HUB_PROVISION_TOKEN (scripts) OR a logged-in admin on a
 * same-origin request (the browser). Body: { dryRun?, testCopyTo? }.
 */
import { NextResponse } from 'next/server';
import { getSignups, updateSignup, type Signup } from '@/lib/db';
import { getWebinarInfo } from '@/lib/webinar';
import { sendEmail } from '@/lib/email';
import { hasReminderSent, markReminderSent, type ReminderKey } from '@/lib/cron';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// The just-finished webinar (audience got its replay) and the NEXT event the
// rollover misrouted the same attendees onto.
const JULY23_EVENT_ID = '16bb9e70-5c7a-497c-8e87-368f1ea6ae67';
const JULY29_EVENT_ID = 'b5a29c38-0766-48fa-b09d-1435240398a1';
// Manila midnight, July 24 = 2026-07-23T16:00Z. Signups created before this
// existed when the replay went out → genuine July-23 attendees. Anyone created
// after is a brand-new July-29 registrant who did NOT attend July 23.
const CUTOFF_ISO = '2026-07-23T16:00:00.000Z';

type Body = { dryRun?: boolean; testCopyTo?: string };

function replayVars(s: Signup, webinar: Awaited<ReturnType<typeof getWebinarInfo>>) {
  return {
    firstName: s.firstName,
    webinarName: webinar.name,
    replayUrl: webinar.replayUrl,
    messengerGroupUrl: webinar.messengerGroupUrl,
  };
}

export async function POST(req: Request) {
  const token = process.env.HUB_PROVISION_TOKEN;
  const presented = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const viaToken = Boolean(token) && presented === token;
  const viaAdmin = isAdminLoggedIn() && isSameOrigin(req);
  if (!viaToken && !viaAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const dryRun = body.dryRun === true;
  const testCopyTo = (body.testCopyTo ?? '').trim();

  const replayKey = `replay_${JULY23_EVENT_ID}` as ReminderKey;
  const signups = await getSignups();
  const audience = signups.filter(
    (s) =>
      s.eventId === JULY29_EVENT_ID &&
      ['paid', 'attended', 'no-show'].includes(s.status) &&
      (s.createdAt || '') < CUTOFF_ISO &&
      Boolean(s.email) &&
      s.email.includes('@') &&
      !hasReminderSent(s.metadata, replayKey),
  );

  const webinar = await getWebinarInfo();

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      count: audience.length,
      replayUrl: webinar.replayUrl,
      sample: audience.slice(0, 5).map((s) => ({ email: s.email, firstName: s.firstName, createdAt: s.createdAt })),
    });
  }

  // Optional: send ONE copy to the operator first (using the first recipient's
  // vars) so Kyle can eyeball the real rendered email before the batch.
  let testResult: { to: string; ok: boolean; error?: string } | null = null;
  if (testCopyTo && audience[0]) {
    const r = await sendEmail({ to: testCopyTo, templateId: 'replay', vars: replayVars(audience[0], webinar) });
    testResult = { to: testCopyTo, ok: r.ok, error: r.ok ? undefined : r.error };
  }

  // Batches of 6 so ~100 recipients clear well inside the function limit while
  // staying under provider rate caps (mirrors the replay cron).
  const sent = { email: 0, failed: 0 };
  const BATCH = 6;
  for (let i = 0; i < audience.length; i += BATCH) {
    await Promise.all(
      audience.slice(i, i + BATCH).map(async (s) => {
        const r = await sendEmail({ to: s.email, templateId: 'replay', vars: replayVars(s, webinar) });
        if (r.ok) sent.email += 1;
        else sent.failed += 1;
        // Mark the July-23 replay flag so re-runs skip them (idempotent).
        await updateSignup(s.id, { metadata: markReminderSent(s.metadata, replayKey) });
      }),
    );
  }

  return NextResponse.json({ ok: true, count: audience.length, ...sent, testCopy: testResult });
}

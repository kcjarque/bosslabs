/**
 * POST /api/admin/resend-replay — RETIRED. Always refuses to send.
 *
 * ⚠️ This endpoint was built on a WRONG premise and caused a real incident.
 *
 * The theory was: the rollover "misrouted" July-23 attendees onto the July-29
 * event, so the replay cron skipped them. That was never true. The checkout
 * SESSION PICKER lets a buyer choose a future session, and the data shows they
 * did — on 2026-07-22 alone, 59 people picked July 23 and 20 picked July 29,
 * days before July 23 happened. Being tagged to July 29 meant "I booked July
 * 29", not "I attended July 23 and got mislabelled".
 *
 * Running it emailed 102 people a replay for a webinar they had not attended,
 * ~5 days before their own paid session (customer Julaisa Sangcupan: "Why do I
 * have access to this when my webinar is scheduled for July 29?").
 *
 * The hourly replay cron (app/api/cron/replay) was already correct: it scopes
 * to the just-finished event's own registrants. Do not "fix" that again from a
 * single support message — verify against attendance before assuming a cohort
 * was missed. If a genuine attendee is ever tagged to the wrong event, correct
 * THAT signup's event_id; don't mass-send across events.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Hard-disabled. Kept as a route (not deleted) so the incident and its reason
 *  stay discoverable to whoever looks for this tool next. */
export async function POST() {
  return NextResponse.json(
    {
      error: 'Retired — this endpoint sent a replay to people who had not attended.',
      why:
        'Being tagged to a future event means the buyer PICKED that session (checkout session picker), not that they were misrouted. ' +
        'The hourly replay cron already targets the correct audience.',
      instead:
        'If one genuine attendee is on the wrong event, fix that signup\'s event_id. Never mass-send a replay across events.',
    },
    { status: 410 },
  );
}

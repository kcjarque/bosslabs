/**
 * Sequences cron — runs every 10 minutes (vercel.json).
 *
 * Replaces the old hardcoded /api/cron/reminders. Reads active sequences
 * from the DB and fires the steps whose schedule lands inside the current
 * ±15min window.
 *
 * Algorithm per cron tick:
 *   1. Load all active sequences.
 *   2. For each sequence:
 *      - Resolve list members (live query).
 *      - Load all steps.
 *      - For each active step:
 *        - Compute the target moment based on schedule_type + hours_offset
 *          and the sequence's anchor event (or per-recipient signup time
 *          for after_subscribe).
 *        - For each list member, decide whether the step fires for them now:
 *            • before/after_event: same target time for everyone; fire if
 *              now is within ±15min.
 *            • after_subscribe: per-recipient target = createdAt + offset.
 *        - Skip if sequence_sends already has (step, signup) — idempotent.
 *        - Send the email (and SMS, if attached), then record the send.
 *
 * Best-effort sending: a failed Resend/OneWaySMS call doesn't block the
 * marker. We still write sequence_sends so a flaky provider doesn't cause
 * infinite retry loops. Failures are visible in provider dashboards.
 */

import { NextResponse } from 'next/server';
import {
  getActiveSequences,
  getSequenceSteps,
  getList,
  getEvent,
  computeListMembers,
  getSequenceSendRecipients,
  recordSequenceSend,
  type Signup,
  type SequenceStep,
} from '@/lib/db';
import { getWebinarInfo } from '@/lib/webinar';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { verifyCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** ±15 min tolerance — matches the 10-min cron cadence with safety margin. */
const TOLERANCE_MS = 15 * 60 * 1000;

function templateVarsFor(signup: Signup, webinar: Awaited<ReturnType<typeof getWebinarInfo>>) {
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

/**
 * For a fixed-anchor step (before/after_event), what timestamp does the
 * step target? Returns null if the sequence has no event or no parseable
 * event time.
 */
function eventTargetTime(
  step: SequenceStep,
  eventStartsAtIso: string | null,
): number | null {
  if (!eventStartsAtIso) return null;
  const eventMs = Date.parse(eventStartsAtIso);
  if (Number.isNaN(eventMs)) return null;
  const offsetMs = step.hoursOffset * 60 * 60 * 1000;
  if (step.scheduleType === 'before_event') return eventMs - offsetMs;
  if (step.scheduleType === 'after_event') return eventMs + offsetMs;
  return null;
}

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const now = Date.now();
  const webinar = await getWebinarInfo(); // shared template vars for the legacy single-event case
  const sequences = await getActiveSequences();

  const totals = {
    sequencesProcessed: 0,
    stepsFired: 0,
    emailsSent: 0,
    smsSent: 0,
    failures: 0,
    alreadySent: 0,
  };

  type StepLog = {
    sequenceId: string;
    stepId: string;
    schedule: string;
    recipients: number;
    sent: number;
    alreadySent: number;
    failed: number;
  };
  const log: StepLog[] = [];

  for (const sequence of sequences) {
    totals.sequencesProcessed++;

    const list = await getList(sequence.listId);
    if (!list) continue;

    const event = sequence.eventId ? await getEvent(sequence.eventId) : null;
    const steps = await getSequenceSteps(sequence.id);
    const members = await computeListMembers(list.filterTypes);

    for (const step of steps) {
      if (!step.active) continue;
      if (!step.emailTemplateId && !step.smsTemplateId) continue;

      // Compute who should receive this step right now.
      const targets: Signup[] = [];

      if (step.scheduleType === 'before_event' || step.scheduleType === 'after_event') {
        const target = eventTargetTime(step, event?.startsAtIso ?? null);
        if (target === null) continue;
        // Same target for everyone in the list.
        const delta = Math.abs(now - target);
        if (delta > TOLERANCE_MS) continue;
        targets.push(...members);
      } else {
        // after_subscribe — per-recipient target based on signup createdAt.
        const offsetMs = step.hoursOffset * 60 * 60 * 1000;
        for (const m of members) {
          const created = Date.parse(m.createdAt);
          if (Number.isNaN(created)) continue;
          const target = created + offsetMs;
          if (Math.abs(now - target) <= TOLERANCE_MS) {
            targets.push(m);
          }
        }
        if (targets.length === 0) continue;
      }

      // Filter out anyone who's already received this step.
      const alreadySent = await getSequenceSendRecipients(step.id);
      const fresh = targets.filter((s) => !alreadySent.has(s.id));

      const stepLog: StepLog = {
        sequenceId: sequence.id,
        stepId: step.id,
        schedule: `${step.scheduleType}/${step.hoursOffset}h`,
        recipients: targets.length,
        sent: 0,
        alreadySent: targets.length - fresh.length,
        failed: 0,
      };
      totals.alreadySent += stepLog.alreadySent;

      if (fresh.length === 0) {
        log.push(stepLog);
        continue;
      }

      totals.stepsFired++;

      for (const signup of fresh) {
        const vars = templateVarsFor(signup, webinar);
        let emailOk = false;
        let smsOk = false;

        if (step.emailTemplateId) {
          const res = await sendEmail({
            to: signup.email,
            templateId: step.emailTemplateId,
            vars,
          });
          emailOk = res.ok;
          if (emailOk) totals.emailsSent++;
          else totals.failures++;
        }

        if (step.smsTemplateId && signup.phone) {
          const res = await sendSms({
            to: signup.phone,
            templateId: step.smsTemplateId,
            vars,
          });
          smsOk = res.ok;
          if (smsOk) totals.smsSent++;
        }

        // Mark sent regardless of provider success — prevents infinite
        // retry loops on bad email/phone. Provider dashboards show failures.
        await recordSequenceSend({
          sequenceStepId: step.id,
          signupId: signup.id,
          emailOk,
          smsOk,
        });

        stepLog.sent++;
        if (step.emailTemplateId && !emailOk) stepLog.failed++;
      }

      log.push(stepLog);
    }
  }

  return NextResponse.json({ ok: true, ...totals, log });
}

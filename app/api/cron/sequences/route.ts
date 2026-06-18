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
  getSequenceSubscriptions,
  getSignupById,
  recordSequenceSend,
  type Signup,
  type SequenceStep,
} from '@/lib/db';
import { getWebinarInfo, templateVarsForSignup } from '@/lib/webinar';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { verifyCronAuth } from '@/lib/cron';
import { MONITOR_EMAILS } from '@/lib/config';

export const runtime = 'nodejs';
// Cron route — always dynamic. Auth is read via verifyCronAuth() (a helper),
// which Next's static analysis can't see, so without this it tries to
// prerender the route and its no-store fetch throws at build time.
export const dynamic = 'force-dynamic';
// 300s (Pro plan) so even a large list never times out mid-send. Combined with
// the batched-concurrency sender below, a normal run finishes in seconds — this
// is just the safety ceiling.
export const maxDuration = 300;

/** ±15 min tolerance — matches the 10-min cron cadence with safety margin. */
const TOLERANCE_MS = 15 * 60 * 1000;

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
    // Audience = list members (dynamic filter) ∪ manual subscriptions.
    // For each customer we remember their effective "subscribed_at" anchor:
    //   - list-only members → their signup.createdAt
    //   - manually subscribed → sequence_subscriptions.subscribed_at
    // After_subscribe schedules use this anchor; before/after_event ignore it.
    const audience = new Map<string, { signup: Signup; subscribedAt: string }>();
    const listMembers = await computeListMembers(list);
    for (const m of listMembers) {
      audience.set(m.id, { signup: m, subscribedAt: m.createdAt });
    }
    const manualSubs = await getSequenceSubscriptions(sequence.id);
    for (const sub of manualSubs) {
      // If already in via list, override with manual subscribed_at so the
      // sequence effectively restarts "from now" for that customer.
      const existing = audience.get(sub.signupId);
      if (existing) {
        audience.set(sub.signupId, {
          signup: existing.signup,
          subscribedAt: sub.subscribedAt,
        });
      } else {
        const s = await getSignupById(sub.signupId);
        if (s) audience.set(sub.signupId, { signup: s, subscribedAt: sub.subscribedAt });
      }
    }

    for (const step of steps) {
      if (!step.active) continue;
      if (!step.emailTemplateId && !step.smsTemplateId) continue;

      // Compute who should receive this step right now.
      const targets: Signup[] = [];

      if (step.scheduleType === 'before_event' || step.scheduleType === 'after_event') {
        const target = eventTargetTime(step, event?.startsAtIso ?? null);
        if (target === null) continue;
        // Same target for everyone in the audience.
        const delta = Math.abs(now - target);
        if (delta > TOLERANCE_MS) continue;
        for (const { signup } of audience.values()) targets.push(signup);
      } else {
        // after_subscribe — per-recipient target based on each member's
        // own anchor (signup.createdAt for list-only, subscribed_at for
        // manual subs). This lets manual subscription restart the sequence.
        const offsetMs = step.hoursOffset * 60 * 60 * 1000;
        for (const { signup, subscribedAt } of audience.values()) {
          const anchor = Date.parse(subscribedAt);
          if (Number.isNaN(anchor)) continue;
          const target = anchor + offsetMs;
          if (Math.abs(now - target) <= TOLERANCE_MS) {
            targets.push(signup);
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

      // Send in bounded-concurrency batches, NOT one-at-a-time. A serial loop
      // (email + SMS + DB write per person, ~2-3s each) only got through ~20
      // recipients before the 60s function timeout — so late steps with the
      // full paid audience (e.g. the 1-hour/15-min reminders) ran out of window
      // and silently under-delivered. Batched sends drain the whole list in
      // seconds; maxDuration is also raised below as a safety net.
      const sendToOne = async (signup: Signup) => {
        // Resolves the per-event Zoom link (falls back to global settings).
        const vars = await templateVarsForSignup(signup, webinar);
        let emailOk = false;
        let smsOk = false;
        let emailMessageId: string | null = null;

        if (step.emailTemplateId) {
          const res = await sendEmail({
            to: signup.email,
            templateId: step.emailTemplateId,
            vars,
          });
          emailOk = res.ok;
          if (res.ok) emailMessageId = res.id;
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
          emailMessageId,
        });

        stepLog.sent++;
        if (step.emailTemplateId && !emailOk) stepLog.failed++;
      };

      const SEND_CONCURRENCY = 8;
      for (let i = 0; i < fresh.length; i += SEND_CONCURRENCY) {
        await Promise.all(fresh.slice(i, i + SEND_CONCURRENCY).map(sendToOne));
      }

      // Monitor copy — one email per step fire so the team sees exactly what
      // this event's drip looks like. Email only; uses the sequence's event so
      // the Zoom link etc. resolve. Best-effort — never blocks real sends, and
      // monitors are NOT signups so paid/abandoned/revenue stay clean.
      if (MONITOR_EMAILS.length > 0 && step.emailTemplateId) {
        for (const monitorEmail of MONITOR_EMAILS) {
          try {
            const vars = await templateVarsForSignup(
              { firstName: 'Team', lastName: '(monitor)', email: monitorEmail, phone: '', eventId: sequence.eventId ?? null },
              webinar,
            );
            await sendEmail({ to: monitorEmail, templateId: step.emailTemplateId, vars });
          } catch {
            // ignore — monitoring must never affect the real drip
          }
        }
      }

      log.push(stepLog);
    }
  }

  return NextResponse.json({ ok: true, ...totals, log });
}

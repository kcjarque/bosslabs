/**
 * Drip catch-up — runs the sequence engine OUTSIDE Vercel cron.
 *
 * Why this exists: on 2026-07-29 we found the Vercel project only runs 2 daily
 * cron jobs (the Hobby-plan limit), so every-10-minute jobs like
 * /api/cron/sequences never fire. 311 paid buyers got no reminder at all for
 * the July 29 webinar. This script does exactly what that cron does, so
 * reminders can be driven from anywhere until the plan is fixed.
 *
 * Safe to run as often as you like: every send is deduped through
 * sequence_sends, so re-running never double-sends.
 *
 *   npx tsx scripts/drip-catchup.ts            # dry run — shows what is due
 *   npx tsx scripts/drip-catchup.ts --send     # actually send
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Production env first (real site URL — never bake localhost links into a
// customer email), then .env.local for anything missing.
const PROD_ENV = process.env.BL_PROD_ENV ?? resolve('.env.production.local');
for (const src of [PROD_ENV, resolve('.env.local')]) {
  if (!existsSync(src)) continue;
  for (const line of readFileSync(src, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    const v = m?.[2]?.trim().replace(/^["']|["']$/g, '');
    if (m && v && !process.env[m[1]]) process.env[m[1]] = v;
  }
}
process.env.NEXT_PUBLIC_SITE_URL = 'https://www.bosslabs.live';

import {
  getActiveSequences, getList, getEvent, getSequenceSteps, computeListMembers,
  getSequenceSubscriptions, getSignupById, getSequenceSendRecipients, recordSequenceSend,
  type Signup, type SequenceStep,
} from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { getWebinarInfo, templateVarsForSignup } from '@/lib/webinar';

const SEND = process.argv.includes('--send');
const TOLERANCE_MS = 15 * 60 * 1000;
const CATCHUP_MS = 6 * 60 * 60 * 1000;
const CONC = 8;

function dueNow(step: SequenceStep, startsAtIso: string | null, now: number): boolean {
  if (!startsAtIso) return false;
  const eventMs = Date.parse(startsAtIso);
  if (Number.isNaN(eventMs)) return false;
  const off = step.hoursOffset * 3600e3;
  const target =
    step.scheduleType === 'before_event' ? eventMs - off
      : step.scheduleType === 'after_event' ? eventMs + off : null;
  if (target === null) return false;
  const late = now - target;
  if (Math.abs(late) <= TOLERANCE_MS) return true;
  if (late <= 0 || late > CATCHUP_MS) return false;
  // Never resurrect a "join in 3 hours" reminder after the webinar has begun.
  if (step.scheduleType === 'before_event' && now >= eventMs) return false;
  return true;
}

async function main() {
  const now = Date.now();
  const webinar = await getWebinarInfo();
  console.log(`${new Date(now + 8 * 3600e3).toISOString().slice(0, 19).replace('T', ' ')} Manila · ${SEND ? 'SEND' : 'DRY RUN'}`);

  let totalSent = 0;
  for (const sequence of await getActiveSequences()) {
    try {
      const list = await getList(sequence.listId);
      if (!list) continue;
      const event = sequence.eventId ? await getEvent(sequence.eventId) : null;
      const steps = await getSequenceSteps(sequence.id);

      const fixed = steps.filter(
        (s) => s.active && (s.emailTemplateId || s.smsTemplateId) &&
          (s.scheduleType === 'before_event' || s.scheduleType === 'after_event') &&
          dueNow(s, event?.startsAtIso ?? null, now),
      );
      const perRecipient = steps.filter(
        (s) => s.active && (s.emailTemplateId || s.smsTemplateId) && s.scheduleType === 'after_subscribe',
      );
      if (fixed.length === 0 && perRecipient.length === 0) continue;

      const audience = new Map<string, { signup: Signup; subscribedAt: string }>();
      for (const m of await computeListMembers(list)) audience.set(m.id, { signup: m, subscribedAt: m.createdAt });
      for (const sub of await getSequenceSubscriptions(sequence.id)) {
        const ex = audience.get(sub.signupId);
        if (ex) audience.set(sub.signupId, { signup: ex.signup, subscribedAt: sub.subscribedAt });
        else { const s = await getSignupById(sub.signupId); if (s) audience.set(sub.signupId, { signup: s, subscribedAt: sub.subscribedAt }); }
      }

      for (const step of steps) {
        if (!step.active || (!step.emailTemplateId && !step.smsTemplateId)) continue;
        let targets: Signup[] = [];
        if (step.scheduleType === 'before_event' || step.scheduleType === 'after_event') {
          if (!dueNow(step, event?.startsAtIso ?? null, now)) continue;
          targets = [...audience.values()].map((a) => a.signup);
        } else {
          const off = step.hoursOffset * 3600e3;
          targets = [...audience.values()]
            .filter(({ subscribedAt }) => {
              const anchor = Date.parse(subscribedAt);
              return !Number.isNaN(anchor) && Math.abs(now - (anchor + off)) <= TOLERANCE_MS;
            })
            .map((a) => a.signup);
        }
        if (targets.length === 0) continue;

        const already = await getSequenceSendRecipients(step.id);
        const fresh = targets.filter((s) => !already.has(s.id));
        console.log(`  ${sequence.name} · ${step.scheduleType}/${step.hoursOffset}h  due=${targets.length} already=${targets.length - fresh.length} TO SEND=${fresh.length}`);
        if (!SEND || fresh.length === 0) continue;

        const one = async (s: Signup) => {
          const vars = await templateVarsForSignup(s, webinar);
          let emailOk = false, smsOk = false, id: string | null = null;
          if (step.emailTemplateId) {
            const r = await sendEmail({ to: s.email, templateId: step.emailTemplateId, vars });
            emailOk = r.ok; if (r.ok) id = r.id ?? null;
          }
          if (step.smsTemplateId && s.phone) {
            const r = await sendSms({ to: s.phone, templateId: step.smsTemplateId, vars });
            smsOk = r.ok;
          }
          await recordSequenceSend({ sequenceStepId: step.id, signupId: s.id, emailOk, smsOk, emailMessageId: id });
        };
        for (let i = 0; i < fresh.length; i += CONC) await Promise.all(fresh.slice(i, i + CONC).map(one));
        totalSent += fresh.length;
        console.log(`     -> sent ${fresh.length}`);
      }
    } catch (err) {
      console.error(`  ! "${sequence.name}" threw — skipped:`, (err as Error).message);
    }
  }
  console.log(SEND ? `done · ${totalSent} recipients` : 'dry run — nothing sent');
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });

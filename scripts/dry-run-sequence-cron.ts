/**
 * Dry-run of the sequence cron — replicates the firing logic but
 * doesn't actually send emails or write to sequence_sends. Lets us
 * see exactly what the cron would do given current data.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
try {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
} catch {}

import {
  getActiveSequences,
  getSequenceSteps,
  getList,
  getEvent,
  computeListMembers,
  getSequenceSubscriptions,
  getSequenceSendRecipients,
  getSignupById,
  type Signup,
} from '@/lib/db';

const TOLERANCE_MS = 15 * 60 * 1000;

async function main() {
  const now = Date.now();
  const sequences = await getActiveSequences();
  console.log(`Found ${sequences.length} active sequence(s).\n`);

  for (const sequence of sequences) {
    console.log(`━━━ ${sequence.name} ━━━`);
    const list = await getList(sequence.listId);
    if (!list) { console.log('  ❌ list missing'); continue; }
    const event = sequence.eventId ? await getEvent(sequence.eventId) : null;
    const steps = await getSequenceSteps(sequence.id);

    const audience = new Map<string, { signup: Signup; subscribedAt: string }>();
    const listMembers = await computeListMembers(list);
    for (const m of listMembers) {
      audience.set(m.id, { signup: m, subscribedAt: m.createdAt });
    }
    const manualSubs = await getSequenceSubscriptions(sequence.id);
    for (const sub of manualSubs) {
      const existing = audience.get(sub.signupId);
      if (existing) {
        audience.set(sub.signupId, { signup: existing.signup, subscribedAt: sub.subscribedAt });
      } else {
        const s = await getSignupById(sub.signupId);
        if (s) audience.set(sub.signupId, { signup: s, subscribedAt: sub.subscribedAt });
      }
    }
    console.log(`  Audience: ${audience.size}`);

    for (const step of steps) {
      if (!step.active) { console.log(`  step ${step.hoursOffset}h: SKIP (inactive)`); continue; }
      if (!step.emailTemplateId && !step.smsTemplateId) { console.log(`  step ${step.hoursOffset}h: SKIP (no templates)`); continue; }

      const offsetMs = step.hoursOffset * 3600_000;
      let target: number | null = null;
      if (event) {
        const eventMs = Date.parse(event.startsAtIso);
        if (step.scheduleType === 'before_event') target = eventMs - offsetMs;
        else if (step.scheduleType === 'after_event') target = eventMs + offsetMs;
      }

      const targets: Signup[] = [];
      if (step.scheduleType === 'before_event' || step.scheduleType === 'after_event') {
        if (target === null) { console.log(`  step ${step.hoursOffset}h: SKIP (no event anchor)`); continue; }
        const delta = Math.abs(now - target);
        if (delta > TOLERANCE_MS) {
          console.log(`  step ${step.hoursOffset}h: WAIT (delta=${Math.round(delta/60000)}min, outside ±15)`);
          continue;
        }
        for (const { signup } of audience.values()) targets.push(signup);
      } else {
        const offMs = step.hoursOffset * 3600_000;
        for (const { signup, subscribedAt } of audience.values()) {
          const anchor = Date.parse(subscribedAt);
          if (Number.isNaN(anchor)) continue;
          const t = anchor + offMs;
          if (Math.abs(now - t) <= TOLERANCE_MS) targets.push(signup);
        }
        if (targets.length === 0) { console.log(`  step ${step.hoursOffset}h after_subscribe: WAIT (no one in window)`); continue; }
      }

      const alreadySent = await getSequenceSendRecipients(step.id);
      const fresh = targets.filter((s) => !alreadySent.has(s.id));
      console.log(`  step ${step.hoursOffset}h: IN WINDOW — ${targets.length} targets, ${fresh.length} fresh, ${targets.length - fresh.length} already sent`);
    }
    console.log('');
  }
}

main().catch(console.error);

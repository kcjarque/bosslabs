/**
 * Audit each active sequence step: when did it fire, who got it,
 * and is the cron actually picking it up at the right time?
 *
 * Usage: npx tsx scripts/audit-sequence-firings.ts
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
} from '@/lib/db';
import { createClient } from '@supabase/supabase-js';

const TZ_MANILA = 'Asia/Manila';

function fmt(ms: number): string {
  return new Date(ms).toLocaleString('en-PH', {
    timeZone: TZ_MANILA,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function relative(ms: number): string {
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const sign = diff >= 0 ? 'in' : 'ago';
  const min = Math.round(abs / 60000);
  if (min < 60) return `${sign === 'in' ? 'in' : ''} ${min}m ${sign === 'ago' ? 'ago' : ''}`.trim();
  const h = Math.round(min / 60);
  if (h < 48) return `${sign === 'in' ? 'in' : ''} ${h}h ${sign === 'ago' ? 'ago' : ''}`.trim();
  const d = Math.round(h / 24);
  return `${sign === 'in' ? 'in' : ''} ${d}d ${sign === 'ago' ? 'ago' : ''}`.trim();
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key);

  const sequences = await getActiveSequences();
  if (sequences.length === 0) {
    console.log('No active sequences.');
    return;
  }

  const now = Date.now();

  for (const sequence of sequences) {
    console.log(`\n━━━ ${sequence.name} ━━━`);
    const list = await getList(sequence.listId);
    const event = sequence.eventId ? await getEvent(sequence.eventId) : null;
    if (!list) {
      console.log('  ⚠️  list missing');
      continue;
    }
    console.log(`  List:  ${list.name}  (${list.filterTypes.join(', ')})`);
    if (event) {
      const eventMs = Date.parse(event.startsAtIso);
      console.log(`  Event: ${event.name}  starts ${fmt(eventMs)} (${relative(eventMs)})`);
    } else {
      console.log(`  Event: — none —`);
    }

    const stepsRaw = await sb
      .from('sequence_steps')
      .select('*')
      .eq('sequence_id', sequence.id)
      .order('position');
    const steps = (stepsRaw.data ?? []) as Array<{
      id: string;
      hours_offset: number;
      schedule_type: string;
      active: boolean;
      email_template_id: string | null;
      sms_template_id: string | null;
      created_at: string;
    }>;
    const members = await computeListMembers(list);
    const subs = await getSequenceSubscriptions(sequence.id);
    const audienceSize = new Set([...members.map((m) => m.id), ...subs.map((s) => s.signupId)]).size;
    console.log(`  Audience: ${audienceSize} (${members.length} via list + ${subs.length} manual subs)`);
    console.log('');

    for (const step of steps) {
      if (!step.active) continue;
      const offsetMs = step.hours_offset * 3600_000;
      let targetMs: number | null = null;
      if (event) {
        const eventMs = Date.parse(event.startsAtIso);
        if (step.schedule_type === 'before_event') targetMs = eventMs - offsetMs;
        else if (step.schedule_type === 'after_event') targetMs = eventMs + offsetMs;
      }
      const stepCreatedMs = Date.parse(step.created_at);

      // Count actual sends for this step.
      const { data: sends, error } = await sb
        .from('sequence_sends')
        .select('id, sent_at, email_ok, sms_ok, signup_id')
        .eq('sequence_step_id', step.id);
      if (error) {
        console.log(`  Step ${step.hoursOffset}h: error fetching sends - ${error.message}`);
        continue;
      }
      const sendsArr = sends ?? [];

      const label = step.schedule_type === 'before_event'
        ? `${step.hours_offset}h before`
        : step.schedule_type === 'after_event'
          ? `${step.hours_offset}h after`
          : `${step.hours_offset}h post-signup`;

      console.log(`  ${label.padEnd(20)} target=${targetMs ? fmt(targetMs) : '—'}  ${targetMs ? `(${relative(targetMs)})` : ''}`);
      console.log(`                       step_created=${fmt(stepCreatedMs)} (${relative(stepCreatedMs)})`);

      const inWindow = targetMs !== null && Math.abs(now - targetMs) <= 15 * 60_000;
      const past = targetMs !== null && now > targetMs + 15 * 60_000;
      const future = targetMs !== null && now < targetMs - 15 * 60_000;

      let status = '';
      if (inWindow) status = '🟡 firing now';
      else if (past) status = '✅ past target';
      else if (future) status = '⏳ future';

      console.log(`                       sent_count=${sendsArr.length}/${audienceSize}  ${status}`);

      if (past && targetMs !== null && stepCreatedMs > targetMs + 15 * 60_000) {
        console.log(`                       ℹ️  step was created AFTER window closed — cron correctly skipped`);
      } else if (past && sendsArr.length === 0 && audienceSize > 0) {
        console.log(`                       ❌ TARGET PASSED, NOTHING SENT (step existed during window)`);
      } else if (past && sendsArr.length < audienceSize) {
        console.log(`                       ⚠️  ${audienceSize - sendsArr.length} recipients missed`);
      }
    }
  }

  console.log('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

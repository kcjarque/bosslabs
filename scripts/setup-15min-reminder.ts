/**
 * One-off: add a 15-min-before email + SMS reminder, and attach SMS
 * templates to the 12h / 3h / 1h steps. Zoom link is only sent via SMS
 * on the 1h + 15min steps; the 12h + 3h SMS are link-less reminders.
 *
 * Prereq: hours_offset must be numeric, not integer. Run this SQL once
 * in Supabase before re-running this script:
 *
 *   alter table sequence_steps alter column hours_offset type numeric using hours_offset::numeric;
 *
 * After that, this script is idempotent and can be re-run safely.
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

import { createClient } from '@supabase/supabase-js';
import { renderEmailMarkdown } from '@/lib/email-markdown';

const SEQUENCE_NAME = 'Webinar Reminder Sequence';

const EMAIL_TEMPLATES: Array<{
  id: string;
  name: string;
  subject: string;
  body: string;
}> = [
  {
    id: 'reminder_15min',
    name: '15-minute reminder',
    subject: '🔔 Starting in 15 minutes — san ka na, {{firstName}}?',
    body: `^^15 minutes^^
# San ka na, {{firstName}}?

We start in **15 minutes** — open Zoom now, grab a coffee, and meet us at {{webinarTime}} {{webinarTimezone}} sharp.

[[Open the Zoom call]]({{zoomJoinUrl}})

Bring one workflow you want to automate. We'll show you how to build it tonight.`,
  },
];

const SMS_TEMPLATES: Array<{ id: string; name: string; body: string }> = [
  {
    id: 'reminder_12h',
    name: '12-hour reminder',
    body: 'BOSSLABS AI in 12 hours, {{firstName}}. Tomorrow {{webinarTime}} {{webinarTimezone}}. Bring one workflow to automate. Check email for the Zoom link.',
  },
  {
    id: 'reminder_3h',
    name: '3-hour reminder',
    body: 'BOSSLABS AI in 3 hours, {{firstName}}. Block {{webinarTime}} {{webinarTimezone}} in your calendar now. Check email for the Zoom link.',
  },
  {
    id: 'reminder_15min',
    name: '15-minute reminder',
    body: 'BOSSLABS AI starts in 15 min, {{firstName}}! San ka na? Join: {{zoomJoinUrl}}',
  },
];

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1) Email templates — upsert each.
  for (const t of EMAIL_TEMPLATES) {
    const html = renderEmailMarkdown(t.body);
    const { error } = await sb.from('email_templates').upsert(
      { id: t.id, name: t.name, subject: t.subject, body: t.body, html },
      { onConflict: 'id' },
    );
    if (error) console.log(`  ✗ email ${t.id}: ${error.message}`);
    else console.log(`  ✓ email ${t.id}`);
  }

  // 2) SMS templates — upsert each.
  for (const t of SMS_TEMPLATES) {
    const { error } = await sb.from('sms_templates').upsert(
      { id: t.id, name: t.name, body: t.body },
      { onConflict: 'id' },
    );
    if (error) console.log(`  ✗ sms ${t.id}: ${error.message}`);
    else console.log(`  ✓ sms ${t.id}`);
  }

  // 3) Find the sequence.
  const { data: seqs, error: seqErr } = await sb
    .from('sequences')
    .select('id, name')
    .ilike('name', SEQUENCE_NAME);
  if (seqErr) throw new Error(seqErr.message);
  if (!seqs || seqs.length === 0) {
    console.log(`No sequence matching "${SEQUENCE_NAME}" — skipping step changes.`);
    return;
  }
  const sequenceId = (seqs[0] as { id: string }).id;
  console.log(`\nSequence: ${seqs[0].name} (${sequenceId})`);

  // 4) Existing steps for this sequence.
  const { data: stepsRaw } = await sb
    .from('sequence_steps')
    .select('id, hours_offset, schedule_type, email_template_id, sms_template_id, position')
    .eq('sequence_id', sequenceId);
  const steps = (stepsRaw ?? []) as Array<{
    id: string;
    hours_offset: number;
    schedule_type: string;
    email_template_id: string | null;
    sms_template_id: string | null;
    position: number;
  }>;

  // 5) Attach SMS templates to the 12h, 3h, 1h steps.
  const attachments: Record<number, string> = {
    12: 'reminder_12h',
    3: 'reminder_3h',
    1: 'reminder_1h',
  };
  for (const [hoursStr, smsId] of Object.entries(attachments)) {
    const hrs = Number(hoursStr);
    const step = steps.find(
      (s) => s.schedule_type === 'before_event' && Number(s.hours_offset) === hrs,
    );
    if (!step) {
      console.log(`  ! step ${hrs}h not found — skipping SMS attach`);
      continue;
    }
    if (step.sms_template_id === smsId) {
      console.log(`  · step ${hrs}h already has sms=${smsId}`);
      continue;
    }
    const { error } = await sb
      .from('sequence_steps')
      .update({ sms_template_id: smsId })
      .eq('id', step.id);
    if (error) console.log(`  ✗ step ${hrs}h sms: ${error.message}`);
    else console.log(`  ✓ step ${hrs}h ← sms=${smsId}`);
  }

  // 6) Create the new 15-min step. hours_offset = 0.25 needs numeric column.
  const has15min = steps.some(
    (s) => s.schedule_type === 'before_event' && Number(s.hours_offset) === 0.25,
  );
  if (has15min) {
    console.log(`  · 15-min step already exists`);
  } else {
    const maxPos = steps.reduce((m, s) => Math.max(m, s.position), -1);
    const { error } = await sb.from('sequence_steps').insert({
      sequence_id: sequenceId,
      position: maxPos + 1,
      email_template_id: 'reminder_15min',
      sms_template_id: 'reminder_15min',
      schedule_type: 'before_event',
      hours_offset: 0.25,
      active: true,
    });
    if (error) {
      console.log(`  ✗ create 15-min step: ${error.message}`);
      if (/integer/i.test(error.message)) {
        console.log(
          `\n  ⚠️ hours_offset is still integer. Run this in Supabase SQL Editor first:\n\n  alter table sequence_steps alter column hours_offset type numeric using hours_offset::numeric;\n\n  Then re-run this script.`,
        );
      }
    } else {
      console.log(`  ✓ created 15-min step (email + SMS)`);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

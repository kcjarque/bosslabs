#!/usr/bin/env node
/**
 * One-shot template updater.
 *
 *   node scripts/update-templates.mjs
 *
 * Rewrites all 5 email templates (and 5 SMS templates) with:
 *   - Identity-confirmation opening lines (avoid generic "Thanks, X" =
 *     better Gmail spam classification)
 *   - Visible unsubscribe link in footer using {{unsubscribeUrl}}
 *
 * Updates:
 *   1. /data/email_templates.json (dev JSON fallback)
 *   2. /data/sms_templates.json   (dev JSON fallback)
 *   3. Live Supabase rows via REST PATCH
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/* --------------------------------------------------------------------- */
/* New template content                                                  */
/* --------------------------------------------------------------------- */

const FOOTER_HTML = `<p style="font-size:11px;color:#9BA1AC;margin-top:24px;padding-top:16px;border-top:1px solid #E5E7EB;line-height:1.55"><strong>You&rsquo;re receiving this</strong> because you reserved a seat at the BOSSLABS AI webinar. If you&rsquo;d rather not hear from us, <a href="{{unsubscribeUrl}}" style="color:#9BA1AC;text-decoration:underline">unsubscribe here</a>. — BOSSLABS AI · Built in Manila</p>`;

const EMAIL = [
  {
    id: 'free_welcome',
    name: 'Free Registration Welcome',
    subject: 'You\'re in, {{firstName}} — your Zoom link is below',
    body: `<p style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#0093B8;margin:0 0 12px">BOSSLABS AI · You&rsquo;re in</p><h1 style="font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:36px;line-height:1.1;margin:0 0 16px">Hi {{firstName}} — your seat is confirmed.</h1><p style="font-size:16px;line-height:1.55;margin:0 0 16px">Save the date and bring one workflow you want to automate.</p><p style="font-size:16px;line-height:1.55;margin:0 0 24px"><strong>{{webinarDate}} · {{webinarTime}} {{webinarTimezone}}</strong></p><p style="margin:0 0 24px"><a href="{{zoomJoinUrl}}" style="background:#00B8E6;color:#06070A;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Join the Zoom call</a></p><p style="font-size:14px;line-height:1.5;color:#454A57;margin:0 0 8px">One more step — unlock your Free Gift (Claude Code Skills Pack) by joining the Messenger community:</p><p style="margin:0 0 32px"><a href="{{messengerGroupUrl}}" style="color:#0093B8">Join the BOSSLABS Messenger Community →</a></p><p style="font-size:12px;color:#6B6F7C">— Mikee &amp; Kyle</p>`,
  },
  {
    id: 'paid_confirmation',
    name: 'Paid Ticket Confirmation',
    subject: 'Ticket confirmed — see you on {{webinarDate}}',
    body: `<p style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#0093B8;margin:0 0 12px">Payment received · Seat locked</p><h1 style="font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:36px;line-height:1.1;margin:0 0 16px">Hi {{firstName}} — your BOSSLABS AI seat is confirmed.</h1><p style="font-size:16px;line-height:1.55;margin:0 0 16px">Below is everything you need to show up live.</p><p style="font-size:16px;line-height:1.55;margin:0 0 24px"><strong>Live on Zoom · {{webinarDate}} · {{webinarTime}} {{webinarTimezone}}</strong></p><p style="margin:0 0 24px"><a href="{{zoomJoinUrl}}" style="background:#00B8E6;color:#06070A;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Join the Zoom call</a></p><p style="font-size:14px;line-height:1.55;margin:0 0 8px"><strong>What&rsquo;s included</strong></p><ul style="font-size:14px;line-height:1.7;margin:0 0 24px;padding-left:20px"><li>Claude Code Skills pack (configs, prompts, reusable skills)</li><li>Founder Workflow Audit Checklist</li><li>7-day Zoom replay access</li><li>BOSSLABS Community access (Messenger + ongoing Q&amp;A)</li></ul><p style="font-size:14px;line-height:1.55;color:#454A57;margin:0 0 8px">Join the BOSSLABS Messenger community for reminders + post-event Q&amp;A:</p><p style="margin:0 0 32px"><a href="{{messengerGroupUrl}}" style="color:#0093B8">Join the Messenger Community →</a></p><p style="font-size:12px;color:#6B6F7C">— Mikee &amp; Kyle</p>`,
  },
  {
    id: 'reminder_24h',
    name: '24-Hour Reminder',
    subject: 'Tomorrow at {{webinarTime}} — BOSSLABS AI Webinar',
    body: `<p style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#0093B8;margin:0 0 12px">24-hour reminder</p><h1 style="font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:32px;line-height:1.15;margin:0 0 16px">Hi {{firstName}} — see you tomorrow.</h1><p style="font-size:16px;line-height:1.55;margin:0 0 16px">The webinar goes live <strong>{{webinarDate}} at {{webinarTime}} {{webinarTimezone}}</strong>. Show up 5 minutes early. Bring one workflow you want to automate.</p><p style="margin:0 0 24px"><a href="{{zoomJoinUrl}}" style="background:#00B8E6;color:#06070A;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Join the Zoom call</a></p><p style="font-size:12px;color:#6B6F7C">— Mikee &amp; Kyle</p>`,
  },
  {
    id: 'reminder_1h',
    name: '1-Hour Reminder',
    subject: 'Starting in 1 hour — {{webinarTime}} PHT',
    body: `<p style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#B61E1E;margin:0 0 12px">Starts in 1 hour</p><h1 style="font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:32px;line-height:1.15;margin:0 0 16px">{{firstName}} — the doors open in 60 minutes.</h1><p style="font-size:16px;line-height:1.55;margin:0 0 24px">Grab your laptop, open Zoom, and meet us 5 minutes before {{webinarTime}}.</p><p style="margin:0 0 24px"><a href="{{zoomJoinUrl}}" style="background:#00B8E6;color:#06070A;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Join the Zoom call</a></p><p style="font-size:12px;color:#6B6F7C">— Mikee &amp; Kyle</p>`,
  },
  {
    id: 'replay',
    name: 'Replay Available (7-day window)',
    subject: 'Replay is up — 7 days only, {{firstName}}',
    body: `<p style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#0093B8;margin:0 0 12px">Replay · 7-day window</p><h1 style="font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:32px;line-height:1.15;margin:0 0 16px">Hi {{firstName}} — your replay is up.</h1><p style="font-size:16px;line-height:1.55;margin:0 0 24px">After 7 days it comes down, so block off some time this week.</p><p style="margin:0 0 24px"><a href="{{replayUrl}}" style="background:#00B8E6;color:#06070A;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Watch the replay</a></p><p style="font-size:12px;color:#6B6F7C">— Mikee &amp; Kyle</p>`,
  },
];

// Wrap each body in the standard outer div + append the unsubscribe footer.
const WRAP = (inner) =>
  `<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0B0D12">${inner}${FOOTER_HTML}</div>`;

const SMS = [
  {
    id: 'free_welcome',
    name: 'Free Registration Welcome',
    body: 'BOSSLABS AI: Hi {{firstName}}! You\'re in for the webinar. Save the date {{webinarDate}} at {{webinarTime}}. Join the Messenger community for your Skills Pack: {{messengerGroupUrl}}',
  },
  {
    id: 'paid_confirmation',
    name: 'Paid Ticket Confirmation',
    body: 'BOSSLABS AI: Payment received. {{firstName}}, your seat is locked in for {{webinarDate}} at {{webinarTime}}. Zoom: {{zoomJoinUrl}}',
  },
  {
    id: 'reminder_24h',
    name: '24-Hour Reminder',
    body: 'BOSSLABS AI: Hi {{firstName}}! Tomorrow at {{webinarTime}} {{webinarTimezone}}. Join: {{zoomJoinUrl}}',
  },
  {
    id: 'reminder_1h',
    name: '1-Hour Reminder',
    body: 'BOSSLABS AI: Doors open in 60 min, {{firstName}}. Open Zoom now: {{zoomJoinUrl}}',
  },
  {
    id: 'replay',
    name: 'Replay Available',
    body: 'BOSSLABS AI: Replay is up for 7 days. Watch this week: {{replayUrl}}',
  },
];

/* --------------------------------------------------------------------- */
/* env + helpers                                                         */
/* --------------------------------------------------------------------- */

function loadEnv() {
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

async function patchSupabase(table, body, id) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${table}/${id} → ${r.status}: ${await r.text()}`);
  return r.json();
}

/* --------------------------------------------------------------------- */

async function main() {
  loadEnv();

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log('--- Email templates ---');
  const emailJsonOut = [];
  for (const t of EMAIL) {
    const html = WRAP(t.body);
    emailJsonOut.push({ id: t.id, name: t.name, subject: t.subject, html });
    await patchSupabase('email_templates', { name: t.name, subject: t.subject, html }, t.id);
    console.log(`  ✓ ${t.id.padEnd(20)} updated (html ${html.length} chars)`);
  }
  writeFileSync(
    resolve(process.cwd(), 'data/email_templates.json'),
    JSON.stringify(emailJsonOut, null, 2) + '\n',
  );
  console.log('  ✓ data/email_templates.json rewritten');

  console.log('--- SMS templates ---');
  const smsJsonOut = [];
  for (const t of SMS) {
    smsJsonOut.push({ id: t.id, name: t.name, body: t.body });
    await patchSupabase('sms_templates', { name: t.name, body: t.body }, t.id);
    console.log(`  ✓ ${t.id.padEnd(20)} updated`);
  }
  writeFileSync(
    resolve(process.cwd(), 'data/sms_templates.json'),
    JSON.stringify(smsJsonOut, null, 2) + '\n',
  );
  console.log('  ✓ data/sms_templates.json rewritten');

  console.log('\nDone. SQL migration in supabase/migrations/0001_init.sql still has');
  console.log('the OLD template bodies — that\'s fine, the live DB now matches the');
  console.log('updated copy. Re-run npm run db:scaffold only if you want to sync the');
  console.log('migration seed too (also runs ON CONFLICT DO UPDATE).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

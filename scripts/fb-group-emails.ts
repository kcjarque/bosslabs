/**
 * 1) Create a new "Join the Facebook Group" email template.
 * 2) Repoint the existing "join group" emails (free_welcome,
 *    paid_confirmation) from the old Messenger group to the Facebook group.
 *
 * Re-renders html from the markdown body (that's what the send pipeline
 * uses). Asserts each search string is found so a silent no-op is impossible.
 *
 * Usage: npx tsx scripts/fb-group-emails.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
try {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch {}

const FB_GROUP = 'https://www.facebook.com/share/g/18iYKmoNPc/';

function replaceOnce(body: string, find: string, repl: string, where: string): string {
  if (!body.includes(find)) {
    throw new Error(`[${where}] expected text not found:\n  "${find}"`);
  }
  return body.split(find).join(repl);
}

async function main() {
  const { saveEmailTemplate } = await import('../lib/db');
  const { getSupabase } = await import('../lib/supabase');
  const { renderEmailMarkdown } = await import('../lib/email-markdown');

  const sb = getSupabase();
  const { data: all, error } = await sb
    .from('email_templates')
    .select('id, name, subject, html, body');
  if (error) throw new Error(`read templates: ${error.message}`);
  const byId = new Map((all as any[]).map((t) => [t.id, t]));

  /* ---- 1) New standalone template ---------------------------------- */
  const newBody = [
    '^^BOSSLABS AI · Community^^',
    '# Come build with us, {{firstName}} 🚀',
    '',
    "There's a room where the real magic happens between events — and we'd love for you to be in it.",
    '',
    'Our private Facebook community is where founders and builders learning AI vibe coding hang out: sharing wins, asking questions, swapping ideas, and shipping real apps together.',
    '',
    "## What you'll get inside",
    "A place to get unstuck when you're deep in a build. A front-row seat to what everyone else is creating. And first dibs on events, replays, and the VibeCode Retreat.",
    '',
    "And the best part? **Real humans — we don't use AI bots. We personally read and reply.**",
    '',
    `[[Join the Facebook group]](${FB_GROUP})`,
    '',
    '---',
    '',
    'See you inside, {{firstName}}!',
  ].join('\n');

  await saveEmailTemplate({
    id: 'facebook_group',
    name: 'Join the Facebook Group',
    subject: '{{firstName}}, come join our Facebook community 💬',
    body: newBody,
    html: renderEmailMarkdown(newBody),
  });
  console.log('✅ created/updated template: facebook_group');

  /* ---- 2) free_welcome: Messenger group → Facebook group ----------- */
  const fw = byId.get('free_welcome');
  if (!fw) throw new Error('free_welcome not found');
  let fwBody = fw.body ?? '';
  fwBody = replaceOnce(
    fwBody,
    'One more step — unlock your Free Gift by joining the Messenger group:',
    'One more step — unlock your Free Gift by joining our Facebook community:',
    'free_welcome/intro',
  );
  fwBody = replaceOnce(
    fwBody,
    '[Join the BOSSLABS Messenger Group →]({{messengerGroupUrl}})',
    `[Join the BOSSLABS Facebook group →](${FB_GROUP})`,
    'free_welcome/link',
  );
  await saveEmailTemplate({ ...fw, body: fwBody, html: renderEmailMarkdown(fwBody) });
  console.log('✅ updated template: free_welcome');

  /* ---- 3) paid_confirmation: Messenger group → Facebook group ------ */
  const pc = byId.get('paid_confirmation');
  if (!pc) throw new Error('paid_confirmation not found');
  let pcBody = pc.body ?? '';
  pcBody = replaceOnce(
    pcBody,
    'BOSSLABS Community access (Messenger + ongoing Q&A).',
    'BOSSLABS Community access (Facebook group + ongoing Q&A).',
    'paid_confirmation/included',
  );
  pcBody = replaceOnce(
    pcBody,
    'Join the BOSSLABS Messenger group for reminders + post-event Q&A:',
    'Join the BOSSLABS Facebook group for reminders + post-event Q&A:',
    'paid_confirmation/intro',
  );
  pcBody = replaceOnce(
    pcBody,
    '[Join the Messenger Group →]({{messengerGroupUrl}})',
    `[Join the Facebook group →](${FB_GROUP})`,
    'paid_confirmation/link',
  );
  await saveEmailTemplate({ ...pc, body: pcBody, html: renderEmailMarkdown(pcBody) });
  console.log('✅ updated template: paid_confirmation');

  /* ---- verify (fresh read straight from the DB) -------------------- */
  const { data: after } = await sb
    .from('email_templates')
    .select('id, html, body')
    .in('id', ['facebook_group', 'free_welcome', 'paid_confirmation']);
  const check = (id: string) => {
    const t = (after as any[]).find((x) => x.id === id)!;
    const hasFb = (t.body ?? '').includes(FB_GROUP);
    const hasMsgr = /messenger/i.test(t.body ?? '');
    const htmlHasFb = (t.html ?? '').includes(FB_GROUP);
    console.log(`   ${id}: body→FB ${hasFb} | html→FB ${htmlHasFb} | still says "messenger"? ${hasMsgr}`);
  };
  console.log('\nVerification:');
  check('facebook_group');
  check('free_welcome');
  check('paid_confirmation');
}

main().catch((e) => {
  console.error('❌ failed:', e.message || e);
  process.exit(1);
});

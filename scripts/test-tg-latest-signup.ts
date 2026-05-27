/**
 * Manual diagnostic: dry-run the abandoned-checkout detector against live
 * data. Lists every registered checkout older than the grace period that
 * hasn't yet been notified, then fires one TG notification for the most
 * recent one (so you can see the message shape end-to-end).
 *
 * Usage: npx tsx scripts/test-tg-latest-signup.ts
 */

// Load env from .env.local manually (no dotenv dep).
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

import { getSignups } from '@/lib/db';
import { sendTelegram, esc } from '@/lib/telegram';

const GRACE_MINUTES = 30;

async function main() {
  const now = Date.now();
  const graceMs = GRACE_MINUTES * 60 * 1000;

  const all = await getSignups();
  const abandoned = all.filter((s) => {
    if (s.source !== 'paid') return false;
    if (s.status !== 'registered') return false;
    const age = now - new Date(s.createdAt).getTime();
    return age >= graceMs;
  });

  console.log(`Total signups: ${all.length}`);
  console.log(`Abandoned (>${GRACE_MINUTES}min, status=registered): ${abandoned.length}`);
  abandoned.slice(0, 5).forEach((s) => {
    const ageMin = Math.round((now - new Date(s.createdAt).getTime()) / 60000);
    console.log(`  - ${s.firstName} ${s.lastName ?? ''} | ${s.email} | ${ageMin}min old`);
  });

  if (!abandoned.length) {
    console.log('Nothing to send.');
    return;
  }

  // Send a test notification for the MOST RECENT abandoned signup so you
  // can see what the live trigger will look like. Doesn't mark notified.
  const s = abandoned[0];
  const fullName = `${s.firstName} ${s.lastName ?? ''}`.trim();
  const amt = s.amountCentavos
    ? `₱${(s.amountCentavos / 100).toLocaleString()}`
    : '₱0';
  const ageMin = Math.round((now - new Date(s.createdAt).getTime()) / 60000);

  const result = await sendTelegram(
    `🚨 <b>Abandoned checkout</b> (test — latest)\n\n` +
      `<b>${esc(fullName)}</b>\n` +
      `${esc(s.email)}\n` +
      (s.phone ? `${esc(s.phone)}\n` : '') +
      `Amount: <b>${amt}</b>${s.bumped ? ' (with bump)' : ''}\n` +
      `Stuck for ${ageMin} min`,
  );
  console.log('sendTelegram result:', result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

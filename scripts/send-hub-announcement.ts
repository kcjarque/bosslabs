/**
 * One-shot: announce the BossLabs Hub to every Vault buyer.
 * Recipients = paid signups where any of these hold:
 *   - metadata.otoConfirmed && (otoProduct === 'oto' || 'both')   — post-purchase OTO
 *   - metadata.externalId matches /VAULT/                          — standalone OTOX
 *   - metadata.vaultEmailSent                                      — bumped at checkout
 *
 * Run: npx tsx scripts/send-hub-announcement.ts            (dry run — prints + skips send)
 *      npx tsx scripts/send-hub-announcement.ts --send     (actually sends)
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

for (const line of readFileSync(resolve('.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

import { getSupabase } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';
import { renderEmailMarkdown } from '@/lib/email-markdown';

const HUB_URL = 'https://bosslabs-hub.vercel.app';

const SUBJECT = "Your AI Secrets Builder Vault — the BossLabs Hub is live";

function bodyFor(firstName: string): string {
  // Project's custom markdown — same flavor as the other transactional templates.
  return `^^BossLabs Hub · Now live^^
# Hi ${firstName}, the room is open.

When you grabbed the **AI Secrets Builder Vault** we promised this was just the start. Today we're plugging it into something bigger.

The **BossLabs Hub** is live — the private room where Vault members + BossLabs builders share wins, swap prompts, and ship together. Same cyan, same VibeCode energy, now with a real community wrapped around it.

[[Get into the Hub →]](${HUB_URL})

Use the email you bought the Vault with so we can verify your access.

See you inside.

— Mikey & Kyle`;
}

async function main() {
  const sb = getSupabase();
  const { data, error } = await sb.from('signups').select('id, first_name, last_name, email, metadata, created_at').eq('status', 'paid');
  if (error) throw new Error(error.message);

  const buyers: Array<{ email: string; firstName: string; why: string; createdAt: string }> = [];
  const seen = new Set<string>();
  for (const r of data || []) {
    const m = (r.metadata || {}) as Record<string, unknown>;
    const product = m.otoProduct as string | undefined;
    const otoConfirmed = m.otoConfirmed;
    const externalId = (m.otoExternalId as string) || (m.externalId as string) || '';
    let why = '';
    if (otoConfirmed && (product === 'oto' || product === 'both')) why = `oto-confirmed (${product})`;
    else if (/VAULT/i.test(externalId)) why = 'standalone OTOX VAULT';
    else if (m.vaultEmailSent) why = 'bumped — vaultEmailSent';
    if (!why) continue;
    const email = (r.email || '').toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const firstName = (r.first_name || '').trim() || 'there';
    buyers.push({ email, firstName, why, createdAt: r.created_at || '' });
  }

  console.log(`Found ${buyers.length} unique Vault buyers.`);
  const SEND = process.argv.includes('--send');
  if (!SEND) {
    console.log('DRY RUN — pass --send to actually send.');
    buyers.forEach((b) => console.log(' ', b.email.padEnd(38), '·', b.firstName, '·', b.why));
    return;
  }

  let sent = 0,
    skipped = 0,
    failed = 0;
  for (const b of buyers) {
    const html = renderEmailMarkdown(bodyFor(b.firstName));
    const r = await sendEmail({ to: b.email, subject: SUBJECT, html });
    if (r.ok) {
      sent++;
      console.log('✓ sent', b.email, r.id ? `(${r.id})` : '');
    } else {
      // sendEmail returns ok:false for suppressed/undeliverable — treat as skipped, not a hard fail.
      const isSuppression = /suppressed|undeliverable/i.test(r.error || '');
      if (isSuppression) {
        skipped++;
        console.log('— skipped', b.email, '·', r.error);
      } else {
        failed++;
        console.error('✗ failed', b.email, '·', r.error);
      }
    }
  }
  console.log();
  console.log(`Done. sent=${sent} skipped=${skipped} failed=${failed} (of ${buyers.length} total)`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});

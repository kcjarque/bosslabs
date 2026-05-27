/**
 * Backfill the `status` field for every metadata.adminSends entry by
 * asking Resend for the current state of each email id.
 *
 * Useful when:
 *   - The Resend webhook isn't configured (status pills always empty)
 *   - The webhook is configured but missed some events
 *   - You just shipped the status feature and want history retro-stamped
 *
 * Resend API: GET https://api.resend.com/emails/{id}
 *   Response includes `last_event` which is one of:
 *     sent, delivered, delivery_delayed, bounced, complained,
 *     opened, clicked
 *
 * Usage: npx tsx scripts/backfill-admin-send-statuses.ts
 *        [--dry-run]   — show what would change, no DB writes
 *        [--all]       — also refetch entries that already have a status
 *                        (default: only updates entries with no status)
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
  getSignups,
  updateAdminSendStatus,
  type AdminSendStatus,
} from '@/lib/db';

const DRY = process.argv.includes('--dry-run');
const REFRESH_ALL = process.argv.includes('--all');

type ResendEmailResponse = {
  last_event?: string;
  // Older API responses may instead have `status`
  status?: string;
};

async function fetchResendStatus(
  emailId: string,
  apiKey: string,
): Promise<{ status: AdminSendStatus; statusAt: string } | null> {
  const res = await fetch(`https://api.resend.com/emails/${emailId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 404) return null; // email id no longer in Resend (purged)
  if (!res.ok) {
    console.warn(`  Resend ${res.status} for ${emailId}`);
    return null;
  }
  const data = (await res.json()) as ResendEmailResponse;
  // Map Resend's event names to our internal status. delivery_delayed is
  // a transient state we don't model — leave the entry as 'sent'.
  const raw = (data.last_event || data.status || '').toLowerCase();
  const status = ((): AdminSendStatus | null => {
    if (raw === 'sent') return 'sent';
    if (raw === 'delivered') return 'delivered';
    if (raw === 'opened') return 'opened';
    if (raw === 'clicked') return 'clicked';
    if (raw === 'bounced') return 'bounced';
    if (raw === 'complained') return 'complained';
    return null;
  })();
  if (!status) return null;
  return { status, statusAt: new Date().toISOString() };
}

async function getResendKey(): Promise<string> {
  // Settings are stored in Supabase; fall back to env for local dev.
  // The Resend API key lives in settings.resend_api_key (server-only).
  const { getSettings } = await import('@/lib/db');
  const s = await getSettings();
  const key = s.resendApiKey || process.env.RESEND_API_KEY || '';
  if (!key) throw new Error('No RESEND API key configured');
  return key;
}

async function main() {
  const apiKey = await getResendKey();
  const signups = await getSignups();

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const signup of signups) {
    type Entry = {
      ts: string;
      channel: 'email' | 'sms';
      templateId: string;
      providerId?: string;
      status?: AdminSendStatus;
    };
    const meta = signup.metadata as { adminSends?: Entry[] } | undefined;
    const sends = meta?.adminSends ?? [];
    if (sends.length === 0) continue;

    for (const send of sends) {
      // Only Resend (email) has the GET-by-id endpoint; OneWaySMS doesn't.
      if (send.channel !== 'email') continue;
      if (!send.providerId) continue;
      if (send.status && !REFRESH_ALL) {
        skipped++;
        continue;
      }
      scanned++;

      const fetched = await fetchResendStatus(send.providerId, apiKey);
      if (!fetched) {
        missing++;
        continue;
      }

      console.log(
        `  ${signup.firstName} ${signup.lastName ?? ''} · ${send.providerId.slice(0, 8)}… → ${fetched.status}`,
      );

      if (!DRY) {
        await updateAdminSendStatus(
          signup.id,
          send.providerId,
          fetched.status,
          fetched.statusAt,
        );
      }
      updated++;
    }
  }

  console.log('');
  console.log(
    `Scanned ${scanned} · Updated ${updated} · Already had status ${skipped} · Resend had no info ${missing}`,
  );
  if (DRY) console.log('(dry-run: no DB writes)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

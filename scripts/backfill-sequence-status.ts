/**
 * One-time backfill: stamp real Resend delivery status onto sequence_sends
 * that were recorded before we started capturing the Resend message id.
 *
 * Resend's GET /emails list returns {id, to, created_at, last_event}. We
 * match each unstamped sequence_send (email_ok, no message id) to a Resend
 * email by recipient + closest created_at, then write its message id +
 * mapped status so the timeline shows Delivered/Bounced instead of "Sent".
 *
 * Usage: npx tsx scripts/backfill-sequence-status.ts          (dry run)
 *        npx tsx scripts/backfill-sequence-status.ts --apply  (writes)
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
try {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch {}

const APPLY = process.argv.includes('--apply');
const WINDOW_MS = 5 * 60 * 1000; // recipient match must be within 5 min of sent_at

function parseResendTs(s: string): number {
  // "2026-06-01 05:33:44.505557+00" → ISO
  return new Date(s.replace(' ', 'T').replace(/\+00$/, 'Z')).getTime();
}

/** Map Resend's last_event to our pill vocabulary. */
function mapStatus(lastEvent: string): string | null {
  switch (lastEvent) {
    case 'delivered':
      return 'delivered';
    case 'opened':
      return 'opened';
    case 'clicked':
      return 'clicked';
    case 'bounced':
    case 'suppressed': // on the suppression list → never reached the inbox
      return 'bounced';
    case 'complained':
      return 'complained';
    case 'sent':
    case 'delivery_delayed':
      return 'sent';
    default:
      return null;
  }
}

async function main() {
  const { getSupabase } = await import('../lib/supabase');
  const { getSettings } = await import('../lib/db');
  const sb = getSupabase();
  const key = (await getSettings()).resendApiKey;
  if (!key) throw new Error('no resendApiKey in settings');

  // 1) Page through Resend emails (newest first; `after=<oldest id>` walks
  //    older). Cap at 15 pages (1500 emails) as a backstop.
  type ResendEmail = { id: string; to: string[]; created_at: string; last_event: string };
  const byRecipient = new Map<string, Array<{ id: string; ts: number; lastEvent: string }>>();
  let oldestMs = Infinity;
  let total = 0;
  let after: string | null = null;
  for (let page = 0; page < 15; page++) {
    const url = `https://api.resend.com/emails?limit=100${after ? `&after=${after}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const json = (await res.json()) as { data: ResendEmail[]; has_more?: boolean };
    const data = json.data ?? [];
    if (data.length === 0) break;
    for (const e of data) {
      const to = (e.to?.[0] ?? '').toLowerCase();
      if (!to) continue;
      const ts = parseResendTs(e.created_at);
      oldestMs = Math.min(oldestMs, ts);
      if (!byRecipient.has(to)) byRecipient.set(to, []);
      byRecipient.get(to)!.push({ id: e.id, ts, lastEvent: e.last_event });
    }
    total += data.length;
    after = data[data.length - 1].id;
    if (!json.has_more) break;
  }
  console.log(`Resend emails fetched: ${total} (back to ${new Date(oldestMs).toISOString()})`);

  // 2) Unstamped sequence_sends (email accepted, no message id yet) + recipient.
  const { data: sends } = await sb
    .from('sequence_sends')
    .select('id, sent_at, signup_id, email_ok, email_message_id')
    .is('email_message_id', null)
    .eq('email_ok', true);
  const rows = (sends ?? []) as Array<{ id: string; sent_at: string; signup_id: string }>;
  // resolve recipient emails
  const signupIds = [...new Set(rows.map((r) => r.signup_id))];
  const { data: sigs } = await sb.from('signups').select('id, email').in('id', signupIds);
  const emailById = new Map((sigs ?? []).map((s: { id: string; email: string }) => [s.id, (s.email ?? '').toLowerCase()]));

  let matched = 0,
    outOfRange = 0,
    noMatch = 0;
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const email = emailById.get(r.signup_id);
    if (!email) continue;
    const sentMs = new Date(r.sent_at).getTime();
    const candidates = byRecipient.get(email) ?? [];
    // closest within window
    let best: { id: string; ts: number; lastEvent: string } | null = null;
    for (const c of candidates) {
      if (Math.abs(c.ts - sentMs) > WINDOW_MS) continue;
      if (!best || Math.abs(c.ts - sentMs) < Math.abs(best.ts - sentMs)) best = c;
    }
    if (!best) {
      if (sentMs < oldestMs) outOfRange++;
      else noMatch++;
      continue;
    }
    const status = mapStatus(best.lastEvent);
    if (!status) {
      noMatch++;
      continue;
    }
    counts[status] = (counts[status] ?? 0) + 1;
    matched++;
    if (APPLY) {
      await sb
        .from('sequence_sends')
        .update({ email_message_id: best.id, email_status: status, email_status_at: new Date(best.ts).toISOString() })
        .eq('id', r.id);
    }
  }

  console.log(`\nunstamped sequence email sends: ${rows.length}`);
  console.log(`  matched + ${APPLY ? 'updated' : 'would update'}: ${matched}`, counts);
  console.log(`  no Resend match (same window): ${noMatch}`);
  console.log(`  older than fetched window (can't reach): ${outOfRange}`);
  console.log(APPLY ? '\n✅ applied.' : '\n(dry run — pass --apply to write)');
}

main().catch((e) => {
  console.error('❌', e.message || e);
  process.exit(1);
});

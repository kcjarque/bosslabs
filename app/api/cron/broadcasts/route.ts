/**
 * Broadcast cron (SPEC §12.3) — runs every 10 min. Sends any scheduled_broadcasts
 * whose time has arrived to their target list, rendering the markdown body through
 * the full email pipeline (offer vars + tracked links) per recipient.
 *
 * Race-safe: each due row is claimed (status scheduled→sending via a conditional
 * update) before sending, so overlapping cron ticks never double-send. Sunset
 * contacts are excluded (the lifecycle cron parked them); unsubscribed/suppressed
 * are already refused by sendEmail. Email only for now (broadcasts are email copy).
 */
import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron';
import { getList, computeListMembers, type Signup } from '@/lib/db';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type BroadcastRow = {
  id: string;
  subject: string;
  body: string;
  channel: string;
  list_id: string | null;
};

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, skipped: 'no supabase' });

  const sb = getSupabase();
  const nowIso = new Date().toISOString();
  const { data } = await sb
    .from('scheduled_broadcasts')
    .select('id, subject, body, channel, list_id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(5);
  const due = (data ?? []) as BroadcastRow[];

  const results: Array<{ id: string; sent: number; total: number; status: string }> = [];

  for (const b of due) {
    // Claim it: only proceeds if THIS tick flips scheduled→sending.
    const { data: claimed } = await sb
      .from('scheduled_broadcasts')
      .update({ status: 'sending' })
      .eq('id', b.id)
      .eq('status', 'scheduled')
      .select('id');
    if (!claimed || claimed.length === 0) continue;

    const fail = async (why: string) => {
      await sb.from('scheduled_broadcasts').update({ status: 'failed' }).eq('id', b.id);
      results.push({ id: b.id, sent: 0, total: 0, status: `failed: ${why}` });
    };

    if (b.channel !== 'email') { await fail('only email broadcasts supported'); continue; }
    if (!b.list_id) { await fail('no list'); continue; }
    const list = await getList(b.list_id);
    if (!list) { await fail('list not found'); continue; }

    let members = await computeListMembers(list);
    // Exclude sunsetted contacts — the lifecycle cron parked them; don't wake them.
    const { data: sun } = await sb.from('signups').select('id').eq('send_state', 'sunset');
    const sunset = new Set((sun ?? []).map((r: { id: string }) => r.id));
    members = members.filter((m) => !sunset.has(m.id));

    let sent = 0;
    const sendOne = async (m: Signup) => {
      const res = await sendEmail({
        to: m.email,
        subject: b.subject,
        markdownBody: b.body,
        vars: { firstName: m.firstName || 'there', lastName: m.lastName || '', email: m.email },
      });
      if (res.ok) sent++;
    };
    const CONCURRENCY = 8;
    for (let i = 0; i < members.length; i += CONCURRENCY) {
      await Promise.all(members.slice(i, i + CONCURRENCY).map(sendOne));
    }

    await sb
      .from('scheduled_broadcasts')
      .update({ status: 'sent', sent_at: new Date().toISOString(), sent_count: sent, total_count: members.length })
      .eq('id', b.id);
    results.push({ id: b.id, sent, total: members.length, status: 'sent' });
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

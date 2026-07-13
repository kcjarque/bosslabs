/**
 * Broadcast cron (SPEC §12.3) — runs every 10 min. Sends any scheduled_broadcasts
 * whose time has arrived to their target list, rendering the markdown body through
 * the full email pipeline (offer vars + tracked links) per recipient.
 *
 * Crash/timeout safe:
 *   - Each row is claimed (status→'sending' + claimed_at) via a conditional update
 *     so concurrent ticks never both send.
 *   - `sent_contact_ids` is persisted after every batch, so if the function dies
 *     mid-send (Vercel SIGKILL at maxDuration, or a thrown DB error), a later tick
 *     RESUMES and skips everyone already delivered — never a double-send.
 *   - A 'sending' row whose claim is older than 15 min is reclaimable (the function
 *     that owned it died); `attempts` caps runaway retries at 3 → 'failed'.
 * Sunset contacts are excluded; unsubscribed/suppressed are refused by sendEmail.
 * Email only for now (broadcasts are email copy).
 */
import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron';
import { getList, computeListMembers, type Signup } from '@/lib/db';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const STALE_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const CONCURRENCY = 8;

type BroadcastRow = {
  id: string;
  subject: string;
  body: string;
  channel: string;
  list_id: string | null;
  sent_contact_ids: string[] | null;
  attempts: number | null;
};

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, skipped: 'no supabase' });

  const sb = getSupabase();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const staleIso = new Date(now - STALE_MS).toISOString();

  // Due = scheduled + time reached, OR a 'sending' row whose owner died (stale claim).
  const { data } = await sb
    .from('scheduled_broadcasts')
    .select('id, subject, body, channel, list_id, sent_contact_ids, attempts')
    .or(`and(status.eq.scheduled,scheduled_at.lte.${nowIso}),and(status.eq.sending,claimed_at.lt.${staleIso})`)
    .order('scheduled_at', { ascending: true })
    .limit(5);
  const due = (data ?? []) as BroadcastRow[];

  const results: Array<{ id: string; sent: number; total: number; status: string }> = [];

  for (const b of due) {
    const priorSent = b.sent_contact_ids ?? [];
    if ((b.attempts ?? 0) >= MAX_ATTEMPTS) {
      await sb.from('scheduled_broadcasts').update({ status: 'failed' }).eq('id', b.id);
      results.push({ id: b.id, sent: priorSent.length, total: 0, status: 'failed: max attempts' });
      continue;
    }

    // Claim: only the tick that flips scheduled→sending (or reclaims a stale
    // 'sending') proceeds. Concurrent ticks see 0 rows and skip.
    const { data: claimed } = await sb
      .from('scheduled_broadcasts')
      .update({ status: 'sending', claimed_at: nowIso, attempts: (b.attempts ?? 0) + 1 })
      .eq('id', b.id)
      .or(`status.eq.scheduled,and(status.eq.sending,claimed_at.lt.${staleIso})`)
      .select('id');
    if (!claimed || claimed.length === 0) continue;

    // Bad config → hard fail (reclaiming won't help).
    if (b.channel !== 'email' || !b.list_id) {
      await sb.from('scheduled_broadcasts').update({ status: 'failed' }).eq('id', b.id);
      results.push({ id: b.id, sent: priorSent.length, total: 0, status: 'failed: bad config' });
      continue;
    }

    try {
      const list = await getList(b.list_id);
      if (!list) throw new Error('list not found');
      const members = await computeListMembers(list);
      const { data: sun } = await sb.from('signups').select('id').eq('send_state', 'sunset');
      const sunset = new Set((sun ?? []).map((r: { id: string }) => r.id));
      const sentSet = new Set(priorSent);
      const audience = members.filter((m) => !sunset.has(m.id));
      const targets = audience.filter((m) => !sentSet.has(m.id));

      let progressed = [...priorSent];
      for (let i = 0; i < targets.length; i += CONCURRENCY) {
        const batch = targets.slice(i, i + CONCURRENCY);
        const okIds = (
          await Promise.all(
            batch.map(async (m: Signup) => {
              const res = await sendEmail({
                to: m.email,
                subject: b.subject,
                markdownBody: b.body,
                vars: { firstName: m.firstName || 'there', lastName: m.lastName || '', email: m.email },
              });
              return res.ok ? m.id : null;
            }),
          )
        ).filter((x): x is string => Boolean(x));
        if (okIds.length) {
          progressed = [...progressed, ...okIds];
          // Persist progress before the next batch so a crash resumes here.
          await sb.from('scheduled_broadcasts').update({ sent_contact_ids: progressed }).eq('id', b.id);
        }
      }

      await sb
        .from('scheduled_broadcasts')
        .update({ status: 'sent', sent_at: new Date().toISOString(), sent_count: progressed.length, total_count: audience.length })
        .eq('id', b.id);
      results.push({ id: b.id, sent: progressed.length, total: audience.length, status: 'sent' });
    } catch (err) {
      // Transient (list/DB) — leave it 'sending'; the stale-claim reclaims it in
      // 15 min and sent_contact_ids makes the resume skip already-delivered people.
      console.warn('[broadcasts] deferred, will reclaim:', b.id, err instanceof Error ? err.message : err);
      results.push({ id: b.id, sent: priorSent.length, total: 0, status: 'deferred' });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

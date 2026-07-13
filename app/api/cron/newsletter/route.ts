/**
 * Newsletter router (the "home base" brain) — runs hourly.
 *
 * Puts every live contact in exactly one send_state lane, derived from whether
 * they still have a FUTURE (unfired) step in any active sequence:
 *   - future SOS step        → in_sos          (newsletter paused)
 *   - else future finite step → in_sequence     (reminders / Track A-B / cart — not yet)
 *   - else                    → active_broadcast (enrolled in the Daily Seinfeld Newsletter)
 *
 * A "future step" = target time (before/after_event vs the event, after_subscribe
 * vs the contact's anchor) is still ahead of now. No sequence_sends lookup needed:
 * a step still to come means they're still in that flow.
 *
 * Pause/resume continuity: entering in_sos stamps newsletter_paused_at; leaving it
 * shifts the newsletter subscription's subscribed_at forward by the paused duration,
 * so a 60-day STORY resumes on the exact beat it paused on (no skipped chapters).
 *
 * SAFE BY DEFAULT: no-ops entirely unless "Daily Seinfeld Newsletter" is active,
 * and never touches in_winback/sunset (the lifecycle cron owns those lanes).
 */
import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron';
import {
  getActiveSequences,
  getSequenceSteps,
  getList,
  getEvent,
  computeListMembers,
  getSequenceSubscriptions,
  type SequenceModel,
  type SequenceStep,
} from '@/lib/db';
import { enrollByName } from '@/lib/sos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const NEWSLETTER = 'Daily Seinfeld Newsletter';
const HOUR = 3600_000;

function stepTargetMs(step: SequenceStep, anchorMs: number, eventStartMs: number | null): number | null {
  const off = step.hoursOffset * HOUR;
  if (step.scheduleType === 'before_event') return eventStartMs == null ? null : eventStartMs - off;
  if (step.scheduleType === 'after_event') return eventStartMs == null ? null : eventStartMs + off;
  return anchorMs + off; // after_subscribe
}

/** Signup ids that still have a future active step in any of the given sequences. */
async function busyIds(seqs: SequenceModel[], now: number): Promise<Set<string>> {
  const busy = new Set<string>();
  for (const seq of seqs) {
    const list = await getList(seq.listId);
    if (!list) continue;
    const steps = (await getSequenceSteps(seq.id)).filter((s) => s.active);
    if (steps.length === 0) continue;
    const event = seq.eventId ? await getEvent(seq.eventId) : null;
    const eventStartMs = event?.startsAtIso ? Date.parse(event.startsAtIso) : null;

    // audience = list members (anchor = createdAt) ∪ manual subs (anchor = subscribed_at)
    const anchors = new Map<string, number>();
    for (const m of await computeListMembers(list)) anchors.set(m.id, Date.parse(m.createdAt));
    for (const sub of await getSequenceSubscriptions(seq.id)) anchors.set(sub.signupId, Date.parse(sub.subscribedAt));

    for (const [id, anchorMs] of anchors) {
      if (Number.isNaN(anchorMs)) continue;
      for (const st of steps) {
        const t = stepTargetMs(st, anchorMs, eventStartMs);
        if (t != null && t > now) {
          busy.add(id);
          break;
        }
      }
    }
  }
  return busy;
}

type Row = {
  id: string;
  status: string | null;
  send_state: string | null;
  newsletter_paused_at: string | null;
  metadata: Record<string, unknown> | null;
};

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, skipped: 'no supabase' });

  const sb = getSupabase();
  const { data: nl } = await sb.from('sequences').select('id, active').eq('name', NEWSLETTER).maybeSingle();
  const newsletter = nl as { id: string; active: boolean } | null;
  if (!newsletter || !newsletter.active) {
    return NextResponse.json({ ok: true, skipped: 'newsletter inactive' });
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // Categorize active sequences (excluding the newsletter itself).
  const seqs = await getActiveSequences();
  const sosSeqs: SequenceModel[] = [];
  const finiteSeqs: SequenceModel[] = [];
  for (const s of seqs) {
    if (s.name === NEWSLETTER) continue;
    (s.name.startsWith('SOS ·') ? sosSeqs : finiteSeqs).push(s);
  }

  const sosBusy = await busyIds(sosSeqs, now);
  const finiteBusy = await busyIds(finiteSeqs, now);

  const { data: sigs } = await sb
    .from('signups')
    .select('id, status, send_state, newsletter_paused_at, metadata');
  const rows = (sigs ?? []) as Row[];
  const nlSubs = new Set((await getSequenceSubscriptions(newsletter.id)).map((s) => s.signupId));

  const totals = { scanned: rows.length, toSos: 0, toSequence: 0, toActive: 0, enrolled: 0, resumed: 0 };

  for (const r of rows) {
    if (r.status === 'unsubscribed') continue;
    const meta = (r.metadata ?? {}) as { emailSuppressed?: string; standaloneOto?: boolean };
    if (meta.emailSuppressed || meta.standaloneOto) continue;
    const state = r.send_state || 'active_broadcast';
    if (state === 'in_winback' || state === 'sunset') continue; // lifecycle owns these

    const desired = sosBusy.has(r.id) ? 'in_sos' : finiteBusy.has(r.id) ? 'in_sequence' : 'active_broadcast';

    if (desired === 'in_sos') {
      const patch: Record<string, unknown> = {};
      if (state !== 'in_sos') patch.send_state = 'in_sos';
      if (!r.newsletter_paused_at) patch.newsletter_paused_at = nowIso; // stamp pause start
      if (Object.keys(patch).length) {
        await sb.from('signups').update(patch).eq('id', r.id);
        totals.toSos++;
      }
    } else if (desired === 'in_sequence') {
      if (state !== 'in_sequence') {
        await sb.from('signups').update({ send_state: 'in_sequence' }).eq('id', r.id);
        totals.toSequence++;
      }
    } else {
      // active_broadcast — resume the newsletter, re-anchoring if we're leaving a pause.
      if (r.newsletter_paused_at && nlSubs.has(r.id)) {
        const pausedMs = Date.parse(r.newsletter_paused_at);
        if (!Number.isNaN(pausedMs)) {
          const shiftMs = now - pausedMs;
          const { data: subRow } = await sb
            .from('sequence_subscriptions')
            .select('id, subscribed_at')
            .eq('sequence_id', newsletter.id)
            .eq('signup_id', r.id)
            .maybeSingle();
          const sr = subRow as { id: string; subscribed_at: string } | null;
          if (sr) {
            const newAnchor = new Date(Date.parse(sr.subscribed_at) + shiftMs).toISOString();
            await sb.from('sequence_subscriptions').update({ subscribed_at: newAnchor }).eq('id', sr.id);
            totals.resumed++;
          }
        }
      }
      const patch: Record<string, unknown> = {};
      if (state !== 'active_broadcast') patch.send_state = 'active_broadcast';
      if (r.newsletter_paused_at) patch.newsletter_paused_at = null;
      if (Object.keys(patch).length) {
        await sb.from('signups').update(patch).eq('id', r.id);
        totals.toActive++;
      }
      if (!nlSubs.has(r.id)) {
        const ok = await enrollByName(NEWSLETTER, r.id);
        if (ok) {
          totals.enrolled++;
          nlSubs.add(r.id);
        }
      }
    }
  }

  return NextResponse.json({ ok: true, ...totals });
}

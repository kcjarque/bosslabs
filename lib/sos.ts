/**
 * Click-triggered SOS enrollment (SPEC §6–9). A click on an offer link enrolls
 * the contact into that offer's soap-opera (a after_subscribe sequence, dripped
 * by the normal sequences cron) — the payoff for the whole click-tagging layer.
 *
 * Guards, in order:
 *   1. Only retreat / dfy / vault have soap-operas (oto_1on1 lives inside Track A).
 *   2. The target sequence must be ACTIVE — every SOS/waitlist sequence ships
 *      INACTIVE, so nothing fires to real leads until Kyle flips it on. This also
 *      prevents an enrollment backlog: while inactive, we simply don't enroll.
 *   3. If the offer is on waitlist/closed, enroll into the one-shot WAITLIST
 *      sequence instead of the full SOS.
 *   4. Idempotent — a contact already subscribed is never re-enrolled, so
 *      repeat clicks can't restart the soap-opera from step 1.
 *
 * Best-effort: this runs on the /api/l click hot path and must never throw.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { subscribeToSequence, getSequenceSubscriptions } from './db';
import { getOffer } from './offers';

const SOS_MAP: Record<string, { sos: string; waitlist: string }> = {
  retreat: { sos: 'SOS · Retreat (click-triggered)', waitlist: 'Waitlist · Retreat' },
  dfy: { sos: 'SOS · DFY (click-triggered)', waitlist: 'Waitlist · DFY' },
  vault: { sos: 'SOS · Vault (click-triggered)', waitlist: 'Waitlist · Vault' },
};

async function findActiveSequenceByName(name: string): Promise<{ id: string; active: boolean } | null> {
  const { data } = await getSupabase()
    .from('sequences')
    .select('id, active')
    .eq('name', name)
    .maybeSingle();
  return (data as { id: string; active: boolean } | null) ?? null;
}

export async function enrollFromOfferClick(contactId: string | null, offerTag: string): Promise<void> {
  if (!isSupabaseConfigured() || !contactId) return;
  const map = SOS_MAP[offerTag];
  if (!map) return;
  try {
    const offer = await getOffer(offerTag);
    const open = !offer || offer.status === 'open';
    const target = await findActiveSequenceByName(open ? map.sos : map.waitlist);
    if (!target || !target.active) return; // dormant until Kyle activates it
    const subs = await getSequenceSubscriptions(target.id);
    if (subs.some((s) => s.signupId === contactId)) return; // already in — no restart
    await subscribeToSequence(target.id, contactId);
  } catch (err) {
    console.warn('[sos] enroll skipped:', err instanceof Error ? err.message : err);
  }
}

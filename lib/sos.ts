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

/**
 * Enroll a contact into a sequence by exact name. Shared by the SOS click
 * trigger, the vault-onboarding purchase hook, and the lifecycle cron.
 * Returns true only when a NEW subscription was created. No-op (returns false)
 * when: Supabase off, no contact, sequence missing/INACTIVE (dormant until Kyle
 * flips it on → no enrollment backlog), or the contact is already subscribed
 * (idempotent — never restarts a drip). Best-effort — never throws.
 */
export async function enrollByName(sequenceName: string, contactId: string | null): Promise<boolean> {
  if (!isSupabaseConfigured() || !contactId) return false;
  try {
    const target = await findActiveSequenceByName(sequenceName);
    if (!target || !target.active) return false;
    const subs = await getSequenceSubscriptions(target.id);
    if (subs.some((s) => s.signupId === contactId)) return false;
    await subscribeToSequence(target.id, contactId);
    return true;
  } catch (err) {
    console.warn('[enroll] skipped:', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function enrollFromOfferClick(contactId: string | null, offerTag: string): Promise<void> {
  const map = SOS_MAP[offerTag];
  if (!map) return; // only retreat/dfy/vault have soap-operas
  const offer = await getOffer(offerTag);
  const open = !offer || offer.status === 'open';
  await enrollByName(open ? map.sos : map.waitlist, contactId);
}

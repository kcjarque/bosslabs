/**
 * "Recovered" payment detection — a sale that came in AFTER the cart was
 * abandoned, so it must be tallied on the PAYMENT day (not the signup day)
 * and flagged orange in the UI.
 *
 * A paid signup is "recovered" when EITHER:
 *   1. it was paid on a later Manila calendar day than it signed up
 *      (abandoned, then paid the next day or later), OR
 *   2. a sales closer claimed the lead and it paid after the claim
 *      (passed in as `closerRecoveredIds` — signups with a closer commission).
 *
 * Recovered payments keep their original signup date + conversion credit
 * (cohort), but their cash/revenue is attributed to the day it actually
 * arrived. All of this is computed live from existing fields — no backfill
 * write needed; history recalculates automatically.
 */

import type { Signup } from './db';

const TZ = 'Asia/Manila';

/** YYYY-MM-DD in Asia/Manila. */
export function manilaDateStr(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: TZ });
}

function confirmationSentOf(s: Pick<Signup, 'metadata'>): string | undefined {
  return (s.metadata as { confirmationSent?: string } | undefined)?.confirmationSent;
}

/** The Manila day a signup actually paid (falls back to signup day). */
export function paymentDayOf(s: Pick<Signup, 'createdAt' | 'metadata'>): string {
  const cs = confirmationSentOf(s);
  return manilaDateStr(new Date(cs ?? s.createdAt));
}

/** The Manila day a signup registered. */
export function signupDayOf(s: Pick<Signup, 'createdAt'>): string {
  return manilaDateStr(new Date(s.createdAt));
}

const PAID = new Set(['paid', 'attended']);

/** Is this a recovered (abandoned-then-paid, or closer-claimed-then-paid) sale? */
export function isRecoveredPaid(
  s: Pick<Signup, 'id' | 'status' | 'createdAt' | 'metadata'>,
  closerRecoveredIds: Set<string>,
): boolean {
  if (!PAID.has(s.status)) return false;
  if (closerRecoveredIds.has(s.id)) return true;
  return paymentDayOf(s) > signupDayOf(s); // paid a later calendar day than signup
}

/** Set of recovered signup ids across a list (for the customers-table badge). */
export function recoveredIdSet(
  signups: Pick<Signup, 'id' | 'status' | 'createdAt' | 'metadata'>[],
  closerRecoveredIds: Set<string>,
): Set<string> {
  const out = new Set<string>();
  for (const s of signups) if (isRecoveredPaid(s, closerRecoveredIds)) out.add(s.id);
  return out;
}

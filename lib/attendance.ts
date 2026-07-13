/**
 * Event attendance (SPEC §1.2). Populated from a Zoom participant CSV (match by
 * email) with a manual per-contact toggle fallback. The +14h HOLD + Track A/B
 * branching that consume this are Phase 3 — here we own storage + import.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { findSignupByEmail } from './db';

/** Upsert one attendance record (unique on contact_id + event_id). */
export async function setAttendance(input: {
  contactId: string;
  eventId: string;
  attended: boolean;
  source: 'zoom_import' | 'manual';
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase()
    .from('event_attendance')
    .upsert(
      { contact_id: input.contactId, event_id: input.eventId, attended: input.attended, source: input.source },
      { onConflict: 'contact_id,event_id' },
    );
}

/** Extract every email from a pasted Zoom participant CSV and mark each matching
 *  signup as attended. Robust to Zoom's column layout — we just harvest emails. */
export async function importZoomAttendance(
  eventId: string,
  csv: string,
): Promise<{ total: number; matched: number; unmatched: string[] }> {
  const found = csv.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  const emails = Array.from(new Set(found.map((e) => e.toLowerCase())));
  let matched = 0;
  const unmatched: string[] = [];
  for (const email of emails) {
    const s = await findSignupByEmail(email).catch(() => null);
    if (s) {
      await setAttendance({ contactId: s.id, eventId, attended: true, source: 'zoom_import' });
      matched++;
    } else {
      unmatched.push(email);
    }
  }
  // Stamp the event as imported — even on 0 matches. Lets the attendance split
  // tell "imported, nobody matched" apart from "never imported": without this,
  // a zero-match import would look un-imported and, 14h later, sweep genuine
  // no-shows into the "thanks for attending" ladder.
  if (isSupabaseConfigured()) {
    await getSupabase()
      .from('events')
      .update({ attendance_imported_at: new Date().toISOString() })
      .eq('id', eventId);
  }
  return { total: emails.length, matched, unmatched };
}

/** How many attended a given event (for the admin banner / dashboard). */
export async function getEventAttendanceCount(eventId: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { count } = await getSupabase()
    .from('event_attendance')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('attended', true);
  return count ?? 0;
}

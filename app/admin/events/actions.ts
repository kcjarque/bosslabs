'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { addEvent, updateEvent, deleteEvent } from '@/lib/db';
import { combineLocalAndTimezone } from '@/lib/datetime';

export async function createEventAction(formData: FormData): Promise<void> {
  requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  // Form sends a wall-clock value from <input type="datetime-local">.
  // We combine it server-side with the chosen timezone to build the
  // proper ISO 8601 string with offset that gets stored.
  const startsAtLocal = String(formData.get('startsAtLocal') ?? '').trim();
  const timezone =
    String(formData.get('timezone') ?? 'Asia/Manila').trim() || 'Asia/Manila';
  const zoomJoinUrl = String(formData.get('zoomJoinUrl') ?? '').trim();
  if (!name || !startsAtLocal) throw new Error('Name and start time required');
  const startsAtIso = combineLocalAndTimezone(startsAtLocal, timezone);
  await addEvent({ name, startsAtIso, timezone, active: true, zoomJoinUrl });
  revalidatePath('/admin/events');
}

/**
 * Patch interface: accepts EITHER the new (localDateTime + timezone) form
 * coming from the calendar UI OR a pre-formed startsAtIso (for back-compat
 * with any callers that still pass ISO directly). Combining happens here
 * if needed.
 */
export async function updateEventAction(
  id: string,
  patch: {
    name?: string;
    startsAtIso?: string;
    startsAtLocal?: string;
    timezone?: string;
    active?: boolean;
    zoomJoinUrl?: string;
  },
): Promise<void> {
  requireAdmin();
  const finalPatch: {
    name?: string;
    startsAtIso?: string;
    timezone?: string;
    active?: boolean;
    zoomJoinUrl?: string;
  } = {};
  if (patch.name !== undefined) finalPatch.name = patch.name;
  if (patch.timezone !== undefined) finalPatch.timezone = patch.timezone;
  if (patch.active !== undefined) finalPatch.active = patch.active;
  if (patch.zoomJoinUrl !== undefined) finalPatch.zoomJoinUrl = patch.zoomJoinUrl;
  // Prefer the wall-clock + timezone path; fall back to raw ISO.
  if (patch.startsAtLocal !== undefined) {
    finalPatch.startsAtIso = combineLocalAndTimezone(
      patch.startsAtLocal,
      patch.timezone ?? 'Asia/Manila',
    );
  } else if (patch.startsAtIso !== undefined) {
    finalPatch.startsAtIso = patch.startsAtIso;
  }
  await updateEvent(id, finalPatch);
  revalidatePath('/admin/events');
}

export async function deleteEventAction(id: string): Promise<void> {
  requireAdmin();
  await deleteEvent(id);
  revalidatePath('/admin/events');
}

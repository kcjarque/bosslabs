'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { addEvent, updateEvent, deleteEvent } from '@/lib/db';

export async function createEventAction(formData: FormData): Promise<void> {
  requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  const startsAtIso = String(formData.get('startsAtIso') ?? '').trim();
  const timezone = String(formData.get('timezone') ?? 'Asia/Manila').trim() || 'Asia/Manila';
  if (!name || !startsAtIso) throw new Error('Name and start time required');
  await addEvent({ name, startsAtIso, timezone, active: true });
  revalidatePath('/admin/events');
}

export async function updateEventAction(
  id: string,
  patch: { name?: string; startsAtIso?: string; timezone?: string; active?: boolean },
): Promise<void> {
  requireAdmin();
  await updateEvent(id, patch);
  revalidatePath('/admin/events');
}

export async function deleteEventAction(id: string): Promise<void> {
  requireAdmin();
  await deleteEvent(id);
  revalidatePath('/admin/events');
}

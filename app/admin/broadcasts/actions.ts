'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { createScheduledBroadcast, cancelScheduledBroadcast } from '@/lib/broadcasts';

export type BroadcastFormResult = { ok: boolean; error?: string; message?: string } | null;

export async function scheduleBroadcastAction(
  _prev: BroadcastFormResult,
  fd: FormData,
): Promise<BroadcastFormResult> {
  requireAdmin();
  const subject = String(fd.get('subject') ?? '').trim();
  const body = String(fd.get('body') ?? '').trim();
  const listId = String(fd.get('listId') ?? '').trim();
  const when = String(fd.get('scheduledAt') ?? '').trim();
  const sendNow = fd.get('sendNow') === 'on';

  if (!subject) return { ok: false, error: 'Subject is required.' };
  if (!body) return { ok: false, error: 'Body is required.' };
  if (!listId) return { ok: false, error: 'Pick a list to send to.' };

  // datetime-local has no zone; treat the entered wall-clock as Asia/Manila (+08).
  const scheduledAt =
    sendNow || !when ? new Date().toISOString() : new Date(`${when}:00+08:00`).toISOString();
  if (Number.isNaN(Date.parse(scheduledAt))) return { ok: false, error: 'Invalid schedule time.' };

  const r = await createScheduledBroadcast({ subject, body, listId, scheduledAt });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath('/admin/broadcasts');
  return {
    ok: true,
    message: sendNow
      ? 'Queued — the cron sends it within ~10 minutes.'
      : `Scheduled for ${new Date(scheduledAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} (Manila).`,
  };
}

export async function cancelBroadcastAction(fd: FormData): Promise<void> {
  requireAdmin();
  const id = String(fd.get('id') ?? '');
  if (id) await cancelScheduledBroadcast(id);
  revalidatePath('/admin/broadcasts');
}

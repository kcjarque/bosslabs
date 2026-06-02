'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { createCloser, updateCloser } from '@/lib/closers';
import { saveSettings } from '@/lib/db';

export async function saveCloserSettingsAction(input: {
  holdHours: number;
  workStartHour: number;
  workEndHour: number;
}): Promise<{ ok: boolean; error?: string }> {
  requireAdmin();
  if (!(input.holdHours > 0)) return { ok: false, error: 'Hold hours must be greater than 0.' };
  if (!(input.workStartHour >= 0 && input.workEndHour <= 24 && input.workEndHour > input.workStartHour)) {
    return { ok: false, error: 'Work end must be after start (0–24).' };
  }
  await saveSettings({
    closerClaimHoldHours: input.holdHours,
    closerWorkStartHour: input.workStartHour,
    closerWorkEndHour: input.workEndHour,
  });
  revalidatePath('/admin/closers');
  revalidatePath('/admin/closers/settings');
  return { ok: true };
}

export async function createCloserAction(input: {
  name: string;
  username: string;
  email?: string;
  password: string;
  commissionPercent?: number;
}): Promise<{ ok: boolean; error?: string }> {
  requireAdmin();
  if (!input.name?.trim() || !input.username?.trim() || !input.password) {
    return { ok: false, error: 'Name, username and password are required.' };
  }
  try {
    await createCloser(input);
    revalidatePath('/admin/closers');
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    return { ok: false, error: /duplicate|unique/i.test(msg) ? 'That username is already taken.' : msg };
  }
}

export async function updateCloserAction(
  id: string,
  patch: { name?: string; email?: string; commissionPercent?: number; active?: boolean; password?: string },
): Promise<{ ok: boolean; error?: string }> {
  requireAdmin();
  try {
    await updateCloser(id, patch);
    revalidatePath('/admin/closers');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error' };
  }
}

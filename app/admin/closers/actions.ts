'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { createCloser, updateCloser } from '@/lib/closers';
import { saveSettings } from '@/lib/db';

export async function saveCloserSettingsAction(holdHours: number): Promise<{ ok: boolean; error?: string }> {
  requireAdmin();
  if (!(holdHours > 0)) return { ok: false, error: 'Hours must be greater than 0.' };
  await saveSettings({ closerClaimHoldHours: holdHours });
  revalidatePath('/admin/closers');
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

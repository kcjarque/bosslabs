'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { updateFunnel, type EventFunnelConfig } from '@/lib/db';

export async function updateFunnelAction(
  id: string,
  patch: {
    name?: string;
    active?: boolean;
    config?: EventFunnelConfig & Record<string, unknown>;
  },
): Promise<void> {
  requireAdmin();
  await updateFunnel(id, patch);
  revalidatePath('/admin/funnels');
  revalidatePath(`/admin/funnels/${id}`);
}

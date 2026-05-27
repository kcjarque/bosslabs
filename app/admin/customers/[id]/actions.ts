'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { subscribeToSequence, unsubscribeFromSequence } from '@/lib/db';

export async function subscribeCustomerAction(
  signupId: string,
  sequenceId: string,
): Promise<void> {
  requireAdmin();
  if (!signupId || !sequenceId) throw new Error('signupId + sequenceId required');
  await subscribeToSequence(sequenceId, signupId);
  revalidatePath(`/admin/customers/${signupId}`);
}

export async function unsubscribeCustomerAction(
  signupId: string,
  sequenceId: string,
): Promise<void> {
  requireAdmin();
  if (!signupId || !sequenceId) throw new Error('signupId + sequenceId required');
  await unsubscribeFromSequence(sequenceId, signupId);
  revalidatePath(`/admin/customers/${signupId}`);
}

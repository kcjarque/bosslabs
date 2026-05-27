'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { deleteSignups, subscribeManyToSequence } from '@/lib/db';

/**
 * Bulk-subscribe the given customers to a sequence. Server-side filter
 * skips anyone already covered by the sequence's list filter OR by an
 * existing manual subscription, so accidentally bulk-subscribing a list
 * that already feeds the sequence is a no-op rather than a noisy dupe.
 */
export async function bulkSubscribeAction(
  signupIds: string[],
  sequenceId: string,
): Promise<{ subscribed: number; skipped: number }> {
  requireAdmin();
  if (!sequenceId) throw new Error('sequenceId required');
  if (signupIds.length === 0) throw new Error('No customers selected');
  const result = await subscribeManyToSequence(sequenceId, signupIds);
  revalidatePath('/admin/customers');
  return result;
}

/**
 * Bulk-delete customers. Their sequence_sends + sequence_subscriptions +
 * page_views cascade via FK on delete. Email/SMS/TG history is gone.
 * Caller must confirm — there's no undo.
 */
export async function bulkDeleteAction(
  signupIds: string[],
): Promise<{ count: number }> {
  requireAdmin();
  if (signupIds.length === 0) throw new Error('No customers selected');
  const count = await deleteSignups(signupIds);
  revalidatePath('/admin/customers');
  return { count };
}

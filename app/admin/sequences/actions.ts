'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import {
  addSequence,
  updateSequence,
  deleteSequence,
  addSequenceStep,
  updateSequenceStep,
  deleteSequenceStep,
  type SequenceScheduleType,
} from '@/lib/db';

/* Sequences */

export async function createSequenceAction(formData: FormData): Promise<void> {
  requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  const listId = String(formData.get('listId') ?? '').trim();
  const eventId = String(formData.get('eventId') ?? '').trim() || null;
  const description = String(formData.get('description') ?? '').trim() || null;
  if (!name || !listId) throw new Error('Name and list required');
  await addSequence({ name, listId, eventId, description, active: true });
  revalidatePath('/admin/sequences');
}

export async function updateSequenceAction(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    listId?: string;
    eventId?: string | null;
    active?: boolean;
  },
): Promise<void> {
  requireAdmin();
  await updateSequence(id, patch);
  revalidatePath('/admin/sequences');
  revalidatePath(`/admin/sequences/${id}`);
}

export async function deleteSequenceAction(id: string): Promise<void> {
  requireAdmin();
  await deleteSequence(id);
  revalidatePath('/admin/sequences');
}

/* Sequence steps */

export async function createStepAction(input: {
  sequenceId: string;
  position: number;
  emailTemplateId: string | null;
  smsTemplateId: string | null;
  scheduleType: SequenceScheduleType;
  hoursOffset: number;
}): Promise<void> {
  requireAdmin();
  await addSequenceStep({ ...input, active: true });
  revalidatePath(`/admin/sequences/${input.sequenceId}`);
}

export async function updateStepAction(
  id: string,
  sequenceId: string,
  patch: {
    position?: number;
    emailTemplateId?: string | null;
    smsTemplateId?: string | null;
    scheduleType?: SequenceScheduleType;
    hoursOffset?: number;
    active?: boolean;
  },
): Promise<void> {
  requireAdmin();
  await updateSequenceStep(id, patch);
  revalidatePath(`/admin/sequences/${sequenceId}`);
}

export async function deleteStepAction(id: string, sequenceId: string): Promise<void> {
  requireAdmin();
  await deleteSequenceStep(id);
  revalidatePath(`/admin/sequences/${sequenceId}`);
}

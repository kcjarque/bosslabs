'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { addList, updateList, deleteList, type ListFilterType } from '@/lib/db';

const VALID_FILTERS: ListFilterType[] = [
  'all_paid',
  'all_registered',
  'all_free',
  'all_signups',
  'abandoned',
];

function parseFilterTypes(raw: FormDataEntryValue[]): ListFilterType[] {
  return raw
    .map((v) => String(v).trim())
    .filter((v): v is ListFilterType =>
      VALID_FILTERS.includes(v as ListFilterType),
    );
}

export async function createListAction(formData: FormData): Promise<void> {
  requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const filterTypes = parseFilterTypes(formData.getAll('filterTypes'));
  // Empty string from the "All events" option → null. Otherwise the chosen event UUID.
  const eventIdRaw = String(formData.get('eventId') ?? '').trim();
  const eventId = eventIdRaw || null;
  if (!name) throw new Error('Name required');
  if (filterTypes.length === 0) throw new Error('Pick at least one filter');
  await addList({ name, description, filterTypes, eventId });
  revalidatePath('/admin/lists');
}

export async function updateListAction(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    filterTypes?: ListFilterType[];
    eventId?: string | null;
  },
): Promise<void> {
  requireAdmin();
  if (patch.filterTypes !== undefined && patch.filterTypes.length === 0) {
    throw new Error('Pick at least one filter');
  }
  await updateList(id, patch);
  revalidatePath('/admin/lists');
}

export async function deleteListAction(id: string): Promise<void> {
  requireAdmin();
  await deleteList(id);
  revalidatePath('/admin/lists');
}

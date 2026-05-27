'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { addList, updateList, deleteList, type ListFilterType } from '@/lib/db';

export async function createListAction(formData: FormData): Promise<void> {
  requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const filterType = String(formData.get('filterType') ?? '').trim() as ListFilterType;
  if (!name || !filterType) throw new Error('Name and filter type required');
  await addList({ name, description, filterType });
  revalidatePath('/admin/lists');
}

export async function updateListAction(
  id: string,
  patch: { name?: string; description?: string | null; filterType?: ListFilterType },
): Promise<void> {
  requireAdmin();
  await updateList(id, patch);
  revalidatePath('/admin/lists');
}

export async function deleteListAction(id: string): Promise<void> {
  requireAdmin();
  await deleteList(id);
  revalidatePath('/admin/lists');
}

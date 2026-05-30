'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import {
  createAffiliate,
  updateAffiliate,
  markCommissionPaid,
  type CommissionType,
} from '@/lib/affiliates';

export async function createAffiliateAction(formData: FormData): Promise<void> {
  requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  const code = String(formData.get('code') ?? '').trim() || name;
  const email = String(formData.get('email') ?? '').trim();
  const commissionType = (String(formData.get('commissionType') ?? 'percent') as CommissionType);
  const raw = Number(formData.get('commissionValue') ?? 0);
  if (!name) throw new Error('Name is required');
  // Fixed amounts are entered in pesos → stored as centavos. Percent is stored as-is.
  const commissionValue = commissionType === 'fixed' ? Math.round(raw * 100) : raw;
  await createAffiliate({ code, name, email, commissionType, commissionValue });
  revalidatePath('/admin/affiliates');
}

export async function toggleAffiliateAction(formData: FormData): Promise<void> {
  requireAdmin();
  await updateAffiliate(String(formData.get('id') ?? ''), {
    active: formData.get('active') === '1',
  });
  revalidatePath('/admin/affiliates');
}

export async function markCommissionPaidAction(formData: FormData): Promise<void> {
  requireAdmin();
  await markCommissionPaid(String(formData.get('id') ?? ''));
  revalidatePath('/admin/affiliates');
}

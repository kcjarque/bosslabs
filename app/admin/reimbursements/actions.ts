'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAdminSession, type AdminSession } from '@/lib/admin-auth';
import {
  submitReimbursementRequest,
  deleteMyReimbursementRequest,
  updatePayoutSettings,
  type ReimbursementCategory,
} from '@/lib/reimbursements';
import { manilaToday } from '@/lib/finance';

function str(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === 'string' ? v : '';
}
function nullable(fd: FormData, k: string): string | null {
  const v = str(fd, k).trim();
  return v ? v : null;
}

/** Only a named staff account has its own claims/settings — the shared Admin
 *  login has no staff_accounts row to attach anything to. */
function requireStaffSession(): AdminSession & { id: string } {
  const session = getAdminSession();
  if (!session || session.role !== 'staff' || !session.id) redirect('/admin/reimbursements');
  return session as AdminSession & { id: string };
}

function refresh() {
  revalidatePath('/admin/reimbursements', 'layout');
}

const CATEGORIES: ReimbursementCategory[] = ['transport', 'meals', 'supplies', 'other'];

export async function submitReimbursementAction(fd: FormData) {
  const session = requireStaffSession();
  const category = str(fd, 'category');
  await submitReimbursementRequest({
    staffId: session.id,
    description: str(fd, 'description'),
    category: CATEGORIES.includes(category as ReimbursementCategory)
      ? (category as ReimbursementCategory)
      : 'other',
    amountCentavos: Math.round(Number(str(fd, 'amount')) * 100),
    spentOn: str(fd, 'spentOn') || manilaToday(),
    receiptUrl: nullable(fd, 'receiptUrl'),
  });
  refresh();
}

export async function deleteMyReimbursementAction(fd: FormData) {
  const session = requireStaffSession();
  const requestId = str(fd, 'requestId');
  if (requestId) await deleteMyReimbursementRequest(session.id, requestId);
  refresh();
}

export async function updatePayoutSettingsAction(fd: FormData) {
  const session = requireStaffSession();
  const method = str(fd, 'payoutMethod');
  if (method !== 'bank' && method !== 'gcash') redirect('/admin/reimbursements/settings');
  await updatePayoutSettings(session.id, {
    payoutMethod: method,
    bankName: str(fd, 'bankName'),
    bankAccountName: str(fd, 'bankAccountName'),
    bankAccountNumber: str(fd, 'bankAccountNumber'),
    gcashName: str(fd, 'gcashName'),
    gcashNumber: str(fd, 'gcashNumber'),
  });
  refresh();
}

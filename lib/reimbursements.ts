/**
 * Staff reimbursements — self-reported expense claims + admin payouts.
 *
 * Mirrors the closer commissions/payouts pattern (lib/closers.ts): staff
 * submit claims straight into the pending pool (no approval gate — same
 * trust model as commissions, which are also never individually reviewed
 * before payout). Admin tallies a staff member's pending claims, uploads a
 * payment slip, confirms — one payout row is created and those claims flip
 * pending → paid, linked by payout_id for an audit trail. Voiding reverts
 * them to pending.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { syncReimbursementPayoutExpense, removeReimbursementPayoutExpense } from './finance';

export type ReimbursementCategory = 'transport' | 'meals' | 'supplies' | 'other';

/* ---- Payout settings (where a staff member gets paid) -------------------- */

export type PayoutSettings = {
  payoutMethod: 'bank' | 'gcash' | null;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  gcashName: string;
  gcashNumber: string;
};

type StaffSettingsRow = {
  payout_method: 'bank' | 'gcash' | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  gcash_name: string | null;
  gcash_number: string | null;
};

function rowToSettings(r: StaffSettingsRow): PayoutSettings {
  return {
    payoutMethod: r.payout_method,
    bankName: r.bank_name ?? '',
    bankAccountName: r.bank_account_name ?? '',
    bankAccountNumber: r.bank_account_number ?? '',
    gcashName: r.gcash_name ?? '',
    gcashNumber: r.gcash_number ?? '',
  };
}

export async function getPayoutSettings(staffId: string): Promise<PayoutSettings | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabase()
    .from('staff_accounts')
    .select('payout_method, bank_name, bank_account_name, bank_account_number, gcash_name, gcash_number')
    .eq('id', staffId)
    .maybeSingle();
  return data ? rowToSettings(data as StaffSettingsRow) : null;
}

export async function updatePayoutSettings(
  staffId: string,
  input: {
    payoutMethod: 'bank' | 'gcash';
    bankName?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    gcashName?: string;
    gcashNumber?: string;
  },
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase()
    .from('staff_accounts')
    .update({
      payout_method: input.payoutMethod,
      bank_name: input.bankName?.trim() || null,
      bank_account_name: input.bankAccountName?.trim() || null,
      bank_account_number: input.bankAccountNumber?.trim() || null,
      gcash_name: input.gcashName?.trim() || null,
      gcash_number: input.gcashNumber?.trim() || null,
    })
    .eq('id', staffId);
  if (error) throw new Error(`updatePayoutSettings: ${error.message}`);
}

/* ---- Requests (expense claims) -------------------------------------------- */

export type ReimbursementRequest = {
  id: string;
  staffId: string;
  description: string;
  category: ReimbursementCategory;
  amountCentavos: number;
  spentOn: string; // YYYY-MM-DD
  receiptUrl: string | null;
  status: 'pending' | 'paid' | 'void';
  createdAt: string;
};

type RequestRow = {
  id: string;
  staff_id: string;
  description: string;
  category: ReimbursementCategory;
  amount_centavos: number | string;
  spent_on: string;
  receipt_url: string | null;
  status: 'pending' | 'paid' | 'void';
  created_at: string;
};

function rowToRequest(r: RequestRow): ReimbursementRequest {
  return {
    id: r.id,
    staffId: r.staff_id,
    description: r.description,
    category: r.category,
    amountCentavos: Number(r.amount_centavos),
    spentOn: r.spent_on,
    receiptUrl: r.receipt_url,
    status: r.status,
    createdAt: r.created_at,
  };
}

export async function submitReimbursementRequest(input: {
  staffId: string;
  description: string;
  category: ReimbursementCategory;
  amountCentavos: number;
  spentOn: string;
  receiptUrl?: string | null;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const description = input.description.trim();
  if (!description) throw new Error('Description is required.');
  if (!(input.amountCentavos > 0)) throw new Error('Amount must be greater than zero.');
  const { error } = await getSupabase().from('reimbursement_requests').insert({
    staff_id: input.staffId,
    description,
    category: input.category,
    amount_centavos: Math.round(input.amountCentavos),
    spent_on: input.spentOn,
    receipt_url: input.receiptUrl ?? null,
  });
  if (error) throw new Error(`submitReimbursementRequest: ${error.message}`);
}

export async function listMyReimbursementRequests(staffId: string): Promise<ReimbursementRequest[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('reimbursement_requests')
    .select('*')
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listMyReimbursementRequests: ${error.message}`);
  return (data as RequestRow[]).map(rowToRequest);
}

/** Delete a still-pending request — only the owner, only before it's paid.
 *  A basic typo/mistake fix, not a review workflow: once paid a request is
 *  locked into its payout's audit trail. */
export async function deleteMyReimbursementRequest(staffId: string, requestId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase()
    .from('reimbursement_requests')
    .delete()
    .eq('id', requestId)
    .eq('staff_id', staffId)
    .eq('status', 'pending');
}

/* ---- Admin — pending breakdown by staff ----------------------------------- */

export type PendingReimbursementGroup = {
  staffId: string;
  staffName: string;
  totalCentavos: number;
  requests: ReimbursementRequest[];
  /** Where to send the money — null if the staff member hasn't set it yet. */
  payoutSettings: PayoutSettings | null;
};

/** Every staff member with pending reimbursement claims, grouped — drives the
 *  admin Payable tab. Mirrors listPendingCommissionsByCloser. Includes each
 *  staff member's payout settings so admin knows where to send the money. */
export async function listPendingReimbursementsByStaff(): Promise<PendingReimbursementGroup[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from('reimbursement_requests')
    .select(
      '*, staff_accounts!inner(id, name, payout_method, bank_name, bank_account_name, bank_account_number, gcash_name, gcash_number)',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listPendingReimbursementsByStaff: ${error.message}`);
  const rows = (data ?? []) as Array<
    RequestRow & { staff_accounts: { id: string; name: string } & StaffSettingsRow }
  >;
  const byStaff = new Map<
    string,
    { staffName: string; requests: ReimbursementRequest[]; payoutSettings: PayoutSettings }
  >();
  for (const r of rows) {
    const entry =
      byStaff.get(r.staff_id) ??
      { staffName: r.staff_accounts.name, requests: [], payoutSettings: rowToSettings(r.staff_accounts) };
    entry.requests.push(rowToRequest(r));
    byStaff.set(r.staff_id, entry);
  }
  return [...byStaff.entries()]
    .map(([staffId, { staffName, requests, payoutSettings }]) => ({
      staffId,
      staffName,
      totalCentavos: requests.reduce((s, r) => s + r.amountCentavos, 0),
      requests,
      payoutSettings: payoutSettings.payoutMethod ? payoutSettings : null,
    }))
    .sort((a, b) => a.staffName.localeCompare(b.staffName));
}

/* ---- Payouts --------------------------------------------------------------- */

export type ReimbursementPayout = {
  id: string;
  staffId: string;
  amountCentavos: number;
  requestCount: number;
  slipUrl: string | null;
  slipFilename: string | null;
  note: string | null;
  status: 'paid' | 'voided';
  createdBy: string | null;
  paidAt: string;
  voidedAt: string | null;
};

type PayoutRow = {
  id: string;
  staff_id: string;
  amount_centavos: number | string;
  request_count: number;
  slip_url: string | null;
  slip_filename: string | null;
  note: string | null;
  status: 'paid' | 'voided';
  created_by: string | null;
  paid_at: string;
  voided_at: string | null;
};

function rowToPayout(r: PayoutRow): ReimbursementPayout {
  return {
    id: r.id,
    staffId: r.staff_id,
    amountCentavos: Number(r.amount_centavos),
    requestCount: r.request_count,
    slipUrl: r.slip_url,
    slipFilename: r.slip_filename,
    note: r.note,
    status: r.status,
    createdBy: r.created_by,
    paidAt: r.paid_at,
    voidedAt: r.voided_at,
  };
}

/** Create a payout for one staff member: tallies their currently-pending
 *  requests, inserts a payout row, then atomically flips those requests to
 *  status='paid' with their payout_id pointed at the new payout. Mirrors
 *  createCloserPayout. */
export async function createReimbursementPayout(input: {
  staffId: string;
  slipUrl?: string | null;
  slipFilename?: string | null;
  note?: string | null;
  createdBy?: string | null;
}): Promise<ReimbursementPayout> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
  const sb = getSupabase();
  // Re-pull at write time so a stale UI doesn't double-pay anything just paid
  // by another tab.
  const { data: pending, error: pendErr } = await sb
    .from('reimbursement_requests')
    .select('id, amount_centavos')
    .eq('staff_id', input.staffId)
    .eq('status', 'pending');
  if (pendErr) throw new Error(`createReimbursementPayout pending: ${pendErr.message}`);
  const rows = (pending ?? []) as Array<{ id: string; amount_centavos: number | string }>;
  if (rows.length === 0) throw new Error('No pending reimbursements to pay out');

  const total = rows.reduce((s, r) => s + Number(r.amount_centavos), 0);
  const requestIds = rows.map((r) => r.id);

  const { data: payoutRow, error: payErr } = await sb
    .from('reimbursement_payouts')
    .insert({
      staff_id: input.staffId,
      amount_centavos: total,
      request_count: rows.length,
      slip_url: input.slipUrl ?? null,
      slip_filename: input.slipFilename ?? null,
      note: input.note ?? null,
      created_by: input.createdBy ?? null,
    })
    .select('*')
    .single();
  if (payErr || !payoutRow) throw new Error(`createReimbursementPayout insert: ${payErr?.message ?? 'unknown'}`);

  const payout = rowToPayout(payoutRow as PayoutRow);

  const { error: updErr } = await sb
    .from('reimbursement_requests')
    .update({ status: 'paid', payout_id: payout.id })
    .in('id', requestIds);
  if (updErr) throw new Error(`createReimbursementPayout link: ${updErr.message}`);

  // Mirror into the expense ledger — best-effort, the payout is already done.
  try {
    const { data: s } = await sb.from('staff_accounts').select('name').eq('id', input.staffId).maybeSingle();
    await syncReimbursementPayoutExpense({
      payoutId: payout.id,
      staffName: (s as { name: string } | null)?.name ?? 'Staff',
      amountCentavos: payout.amountCentavos,
      requestCount: payout.requestCount,
      receiptUrl: payout.slipUrl,
      spentOn: new Date(payout.paidAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
      paidBy: payout.createdBy,
    });
  } catch (err) {
    console.warn('[reimbursements] syncReimbursementPayoutExpense skipped:', err instanceof Error ? err.message : err);
  }

  return payout;
}

/** Mark a payout voided + revert its requests back to 'pending'. The payout
 *  row stays for the audit log. Mirrors voidCloserPayout. */
export async function voidReimbursementPayout(payoutId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();
  await sb
    .from('reimbursement_requests')
    .update({ status: 'pending', payout_id: null })
    .eq('payout_id', payoutId);
  await sb
    .from('reimbursement_payouts')
    .update({ status: 'voided', voided_at: new Date().toISOString() })
    .eq('id', payoutId);
  try {
    await removeReimbursementPayoutExpense(payoutId);
  } catch (err) {
    console.warn('[reimbursements] removeReimbursementPayoutExpense skipped:', err instanceof Error ? err.message : err);
  }
}

export type PayoutWithStaff = ReimbursementPayout & { staffName: string };

export async function listReimbursementPayouts(): Promise<PayoutWithStaff[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from('reimbursement_payouts')
    .select('*, staff_accounts!inner(name)')
    .order('paid_at', { ascending: false });
  if (error) throw new Error(`listReimbursementPayouts: ${error.message}`);
  return ((data ?? []) as Array<PayoutRow & { staff_accounts: { name: string } | null }>).map((r) => ({
    ...rowToPayout(r),
    staffName: r.staff_accounts?.name ?? '—',
  }));
}

export async function listRequestsByPayout(payoutId: string): Promise<ReimbursementRequest[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('reimbursement_requests')
    .select('*')
    .eq('payout_id', payoutId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listRequestsByPayout: ${error.message}`);
  return (data as RequestRow[]).map(rowToRequest);
}

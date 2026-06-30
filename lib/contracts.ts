/**
 * Saveable contracts produced by the Contract Maker. Stored snapshot of the
 * form state + computed totals. Optional signup_id link for customer LTV.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { ContractFormData, ContractLineItem } from '@/lib/contract-defaults';

export type ContractStatus = 'draft' | 'sent' | 'signed' | 'cancelled';

export type Contract = {
  id: string;
  signupId: string | null;
  clientCompanyName: string;
  clientRepName: string;
  clientRepPosition: string;
  clientAddress: string;
  effectiveDate: string;
  optionId: string;
  lineItems: ContractLineItem[];
  governingVenue: string;
  requiresDownpayment: boolean;
  downpaymentMode: 'percent' | 'fixed';
  downpaymentPercent: number;
  downpaymentFixedCentavos: number;
  oneTimeTotalCentavos: number;
  monthlyTotalCentavos: number;
  status: ContractStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type ContractRow = {
  id: string;
  signup_id: string | null;
  client_company_name: string;
  client_rep_name: string | null;
  client_rep_position: string | null;
  client_address: string | null;
  effective_date: string;
  option_id: string;
  line_items: ContractLineItem[] | null;
  governing_venue: string | null;
  requires_downpayment: boolean;
  downpayment_mode: 'percent' | 'fixed';
  downpayment_percent: number | null;
  downpayment_fixed_centavos: number | null;
  one_time_total_centavos: number;
  monthly_total_centavos: number;
  status: ContractStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function rowToContract(r: ContractRow): Contract {
  return {
    id: r.id,
    signupId: r.signup_id,
    clientCompanyName: r.client_company_name,
    clientRepName: r.client_rep_name ?? '',
    clientRepPosition: r.client_rep_position ?? '',
    clientAddress: r.client_address ?? '',
    effectiveDate: r.effective_date,
    optionId: r.option_id,
    lineItems: r.line_items ?? [],
    governingVenue: r.governing_venue ?? '',
    requiresDownpayment: r.requires_downpayment,
    downpaymentMode: r.downpayment_mode,
    downpaymentPercent: r.downpayment_percent ?? 50,
    downpaymentFixedCentavos: r.downpayment_fixed_centavos ?? 0,
    oneTimeTotalCentavos: r.one_time_total_centavos,
    monthlyTotalCentavos: r.monthly_total_centavos,
    status: r.status,
    notes: r.notes ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Sum a contract's line items by kind. Stored on the row so the list page
 *  and customer-profile LTV calc don't re-parse line_items on every read. */
export function computeTotals(lineItems: ContractLineItem[]): {
  oneTimeCentavos: number;
  monthlyCentavos: number;
} {
  let oneTime = 0;
  let monthly = 0;
  for (const li of lineItems) {
    if (li.kind === 'monthly') monthly += li.amountCentavos || 0;
    else oneTime += li.amountCentavos || 0;
  }
  return { oneTimeCentavos: oneTime, monthlyCentavos: monthly };
}

function toRowPatch(form: Partial<ContractFormData> & { signupId?: string | null; status?: ContractStatus; notes?: string }): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (form.signupId !== undefined) patch.signup_id = form.signupId;
  if (form.clientCompanyName !== undefined) patch.client_company_name = form.clientCompanyName;
  if (form.clientRepName !== undefined) patch.client_rep_name = form.clientRepName || null;
  if (form.clientRepPosition !== undefined) patch.client_rep_position = form.clientRepPosition || null;
  if (form.clientAddress !== undefined) patch.client_address = form.clientAddress || null;
  if (form.effectiveDate !== undefined) patch.effective_date = form.effectiveDate;
  if (form.optionId !== undefined) patch.option_id = form.optionId;
  if (form.lineItems !== undefined) {
    patch.line_items = form.lineItems;
    const t = computeTotals(form.lineItems);
    patch.one_time_total_centavos = t.oneTimeCentavos;
    patch.monthly_total_centavos = t.monthlyCentavos;
  }
  if (form.governingVenue !== undefined) patch.governing_venue = form.governingVenue || null;
  if (form.requiresDownpayment !== undefined) patch.requires_downpayment = form.requiresDownpayment;
  if (form.downpaymentMode !== undefined) patch.downpayment_mode = form.downpaymentMode;
  if (form.downpaymentPercent !== undefined) patch.downpayment_percent = form.downpaymentPercent;
  if (form.downpaymentFixedCentavos !== undefined) patch.downpayment_fixed_centavos = form.downpaymentFixedCentavos;
  if (form.status !== undefined) patch.status = form.status;
  if (form.notes !== undefined) patch.notes = form.notes || null;
  patch.updated_at = new Date().toISOString();
  return patch;
}

export async function createContract(
  form: ContractFormData & { signupId?: string | null; status?: ContractStatus; notes?: string },
): Promise<Contract | null> {
  if (!isSupabaseConfigured()) return null;
  const patch = toRowPatch(form);
  // updated_at left to the trigger/default for inserts.
  delete patch.updated_at;
  const { data, error } = await getSupabase()
    .from('contracts')
    .insert(patch)
    .select('*')
    .single();
  if (error) throw new Error(`createContract: ${error.message}`);
  return rowToContract(data as ContractRow);
}

export async function updateContract(
  id: string,
  form: Partial<ContractFormData> & { signupId?: string | null; status?: ContractStatus; notes?: string },
): Promise<Contract | null> {
  if (!isSupabaseConfigured()) return null;
  const patch = toRowPatch(form);
  const { data, error } = await getSupabase()
    .from('contracts')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateContract: ${error.message}`);
  return rowToContract(data as ContractRow);
}

export async function getContract(id: string): Promise<Contract | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabase()
    .from('contracts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getContract: ${error.message}`);
  return data ? rowToContract(data as ContractRow) : null;
}

export async function listContracts(opts: { limit?: number; q?: string } = {}): Promise<Contract[]> {
  if (!isSupabaseConfigured()) return [];
  let q = getSupabase()
    .from('contracts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.q) {
    q = q.ilike('client_company_name', `%${opts.q}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`listContracts: ${error.message}`);
  return (data as ContractRow[]).map(rowToContract);
}

export async function listContractsForSignup(signupId: string): Promise<Contract[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('contracts')
    .select('*')
    .eq('signup_id', signupId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listContractsForSignup: ${error.message}`);
  return (data as ContractRow[]).map(rowToContract);
}

export async function deleteContract(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase().from('contracts').delete().eq('id', id);
  if (error) throw new Error(`deleteContract: ${error.message}`);
}

/** Annualised LTV-style projection for a single contract: one-time + 12mo
 *  retainer. Used by the customer profile "Contracts" section so a buyer
 *  on a ₱30K/mo retainer + ₱100K setup shows as ₱460K LTV from contracts. */
export function projectedAnnualContractValue(c: Contract): number {
  return c.oneTimeTotalCentavos + c.monthlyTotalCentavos * 12;
}

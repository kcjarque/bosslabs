/**
 * Saveable mutual NDAs produced by the NDA Maker. Stored snapshot of the
 * form state + optional signup_id for customer profile cross-linking.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { NdaFormData } from '@/lib/nda-defaults';

export type NdaStatus = 'draft' | 'sent' | 'signed' | 'cancelled';

export type Nda = {
  id: string;
  signupId: string | null;
  bosslabsOfficeAddress: string;
  bosslabsSecRegNo: string;
  counterpartyCompanyName: string;
  counterpartyOfficeAddress: string;
  counterpartyRepName: string;
  counterpartyRepPosition: string;
  counterpartyBusinessDescription: string;
  purposeDescription: string;
  effectiveDate: string;
  governingVenue: string;
  status: NdaStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type NdaRow = {
  id: string;
  signup_id: string | null;
  bosslabs_office_address: string | null;
  bosslabs_sec_reg_no: string | null;
  counterparty_company_name: string;
  counterparty_office_address: string | null;
  counterparty_rep_name: string | null;
  counterparty_rep_position: string | null;
  counterparty_business_description: string | null;
  purpose_description: string | null;
  effective_date: string;
  governing_venue: string;
  status: NdaStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function rowToNda(r: NdaRow): Nda {
  return {
    id: r.id,
    signupId: r.signup_id,
    bosslabsOfficeAddress: r.bosslabs_office_address ?? '',
    bosslabsSecRegNo: r.bosslabs_sec_reg_no ?? '',
    counterpartyCompanyName: r.counterparty_company_name,
    counterpartyOfficeAddress: r.counterparty_office_address ?? '',
    counterpartyRepName: r.counterparty_rep_name ?? '',
    counterpartyRepPosition: r.counterparty_rep_position ?? '',
    counterpartyBusinessDescription: r.counterparty_business_description ?? '',
    purposeDescription: r.purpose_description ?? '',
    effectiveDate: r.effective_date,
    governingVenue: r.governing_venue,
    status: r.status,
    notes: r.notes ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toRowPatch(
  form: Partial<NdaFormData> & { signupId?: string | null; status?: NdaStatus; notes?: string },
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (form.signupId !== undefined) patch.signup_id = form.signupId;
  if (form.bosslabsOfficeAddress !== undefined) patch.bosslabs_office_address = form.bosslabsOfficeAddress || null;
  if (form.bosslabsSecRegNo !== undefined) patch.bosslabs_sec_reg_no = form.bosslabsSecRegNo || null;
  if (form.counterpartyCompanyName !== undefined) patch.counterparty_company_name = form.counterpartyCompanyName;
  if (form.counterpartyOfficeAddress !== undefined) patch.counterparty_office_address = form.counterpartyOfficeAddress || null;
  if (form.counterpartyRepName !== undefined) patch.counterparty_rep_name = form.counterpartyRepName || null;
  if (form.counterpartyRepPosition !== undefined) patch.counterparty_rep_position = form.counterpartyRepPosition || null;
  if (form.counterpartyBusinessDescription !== undefined) patch.counterparty_business_description = form.counterpartyBusinessDescription || null;
  if (form.purposeDescription !== undefined) patch.purpose_description = form.purposeDescription || null;
  if (form.effectiveDate !== undefined) patch.effective_date = form.effectiveDate;
  if (form.governingVenue !== undefined) patch.governing_venue = form.governingVenue;
  if (form.status !== undefined) patch.status = form.status;
  if (form.notes !== undefined) patch.notes = form.notes || null;
  patch.updated_at = new Date().toISOString();
  return patch;
}

export async function createNda(
  form: NdaFormData & { signupId?: string | null; status?: NdaStatus; notes?: string },
): Promise<Nda | null> {
  if (!isSupabaseConfigured()) return null;
  const patch = toRowPatch(form);
  delete patch.updated_at;
  const { data, error } = await getSupabase()
    .from('ndas')
    .insert(patch)
    .select('*')
    .single();
  if (error) throw new Error(`createNda: ${error.message}`);
  return rowToNda(data as NdaRow);
}

export async function updateNda(
  id: string,
  form: Partial<NdaFormData> & { signupId?: string | null; status?: NdaStatus; notes?: string },
): Promise<Nda | null> {
  if (!isSupabaseConfigured()) return null;
  const patch = toRowPatch(form);
  const { data, error } = await getSupabase()
    .from('ndas')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateNda: ${error.message}`);
  return rowToNda(data as NdaRow);
}

export async function getNda(id: string): Promise<Nda | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabase()
    .from('ndas')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getNda: ${error.message}`);
  return data ? rowToNda(data as NdaRow) : null;
}

export async function listNdas(opts: { limit?: number; q?: string } = {}): Promise<Nda[]> {
  if (!isSupabaseConfigured()) return [];
  let q = getSupabase()
    .from('ndas')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.q) q = q.ilike('counterparty_company_name', `%${opts.q}%`);
  const { data, error } = await q;
  if (error) throw new Error(`listNdas: ${error.message}`);
  return (data as NdaRow[]).map(rowToNda);
}

export async function listNdasForSignup(signupId: string): Promise<Nda[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('ndas')
    .select('*')
    .eq('signup_id', signupId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listNdasForSignup: ${error.message}`);
  return (data as NdaRow[]).map(rowToNda);
}

export async function deleteNda(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase().from('ndas').delete().eq('id', id);
  if (error) throw new Error(`deleteNda: ${error.message}`);
}

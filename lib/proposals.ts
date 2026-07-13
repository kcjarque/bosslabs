/**
 * Saveable project proposals produced by the Proposal Maker. Sibling of
 * lib/contracts.ts — a stored snapshot of the form state plus the headline
 * investment figures. Optional signup_id link for customer LTV/context.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { ProposalFormData, ProposalModule } from '@/lib/proposal-defaults';

export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'declined';

export type Proposal = {
  id: string;
  signupId: string | null;
  clientCompanyName: string;
  clientRepName: string;
  clientRepPosition: string;
  clientAddress: string;
  platformName: string;
  clientVision: string;
  proposalNo: string;
  proposalDate: string;
  validityDays: number;
  optionId: string;
  modules: ProposalModule[];
  integrations: string[];
  aiPhase1: string[];
  aiPhase2: string[];
  shipLog: string[];
  kickoffDate: string;
  onboardingDays: number;
  workflowDays: number;
  mvpDays: number;
  dataMigrationDays: number;
  implementationDays: number;
  warrantyDays: number;
  trainingSessions: number;
  trainingMode: 'on-site' | 'online' | 'either';
  oneTimeTotalCentavos: number;
  monthlyRetainerCentavos: number;
  minRetainerMonths: number;
  exitFeeCentavos: number;
  status: ProposalStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type ProposalRow = {
  id: string;
  signup_id: string | null;
  client_company_name: string;
  client_rep_name: string | null;
  client_rep_position: string | null;
  client_address: string | null;
  platform_name: string | null;
  client_vision: string | null;
  proposal_no: string | null;
  proposal_date: string;
  validity_days: number;
  option_id: string;
  modules: ProposalModule[] | null;
  integrations: string[] | null;
  ai_phase1: string[] | null;
  ai_phase2: string[] | null;
  ship_log: string[] | null;
  kickoff_date: string | null;
  onboarding_days: number;
  workflow_days: number;
  mvp_days: number;
  data_migration_days: number;
  implementation_days: number;
  warranty_days: number;
  training_sessions: number;
  training_mode: 'on-site' | 'online' | 'either';
  one_time_total_centavos: number;
  monthly_retainer_centavos: number;
  min_retainer_months: number;
  exit_fee_centavos: number;
  status: ProposalStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function rowToProposal(r: ProposalRow): Proposal {
  return {
    id: r.id,
    signupId: r.signup_id,
    clientCompanyName: r.client_company_name,
    clientRepName: r.client_rep_name ?? '',
    clientRepPosition: r.client_rep_position ?? '',
    clientAddress: r.client_address ?? '',
    platformName: r.platform_name ?? '',
    clientVision: r.client_vision ?? '',
    proposalNo: r.proposal_no ?? '',
    proposalDate: r.proposal_date,
    validityDays: r.validity_days ?? 30,
    optionId: r.option_id,
    modules: r.modules ?? [],
    integrations: r.integrations ?? [],
    aiPhase1: r.ai_phase1 ?? [],
    aiPhase2: r.ai_phase2 ?? [],
    shipLog: r.ship_log ?? [],
    kickoffDate: r.kickoff_date ?? '',
    onboardingDays: r.onboarding_days ?? 2,
    workflowDays: r.workflow_days ?? 3,
    mvpDays: r.mvp_days ?? 4,
    dataMigrationDays: r.data_migration_days ?? 7,
    implementationDays: r.implementation_days ?? 30,
    warrantyDays: r.warranty_days ?? 60,
    trainingSessions: r.training_sessions ?? 2,
    trainingMode: r.training_mode ?? 'either',
    oneTimeTotalCentavos: r.one_time_total_centavos,
    monthlyRetainerCentavos: r.monthly_retainer_centavos,
    minRetainerMonths: r.min_retainer_months ?? 6,
    exitFeeCentavos: r.exit_fee_centavos,
    status: r.status,
    notes: r.notes ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toRowPatch(
  form: Partial<ProposalFormData> & { signupId?: string | null; status?: ProposalStatus; notes?: string; proposalNo?: string },
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (form.signupId !== undefined) patch.signup_id = form.signupId;
  if (form.clientCompanyName !== undefined) patch.client_company_name = form.clientCompanyName;
  if (form.clientRepName !== undefined) patch.client_rep_name = form.clientRepName || null;
  if (form.clientRepPosition !== undefined) patch.client_rep_position = form.clientRepPosition || null;
  if (form.clientAddress !== undefined) patch.client_address = form.clientAddress || null;
  if (form.platformName !== undefined) patch.platform_name = form.platformName || null;
  if (form.clientVision !== undefined) patch.client_vision = form.clientVision || null;
  if (form.proposalNo !== undefined) patch.proposal_no = form.proposalNo || null;
  if (form.proposalDate !== undefined) patch.proposal_date = form.proposalDate;
  if (form.validityDays !== undefined) patch.validity_days = form.validityDays;
  if (form.optionId !== undefined) patch.option_id = form.optionId;
  if (form.modules !== undefined) patch.modules = form.modules;
  if (form.integrations !== undefined) patch.integrations = form.integrations;
  if (form.aiPhase1 !== undefined) patch.ai_phase1 = form.aiPhase1;
  if (form.aiPhase2 !== undefined) patch.ai_phase2 = form.aiPhase2;
  if (form.shipLog !== undefined) patch.ship_log = form.shipLog;
  if (form.kickoffDate !== undefined) patch.kickoff_date = form.kickoffDate || null;
  if (form.onboardingDays !== undefined) patch.onboarding_days = form.onboardingDays;
  if (form.workflowDays !== undefined) patch.workflow_days = form.workflowDays;
  if (form.mvpDays !== undefined) patch.mvp_days = form.mvpDays;
  if (form.dataMigrationDays !== undefined) patch.data_migration_days = form.dataMigrationDays;
  if (form.implementationDays !== undefined) patch.implementation_days = form.implementationDays;
  if (form.warrantyDays !== undefined) patch.warranty_days = form.warrantyDays;
  if (form.trainingSessions !== undefined) patch.training_sessions = form.trainingSessions;
  if (form.trainingMode !== undefined) patch.training_mode = form.trainingMode;
  if (form.oneTimeTotalCentavos !== undefined) patch.one_time_total_centavos = form.oneTimeTotalCentavos;
  if (form.monthlyRetainerCentavos !== undefined) patch.monthly_retainer_centavos = form.monthlyRetainerCentavos;
  if (form.minRetainerMonths !== undefined) patch.min_retainer_months = form.minRetainerMonths;
  if (form.exitFeeCentavos !== undefined) patch.exit_fee_centavos = form.exitFeeCentavos;
  if (form.status !== undefined) patch.status = form.status;
  if (form.notes !== undefined) patch.notes = form.notes || null;
  patch.updated_at = new Date().toISOString();
  return patch;
}

/** PROP-YYMMDD- prefix for a given ISO date. NN is appended by the caller. */
function proposalNoPrefix(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00`);
  const base = Number.isNaN(d.getTime()) ? new Date() : d;
  const yy = String(base.getFullYear()).slice(2);
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  const dd = String(base.getDate()).padStart(2, '0');
  return `PROP-${yy}${mm}${dd}-`;
}

/** Next sequence number for a proposal dated `dateIso` — counts existing rows
 *  sharing the same PROP-YYMMDD- prefix so numbering restarts each day. */
async function nextProposalNo(dateIso: string): Promise<string> {
  const prefix = proposalNoPrefix(dateIso);
  const { count, error } = await getSupabase()
    .from('proposals')
    .select('id', { count: 'exact', head: true })
    .ilike('proposal_no', `${prefix}%`);
  if (error) throw new Error(`nextProposalNo: ${error.message}`);
  return `${prefix}${String((count ?? 0) + 1).padStart(2, '0')}`;
}

export async function createProposal(
  form: ProposalFormData & { signupId?: string | null; status?: ProposalStatus; notes?: string },
): Promise<Proposal | null> {
  if (!isSupabaseConfigured()) return null;
  const patch = toRowPatch(form);
  // updated_at left to the trigger/default for inserts.
  delete patch.updated_at;
  // Always assign the authoritative proposal number server-side, ignoring any
  // provisional value the form may have carried.
  const dateIso = typeof form.proposalDate === 'string' && form.proposalDate ? form.proposalDate : new Date().toISOString().slice(0, 10);
  patch.proposal_no = await nextProposalNo(dateIso);
  const { data, error } = await getSupabase()
    .from('proposals')
    .insert(patch)
    .select('*')
    .single();
  if (error) throw new Error(`createProposal: ${error.message}`);
  return rowToProposal(data as ProposalRow);
}

export async function updateProposal(
  id: string,
  form: Partial<ProposalFormData> & { signupId?: string | null; status?: ProposalStatus; notes?: string },
): Promise<Proposal | null> {
  if (!isSupabaseConfigured()) return null;
  const patch = toRowPatch(form);
  const { data, error } = await getSupabase()
    .from('proposals')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateProposal: ${error.message}`);
  return rowToProposal(data as ProposalRow);
}

export async function getProposal(id: string): Promise<Proposal | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabase()
    .from('proposals')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getProposal: ${error.message}`);
  return data ? rowToProposal(data as ProposalRow) : null;
}

export async function listProposals(opts: { limit?: number; q?: string } = {}): Promise<Proposal[]> {
  if (!isSupabaseConfigured()) return [];
  let q = getSupabase()
    .from('proposals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.q) {
    q = q.ilike('client_company_name', `%${opts.q}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`listProposals: ${error.message}`);
  return (data as ProposalRow[]).map(rowToProposal);
}

export async function deleteProposal(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase().from('proposals').delete().eq('id', id);
  if (error) throw new Error(`deleteProposal: ${error.message}`);
}

/** Annualised value projection for a proposal: one-time + 12mo retainer.
 *  Mirrors projectedAnnualContractValue so the list page can total pipeline. */
export function projectedAnnualProposalValue(p: Proposal): number {
  return p.oneTimeTotalCentavos + p.monthlyRetainerCentavos * 12;
}

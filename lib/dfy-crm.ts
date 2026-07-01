/**
 * DFY (Done-For-You) CRM — a standalone kanban of service prospects moving
 * through Discovery Call → Contract Sent → Follow Up → Contract Signing →
 * Onboarding. Manual cards (not auto-populated from signups). One-tap SMS via
 * the board's sms: link.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { getSignups } from './db';
import { DFY_STAGES, type DfyStage, type DfyCard } from './dfy-stages';
import { createProject } from './dfy';

export { DFY_STAGES, DFY_STAGE_META, type DfyStage, type DfyCard } from './dfy-stages';

type DfyPayment = { amountCentavos: number; at: string; note?: string };

type DfyRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  stage: string;
  position: number;
  amount_centavos: number | null;
  payments: DfyPayment[] | null;
  paid_at: string | null;
  dfy_ops_project_id: string | null;
  created_at: string;
  updated_at: string;
};

function rowToCard(r: DfyRow): DfyCard {
  const payments = Array.isArray(r.payments) ? r.payments : [];
  const collected = payments.reduce((s, p) => s + (p.amountCentavos || 0), 0);
  const deal = r.amount_centavos ?? 0;
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? '',
    email: r.email ?? '',
    note: r.note ?? '',
    stage: (DFY_STAGES as readonly string[]).includes(r.stage) ? (r.stage as DfyStage) : 'discovery_call',
    position: r.position ?? 0,
    amountCentavos: r.amount_centavos ?? null,
    collectedCentavos: collected,
    paidInFull: deal > 0 && collected >= deal,
    paidAt: r.paid_at ?? null,
    payments,
    dfyOpsProjectId: r.dfy_ops_project_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Idempotent: if the CRM card already has a linked DFY Ops project, returns
 *  its id. Otherwise creates a new dfy_projects row (lane='lite', customer
 *  name from the CRM card) and stashes the id back on the CRM row.
 *
 *  Called on every stage-transition-to-onboarding path so a card that
 *  bounces out and back doesn't spawn duplicates. Also exposed to the UI
 *  as a manual button for pre-existing Onboarding cards. */
export async function ensureDfyOpsProjectForCard(cardId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data: card, error } = await sb
    .from('dfy_crm_cards')
    .select('id, name, dfy_ops_project_id')
    .eq('id', cardId)
    .maybeSingle();
  if (error) throw new Error(`ensureDfyOpsProject read: ${error.message}`);
  if (!card) return null;
  const existing = (card as { dfy_ops_project_id?: string | null }).dfy_ops_project_id;
  if (existing) return existing;
  const project = await createProject({
    customerName: (card as { name: string }).name || 'DFY customer',
    lane: 'lite',
  });
  if (!project) return null;
  const { error: linkErr } = await sb
    .from('dfy_crm_cards')
    .update({ dfy_ops_project_id: project.id, updated_at: new Date().toISOString() })
    .eq('id', cardId);
  if (linkErr) throw new Error(`ensureDfyOpsProject link: ${linkErr.message}`);
  return project.id;
}

export async function listDfyCards(): Promise<DfyCard[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('dfy_crm_cards')
    .select('*')
    .order('stage', { ascending: true })
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listDfyCards: ${error.message}`);
  return ((data as DfyRow[]) ?? []).map(rowToCard);
}

export async function addDfyCard(input: {
  name: string;
  phone?: string;
  email?: string;
  note?: string;
  amountCentavos?: number | null;
  stage?: DfyStage;
}): Promise<DfyCard> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
  const { data, error } = await getSupabase()
    .from('dfy_crm_cards')
    .insert({
      name: input.name,
      phone: input.phone ?? '',
      email: input.email ?? '',
      note: input.note ?? '',
      amount_centavos: input.amountCentavos ?? null,
      stage: input.stage ?? 'discovery_call',
    })
    .select('*')
    .single();
  if (error) throw new Error(`addDfyCard: ${error.message}`);
  return rowToCard(data as DfyRow);
}

export async function updateDfyCard(
  id: string,
  patch: {
    stage?: DfyStage;
    note?: string;
    name?: string;
    phone?: string;
    email?: string;
    amountCentavos?: number | null;
    position?: number;
  },
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.stage !== undefined) row.stage = patch.stage;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.amountCentavos !== undefined) row.amount_centavos = patch.amountCentavos;
  if (patch.position !== undefined) row.position = patch.position;
  const { error } = await getSupabase().from('dfy_crm_cards').update(row).eq('id', id);
  if (error) throw new Error(`updateDfyCard: ${error.message}`);
  // Onboarding transition → auto-create the delivery-kanban card (idempotent).
  // Runs best-effort AFTER the stage flip so a failure here doesn't block the
  // stage move itself; the manual "Create DFY Ops card" button covers retries.
  if (patch.stage === 'onboarding') {
    try {
      await ensureDfyOpsProjectForCard(id);
    } catch (err) {
      console.warn('[dfy-crm] ensureDfyOpsProject on stage change failed:', err);
    }
  }
}

export async function deleteDfyCard(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase().from('dfy_crm_cards').delete().eq('id', id);
  if (error) throw new Error(`deleteDfyCard: ${error.message}`);
}

/** Set/edit the contract price (centavos) on a DFY card. */
export async function setDfyDealAmount(id: string, centavos: number): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase()
    .from('dfy_crm_cards')
    .update({ amount_centavos: Math.max(0, Math.round(centavos)), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`setDfyDealAmount: ${error.message}`);
}

/**
 * Log a (partial or full) DFY cash payment. Appends to the payments log; once
 * collected reaches the contract price it stamps paid_at and advances the card
 * to Onboarding. This log is the single source of truth for DFY income.
 */
export async function logDfyPayment(id: string, centavos: number, note?: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const amount = Math.max(0, Math.round(centavos));
  if (amount <= 0) return;
  const sb = getSupabase();
  const { data, error: readErr } = await sb
    .from('dfy_crm_cards')
    .select('amount_centavos, payments, paid_at, stage')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new Error(`logDfyPayment read: ${readErr.message}`);
  const payments = (Array.isArray(data?.payments) ? data!.payments : []) as DfyPayment[];
  payments.push({ amountCentavos: amount, at: new Date().toISOString(), note: note?.trim() || undefined });
  const collected = payments.reduce((s, p) => s + (p.amountCentavos || 0), 0);
  const deal = (data?.amount_centavos as number | null) ?? 0;
  const patch: Record<string, unknown> = { payments, updated_at: new Date().toISOString() };
  const autoAdvanceToOnboarding = deal > 0 && collected >= deal;
  if (autoAdvanceToOnboarding) {
    patch.paid_at = (data?.paid_at as string | null) ?? new Date().toISOString();
    patch.stage = 'onboarding';
  }
  const { error } = await sb.from('dfy_crm_cards').update(patch).eq('id', id);
  if (error) throw new Error(`logDfyPayment: ${error.message}`);
  // Same idempotent auto-create hook as the drag-drop stage change.
  if (autoAdvanceToOnboarding) {
    try {
      await ensureDfyOpsProjectForCard(id);
    } catch (err) {
      console.warn('[dfy-crm] ensureDfyOpsProject on final-payment auto-advance failed:', err);
    }
  }
}

/** Mark a DFY card paid in full — logs a payment for the remaining balance. */
export async function markDfyPaidInFull(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();
  const { data } = await sb
    .from('dfy_crm_cards')
    .select('amount_centavos, payments')
    .eq('id', id)
    .maybeSingle();
  const payments = (Array.isArray(data?.payments) ? data!.payments : []) as DfyPayment[];
  const collected = payments.reduce((s, p) => s + (p.amountCentavos || 0), 0);
  const deal = (data?.amount_centavos as number | null) ?? 0;
  const remaining = Math.max(0, deal - collected);
  if (remaining <= 0) return; // no contract price set, or already fully collected
  await logDfyPayment(id, remaining, 'Marked paid in full');
}

/**
 * DFY income — cash actually collected from the DFY payments log, period-scoped
 * by each payment's timestamp. Used by the dashboard Income section. Kept
 * separate from ROAS/daily (back-end income).
 */
export async function sumDfyIncomeCentavos(sinceMs?: number, untilMs?: number): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { data, error } = await getSupabase().from('dfy_crm_cards').select('payments');
  if (error) return 0;
  let total = 0;
  for (const row of (data ?? []) as { payments: DfyPayment[] | null }[]) {
    for (const p of row.payments ?? []) {
      const t = Date.parse(p.at);
      if (sinceMs != null && t < sinceMs) continue;
      if (untilMs != null && t >= untilMs) continue;
      total += p.amountCentavos || 0;
    }
  }
  return total;
}

/** Existing customers (signups) for the "add from existing customer" search. */
export type DfyCandidate = { id: string; name: string; email: string; phone: string };
export async function listDfyCandidates(): Promise<DfyCandidate[]> {
  const signups = await getSignups();
  return signups.map((s) => ({
    id: s.id,
    name: `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || s.email,
    email: s.email ?? '',
    phone: s.phone ?? '',
  }));
}

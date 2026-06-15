/**
 * DFY (Done-For-You) CRM — a standalone kanban of service prospects moving
 * through Discovery Call → Contract Sent → Follow Up → Contract Signing →
 * Onboarding. Manual cards (not auto-populated from signups). One-tap SMS via
 * the board's sms: link.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { DFY_STAGES, type DfyStage, type DfyCard } from './dfy-stages';

export { DFY_STAGES, DFY_STAGE_META, type DfyStage, type DfyCard } from './dfy-stages';

type DfyRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  stage: string;
  position: number;
  amount_centavos: number | null;
  created_at: string;
  updated_at: string;
};

function rowToCard(r: DfyRow): DfyCard {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? '',
    email: r.email ?? '',
    note: r.note ?? '',
    stage: (DFY_STAGES as readonly string[]).includes(r.stage) ? (r.stage as DfyStage) : 'discovery_call',
    position: r.position ?? 0,
    amountCentavos: r.amount_centavos ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
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
}

export async function deleteDfyCard(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase().from('dfy_crm_cards').delete().eq('id', id);
  if (error) throw new Error(`deleteDfyCard: ${error.message}`);
}

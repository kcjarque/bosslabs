/**
 * Order-bump CRM — a kanban board of people to follow up with, with one-tap
 * SMS (opens the phone's Messages app via an sms: link with the template +
 * their name filled in).
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { CRM_STAGES, type CrmStage, type CrmCard } from './crm-stages';

export { CRM_STAGES, CRM_STAGE_META, type CrmStage, type CrmCard } from './crm-stages';

type CrmRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  stage: string;
  position: number;
  signup_id: string | null;
  created_at: string;
};

function rowToCard(r: CrmRow): CrmCard {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? '',
    email: r.email ?? '',
    note: r.note ?? '',
    stage: (CRM_STAGES as readonly string[]).includes(r.stage) ? (r.stage as CrmStage) : 'new',
    position: r.position ?? 0,
    signupId: r.signup_id,
    createdAt: r.created_at,
  };
}

export async function listCrmCards(): Promise<CrmCard[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('crm_cards')
    .select('*')
    .order('stage', { ascending: true })
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listCrmCards: ${error.message}`);
  return (data as CrmRow[]).map(rowToCard);
}

export async function addCrmCard(input: {
  name: string;
  phone?: string;
  email?: string;
  note?: string;
  stage?: CrmStage;
}): Promise<CrmCard> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
  const { data, error } = await getSupabase()
    .from('crm_cards')
    .insert({
      name: input.name,
      phone: input.phone ?? '',
      email: input.email ?? '',
      note: input.note ?? '',
      stage: input.stage ?? 'new',
    })
    .select('*')
    .single();
  if (error) throw new Error(`addCrmCard: ${error.message}`);
  return rowToCard(data as CrmRow);
}

export async function updateCrmCard(
  id: string,
  patch: Partial<Pick<CrmCard, 'name' | 'phone' | 'email' | 'note' | 'stage' | 'position'>>,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.stage !== undefined) row.stage = patch.stage;
  if (patch.position !== undefined) row.position = patch.position;
  const { error } = await getSupabase().from('crm_cards').update(row).eq('id', id);
  if (error) throw new Error(`updateCrmCard: ${error.message}`);
}

export async function deleteCrmCard(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase().from('crm_cards').delete().eq('id', id);
}

export async function getCrmTemplate(): Promise<string> {
  if (!isSupabaseConfigured()) return '';
  const { data } = await getSupabase().from('crm_config').select('sms_template').eq('id', 1).maybeSingle();
  return data?.sms_template ?? '';
}

export async function saveCrmTemplate(template: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase().from('crm_config').upsert({ id: 1, sms_template: template });
}

/** Pull paid customers onto the board (deduped by signup_id). Returns added count. */
export async function importPaidCustomers(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const sb = getSupabase();
  const { data: paid, error: paidErr } = await sb
    .from('signups')
    .select('id, first_name, last_name, email, phone, status')
    .in('status', ['paid', 'attended']);
  if (paidErr) throw new Error(`importPaidCustomers (read signups): ${paidErr.message}`);
  if (!paid || paid.length === 0) return 0;

  // Dedup against signup_ids already on the board. We can't use upsert's
  // ON CONFLICT here: the unique index on signup_id is partial
  // (WHERE signup_id IS NOT NULL), which Postgres won't accept as an
  // ON CONFLICT inference target. Filtering client-side then inserting is
  // simpler and the partial index still backstops true duplicates.
  const { data: existing, error: exErr } = await sb
    .from('crm_cards')
    .select('signup_id')
    .not('signup_id', 'is', null);
  if (exErr) throw new Error(`importPaidCustomers (read board): ${exErr.message}`);
  const onBoard = new Set((existing ?? []).map((r) => r.signup_id as string));

  const rows = paid
    .filter((s) => !onBoard.has(s.id))
    .map((s) => ({
      name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || 'Customer',
      phone: s.phone ?? '',
      email: s.email ?? '',
      stage: 'new',
      signup_id: s.id,
    }));
  if (rows.length === 0) return 0;

  const { data: inserted, error: insErr } = await sb.from('crm_cards').insert(rows).select('id');
  if (insErr) throw new Error(`importPaidCustomers (insert): ${insErr.message}`);
  return inserted?.length ?? 0;
}

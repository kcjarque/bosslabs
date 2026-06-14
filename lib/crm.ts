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
    amountCentavos: null,
    remarks: '',
    eventStartsAt: null,
  };
}

/**
 * Order-bump board: ONLY customers who actually took the OTO, each with the
 * total they paid (main + OTO). We resolve bump status + amount from the
 * linked signup at read time, then drop anyone who didn't bump — so the board
 * is a live check of order-bump buyers. (Same otoConfirmed gate the dashboard
 * + customer table use, so amounts agree.)
 */
export async function listCrmCards(): Promise<CrmCard[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from('crm_cards')
    .select('*')
    .order('stage', { ascending: true })
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listCrmCards: ${error.message}`);
  const rows = (data as CrmRow[]) ?? [];

  const signupIds = [...new Set(rows.map((r) => r.signup_id).filter(Boolean))] as string[];
  const bump = new Map<string, { total: number; remarks: string; eventStartsAt: string | null }>();
  if (signupIds.length) {
    const { data: sigs } = await sb
      .from('signups')
      .select('id, bumped, amount_centavos, metadata, event_id')
      .in('id', signupIds);
    const sigRows = (sigs ?? []) as Array<{
      id: string;
      bumped: boolean | null;
      amount_centavos: number | null;
      metadata: Record<string, unknown> | null;
      event_id: string | null;
    }>;
    // Resolve each signup's event → its start date (the webinar they joined).
    const eventIds = [...new Set(sigRows.map((s) => s.event_id).filter(Boolean))] as string[];
    const eventStart = new Map<string, string>();
    if (eventIds.length) {
      const { data: evs } = await sb.from('events').select('id, starts_at_iso').in('id', eventIds);
      for (const e of (evs ?? []) as Array<{ id: string; starts_at_iso: string | null }>) {
        if (e.starts_at_iso) eventStart.set(e.id, e.starts_at_iso);
      }
    }
    for (const s of sigRows) {
      if (!s.bumped) continue; // only order-bump buyers land on this board
      const meta = (s.metadata ?? {}) as { otoConfirmed?: string; otoAmount?: number; remarks?: string };
      const otoExtra = meta.otoConfirmed && meta.otoAmount ? meta.otoAmount * 100 : 0;
      bump.set(s.id, {
        total: (s.amount_centavos ?? 0) + otoExtra,
        remarks: meta.remarks ?? '',
        eventStartsAt: s.event_id ? eventStart.get(s.event_id) ?? null : null,
      });
    }
  }

  return rows
    .filter((r) => r.signup_id && bump.has(r.signup_id))
    .map((r) => {
      const card = rowToCard(r);
      const b = bump.get(r.signup_id!)!;
      card.amountCentavos = b.total;
      card.remarks = b.remarks;
      card.eventStartsAt = b.eventStartsAt;
      return card;
    });
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

/**
 * Auto-add a single new paid customer to the board the moment they pay.
 * Idempotent (deduped by signup_id) and NEVER throws — it's called from the
 * payment webhook / checkout, so a CRM hiccup must never break a payment.
 */
export async function syncCrmCardForSignup(input: {
  signupId: string;
  name: string;
  phone?: string;
  email?: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const sb = getSupabase();
    const { data: existing } = await sb
      .from('crm_cards')
      .select('id')
      .eq('signup_id', input.signupId)
      .maybeSingle();
    if (existing) return; // already on the board
    await sb.from('crm_cards').insert({
      name: input.name.trim() || 'Customer',
      phone: input.phone ?? '',
      email: input.email ?? '',
      stage: 'new',
      signup_id: input.signupId,
    });
  } catch (err) {
    console.warn('[crm] syncCrmCardForSignup skipped:', err instanceof Error ? err.message : err);
  }
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

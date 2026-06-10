/**
 * VibeCode Retreat CRM — a kanban of retreat leads. Mirrors the order-bump
 * CRM, but fed by retreat_reservations:
 *   - reserved (no payment yet)      → "Interested"
 *   - paid (proof submitted)         → auto-advanced to "Paid"
 * The team can also add people manually (promote anyone who expressed interest)
 * and drag through the later stages. Sync runs on read so the board self-heals.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { getSignups } from './db';
import { RETREAT_CRM_STAGES, type RetreatCrmStage, type RetreatCrmCard } from './retreat-crm-stages';

export {
  RETREAT_CRM_STAGES,
  RETREAT_CRM_STAGE_META,
  type RetreatCrmStage,
  type RetreatCrmCard,
} from './retreat-crm-stages';

type CardRow = {
  id: string;
  reservation_id: string | null;
  name: string;
  email: string;
  phone: string;
  stage: string;
  position: number;
  note: string;
  created_at: string;
};

type ResRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  amount_due_centavos: number | null;
  payment_method: string | null;
};

/** A reservation counts as paid once it has either an uploaded bank-transfer
 *  proof OR a cleared Xendit card payment. */
function isResPaid(status: string | undefined): boolean {
  return status === 'proof_submitted' || status === 'paid';
}

function rowToCard(r: CardRow, res?: ResRow): RetreatCrmCard {
  const paid = isResPaid(res?.status);
  return {
    id: r.id,
    reservationId: r.reservation_id ?? null,
    name: r.name || res?.name || '',
    phone: r.phone || res?.phone || '',
    email: r.email || res?.email || '',
    note: r.note ?? '',
    stage: (RETREAT_CRM_STAGES as readonly string[]).includes(r.stage)
      ? (r.stage as RetreatCrmStage)
      : 'interested',
    position: r.position ?? 0,
    paid,
    amountCentavos: res?.amount_due_centavos ?? null,
    method: res?.payment_method ?? null,
    createdAt: r.created_at,
  };
}

export async function listRetreatCrmCards(): Promise<RetreatCrmCard[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();

  const [{ data: resv }, { data: cardRows }] = await Promise.all([
    sb
      .from('retreat_reservations')
      .select('id, name, email, phone, status, amount_due_centavos, payment_method'),
    sb.from('retreat_crm_cards').select('*'),
  ]);
  const reservations = (resv ?? []) as ResRow[];
  const resById = new Map(reservations.map((r) => [r.id, r]));
  let cards = (cardRows ?? []) as CardRow[];
  const haveResIds = new Set(cards.map((c) => c.reservation_id).filter(Boolean));

  // Sync 1 — every reservation gets a card (Interested, or Paid if already paid).
  const toInsert = reservations
    .filter((r) => !haveResIds.has(r.id))
    .map((r) => ({
      reservation_id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      stage: isResPaid(r.status) ? 'paid' : 'interested',
    }));
  if (toInsert.length) {
    const { data: inserted } = await sb
      .from('retreat_crm_cards')
      .upsert(toInsert, { onConflict: 'reservation_id' })
      .select('*');
    if (inserted) cards = cards.concat(inserted as CardRow[]);
  }

  // Sync 2 — auto-advance: an "interested" card whose reservation is now paid → "paid".
  for (const c of cards) {
    if (c.reservation_id && c.stage === 'interested' && isResPaid(resById.get(c.reservation_id)?.status)) {
      await sb.from('retreat_crm_cards').update({ stage: 'paid' }).eq('id', c.id);
      c.stage = 'paid';
    }
  }

  return cards
    .map((c) => rowToCard(c, c.reservation_id ? resById.get(c.reservation_id) : undefined))
    .sort((a, b) => a.stage.localeCompare(b.stage) || a.position - b.position);
}

/** A pickable customer for the "Promote someone interested" search box. */
export type RetreatCrmCandidate = { id: string; name: string; email: string; phone: string };

/**
 * The customer list that powers the promote-search in the board. Drawn from the
 * same signups the Customers page shows, so the team searches one source of truth
 * instead of retyping names. Name falls back to email when a row has no name.
 */
export async function listRetreatCrmCandidates(): Promise<RetreatCrmCandidate[]> {
  const signups = await getSignups();
  return signups.map((s) => ({
    id: s.id,
    name: `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || s.email,
    email: s.email ?? '',
    phone: s.phone ?? '',
  }));
}

export async function addRetreatCrmCard(input: {
  name: string;
  email?: string;
  phone?: string;
  stage?: RetreatCrmStage;
}): Promise<RetreatCrmCard> {
  const { data, error } = await getSupabase()
    .from('retreat_crm_cards')
    .insert({
      name: input.name,
      email: input.email ?? '',
      phone: input.phone ?? '',
      stage: input.stage ?? 'interested',
    })
    .select('*')
    .single();
  if (error) throw new Error(`addRetreatCrmCard: ${error.message}`);
  return rowToCard(data as CardRow);
}

export async function updateRetreatCrmCard(
  id: string,
  patch: Partial<Pick<RetreatCrmCard, 'name' | 'phone' | 'email' | 'note' | 'stage' | 'position'>>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.stage !== undefined) row.stage = patch.stage;
  if (patch.position !== undefined) row.position = patch.position;
  if (Object.keys(row).length === 0) return;
  const { error } = await getSupabase().from('retreat_crm_cards').update(row).eq('id', id);
  if (error) throw new Error(`updateRetreatCrmCard: ${error.message}`);
}

export async function deleteRetreatCrmCard(id: string): Promise<void> {
  await getSupabase().from('retreat_crm_cards').delete().eq('id', id);
}

/** SMS template for the retreat board (crm_config row id=2; order-bump uses id=1). */
export async function getRetreatCrmTemplate(): Promise<string> {
  if (!isSupabaseConfigured()) return RETREAT_TEMPLATE_DEFAULT;
  const { data } = await getSupabase().from('crm_config').select('sms_template').eq('id', 2).maybeSingle();
  return (data?.sms_template as string | undefined) ?? RETREAT_TEMPLATE_DEFAULT;
}

export async function saveRetreatCrmTemplate(template: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase().from('crm_config').upsert({ id: 2, sms_template: template });
}

const RETREAT_TEMPLATE_DEFAULT =
  "Hi {{name}}! Saw you're interested in the BOSSLABS VibeCode Retreat 🏝️ — 10 seats only, June 26-27 in Tagaytay. Want me to hold one for you?";

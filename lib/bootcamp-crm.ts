/**
 * AI Founder's Bootcamp CRM — kanban of bootcamp leads. Mirrors the retreat
 * CRM pattern: one card per reservation, auto-synced on read; manually-added
 * cards live with reservation_id = null.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { getSignups } from './db';
import { BOOTCAMP_STAGES, type BootcampStage, type BootcampCard } from './bootcamp-stages';

export {
  BOOTCAMP_STAGES,
  BOOTCAMP_STAGE_META,
  type BootcampStage,
  type BootcampCard,
} from './bootcamp-stages';

type CardRow = {
  id: string;
  reservation_id: string | null;
  name: string;
  email: string;
  phone: string;
  company: string;
  stage: string;
  position: number;
  note: string;
  people: number;
  created_at: string;
};

type ResRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  tier: string;
  seats: number;
  per_seat_centavos: number;
  total_centavos: number;
  amount_due_centavos: number;
  status: string;
  paid_at: string | null;
};

function isResPaid(status: string | undefined): boolean {
  return status === 'proof_submitted' || status === 'paid';
}

function isResFullyPaid(status: string | undefined): boolean {
  return status === 'paid';
}

function rowToCard(r: CardRow, res?: ResRow): BootcampCard {
  return {
    id: r.id,
    reservationId: r.reservation_id ?? null,
    name: r.name || res?.name || '',
    email: r.email || res?.email || '',
    phone: r.phone || res?.phone || '',
    company: r.company || res?.company || '',
    stage: (BOOTCAMP_STAGES as readonly string[]).includes(r.stage)
      ? (r.stage as BootcampStage)
      : 'interested',
    position: r.position ?? 0,
    note: r.note ?? '',
    people: r.people ?? res?.seats ?? 1,
    tier: res?.tier ?? null,
    seats: res?.seats ?? null,
    perSeatCentavos: res?.per_seat_centavos ?? null,
    totalCentavos: res?.total_centavos ?? null,
    amountDueCentavos: res?.amount_due_centavos ?? null,
    paid: isResFullyPaid(res?.status),
    paidAt: res?.paid_at ?? null,
    status: res?.status ?? null,
    createdAt: r.created_at,
  };
}

export async function listBootcampCards(): Promise<BootcampCard[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();

  const [{ data: resv }, { data: cardRows }] = await Promise.all([
    sb
      .from('bootcamp_reservations')
      .select(
        'id, name, email, phone, company, tier, seats, per_seat_centavos, total_centavos, amount_due_centavos, status, paid_at',
      ),
    sb.from('bootcamp_crm_cards').select('*'),
  ]);
  const reservations = (resv ?? []) as ResRow[];
  const resById = new Map(reservations.map((r) => [r.id, r]));
  let cards = (cardRows ?? []) as CardRow[];
  const haveResIds = new Set(cards.map((c) => c.reservation_id).filter(Boolean));

  // Sync 1 — every reservation gets a card. New ones land in 'reserved' (DP
  // submitted) or 'paid' (fully cleared) so the team sees the actual state.
  const toInsert = reservations
    .filter((r) => !haveResIds.has(r.id))
    .map((r) => ({
      reservation_id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      company: r.company,
      people: r.seats,
      stage: isResFullyPaid(r.status) ? 'paid' : isResPaid(r.status) ? 'reserved' : 'reserved',
    }));
  if (toInsert.length) {
    const { data: inserted } = await sb
      .from('bootcamp_crm_cards')
      .upsert(toInsert, { onConflict: 'reservation_id' })
      .select('*');
    if (inserted) cards = cards.concat(inserted as CardRow[]);
  }

  // Sync 2 — only auto-advance "interested" cards whose reservation has cleared.
  // Never override a stage the team set manually.
  for (const c of cards) {
    if (c.stage !== 'interested' || !c.reservation_id) continue;
    if (isResFullyPaid(resById.get(c.reservation_id)?.status)) {
      await sb.from('bootcamp_crm_cards').update({ stage: 'paid' }).eq('id', c.id);
      c.stage = 'paid';
    } else if (isResPaid(resById.get(c.reservation_id)?.status)) {
      await sb.from('bootcamp_crm_cards').update({ stage: 'reserved' }).eq('id', c.id);
      c.stage = 'reserved';
    }
  }

  return cards
    .map((c) => rowToCard(c, c.reservation_id ? resById.get(c.reservation_id) : undefined))
    .sort((a, b) => a.stage.localeCompare(b.stage) || a.position - b.position);
}

export type BootcampCandidate = { id: string; name: string; email: string; phone: string };

export async function listBootcampCandidates(): Promise<BootcampCandidate[]> {
  const signups = await getSignups();
  return signups.map((s) => ({
    id: s.id,
    name: `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || s.email,
    email: s.email ?? '',
    phone: s.phone ?? '',
  }));
}

export async function addBootcampCard(input: {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  stage?: BootcampStage;
}): Promise<BootcampCard> {
  const { data, error } = await getSupabase()
    .from('bootcamp_crm_cards')
    .insert({
      name: input.name,
      email: input.email ?? '',
      phone: input.phone ?? '',
      company: input.company ?? '',
      stage: input.stage ?? 'interested',
    })
    .select('*')
    .single();
  if (error) throw new Error(`addBootcampCard: ${error.message}`);
  return rowToCard(data as CardRow);
}

export async function updateBootcampCard(
  id: string,
  patch: Partial<
    Pick<BootcampCard, 'name' | 'phone' | 'email' | 'company' | 'note' | 'stage' | 'position' | 'people'>
  >,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.company !== undefined) row.company = patch.company;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.stage !== undefined) row.stage = patch.stage;
  if (patch.position !== undefined) row.position = patch.position;
  if (patch.people !== undefined) row.people = Math.max(1, Math.min(5, Math.round(patch.people)));
  if (Object.keys(row).length === 0) return;
  const { error } = await getSupabase().from('bootcamp_crm_cards').update(row).eq('id', id);
  if (error) throw new Error(`updateBootcampCard: ${error.message}`);
}

export async function deleteBootcampCard(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();
  const { data } = await sb
    .from('bootcamp_crm_cards')
    .select('reservation_id')
    .eq('id', id)
    .maybeSingle();
  const resId = (data?.reservation_id as string | null) ?? null;
  if (resId) {
    await sb.from('bootcamp_reservations').delete().eq('id', resId);
  } else {
    await sb.from('bootcamp_crm_cards').delete().eq('id', id);
  }
}

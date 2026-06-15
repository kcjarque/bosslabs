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

type VcrPayment = { amountCentavos: number; at: string; note?: string };

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
  deal_amount_centavos: number | null;
  payments: VcrPayment[] | null;
  paid_at: string | null;
};

const DEFAULT_VCR_DEAL_CENTAVOS = 5_000_000; // ₱50,000

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
  const payments = Array.isArray(r.payments) ? r.payments : [];
  const collected = payments.reduce((s, p) => s + (p.amountCentavos || 0), 0);
  const deal = r.deal_amount_centavos ?? DEFAULT_VCR_DEAL_CENTAVOS;
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
    dealAmountCentavos: deal,
    collectedCentavos: collected,
    paidInFull: deal > 0 && collected >= deal,
    paidAt: r.paid_at ?? null,
    payments,
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
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();
  // Untag the person from this retreat event. If the card is reservation-linked,
  // delete the reservation (cascades the card via FK) — otherwise the board
  // would auto-recreate the card from the still-present reservation on next
  // load. The customer's signup profile is a separate table, left untouched.
  const { data } = await sb.from('retreat_crm_cards').select('reservation_id').eq('id', id).maybeSingle();
  const resId = (data?.reservation_id as string | null) ?? null;
  if (resId) {
    await sb.from('retreat_reservations').delete().eq('id', resId);
  } else {
    await sb.from('retreat_crm_cards').delete().eq('id', id);
  }
}

/** Set the discussed deal amount (centavos, default ₱50k) on a VCR card. */
export async function setRetreatDealAmount(id: string, centavos: number): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase()
    .from('retreat_crm_cards')
    .update({ deal_amount_centavos: Math.max(0, Math.round(centavos)) })
    .eq('id', id);
  if (error) throw new Error(`setRetreatDealAmount: ${error.message}`);
}

/**
 * Log a (partial or full) VCR cash payment on a card. Appends to the payments
 * log; once collected reaches the deal amount it stamps paid_at and advances
 * the card to "paid". This log is the single source of truth for VCR income.
 */
export async function logRetreatPayment(id: string, centavos: number, note?: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const amount = Math.max(0, Math.round(centavos));
  if (amount <= 0) return;
  const sb = getSupabase();
  const { data, error: readErr } = await sb
    .from('retreat_crm_cards')
    .select('deal_amount_centavos, payments, paid_at, stage')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new Error(`logRetreatPayment read: ${readErr.message}`);
  const payments = (Array.isArray(data?.payments) ? data!.payments : []) as VcrPayment[];
  payments.push({ amountCentavos: amount, at: new Date().toISOString(), note: note?.trim() || undefined });
  const collected = payments.reduce((s, p) => s + (p.amountCentavos || 0), 0);
  const deal = (data?.deal_amount_centavos as number | null) ?? DEFAULT_VCR_DEAL_CENTAVOS;
  const patch: Record<string, unknown> = { payments };
  if (deal > 0 && collected >= deal) {
    patch.paid_at = (data?.paid_at as string | null) ?? new Date().toISOString();
    if (data?.stage === 'interested') patch.stage = 'paid';
  }
  const { error } = await sb.from('retreat_crm_cards').update(patch).eq('id', id);
  if (error) throw new Error(`logRetreatPayment: ${error.message}`);
}

/** Mark a VCR card paid in full — logs a payment for the remaining balance. */
export async function markRetreatPaidInFull(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();
  const { data } = await sb
    .from('retreat_crm_cards')
    .select('deal_amount_centavos, payments')
    .eq('id', id)
    .maybeSingle();
  const payments = (Array.isArray(data?.payments) ? data!.payments : []) as VcrPayment[];
  const collected = payments.reduce((s, p) => s + (p.amountCentavos || 0), 0);
  const deal = (data?.deal_amount_centavos as number | null) ?? DEFAULT_VCR_DEAL_CENTAVOS;
  const remaining = Math.max(0, deal - collected);
  if (remaining <= 0) {
    await sb
      .from('retreat_crm_cards')
      .update({ paid_at: new Date().toISOString(), stage: 'paid' })
      .eq('id', id);
    return;
  }
  await logRetreatPayment(id, remaining, 'Marked paid in full');
}

/**
 * Total VCR ("Webinar") income from the card payments log, optionally scoped to
 * a [sinceMs, untilMs) window by each payment's timestamp. Used by the dashboard
 * Income section — kept separate from the ₱999 front-end ROAS/daily metrics.
 */
export async function sumWebinarIncomeCentavos(sinceMs?: number, untilMs?: number): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { data, error } = await getSupabase().from('retreat_crm_cards').select('payments');
  if (error) return 0;
  let total = 0;
  for (const row of (data ?? []) as { payments: VcrPayment[] | null }[]) {
    for (const p of row.payments ?? []) {
      const t = Date.parse(p.at);
      if (sinceMs != null && t < sinceMs) continue;
      if (untilMs != null && t >= untilMs) continue;
      total += p.amountCentavos || 0;
    }
  }
  return total;
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

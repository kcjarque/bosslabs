/**
 * AI Founder's Bootcamp — pricing, reservations, ticket cap.
 *
 * Pricing tiers (per-seat ₱):
 *   single  →  25,000
 *   group3  →  22,000 × 3 seats = 66,000 total
 *   group5  →  20,000 × 5 seats = 100,000 total
 * Downpayment-to-reserve = ₱10,000 × seats. Balance due before bootcamp day.
 * Hard cap: 80 seats — enforced both in this lib and by the DB trigger.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const BOOTCAMP_TOTAL_SEATS = 80;
export const BOOTCAMP_DOWNPAYMENT_PER_SEAT_CENTAVOS = 10_000_00; // ₱10,000

export type BootcampTier = 'single' | 'group3' | 'group5';
export type BootcampMethod = 'Credit Card' | 'Bank Transfer';
export type BootcampStatus = 'reserved' | 'proof_submitted' | 'paid';

export type BootcampTierDef = {
  id: BootcampTier;
  label: string;
  perSeatCentavos: number;
  seats: number;
  totalCentavos: number;
  downpaymentCentavos: number;
  badge?: string;
  tagline: string;
};

export const BOOTCAMP_TIERS: BootcampTierDef[] = [
  {
    id: 'single',
    label: '1 seat',
    perSeatCentavos: 25_000_00,
    seats: 1,
    totalCentavos: 25_000_00,
    downpaymentCentavos: BOOTCAMP_DOWNPAYMENT_PER_SEAT_CENTAVOS,
    tagline: 'Solo founder — your one shot at shipping in 24 hours.',
  },
  {
    id: 'group3',
    label: '3 seats — Corporate trio',
    perSeatCentavos: 22_000_00,
    seats: 3,
    totalCentavos: 66_000_00,
    downpaymentCentavos: BOOTCAMP_DOWNPAYMENT_PER_SEAT_CENTAVOS * 3,
    badge: 'Save ₱9,000',
    tagline: 'Bring two co-founders or your operating team.',
  },
  {
    id: 'group5',
    label: '5 seats — Corporate squad',
    perSeatCentavos: 20_000_00,
    seats: 5,
    totalCentavos: 100_000_00,
    downpaymentCentavos: BOOTCAMP_DOWNPAYMENT_PER_SEAT_CENTAVOS * 5,
    badge: 'Save ₱25,000',
    tagline: 'Whole team. Whole stack. Built in 24 hours.',
  },
];

export function tierById(id: BootcampTier | string | null | undefined): BootcampTierDef | null {
  if (!id) return null;
  return BOOTCAMP_TIERS.find((t) => t.id === id) ?? null;
}

export async function bootcampSeatsRemaining(): Promise<number> {
  if (!isSupabaseConfigured()) return BOOTCAMP_TOTAL_SEATS;
  const { data, error } = await getSupabase().rpc('bootcamp_seats_remaining');
  if (error) return BOOTCAMP_TOTAL_SEATS;
  return typeof data === 'number' ? data : BOOTCAMP_TOTAL_SEATS;
}

export async function bootcampSeatsTaken(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { data, error } = await getSupabase().rpc('bootcamp_seats_taken');
  if (error) return 0;
  return typeof data === 'number' ? data : 0;
}

export type BootcampGroupMember = { name: string; email: string; phone: string };

export type BootcampReservationInput = {
  name: string;
  email: string;
  phone: string;
  company?: string;
  tier: BootcampTier;
  seats: number;
  perSeatCentavos: number;
  totalCentavos: number;
  amountDueCentavos: number;
  balanceDueCentavos: number;
  groupMembers?: BootcampGroupMember[];
  buildIdea?: string;
  heardFrom?: string;
  discountCode?: string;
  paymentMethod?: BootcampMethod;
};

export type BootcampReservation = BootcampReservationInput & {
  id: string;
  createdAt: string;
  status: BootcampStatus;
  proofSubmittedAt: string | null;
  paidAt: string | null;
  xenditInvoiceId: string | null;
  /** Every xendit invoice id that has already been applied to this
   *  reservation. Lets the webhook accept a 2nd (balance) payment while
   *  staying idempotent against Xendit's normal retries. */
  processedInvoiceIds: string[];
};

type BootcampReservationRow = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  tier: string;
  seats: number;
  per_seat_centavos: number;
  total_centavos: number;
  amount_due_centavos: number;
  balance_due_centavos: number;
  group_members: BootcampGroupMember[] | null;
  build_idea: string;
  heard_from: string;
  discount_code: string;
  payment_method: string | null;
  status: string;
  proof_submitted_at: string | null;
  paid_at: string | null;
  xendit_invoice_id: string | null;
  processed_invoice_ids: string[] | null;
};

function rowToReservation(r: BootcampReservationRow): BootcampReservation {
  return {
    id: r.id,
    createdAt: r.created_at,
    name: r.name,
    email: r.email,
    phone: r.phone,
    company: r.company,
    tier: r.tier as BootcampTier,
    seats: r.seats,
    perSeatCentavos: r.per_seat_centavos,
    totalCentavos: r.total_centavos,
    amountDueCentavos: r.amount_due_centavos,
    balanceDueCentavos: r.balance_due_centavos,
    groupMembers: r.group_members ?? [],
    buildIdea: r.build_idea ?? '',
    heardFrom: r.heard_from ?? '',
    discountCode: r.discount_code ?? '',
    paymentMethod: (r.payment_method as BootcampMethod) ?? undefined,
    status:
      r.status === 'paid' ? 'paid' : r.status === 'proof_submitted' ? 'proof_submitted' : 'reserved',
    proofSubmittedAt: r.proof_submitted_at,
    paidAt: r.paid_at,
    xenditInvoiceId: r.xendit_invoice_id,
    processedInvoiceIds: r.processed_invoice_ids ?? [],
  };
}

export async function createBootcampReservation(
  input: BootcampReservationInput,
): Promise<BootcampReservation> {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured');
  const { data, error } = await getSupabase()
    .from('bootcamp_reservations')
    .insert({
      name: input.name,
      email: input.email,
      phone: input.phone,
      company: input.company ?? '',
      tier: input.tier,
      seats: input.seats,
      per_seat_centavos: input.perSeatCentavos,
      total_centavos: input.totalCentavos,
      amount_due_centavos: input.amountDueCentavos,
      balance_due_centavos: input.balanceDueCentavos,
      group_members: input.groupMembers ?? [],
      build_idea: input.buildIdea ?? '',
      heard_from: input.heardFrom ?? '',
      discount_code: input.discountCode ?? '',
      payment_method: input.paymentMethod ?? null,
    })
    .select('*')
    .single();
  if (error) {
    // Surface the trigger-thrown BOOTCAMP_FULL message so the UI can show it.
    if (/BOOTCAMP_FULL/.test(error.message)) throw new Error(error.message);
    throw new Error(`createBootcampReservation: ${error.message}`);
  }
  return rowToReservation(data as BootcampReservationRow);
}

export async function getBootcampReservation(id: string): Promise<BootcampReservation | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabase()
    .from('bootcamp_reservations')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToReservation(data as BootcampReservationRow);
}

export async function markBootcampReservationProof(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase()
    .from('bootcamp_reservations')
    .update({ status: 'proof_submitted', proof_submitted_at: new Date().toISOString() })
    .eq('id', id);
}

export type ApplyPaymentResult =
  | { alreadyProcessed: true }
  | {
      alreadyProcessed: false;
      wasFirstPayment: boolean;
      paidCentavos: number;
      newBalanceCentavos: number;
      fullyPaid: boolean;
    };

/**
 * Apply a cleared Xendit payment to the reservation. Idempotent per invoice id:
 *  - If `invoiceId` is already in `processed_invoice_ids`, returns
 *    `{alreadyProcessed: true}` and writes nothing — Xendit's normal webhook
 *    retries don't double-count.
 *  - Otherwise: decrements `balance_due_centavos` by the paid amount, appends
 *    the invoice id to the processed list, flips status='paid' on the first
 *    successful payment, and returns the new balance + whether the reservation
 *    is now fully paid (balance==0).
 *
 * Replaces the previous markBootcampReservationPaid helper which keyed
 * idempotency on `status==='paid'`. That broke 2-stage flows: after the DP
 * cleared, the balance payment's webhook was silently dropped.
 */
export async function applyBootcampPayment(
  id: string,
  paidCentavos: number,
  opts: { invoiceId?: string | null; paidAtIso?: string } = {},
): Promise<ApplyPaymentResult> {
  if (!isSupabaseConfigured()) return { alreadyProcessed: true };
  const sb = getSupabase();
  const { data: row, error: readErr } = await sb
    .from('bootcamp_reservations')
    .select('balance_due_centavos, status, paid_at, processed_invoice_ids')
    .eq('id', id)
    .single();
  if (readErr || !row) throw new Error(`applyBootcampPayment read: ${readErr?.message ?? 'not found'}`);

  const invoiceId = opts.invoiceId ?? '';
  const processed = (row.processed_invoice_ids as string[] | null) ?? [];
  if (invoiceId && processed.includes(invoiceId)) {
    return { alreadyProcessed: true };
  }

  const wasFirstPayment = row.status !== 'paid';
  const newBalance = Math.max(0, (row.balance_due_centavos as number) - paidCentavos);
  const fullyPaid = newBalance === 0;

  const update: Record<string, unknown> = {
    status: 'paid',
    balance_due_centavos: newBalance,
    xendit_invoice_id: invoiceId || row.processed_invoice_ids?.[0] || null,
    processed_invoice_ids: invoiceId ? [...processed, invoiceId] : processed,
  };
  // Stamp paid_at only on first payment so it represents the seat-locked moment.
  if (wasFirstPayment) update.paid_at = opts.paidAtIso ?? new Date().toISOString();

  const { error: writeErr } = await sb.from('bootcamp_reservations').update(update).eq('id', id);
  if (writeErr) throw new Error(`applyBootcampPayment write: ${writeErr.message}`);

  return { alreadyProcessed: false, wasFirstPayment, paidCentavos, newBalanceCentavos: newBalance, fullyPaid };
}

export async function listBootcampReservations(): Promise<BootcampReservation[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('bootcamp_reservations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as BootcampReservationRow[]).map(rowToReservation);
}

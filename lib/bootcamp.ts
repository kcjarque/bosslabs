/**
 * AI Founder's Bootcamp — pricing, discount codes, reservations, ticket cap.
 *
 * Pricing tiers (per-seat ₱):
 *   single        →  35,000 (regular)
 *   single_promo  →  25,000 (with active webinar code)
 *   group3        →  22,000 × 3 seats = 66,000 total
 *   group5        →  20,000 × 5 seats = 100,000 total
 * Downpayment-to-reserve = ₱10,000 × seats. Balance due before bootcamp day.
 * Hard cap: 80 seats — enforced both in this lib and by the DB trigger.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const BOOTCAMP_TOTAL_SEATS = 80;
export const BOOTCAMP_DOWNPAYMENT_PER_SEAT_CENTAVOS = 10_000_00; // ₱10,000

export type BootcampTier = 'single' | 'single_promo' | 'group3' | 'group5';
export type BootcampMethod = 'Credit Card' | 'Bank Transfer';
export type BootcampStatus = 'reserved' | 'proof_submitted' | 'paid';

export type BootcampTierDef = {
  id: BootcampTier;
  label: string;
  perSeatCentavos: number;
  seats: number;
  totalCentavos: number;
  downpaymentCentavos: number;
  requiresCode: boolean;
  badge?: string;
  tagline: string;
};

export const BOOTCAMP_TIERS: BootcampTierDef[] = [
  {
    id: 'single',
    label: '1 seat — Standard',
    perSeatCentavos: 35_000_00,
    seats: 1,
    totalCentavos: 35_000_00,
    downpaymentCentavos: BOOTCAMP_DOWNPAYMENT_PER_SEAT_CENTAVOS,
    requiresCode: false,
    tagline: 'Solo founder, full investment.',
  },
  {
    id: 'single_promo',
    label: '1 seat — Webinar attendee',
    perSeatCentavos: 25_000_00,
    seats: 1,
    totalCentavos: 25_000_00,
    downpaymentCentavos: BOOTCAMP_DOWNPAYMENT_PER_SEAT_CENTAVOS,
    requiresCode: true,
    badge: 'Code required',
    tagline: '₱10,000 off — code expires 24 hours after the webinar.',
  },
  {
    id: 'group3',
    label: '3 seats — Corporate trio',
    perSeatCentavos: 22_000_00,
    seats: 3,
    totalCentavos: 66_000_00,
    downpaymentCentavos: BOOTCAMP_DOWNPAYMENT_PER_SEAT_CENTAVOS * 3,
    requiresCode: false,
    badge: 'Save ₱39,000',
    tagline: 'Bring two co-founders or your operating team.',
  },
  {
    id: 'group5',
    label: '5 seats — Corporate squad',
    perSeatCentavos: 20_000_00,
    seats: 5,
    totalCentavos: 100_000_00,
    downpaymentCentavos: BOOTCAMP_DOWNPAYMENT_PER_SEAT_CENTAVOS * 5,
    requiresCode: false,
    badge: 'Save ₱75,000',
    tagline: 'Whole team. Whole stack. Built in 24 hours.',
  },
];

export function tierById(id: BootcampTier | string | null | undefined): BootcampTierDef | null {
  if (!id) return null;
  return BOOTCAMP_TIERS.find((t) => t.id === id) ?? null;
}

export type BootcampCode = {
  id: string;
  code: string;
  perSeatCentavos: number;
  startsAt: string;
  expiresAt: string;
  isActive: boolean;
  note: string;
  createdAt: string;
};

type BootcampCodeRow = {
  id: string;
  code: string;
  per_seat_centavos: number;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
  note: string;
  created_at: string;
};
function rowToCode(r: BootcampCodeRow): BootcampCode {
  return {
    id: r.id,
    code: r.code,
    perSeatCentavos: r.per_seat_centavos,
    startsAt: r.starts_at,
    expiresAt: r.expires_at,
    isActive: r.is_active,
    note: r.note,
    createdAt: r.created_at,
  };
}

/** The current active code (case-insensitive on the input). Returns null if
 *  no code matches OR the code is expired / disabled. */
export async function findActiveBootcampCode(input: string): Promise<BootcampCode | null> {
  if (!isSupabaseConfigured() || !input.trim()) return null;
  const { data, error } = await getSupabase()
    .from('bootcamp_discount_codes')
    .select('*')
    .ilike('code', input.trim())
    .eq('is_active', true)
    .lte('starts_at', new Date().toISOString())
    .gte('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) return null;
  return data ? rowToCode(data as BootcampCodeRow) : null;
}

/** Latest active code (for admin panel display). */
export async function getLatestBootcampCode(): Promise<BootcampCode | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabase()
    .from('bootcamp_discount_codes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data ? rowToCode(data as BootcampCodeRow) : null;
}

export async function listBootcampCodes(): Promise<BootcampCode[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('bootcamp_discount_codes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as BootcampCodeRow[]).map(rowToCode);
}

export async function createBootcampCode(input: {
  code: string;
  perSeatCentavos: number;
  expiresAt: string;
  note?: string;
}): Promise<BootcampCode> {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured');
  // Disable any prior active codes so the "active" code is unambiguous.
  await getSupabase()
    .from('bootcamp_discount_codes')
    .update({ is_active: false })
    .eq('is_active', true);
  const { data, error } = await getSupabase()
    .from('bootcamp_discount_codes')
    .insert({
      code: input.code.trim(),
      per_seat_centavos: input.perSeatCentavos,
      expires_at: input.expiresAt,
      note: input.note ?? '',
      is_active: true,
    })
    .select('*')
    .single();
  if (error) throw new Error(`createBootcampCode: ${error.message}`);
  return rowToCode(data as BootcampCodeRow);
}

export async function deactivateBootcampCode(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase().from('bootcamp_discount_codes').update({ is_active: false }).eq('id', id);
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

export async function markBootcampReservationPaid(
  id: string,
  opts: { invoiceId?: string | null; paidAtIso?: string; zeroBalance?: boolean } = {},
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const update: Record<string, unknown> = {
    status: 'paid',
    paid_at: opts.paidAtIso ?? new Date().toISOString(),
    xendit_invoice_id: opts.invoiceId ?? null,
  };
  if (opts.zeroBalance) update.balance_due_centavos = 0;
  await getSupabase().from('bootcamp_reservations').update(update).eq('id', id);
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

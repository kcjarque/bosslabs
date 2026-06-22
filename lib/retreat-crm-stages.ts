/** VibeCode Retreat CRM stages + card shape — dependency-free so the client
 *  board imports them without pulling in the Supabase client. */
export const RETREAT_CRM_STAGES = ['interested', 'confirmed', 'paid', 'attending', 'attended', 'lost'] as const;
export type RetreatCrmStage = (typeof RETREAT_CRM_STAGES)[number];

export const RETREAT_CRM_STAGE_META: Record<RetreatCrmStage, { label: string; tint: string; bar: string }> = {
  interested: { label: 'Interested', tint: 'bg-slate-50', bar: 'bg-slate-400' },
  paid: { label: 'Paid', tint: 'bg-emerald-50', bar: 'bg-emerald-500' },
  confirmed: { label: 'Confirmed', tint: 'bg-cyan-50', bar: 'bg-cyan-500' },
  attending: { label: 'Attending', tint: 'bg-violet-50', bar: 'bg-violet-500' },
  attended: { label: 'Attended', tint: 'bg-blue-50', bar: 'bg-blue-500' },
  lost: { label: 'Lost Lead', tint: 'bg-rose-50', bar: 'bg-rose-400' },
};

export type RetreatCrmCard = {
  id: string;
  reservationId: string | null;
  name: string;
  phone: string;
  email: string;
  note: string;
  stage: RetreatCrmStage;
  position: number;
  /** Has the reservation been paid (proof submitted)? Drives the badge. */
  paid: boolean;
  /** Headcount on this reservation: 1, or 2 when an extra person was added. */
  people: number;
  amountCentavos: number | null;
  method: string | null;
  createdAt: string;
  /** VCR deal tracking (card columns). dealAmount = the discussed full deal
   *  (default ₱50,000); collected = cash actually received via the payments
   *  log; paidInFull once collected >= deal. "Webinar income" sums payments. */
  dealAmountCentavos: number;
  collectedCentavos: number;
  paidInFull: boolean;
  paidAt: string | null;
  payments: { amountCentavos: number; at: string; note?: string }[];
};

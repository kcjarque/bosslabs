/** AI Founder's Bootcamp CRM stages — dependency-free so the client board
 *  can import them without pulling in the Supabase client. */
export const BOOTCAMP_STAGES = [
  'interested',
  'reserved',
  'paid',
  'attended',
  'lost',
] as const;
export type BootcampStage = (typeof BOOTCAMP_STAGES)[number];

export const BOOTCAMP_STAGE_META: Record<
  BootcampStage,
  { label: string; tint: string; bar: string }
> = {
  interested: { label: 'Interested', tint: 'bg-slate-50', bar: 'bg-slate-400' },
  reserved: { label: 'Reserved (DP)', tint: 'bg-cyan-50', bar: 'bg-cyan-500' },
  paid: { label: 'Fully paid', tint: 'bg-emerald-50', bar: 'bg-emerald-500' },
  attended: { label: 'Attended', tint: 'bg-blue-50', bar: 'bg-blue-500' },
  lost: { label: 'Lost Lead', tint: 'bg-rose-50', bar: 'bg-rose-400' },
};

export type BootcampCard = {
  id: string;
  reservationId: string | null;
  name: string;
  email: string;
  phone: string;
  company: string;
  stage: BootcampStage;
  position: number;
  note: string;
  people: number;
  tier: string | null;
  seats: number | null;
  perSeatCentavos: number | null;
  totalCentavos: number | null;
  amountDueCentavos: number | null;
  paid: boolean;
  paidAt: string | null;
  status: string | null;
  createdAt: string;
};

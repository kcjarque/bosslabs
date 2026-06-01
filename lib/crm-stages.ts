/** CRM stage constants + the card shape — dependency-free so the client
 *  board can import them without pulling in the Supabase client. */
export const CRM_STAGES = ['new', 'messaged', 'interested', 'won', 'lost'] as const;
export type CrmStage = (typeof CRM_STAGES)[number];

export const CRM_STAGE_META: Record<CrmStage, { label: string; tint: string; bar: string }> = {
  new: { label: 'New', tint: 'bg-slate-50', bar: 'bg-slate-400' },
  messaged: { label: 'Messaged', tint: 'bg-cyan-50', bar: 'bg-cyan-500' },
  interested: { label: 'Interested', tint: 'bg-amber-50', bar: 'bg-amber-500' },
  won: { label: 'Closed — Won', tint: 'bg-emerald-50', bar: 'bg-emerald-500' },
  lost: { label: 'Not now', tint: 'bg-rose-50', bar: 'bg-rose-400' },
};

export type CrmCard = {
  id: string;
  name: string;
  phone: string;
  email: string;
  note: string;
  stage: CrmStage;
  position: number;
  signupId: string | null;
  createdAt: string;
  /** Total the customer paid (main + OTO), in centavos. Null for cards with
   *  no linked paid signup. Drives the order-bump amount shown on the card. */
  amountCentavos: number | null;
  /** Free-text remark — shared with the customer profile (stored on the
   *  signup's metadata.remarks). */
  remarks: string;
};

/** DFY (Done-For-You) CRM stage constants + card shape — dependency-free so
 *  the client board can import them without pulling in the Supabase client. */
export const DFY_STAGES = [
  'discovery_call',
  'contract_sent',
  'follow_up',
  'contract_signing',
  'onboarding',
] as const;
export type DfyStage = (typeof DFY_STAGES)[number];

export const DFY_STAGE_META: Record<DfyStage, { label: string; tint: string; bar: string }> = {
  discovery_call: { label: 'Discovery Call', tint: 'bg-slate-50', bar: 'bg-slate-400' },
  contract_sent: { label: 'Contract Sent', tint: 'bg-cyan-50', bar: 'bg-cyan-500' },
  follow_up: { label: 'Follow Up', tint: 'bg-amber-50', bar: 'bg-amber-500' },
  contract_signing: { label: 'Contract Signing', tint: 'bg-violet-50', bar: 'bg-violet-500' },
  onboarding: { label: 'Onboarding', tint: 'bg-emerald-50', bar: 'bg-emerald-500' },
};

export type DfyCard = {
  id: string;
  name: string;
  phone: string;
  email: string;
  note: string;
  stage: DfyStage;
  position: number;
  /** Optional deal value (centavos). */
  amountCentavos: number | null;
  createdAt: string;
  updatedAt: string;
};

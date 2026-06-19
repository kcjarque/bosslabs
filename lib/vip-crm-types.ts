/** VIP CRM card shape + tag suggestions — dependency-free so the client board
 *  imports them without pulling in the Supabase client. */
export type VipCard = {
  id: string;
  name: string;
  phone: string;
  email: string;
  /** Free-text label/category: a future project, or a VIP type (e.g. "Investor"). */
  tag: string;
  /** Why we're tracking them — context for the next project. */
  note: string;
  createdAt: string;
  updatedAt: string;
};

/** Quick-pick suggestions for the tag field (free-text — these just seed a datalist). */
export const VIP_TAG_SUGGESTIONS = [
  'Future project',
  'Investor',
  'Partner',
  'Big spender',
  'Influencer',
  'Referrer',
  'Beta tester',
  'Hire',
] as const;

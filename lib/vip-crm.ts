/**
 * VIP CRM — a standalone watchlist of people to track for future projects.
 * Not a pipeline (no stages): each card is a person + contact, a free-text tag
 * (a future project or VIP type) and a note on why we're tracking them. Manual
 * cards, optionally promoted from existing signups.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { getSignups } from './db';
import type { VipCard } from './vip-crm-types';

export type { VipCard } from './vip-crm-types';
export { VIP_TAG_SUGGESTIONS } from './vip-crm-types';

type VipRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  tag: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function rowToCard(r: VipRow): VipCard {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? '',
    email: r.email ?? '',
    tag: r.tag ?? '',
    note: r.note ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listVipCards(): Promise<VipCard[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('vip_crm_cards')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listVipCards: ${error.message}`);
  return ((data as VipRow[]) ?? []).map(rowToCard);
}

export async function addVipCard(input: {
  name: string;
  phone?: string;
  email?: string;
  tag?: string;
  note?: string;
}): Promise<VipCard> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
  const name = input.name.trim();
  if (!name) throw new Error('Name is required');
  const { data, error } = await getSupabase()
    .from('vip_crm_cards')
    .insert({
      name,
      phone: input.phone?.trim() ?? '',
      email: input.email?.trim() ?? '',
      tag: input.tag?.trim() ?? '',
      note: input.note?.trim() ?? '',
    })
    .select('*')
    .single();
  if (error) throw new Error(`addVipCard: ${error.message}`);
  return rowToCard(data as VipRow);
}

export async function updateVipCard(
  id: string,
  patch: { name?: string; phone?: string; email?: string; tag?: string; note?: string },
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.phone !== undefined) row.phone = patch.phone.trim();
  if (patch.email !== undefined) row.email = patch.email.trim();
  if (patch.tag !== undefined) row.tag = patch.tag.trim();
  if (patch.note !== undefined) row.note = patch.note;
  const { error } = await getSupabase().from('vip_crm_cards').update(row).eq('id', id);
  if (error) throw new Error(`updateVipCard: ${error.message}`);
}

export async function deleteVipCard(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase().from('vip_crm_cards').delete().eq('id', id);
  if (error) throw new Error(`deleteVipCard: ${error.message}`);
}

/** Existing customers (signups) for the "add from existing customer" search. */
export type VipCandidate = { id: string; name: string; email: string; phone: string };
export async function listVipCandidates(): Promise<VipCandidate[]> {
  const signups = await getSignups();
  return signups.map((s) => ({
    id: s.id,
    name: `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || s.email,
    email: s.email ?? '',
    phone: s.phone ?? '',
  }));
}

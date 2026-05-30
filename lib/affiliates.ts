/**
 * Affiliate / referral system.
 *
 * Attribution flow:
 *   1. Visitor hits /r/<code> (or any page with ?ref=<code>) → a first-touch
 *      `bl_ref` cookie is set for 15 days (set ONCE, never overwritten).
 *   2. At checkout the cookie is read and stamped onto the signup's metadata
 *      (affiliateCode + affiliateFirstTouchAt) — so even abandoned carts are
 *      attributed.
 *   3. When the Xendit webhook marks the signup `paid`, recordCommission()
 *      computes the payout (per-affiliate % or fixed, on total paid) and writes
 *      a pending row to the commission ledger. Idempotent (unique signup_id).
 */

import { getSupabase, isSupabaseConfigured } from './supabase';

export { REF_COOKIE, REF_TOUCH_COOKIE, REF_MAX_AGE_SECONDS } from './ref-cookie';

export type CommissionType = 'percent' | 'fixed';

export type Affiliate = {
  id: string;
  code: string;
  name: string;
  email: string;
  commissionType: CommissionType;
  /** percent (e.g. 20 = 20%) OR centavos when type is 'fixed'. */
  commissionValue: number;
  dashboardToken: string;
  active: boolean;
  createdAt: string;
};

type AffiliateRow = {
  id: string;
  code: string;
  name: string;
  email: string | null;
  commission_type: CommissionType;
  commission_value: number | string;
  dashboard_token: string;
  active: boolean;
  created_at: string;
};

function rowToAffiliate(r: AffiliateRow): Affiliate {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    email: r.email ?? '',
    commissionType: r.commission_type,
    commissionValue: Number(r.commission_value),
    dashboardToken: r.dashboard_token,
    active: r.active,
    createdAt: r.created_at,
  };
}

/** Slugify a proposed code: lowercase, alnum + dashes only. */
export function slugifyCode(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Commission for a sale, in centavos. percent → % of sale; fixed → flat. */
export function commissionCentavos(aff: Affiliate, saleCentavos: number): number {
  if (aff.commissionType === 'fixed') return Math.round(aff.commissionValue);
  return Math.round((saleCentavos * aff.commissionValue) / 100);
}

export async function listAffiliates(): Promise<Affiliate[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('affiliates')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listAffiliates: ${error.message}`);
  return (data as AffiliateRow[]).map(rowToAffiliate);
}

export async function getAffiliateByCode(code: string): Promise<Affiliate | null> {
  if (!isSupabaseConfigured() || !code) return null;
  const { data, error } = await getSupabase()
    .from('affiliates')
    .select('*')
    .eq('code', code.toLowerCase())
    .maybeSingle();
  if (error) return null;
  return data ? rowToAffiliate(data as AffiliateRow) : null;
}

export async function getAffiliateByToken(token: string): Promise<Affiliate | null> {
  if (!isSupabaseConfigured() || !token) return null;
  const { data, error } = await getSupabase()
    .from('affiliates')
    .select('*')
    .eq('dashboard_token', token)
    .maybeSingle();
  if (error) return null;
  return data ? rowToAffiliate(data as AffiliateRow) : null;
}

export async function createAffiliate(input: {
  code: string;
  name: string;
  email?: string;
  commissionType: CommissionType;
  commissionValue: number;
}): Promise<Affiliate> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
  const { data, error } = await getSupabase()
    .from('affiliates')
    .insert({
      code: slugifyCode(input.code),
      name: input.name,
      email: input.email ?? '',
      commission_type: input.commissionType,
      commission_value: input.commissionValue,
    })
    .select('*')
    .single();
  if (error) throw new Error(`createAffiliate: ${error.message}`);
  return rowToAffiliate(data as AffiliateRow);
}

export async function updateAffiliate(
  id: string,
  patch: Partial<{
    name: string;
    email: string;
    commissionType: CommissionType;
    commissionValue: number;
    active: boolean;
  }>,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.commissionType !== undefined) row.commission_type = patch.commissionType;
  if (patch.commissionValue !== undefined) row.commission_value = patch.commissionValue;
  if (patch.active !== undefined) row.active = patch.active;
  const { error } = await getSupabase().from('affiliates').update(row).eq('id', id);
  if (error) throw new Error(`updateAffiliate: ${error.message}`);
}

export async function logAffiliateClick(input: {
  affiliateId: string;
  sessionId?: string;
  landingPath?: string;
  referrer?: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase().from('affiliate_clicks').insert({
    affiliate_id: input.affiliateId,
    session_id: input.sessionId ?? '',
    landing_path: input.landingPath ?? '',
    referrer: input.referrer ?? '',
  });
}

/**
 * Record a commission for a converted (paid) signup. Idempotent — the unique
 * signup_id means a re-fired webhook won't double-pay. No-op if the code is
 * unknown or the affiliate is inactive.
 */
export async function recordCommission(input: {
  affiliateCode: string;
  signupId: string;
  saleCentavos: number;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const aff = await getAffiliateByCode(input.affiliateCode);
  if (!aff || !aff.active) return;
  const commission = commissionCentavos(aff, input.saleCentavos);
  await getSupabase()
    .from('affiliate_commissions')
    .upsert(
      {
        affiliate_id: aff.id,
        signup_id: input.signupId,
        sale_centavos: input.saleCentavos,
        commission_centavos: commission,
        status: 'pending',
      },
      { onConflict: 'signup_id', ignoreDuplicates: true },
    );
}

/** Void a commission when its sale is refunded. */
export async function voidCommissionForSignup(signupId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase()
    .from('affiliate_commissions')
    .update({ status: 'void' })
    .eq('signup_id', signupId);
}

export type Commission = {
  id: string;
  affiliateId: string;
  signupId: string;
  saleCentavos: number;
  commissionCentavos: number;
  status: 'pending' | 'paid' | 'void';
  createdAt: string;
};

function rowToCommission(r: Record<string, unknown>): Commission {
  return {
    id: r.id as string,
    affiliateId: r.affiliate_id as string,
    signupId: r.signup_id as string,
    saleCentavos: Number(r.sale_centavos),
    commissionCentavos: Number(r.commission_centavos),
    status: r.status as Commission['status'],
    createdAt: r.created_at as string,
  };
}

export async function listCommissions(affiliateId?: string): Promise<Commission[]> {
  if (!isSupabaseConfigured()) return [];
  let qb = getSupabase()
    .from('affiliate_commissions')
    .select('*')
    .order('created_at', { ascending: false });
  if (affiliateId) qb = qb.eq('affiliate_id', affiliateId);
  const { data, error } = await qb;
  if (error) throw new Error(`listCommissions: ${error.message}`);
  return (data as Record<string, unknown>[]).map(rowToCommission);
}

export async function markCommissionPaid(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase().from('affiliate_commissions').update({ status: 'paid' }).eq('id', id);
}

export type AffiliateStats = {
  clicks: number;
  referredSignups: number;
  paidConversions: number;
  earningsPendingCentavos: number;
  earningsPaidCentavos: number;
};

/** Aggregate stats for one affiliate (for the admin + affiliate dashboard). */
export async function getAffiliateStats(aff: Affiliate): Promise<AffiliateStats> {
  if (!isSupabaseConfigured()) {
    return {
      clicks: 0,
      referredSignups: 0,
      paidConversions: 0,
      earningsPendingCentavos: 0,
      earningsPaidCentavos: 0,
    };
  }
  const sb = getSupabase();
  const [clicksRes, signupsRes, comms] = await Promise.all([
    sb.from('affiliate_clicks').select('id', { count: 'exact', head: true }).eq('affiliate_id', aff.id),
    sb
      .from('signups')
      .select('id', { count: 'exact', head: true })
      .eq('metadata->>affiliateCode', aff.code),
    listCommissions(aff.id),
  ]);
  const pending = comms.filter((c) => c.status === 'pending').reduce((s, c) => s + c.commissionCentavos, 0);
  const paid = comms.filter((c) => c.status === 'paid').reduce((s, c) => s + c.commissionCentavos, 0);
  return {
    clicks: clicksRes.count ?? 0,
    referredSignups: signupsRes.count ?? 0,
    paidConversions: comms.filter((c) => c.status !== 'void').length,
    earningsPendingCentavos: pending,
    earningsPaidCentavos: paid,
  };
}

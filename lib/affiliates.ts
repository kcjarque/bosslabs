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

import crypto from 'crypto';
import { getSupabase, isSupabaseConfigured } from './supabase';

export { REF_COOKIE, REF_TOUCH_COOKIE, REF_MAX_AGE_SECONDS } from './ref-cookie';

/** Canonical public domain — affiliate share + dashboard links use this
 *  (not the *.vercel.app deploy URL). */
export const PUBLIC_SITE_URL = 'https://www.bosslabs.live';

/** An opaque, non-identifying referral code (so the link never reveals who
 *  the affiliate is). 8 hex chars. */
export function randomAffiliateCode(): string {
  return crypto.randomBytes(4).toString('hex');
}

/** Base commission for self-serve affiliate sign-ups (admin can change any
 *  affiliate's rate after). Single source for the public /affiliate page copy
 *  + the signup endpoint so the advertised rate and the granted rate can't drift.
 *  The program is a ladder: start here, climb via milestones (see TIER_LADDER). */
export const AFFILIATE_DEFAULT_PERCENT = 5;

/** The commission ladder shown on the /affiliate page. Affiliates start at the
 *  base rate and climb as they hit referred-sale milestones. Thresholds are a
 *  starting proposal — tune to taste; wire enforcement once locked. */
export const TIER_LADDER = [
  { percent: 5, label: 'Start', atSales: 0 },
  { percent: 7.5, label: 'Milestone 1', atSales: 10 },
  { percent: 10, label: 'Milestone 2', atSales: 25 },
] as const;

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
  telegramChatId: string;
  notifyEmail: boolean;
  notifyTelegram: boolean;
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
  telegram_chat_id: string | null;
  notify_email: boolean | null;
  notify_telegram: boolean | null;
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
    telegramChatId: r.telegram_chat_id ?? '',
    notifyEmail: r.notify_email ?? true,
    notifyTelegram: r.notify_telegram ?? false,
  };
}

/** Promo-kit / program config (shared across all affiliates). */
export type AffiliateProgram = {
  swipeCopy: string;
  assetsUrl: string;
  onePagerUrl: string;
  /** Reward tiers + bonuses (one tier + one bonus). */
  tiersEnabled: boolean;
  tierMinSales: number;
  tierPercent: number;
  bonusAtSales: number;
  bonusAmountCentavos: number;
};

const EMPTY_PROGRAM: AffiliateProgram = {
  swipeCopy: '',
  assetsUrl: '',
  onePagerUrl: '',
  tiersEnabled: false,
  tierMinSales: 10,
  tierPercent: 0,
  bonusAtSales: 0,
  bonusAmountCentavos: 0,
};

export async function getAffiliateProgram(): Promise<AffiliateProgram> {
  if (!isSupabaseConfigured()) return EMPTY_PROGRAM;
  const { data } = await getSupabase()
    .from('affiliate_program')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (!data) return EMPTY_PROGRAM;
  return {
    swipeCopy: data.swipe_copy ?? '',
    assetsUrl: data.assets_url ?? '',
    onePagerUrl: data.onepager_url ?? '',
    tiersEnabled: data.tiers_enabled ?? false,
    tierMinSales: Number(data.tier_min_sales ?? 10),
    tierPercent: Number(data.tier_percent ?? 0),
    bonusAtSales: Number(data.bonus_at_sales ?? 0),
    bonusAmountCentavos: Number(data.bonus_amount_centavos ?? 0),
  };
}

export async function saveAffiliateProgram(p: AffiliateProgram): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase().from('affiliate_program').upsert({
    id: 1,
    swipe_copy: p.swipeCopy,
    assets_url: p.assetsUrl,
    onepager_url: p.onePagerUrl,
    tiers_enabled: p.tiersEnabled,
    tier_min_sales: p.tierMinSales,
    tier_percent: p.tierPercent,
    bonus_at_sales: p.bonusAtSales,
    bonus_amount_centavos: p.bonusAmountCentavos,
    updated_at: new Date().toISOString(),
  });
}

/** Affiliate self-service: update their notification contact details
 *  (called from the dashboard, keyed by dashboard token — no admin needed). */
export async function updateAffiliateContact(
  token: string,
  patch: { email?: string; telegramChatId?: string; notifyEmail?: boolean; notifyTelegram?: boolean },
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const row: Record<string, unknown> = {};
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.telegramChatId !== undefined) row.telegram_chat_id = patch.telegramChatId;
  if (patch.notifyEmail !== undefined) row.notify_email = patch.notifyEmail;
  if (patch.notifyTelegram !== undefined) row.notify_telegram = patch.notifyTelegram;
  if (Object.keys(row).length === 0) return;
  await getSupabase().from('affiliates').update(row).eq('dashboard_token', token);
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

/** Commission % for a given referred-sale count, per the milestone ladder
 *  (e.g. 0–9 sales → 5%, 10–24 → 7.5%, 25+ → 10%). Returns the highest tier
 *  whose threshold the count has reached. */
export function ladderPercentForSales(salesCount: number): number {
  let pct: number = TIER_LADDER[0].percent;
  for (const t of TIER_LADDER) {
    if (salesCount >= t.atSales) pct = t.percent;
  }
  return pct;
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
  sub?: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase().from('affiliate_clicks').insert({
    affiliate_id: input.affiliateId,
    session_id: input.sessionId ?? '',
    landing_path: input.landingPath ?? '',
    referrer: input.referrer ?? '',
    sub: input.sub ?? '',
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
  sub?: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const aff = await getAffiliateByCode(input.affiliateCode);
  if (!aff || !aff.active) return;
  const sb = getSupabase();
  const program = await getAffiliateProgram();

  // Count prior non-void SALE commissions — drives tier + bonus thresholds.
  const { count: prior } = await sb
    .from('affiliate_commissions')
    .select('id', { count: 'exact', head: true })
    .eq('affiliate_id', aff.id)
    .eq('kind', 'sale')
    .neq('status', 'void');
  const salesCount = prior ?? 0;

  // Effective rate: the milestone LADDER (5→7.5→10) bumps a percent affiliate UP
  // as their referred-sale count climbs. An admin-set custom rate or the program
  // reward tier can only raise it further — never lower it. Persist the climb so
  // the new rate shows in the affiliate's dashboard + admin and sticks for
  // future sales. `salesCount` is PRIOR sales, so the 11th sale earns 7.5%, etc.
  let commission = commissionCentavos(aff, input.saleCentavos);
  if (aff.commissionType === 'percent') {
    let pct = Math.max(aff.commissionValue, ladderPercentForSales(salesCount));
    if (program.tiersEnabled && salesCount >= program.tierMinSales) {
      pct = Math.max(pct, program.tierPercent);
    }
    if (pct > aff.commissionValue) {
      await updateAffiliate(aff.id, { commissionValue: pct });
    }
    commission = Math.round((input.saleCentavos * pct) / 100);
  }

  const { data: inserted } = await sb
    .from('affiliate_commissions')
    .upsert(
      {
        affiliate_id: aff.id,
        signup_id: input.signupId,
        sale_centavos: input.saleCentavos,
        commission_centavos: commission,
        status: 'pending',
        kind: 'sale',
        sub: input.sub ?? '',
      },
      { onConflict: 'signup_id', ignoreDuplicates: true },
    )
    .select('id');

  // ignoreDuplicates returns no rows when the signup was already credited.
  if (!inserted || inserted.length === 0) return;

  await notifyAffiliateOfSale(aff, commission).catch(() => {});

  // One-time milestone bonus. The synthetic signup_id (unique) guarantees it
  // is only ever awarded once per affiliate per threshold.
  const newCount = salesCount + 1;
  if (
    program.tiersEnabled &&
    program.bonusAtSales > 0 &&
    program.bonusAmountCentavos > 0 &&
    newCount >= program.bonusAtSales
  ) {
    await sb.from('affiliate_commissions').upsert(
      {
        affiliate_id: aff.id,
        signup_id: `bonus_${aff.id}_${program.bonusAtSales}`,
        sale_centavos: 0,
        commission_centavos: program.bonusAmountCentavos,
        status: 'pending',
        kind: 'bonus',
        sub: '',
      },
      { onConflict: 'signup_id', ignoreDuplicates: true },
    );
  }
}

/** Email + Telegram "you just earned ₱X" ping to the affiliate. Best-effort. */
async function notifyAffiliateOfSale(aff: Affiliate, commissionCent: number): Promise<void> {
  const amount = formatPHP(commissionCent);
  const firstName = aff.name.split(' ')[0] || 'there';
  if (aff.notifyEmail && aff.email) {
    const { sendEmail } = await import('./email');
    await sendEmail({
      to: aff.email,
      subject: `🎉 You just earned ${amount}!`,
      html: `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:28px;color:#0B0D12">
        <p style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#0093B8;margin:0 0 8px">BOSSLABS AI · Affiliate</p>
        <h1 style="font-family:Georgia,serif;font-size:30px;margin:0 0 12px">Cha-ching, ${firstName}! 💸</h1>
        <p style="font-size:16px;line-height:1.6;color:#1F2330">Someone you referred just bought — you earned <strong>${amount}</strong>. It's now pending in your dashboard.</p>
        <p style="font-size:13px;color:#9BA1AC">Keep sharing your link to earn more.</p>
      </div>`,
    }).catch(() => {});
  }
  if (aff.notifyTelegram && aff.telegramChatId) {
    const { sendTelegramTo } = await import('./telegram');
    await sendTelegramTo(
      aff.telegramChatId,
      `🎉 <b>Cha-ching, ${firstName}!</b>\nYou just earned <b>${amount}</b> — someone you referred bought. It's pending in your dashboard.`,
    ).catch(() => {});
  }
}

/** Format centavos as ₱ (local copy to avoid importing lib/config into the
 *  notification path). */
function formatPHP(centavos: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 }).format(
    centavos / 100,
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
  sub: string;
  kind: 'sale' | 'bonus';
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
    sub: (r.sub as string) ?? '',
    kind: ((r.kind as string) === 'bonus' ? 'bonus' : 'sale'),
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
export async function getAffiliateStats(
  aff: Affiliate,
  /** Pass the full commissions list (fetched once) to avoid an N+1 query when
   *  computing stats for every affiliate on the admin page. */
  preloadedCommissions?: Commission[],
): Promise<AffiliateStats> {
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
    preloadedCommissions
      ? Promise.resolve(preloadedCommissions.filter((c) => c.affiliateId === aff.id))
      : listCommissions(aff.id),
  ]);
  const pending = comms.filter((c) => c.status === 'pending').reduce((s, c) => s + c.commissionCentavos, 0);
  const paid = comms.filter((c) => c.status === 'paid').reduce((s, c) => s + c.commissionCentavos, 0);
  return {
    clicks: clicksRes.count ?? 0,
    referredSignups: signupsRes.count ?? 0,
    // Count only real sales, not milestone-bonus ledger rows.
    paidConversions: comms.filter((c) => c.status !== 'void' && c.kind === 'sale').length,
    earningsPendingCentavos: pending,
    earningsPaidCentavos: paid,
  };
}

export type LeaderboardEntry = {
  affiliateId: string;
  name: string;
  sales: number;
  earningsCentavos: number;
};

/** Top affiliates by paid+pending sales, names masked to first name + initial. */
export async function getLeaderboard(limit = 5): Promise<LeaderboardEntry[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const [affs, comms] = await Promise.all([listAffiliates(), listCommissions()]);
  const byId = new Map(affs.map((a) => [a.id, a]));
  const agg = new Map<string, { sales: number; earnings: number }>();
  for (const c of comms) {
    if (c.status === 'void') continue;
    const cur = agg.get(c.affiliateId) ?? { sales: 0, earnings: 0 };
    if (c.kind === 'sale') cur.sales += 1;
    cur.earnings += c.commissionCentavos;
    agg.set(c.affiliateId, cur);
  }
  return [...agg.entries()]
    .map(([id, v]) => {
      const a = byId.get(id);
      const parts = (a?.name ?? '').trim().split(/\s+/);
      const masked = parts[0] ? `${parts[0]}${parts[1] ? ' ' + parts[1][0] + '.' : ''}` : 'Affiliate';
      return { affiliateId: id, name: masked, sales: v.sales, earningsCentavos: v.earnings };
    })
    .filter((e) => e.sales > 0)
    .sort((a, b) => b.sales - a.sales || b.earningsCentavos - a.earningsCentavos)
    .slice(0, limit);
}

/* ─── Affiliate testimonial videos ─────────────────────────────────────── */
// Affiliates upload testimonial videos in their dashboard; we run ads to them.
// Files go straight to Supabase Storage via a server-signed upload URL (the
// browser PUTs to it directly, so big videos bypass the serverless body limit).
// Private bucket — admin views via short-lived signed URLs.

const VIDEO_BUCKET = 'affiliate-videos';

export type AffiliateVideo = {
  id: string;
  affiliateId: string;
  path: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  url: string | null; // short-lived signed view/download URL
};

/** Server-signed upload URL the browser PUTs the file to. Path is namespaced to
 *  the affiliate so they can only write under their own folder. */
export async function signAffiliateVideoUpload(
  affiliateId: string,
  filename: string,
  _contentType: string,
): Promise<{ path: string; uploadUrl: string } | null> {
  if (!isSupabaseConfigured()) return null;
  const stem = slugifyCode(filename.replace(/\.[^.]+$/, '')) || 'video';
  const ext = (filename.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase();
  const path = `${affiliateId}/${Date.now()}-${stem}${ext}`;
  const { data, error } = await getSupabase().storage.from(VIDEO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const uploadUrl = data.signedUrl.startsWith('http') ? data.signedUrl : `${base}/storage/v1${data.signedUrl}`;
  return { path, uploadUrl };
}

export async function addAffiliateVideo(input: {
  affiliateId: string;
  path: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  // Only allow rows under the affiliate's own folder — defends against a forged
  // path in the confirm call.
  if (!input.path.startsWith(`${input.affiliateId}/`)) return;
  await getSupabase().from('affiliate_videos').insert({
    affiliate_id: input.affiliateId,
    path: input.path,
    original_name: input.originalName.slice(0, 200),
    content_type: input.contentType.slice(0, 100),
    size_bytes: Math.max(0, Math.round(input.sizeBytes)),
  });
}

type AffiliateVideoRow = {
  id: string;
  affiliate_id: string;
  path: string;
  original_name: string | null;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

async function rowsToVideos(rows: AffiliateVideoRow[]): Promise<AffiliateVideo[]> {
  const sb = getSupabase();
  const out: AffiliateVideo[] = [];
  for (const r of rows) {
    const { data } = await sb.storage.from(VIDEO_BUCKET).createSignedUrl(r.path, 60 * 60);
    out.push({
      id: r.id,
      affiliateId: r.affiliate_id,
      path: r.path,
      originalName: r.original_name ?? '',
      contentType: r.content_type ?? '',
      sizeBytes: Number(r.size_bytes ?? 0),
      createdAt: r.created_at,
      url: data?.signedUrl ?? null,
    });
  }
  return out;
}

/** An affiliate's own videos (for their dashboard). */
export async function listAffiliateVideos(affiliateId: string): Promise<AffiliateVideo[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await getSupabase()
    .from('affiliate_videos')
    .select('*')
    .eq('affiliate_id', affiliateId)
    .order('created_at', { ascending: false });
  return rowsToVideos((data as AffiliateVideoRow[]) ?? []);
}

/** All videos with the affiliate's name (for admin review). */
export async function listAllAffiliateVideos(): Promise<(AffiliateVideo & { affiliateName: string })[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await getSupabase()
    .from('affiliate_videos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  const vids = await rowsToVideos((data as AffiliateVideoRow[]) ?? []);
  const names = new Map((await listAffiliates()).map((a) => [a.id, a.name]));
  return vids.map((v) => ({ ...v, affiliateName: names.get(v.affiliateId) ?? 'Affiliate' }));
}

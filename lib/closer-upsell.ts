/**
 * Closer UPSELL subsystem — Feature set on top of the abandoned-cart closers.
 *
 *  1) A claimable pool of PAID customers (post-webinar). A closer claims one to
 *     call and upsell — mirrors the abandoned pool, but keyed in its own table
 *     (closer_upsell_leads) so it never collides with the sales pipeline.
 *
 *  2) Per-lead PROMO CODES scoped to ONE product (retreat / vault /
 *     build_session), blasted to the customer over SMS + email with a
 *     pre-applied product link, then tracked for send status. Reuses the
 *     existing promo_codes discount engine.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { getSignups, savePromoCode, findPromoCode, computeDiscountCentavos, type Signup } from './db';
import { sendEmail } from './email';
import { sendSms } from './sms';

const BASE_URL = 'https://www.bosslabs.live';

/* ── Product registry — the 3 upsells a closer can offer ─────────────────── */

export type UpsellProductKey = 'retreat' | 'vault' | 'build_session';

export type UpsellProduct = {
  key: UpsellProductKey;
  name: string;
  /** List price the discount applies to, in centavos. */
  baseCentavos: number;
  /** Landing path the promo link points at (promo code appended at send). */
  path: string;
};

export const UPSELL_PRODUCTS: Record<UpsellProductKey, UpsellProduct> = {
  retreat: { key: 'retreat', name: 'VibeCode Retreat', baseCentavos: 7_500_000, path: '/vibecode-retreat' },
  vault: { key: 'vault', name: 'The AI Secrets Builder Vault', baseCentavos: 99_900, path: '/oto?product=oto' },
  build_session: { key: 'build_session', name: '1:1 Build Session with Kyle & Mikey', baseCentavos: 399_700, path: '/oto?product=oto2' },
};

export function isUpsellProduct(v: string): v is UpsellProductKey {
  return v === 'retreat' || v === 'vault' || v === 'build_session';
}

/** Personal codes allow a few redemptions (retries / deposit+balance) but not
 *  mass reuse if the code leaks. */
const PROMO_MAX_USES = 5;

/** Hard ceiling on a closer-issued discount — protects margin. Applies to BOTH
 *  percent and fixed-peso codes (a ₱ code can't exceed 15% of the list price). */
export const CLOSER_MAX_DISCOUNT_PCT = 15;

const peso = (c: number) => `₱${(c / 100).toLocaleString('en-PH')}`;

/* ── Pool: paid customers not yet claimed in the upsell pipeline ─────────── */

export type UpsellPoolLead = {
  signupId: string;
  name: string;
  paidCentavos: number;
  paidAt: string;
};

export type UpsellLead = {
  leadId: string;
  signupId: string;
  name: string;
  email: string;
  phone: string;
  paidCentavos: number;
  paidAt: string;
  stage: string; // new | contacted | sent | won | lost
  claimedAt: string;
  sends: UpsellSend[];
};

export type UpsellSend = {
  id: string;
  product: UpsellProductKey;
  promoCode: string;
  discountLabel: string;
  baseCentavos: number;
  discountCentavos: number;
  finalCentavos: number;
  link: string;
  emailStatus: string;
  emailSentAt: string | null;
  smsStatus: string;
  smsSentAt: string | null;
  createdAt: string;
};

const isPaid = (s: Signup) => s.status === 'paid' || s.status === 'attended';
const displayName = (s: Signup) =>
  [s.firstName, (s as { lastName?: string }).lastName].filter(Boolean).join(' ').trim() ||
  s.email?.split('@')[0] ||
  'Customer';

/** All paid customers not yet claimed by any closer in the upsell pool.
 *  Excludes customers who are already committed elsewhere and shouldn't be
 *  cold-upsold: those who CLOSED a DFY deal, and anyone who joined the
 *  VibeCode Retreat (batch 1). Matched by email, live. */
export async function listUpsellPool(): Promise<UpsellPoolLead[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const [claimedRes, dfyRes, retreatRes] = await Promise.all([
    sb.from('closer_upsell_leads').select('signup_id'),
    sb.from('dfy_crm_cards').select('email').eq('stage', 'closed_deal'),
    sb.from('retreat_reservations').select('email'),
  ]);
  const taken = new Set(((claimedRes.data ?? []) as { signup_id: string }[]).map((r) => r.signup_id));
  const excludedEmails = new Set<string>();
  for (const r of [...(dfyRes.data ?? []), ...(retreatRes.data ?? [])] as { email: string | null }[]) {
    const e = (r.email ?? '').toLowerCase().trim();
    if (e) excludedEmails.add(e);
  }
  const signups = await getSignups();
  return signups
    .filter((s) => isPaid(s) && !taken.has(s.id) && !excludedEmails.has((s.email ?? '').toLowerCase().trim()))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((s) => ({
      signupId: s.id,
      name: displayName(s),
      paidCentavos: s.amountCentavos ?? 0,
      paidAt: s.createdAt,
    }));
}

/** A closer's own claimed upsell leads, each with its send history. */
export async function listMyUpsellLeads(closerId: string): Promise<UpsellLead[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const { data: leads } = await sb
    .from('closer_upsell_leads')
    .select('*')
    .eq('closer_id', closerId)
    .order('claimed_at', { ascending: false });
  const rows = (leads ?? []) as Array<{ id: string; signup_id: string; stage: string; claimed_at: string }>;
  if (rows.length === 0) return [];

  const signups = await getSignups();
  const byId = new Map(signups.map((s) => [s.id, s]));
  const leadIds = rows.map((r) => r.id);
  const { data: sendRows } = await sb
    .from('closer_promo_sends')
    .select('*')
    .in('upsell_lead_id', leadIds)
    .order('created_at', { ascending: false });
  const sendsByLead = new Map<string, UpsellSend[]>();
  for (const r of (sendRows ?? []) as Array<Record<string, unknown>>) {
    const list = sendsByLead.get(r.upsell_lead_id as string) ?? [];
    list.push({
      id: r.id as string,
      product: r.product as UpsellProductKey,
      promoCode: r.promo_code as string,
      discountLabel: labelFor(r.discount_type as string, Number(r.discount_value)),
      baseCentavos: Number(r.base_centavos),
      discountCentavos: Number(r.discount_centavos),
      finalCentavos: Number(r.final_centavos),
      link: (r.link as string) ?? '',
      emailStatus: r.email_status as string,
      emailSentAt: (r.email_sent_at as string) ?? null,
      smsStatus: r.sms_status as string,
      smsSentAt: (r.sms_sent_at as string) ?? null,
      createdAt: r.created_at as string,
    });
    sendsByLead.set(r.upsell_lead_id as string, list);
  }

  return rows.map((r) => {
    const s = byId.get(r.signup_id);
    return {
      leadId: r.id,
      signupId: r.signup_id,
      name: s ? displayName(s) : r.signup_id,
      email: s?.email ?? '',
      phone: s?.phone ?? '',
      paidCentavos: s?.amountCentavos ?? 0,
      paidAt: s?.createdAt ?? r.claimed_at,
      stage: r.stage,
      claimedAt: r.claimed_at,
      sends: sendsByLead.get(r.id) ?? [],
    };
  });
}

export type CloserUpsellSummary = {
  closerId: string;
  closerName: string;
  closerUsername: string;
  leads: UpsellLead[];
};

/** Admin oversight: every closer's claimed upsell customers + the promo codes
 *  they sent (with per-channel status). Read-only. */
export async function listAllUpsellActivity(): Promise<CloserUpsellSummary[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const [{ data: closers }, { data: leadRows }, { data: sendRows }] = await Promise.all([
    sb.from('closer_accounts').select('id, name, username').order('name'),
    sb.from('closer_upsell_leads').select('*').order('claimed_at', { ascending: false }),
    sb.from('closer_promo_sends').select('*').order('created_at', { ascending: false }),
  ]);
  const leads = (leadRows ?? []) as Array<{ id: string; signup_id: string; closer_id: string; stage: string; claimed_at: string }>;
  if (leads.length === 0) return [];

  const signups = await getSignups();
  const byId = new Map(signups.map((s) => [s.id, s]));
  const sendsByLead = new Map<string, UpsellSend[]>();
  for (const r of (sendRows ?? []) as Array<Record<string, unknown>>) {
    const list = sendsByLead.get(r.upsell_lead_id as string) ?? [];
    list.push({
      id: r.id as string,
      product: r.product as UpsellProductKey,
      promoCode: r.promo_code as string,
      discountLabel: labelFor(r.discount_type as string, Number(r.discount_value)),
      baseCentavos: Number(r.base_centavos),
      discountCentavos: Number(r.discount_centavos),
      finalCentavos: Number(r.final_centavos),
      link: (r.link as string) ?? '',
      emailStatus: r.email_status as string,
      emailSentAt: (r.email_sent_at as string) ?? null,
      smsStatus: r.sms_status as string,
      smsSentAt: (r.sms_sent_at as string) ?? null,
      createdAt: r.created_at as string,
    });
    sendsByLead.set(r.upsell_lead_id as string, list);
  }

  const leadsByCloser = new Map<string, UpsellLead[]>();
  for (const r of leads) {
    const s = byId.get(r.signup_id);
    const lead: UpsellLead = {
      leadId: r.id,
      signupId: r.signup_id,
      name: s ? displayName(s) : r.signup_id,
      email: s?.email ?? '',
      phone: s?.phone ?? '',
      paidCentavos: s?.amountCentavos ?? 0,
      paidAt: s?.createdAt ?? r.claimed_at,
      stage: r.stage,
      claimedAt: r.claimed_at,
      sends: sendsByLead.get(r.id) ?? [],
    };
    const list = leadsByCloser.get(r.closer_id) ?? [];
    list.push(lead);
    leadsByCloser.set(r.closer_id, list);
  }

  return ((closers ?? []) as Array<{ id: string; name: string; username: string }>)
    .map((c) => ({ closerId: c.id, closerName: c.name, closerUsername: c.username, leads: leadsByCloser.get(c.id) ?? [] }))
    .filter((c) => c.leads.length > 0);
}

/** Claim a paid customer into this closer's upsell pipeline. */
export async function claimUpsellLead(signupId: string, closerId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'not configured' };
  const { error } = await getSupabase()
    .from('closer_upsell_leads')
    .insert({ signup_id: signupId, closer_id: closerId, stage: 'new' });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return { ok: false, error: 'Already claimed by a closer.' };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Release a lead back to the pool (owner only). */
export async function releaseUpsellLead(leadId: string, closerId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase().from('closer_upsell_leads').delete().eq('id', leadId).eq('closer_id', closerId);
}

/** Move a lead across kanban stages (owner only). */
export async function setUpsellStage(leadId: string, closerId: string, stage: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const allowed = ['new', 'contacted', 'sent', 'won', 'lost'];
  if (!allowed.includes(stage)) return;
  await getSupabase()
    .from('closer_upsell_leads')
    .update({ stage, updated_at: new Date().toISOString(), closed_at: stage === 'won' || stage === 'lost' ? new Date().toISOString() : null })
    .eq('id', leadId)
    .eq('closer_id', closerId);
}

/* ── Promo code + send ──────────────────────────────────────────────────── */

function labelFor(type: string, value: number): string {
  return type === 'percent' ? `${value}% off` : `${peso(value)} off`;
}

/** Generate a readable, unique-ish personal code, e.g. "BENNY-VAULT-4KX9". */
function genCode(closerUsername: string, product: UpsellProductKey): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  const stub = closerUsername.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6) || 'CLOSER';
  const prod = product === 'build_session' ? 'BUILD' : product.toUpperCase();
  return `${stub}-${prod}-${suffix}`;
}

/**
 * Create a product-scoped promo code + blast it to the customer over SMS +
 * email with a pre-applied link, and log the send with per-channel status.
 * Returns the send record id + priced numbers. Sending is best-effort — a
 * failed channel is recorded as 'failed', it doesn't throw.
 */
export async function createPromoAndSend(input: {
  leadId: string;
  closerId: string;
  closerName: string;
  closerUsername: string;
  product: UpsellProductKey;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  channels: { email: boolean; sms: boolean };
}): Promise<{ ok: boolean; error?: string; sendId?: string; code?: string; finalCentavos?: number }> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'not configured' };
  const sb = getSupabase();

  // Resolve the lead + customer (must belong to this closer).
  const { data: leadRow } = await sb
    .from('closer_upsell_leads')
    .select('id, signup_id, closer_id')
    .eq('id', input.leadId)
    .eq('closer_id', input.closerId)
    .maybeSingle();
  if (!leadRow) return { ok: false, error: 'Lead not found or not yours.' };
  const signupId = (leadRow as { signup_id: string }).signup_id;

  const signups = await getSignups();
  const customer = signups.find((s) => s.id === signupId);
  if (!customer) return { ok: false, error: 'Customer not found.' };

  const prod = UPSELL_PRODUCTS[input.product];
  const value = Math.max(0, Math.round(input.discountValue));
  if (input.discountType === 'percent' && value < 1) return { ok: false, error: 'Enter a percent between 1 and 15.' };
  if (input.discountType === 'percent' && value > CLOSER_MAX_DISCOUNT_PCT) {
    return { ok: false, error: `Closer promo codes are capped at ${CLOSER_MAX_DISCOUNT_PCT}%.` };
  }
  const discountValueForEngine = input.discountType === 'percent' ? value : value * 100; // fixed = pesos → centavos
  const base = prod.baseCentavos;
  const discount = computeDiscountCentavos({ discountType: input.discountType, discountValue: discountValueForEngine }, base);
  const final = Math.max(0, base - discount);
  if (discount <= 0) return { ok: false, error: 'Discount works out to ₱0 — check the value.' };
  // Enforce the 15% ceiling on the resolved discount — catches fixed-peso codes
  // that would otherwise exceed the cap on a low-priced product.
  const maxDiscount = Math.round((base * CLOSER_MAX_DISCOUNT_PCT) / 100);
  if (discount > maxDiscount) {
    return { ok: false, error: `That's over the ${CLOSER_MAX_DISCOUNT_PCT}% cap — max ${peso(maxDiscount)} off ${prod.name}.` };
  }

  // Mint a unique scoped code (retry a couple times on the rare collision).
  let code = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = genCode(input.closerUsername, input.product);
    const existing = await findPromoCode(candidate);
    if (!existing) { code = candidate; break; }
  }
  if (!code) return { ok: false, error: 'Could not generate a unique code, try again.' };

  await savePromoCode({
    code,
    discountType: input.discountType,
    discountValue: discountValueForEngine,
    maxUses: PROMO_MAX_USES,
    usesCount: 0,
    active: true,
    note: `Closer ${input.closerName} → ${customer.email} for ${prod.name}`,
    product: input.product,
    createdByCloser: input.closerId,
    createdAt: new Date().toISOString(),
  });

  const sep = prod.path.includes('?') ? '&' : '?';
  const link = `${BASE_URL}${prod.path}${sep}promo=${encodeURIComponent(code)}`;
  const discountLabel = labelFor(input.discountType, value);
  const firstName = customer.firstName || displayName(customer);

  // Log the send first (pending) so we always have an audit row.
  const { data: sendRow, error: sendErr } = await sb
    .from('closer_promo_sends')
    .insert({
      upsell_lead_id: input.leadId,
      closer_id: input.closerId,
      signup_id: signupId,
      product: input.product,
      promo_code: code,
      discount_type: input.discountType,
      discount_value: value,
      base_centavos: base,
      discount_centavos: discount,
      final_centavos: final,
      link,
      email_status: input.channels.email ? 'pending' : 'skipped',
      sms_status: input.channels.sms ? 'pending' : 'skipped',
    })
    .select('id')
    .single();
  if (sendErr || !sendRow) return { ok: false, error: `Log failed: ${sendErr?.message ?? 'unknown'}` };
  const sendId = (sendRow as { id: string }).id;

  const vars = {
    firstName,
    productName: prod.name,
    promoCode: code,
    discountLabel,
    basePrice: peso(base),
    finalPrice: peso(final),
    savings: peso(discount),
    link,
    closerName: input.closerName,
  };

  // Email channel.
  if (input.channels.email && customer.email) {
    const res = await sendEmail({ to: customer.email, templateId: 'closer_promo_offer', vars }).catch((e) => ({ ok: false, error: String(e) }));
    await sb.from('closer_promo_sends').update(
      res.ok
        ? { email_status: 'sent', email_sent_at: new Date().toISOString() }
        : { email_status: 'failed', email_error: (res as { error?: string }).error ?? 'send failed' },
    ).eq('id', sendId);
  }

  // SMS channel.
  if (input.channels.sms && customer.phone) {
    const res = await sendSms({ to: customer.phone, templateId: 'closer_promo_offer', vars }).catch((e) => ({ ok: false, error: String(e) }));
    await sb.from('closer_promo_sends').update(
      res.ok
        ? { sms_status: 'sent', sms_sent_at: new Date().toISOString() }
        : { sms_status: 'failed', sms_error: (res as { error?: string }).error ?? 'send failed' },
    ).eq('id', sendId);
  }

  // Advance the lead to 'sent'.
  await sb.from('closer_upsell_leads').update({ stage: 'sent', updated_at: new Date().toISOString() }).eq('id', input.leadId);

  return { ok: true, sendId, code, finalCentavos: final };
}

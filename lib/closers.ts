/**
 * Sales-closer accounts + password hashing.
 *
 * Closers are a distinct, scoped account type (NOT the shared admin). Each
 * logs in at /closer with a username + password (scrypt-hashed). Lead and
 * commission helpers live here too as the subsystem grows.
 */
import crypto from 'crypto';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { setSignupRemarks } from './db';

export type Closer = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  commissionPercent: number;
  active: boolean;
  createdAt: string;
  hasPassword: boolean;
};

type CloserRow = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  password_hash: string | null;
  role: string;
  commission_percent: number | string;
  active: boolean;
  created_at: string;
};

function rowToCloser(r: CloserRow): Closer {
  return {
    id: r.id,
    name: r.name,
    username: r.username,
    email: r.email ?? '',
    role: r.role,
    commissionPercent: Number(r.commission_percent),
    active: r.active,
    createdAt: r.created_at,
    hasPassword: Boolean(r.password_hash),
  };
}

/* ---- password hashing (scrypt, built-in crypto) ------------------- */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---- CRUD --------------------------------------------------------- */

export async function listClosers(): Promise<Closer[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('closer_accounts')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listClosers: ${error.message}`);
  return (data as CloserRow[]).map(rowToCloser);
}

export async function getCloserById(id: string): Promise<Closer | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabase().from('closer_accounts').select('*').eq('id', id).maybeSingle();
  return data ? rowToCloser(data as CloserRow) : null;
}

/** Verify a login. Returns the closer on success, null otherwise. */
export async function verifyCloserLogin(username: string, password: string): Promise<Closer | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabase()
    .from('closer_accounts')
    .select('*')
    .eq('username', username.trim().toLowerCase())
    .maybeSingle();
  if (!data) return null;
  const row = data as CloserRow;
  if (!row.active) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return rowToCloser(row);
}

export async function createCloser(input: {
  name: string;
  username: string;
  email?: string;
  password?: string;
  commissionPercent?: number;
}): Promise<Closer> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
  const { data, error } = await getSupabase()
    .from('closer_accounts')
    .insert({
      name: input.name.trim(),
      username: input.username.trim().toLowerCase(),
      email: input.email?.trim() || null,
      password_hash: input.password ? hashPassword(input.password) : null,
      commission_percent: input.commissionPercent ?? 20,
    })
    .select('*')
    .single();
  if (error) throw new Error(`createCloser: ${error.message}`);
  return rowToCloser(data as CloserRow);
}

export async function updateCloser(
  id: string,
  patch: { name?: string; email?: string; commissionPercent?: number; active?: boolean; password?: string },
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.email !== undefined) row.email = patch.email.trim() || null;
  if (patch.commissionPercent !== undefined) row.commission_percent = patch.commissionPercent;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.password) row.password_hash = hashPassword(patch.password);
  if (Object.keys(row).length === 0) return;
  const { error } = await getSupabase().from('closer_accounts').update(row).eq('id', id);
  if (error) throw new Error(`updateCloser: ${error.message}`);
}

/* ===================================================================== */
/* LEADS — abandoned-cart pool + per-closer pipeline                     */
/* ===================================================================== */

/** Total a customer paid / would pay (main + confirmed OTO), in centavos. */
function totalCentavos(amountCentavos: number | null, metadata: Record<string, unknown> | null): number {
  const meta = (metadata ?? {}) as { otoConfirmed?: string; otoAmount?: number };
  const oto = meta.otoConfirmed && meta.otoAmount ? meta.otoAmount * 100 : 0;
  return (amountCentavos ?? 99900) + oto;
}

/** Signup ids that a closer claimed and that then paid (a closer commission
 *  exists). Used to flag those sales as "recovered" on the dashboard +
 *  customers table even when the payment landed the same day. */
export async function getCloserRecoveredSignupIds(): Promise<Set<string>> {
  if (!isSupabaseConfigured()) return new Set();
  const { data } = await getSupabase().from('closer_commissions').select('signup_id');
  return new Set(((data ?? []) as { signup_id: string }[]).map((r) => r.signup_id));
}

/** The closer who claimed this signup (from closer_leads), or null if the
 *  sale wasn't worked by a closer. Used to credit the closer on alerts. */
export async function getCloserForSignup(
  signupId: string,
): Promise<{ id: string; name: string; username: string } | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data: lead } = await sb
    .from('closer_leads')
    .select('closer_id')
    .eq('signup_id', signupId)
    .maybeSingle();
  if (!lead) return null;
  const { data: closer } = await sb
    .from('closer_accounts')
    .select('id, name, username')
    .eq('id', (lead as { closer_id: string }).closer_id)
    .maybeSingle();
  return closer ? (closer as { id: string; name: string; username: string }) : null;
}

/** Abandoned carts (registered, not paid) NOT yet claimed by any closer.
 *  No phone is returned — the pool is intentionally private until claimed. */
export type PoolLead = { signupId: string; name: string; amountDueCentavos: number; createdAt: string };

export async function listUnclaimedAbandoned(): Promise<PoolLead[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const { data: claimed } = await sb.from('closer_leads').select('signup_id');
  const taken = new Set(((claimed ?? []) as { signup_id: string }[]).map((r) => r.signup_id));
  const { data } = await sb
    .from('signups')
    .select('id, first_name, last_name, amount_centavos, created_at')
    .eq('source', 'paid')
    .eq('status', 'registered')
    .order('created_at', { ascending: false });
  return ((data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; amount_centavos: number | null; created_at: string }>)
    .filter((s) => !taken.has(s.id))
    .map((s) => ({
      signupId: s.id,
      name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || 'Customer',
      amountDueCentavos: s.amount_centavos ?? 99900,
      createdAt: s.created_at,
    }));
}

/** A closer's own leads — phone REVEALED (only ever fetched for the owner). */
export type CloserLead = {
  leadId: string;
  signupId: string;
  name: string;
  phone: string;
  amountCentavos: number;
  stage: string;
  claimedAt: string;
  closedAt: string | null;
  commissionCentavos: number | null;
  /** Free-text remark — shared store with the order-bump board + customer
   *  profile (signup metadata.remarks). */
  remarks: string;
  /** Working minutes left before this claim auto-releases (null once closed).
   *  Counts only the closer's working hours — pauses overnight. */
  remainingHoldMin: number | null;
};

/** Working-hours window in Asia/Manila local time (24h). */
export type WorkHours = { startHour: number; endHour: number };

const MANILA_OFFSET_MS = 8 * 3600_000; // UTC+8, no DST
const DAY_MS = 24 * 3600_000;

/**
 * Minutes between two instants that fall inside the daily working window
 * [startHour, endHour) in Manila. Walks day-by-day and sums each day's
 * overlap. If the window is invalid (start >= end) it degrades to wall-clock.
 */
export function workingMinutesBetween(startMs: number, endMs: number, work: WorkHours): number {
  if (endMs <= startMs) return 0;
  const openMin = work.startHour * 60;
  const closeMin = work.endHour * 60;
  if (!(closeMin > openMin)) return Math.floor((endMs - startMs) / 60000); // degrade to wall-clock
  const s = startMs + MANILA_OFFSET_MS;
  const e = endMs + MANILA_OFFSET_MS;
  let total = 0;
  for (let day = Math.floor(s / DAY_MS) * DAY_MS; day < e; day += DAY_MS) {
    const segStart = Math.max(s, day + openMin * 60000);
    const segEnd = Math.min(e, day + closeMin * 60000);
    if (segEnd > segStart) total += (segEnd - segStart) / 60000;
  }
  return Math.floor(total);
}

/** Minutes left before a claim (claimed at claimedMs) expires. The hold is a
 *  fixed calendar duration (holdHours), counted 24/7 — wall-clock, not paused
 *  outside work hours. */
function remainingHoldMin(claimedMs: number, holdHours: number): number {
  return holdHours * 60 - (Date.now() - claimedMs) / 60000;
}

/**
 * Release every claim whose hold window (a fixed calendar duration, counted
 * 24/7) has elapsed and isn't closed, back to the pool. Lazy-expiry: called
 * whenever the board loads. closer_leads is tiny, so we compute per lead.
 */
export async function releaseExpiredClaims(holdHours: number): Promise<number> {
  if (!isSupabaseConfigured() || !(holdHours > 0)) return 0;
  const sb = getSupabase();
  const { data } = await sb.from('closer_leads').select('id, claimed_at').neq('stage', 'closed');
  const rows = (data ?? []) as Array<{ id: string; claimed_at: string }>;
  const expired = rows
    .filter((r) => remainingHoldMin(new Date(r.claimed_at).getTime(), holdHours) <= 0)
    .map((r) => r.id);
  if (expired.length === 0) return 0;
  const { data: del } = await sb.from('closer_leads').delete().in('id', expired).select('id');
  return del?.length ?? 0;
}

export async function listCloserLeads(
  closerId: string,
  holdHours = 6,
): Promise<CloserLead[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const { data: leads } = await sb
    .from('closer_leads')
    .select('id, signup_id, stage, claimed_at, closed_at')
    .eq('closer_id', closerId)
    .order('claimed_at', { ascending: false });
  const rows = (leads ?? []) as Array<{ id: string; signup_id: string; stage: string; claimed_at: string; closed_at: string | null }>;
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.signup_id);
  const { data: sigs } = await sb
    .from('signups')
    .select('id, first_name, last_name, phone, amount_centavos, metadata')
    .in('id', ids);
  const sigMap = new Map(((sigs ?? []) as Array<Record<string, unknown>>).map((s) => [s.id as string, s]));
  const { data: comms } = await sb.from('closer_commissions').select('signup_id, amount_centavos').in('signup_id', ids);
  const commMap = new Map(((comms ?? []) as Array<{ signup_id: string; amount_centavos: number }>).map((c) => [c.signup_id, c.amount_centavos]));
  return rows.map((r) => {
    const s = (sigMap.get(r.signup_id) ?? {}) as Record<string, unknown>;
    const meta = (s.metadata as { remarks?: string } | null) ?? {};
    return {
      leadId: r.id,
      signupId: r.signup_id,
      name: `${(s.first_name as string) ?? ''} ${(s.last_name as string) ?? ''}`.trim() || 'Customer',
      phone: (s.phone as string) ?? '',
      amountCentavos: totalCentavos((s.amount_centavos as number) ?? null, (s.metadata as Record<string, unknown>) ?? null),
      stage: r.stage,
      claimedAt: r.claimed_at,
      closedAt: r.closed_at,
      commissionCentavos: commMap.get(r.signup_id) ?? null,
      remarks: meta.remarks ?? '',
      remainingHoldMin:
        r.stage === 'closed'
          ? null
          : Math.max(0, remainingHoldMin(new Date(r.claimed_at).getTime(), holdHours)),
    };
  });
}

/** Set a remark on a lead — only if this closer owns it. Writes to the shared
 *  signup store (so it also shows on the order-bump board + customer profile). */
export async function setLeadRemark(
  signupId: string,
  closerId: string,
  remarks: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'not configured' };
  const { data } = await getSupabase()
    .from('closer_leads')
    .select('id')
    .eq('signup_id', signupId)
    .eq('closer_id', closerId)
    .maybeSingle();
  if (!data) return { ok: false, error: 'Not your lead.' };
  await setSignupRemarks(signupId, remarks);
  return { ok: true };
}

/** Claim an abandoned cart. The unique signup_id index makes this atomic —
 *  a second closer claiming the same lead gets a clean "already claimed". */
export async function claimLead(signupId: string, closerId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'not configured' };
  const { error } = await getSupabase()
    .from('closer_leads')
    .insert({ signup_id: signupId, closer_id: closerId, stage: 'new' });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return { ok: false, error: 'Already claimed.' };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Release a lead back to the pool (owner only, never if already closed). */
export async function releaseLead(leadId: string, closerId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase()
    .from('closer_leads')
    .delete()
    .eq('id', leadId)
    .eq('closer_id', closerId)
    .neq('stage', 'closed');
}

/** Move a lead within the owner's own stages (new ↔ contacted). Closed is
 *  payment-driven only, so we never let a manual stage clobber it. */
export async function setLeadStage(leadId: string, closerId: string, stage: string): Promise<void> {
  if (!isSupabaseConfigured() || stage === 'closed') return;
  await getSupabase()
    .from('closer_leads')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('closer_id', closerId)
    .neq('stage', 'closed');
}

/* ===================================================================== */
/* COMMISSIONS                                                           */
/* ===================================================================== */

export type CloserCommissionRow = {
  id: string;
  signupId: string;
  name: string;
  saleCentavos: number;
  percent: number;
  amountCentavos: number;
  status: string;
  createdAt: string;
};

export async function listCloserCommissions(closerId: string): Promise<CloserCommissionRow[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const { data } = await sb
    .from('closer_commissions')
    .select('*')
    .eq('closer_id', closerId)
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const ids = rows.map((r) => r.signup_id as string);
  const sigMap = new Map<string, string>();
  if (ids.length) {
    const { data: sigs } = await sb.from('signups').select('id, first_name, last_name').in('id', ids);
    for (const s of (sigs ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
      sigMap.set(s.id, `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || 'Customer');
    }
  }
  return rows.map((r) => ({
    id: r.id as string,
    signupId: r.signup_id as string,
    name: sigMap.get(r.signup_id as string) ?? 'Customer',
    saleCentavos: Number(r.sale_centavos),
    percent: Number(r.percent),
    amountCentavos: Number(r.amount_centavos),
    status: r.status as string,
    createdAt: r.created_at as string,
  }));
}

/* ===================================================================== */
/* ADMIN — assignments overview (every closer's leads, read-only)        */
/* ===================================================================== */

export type AssignmentLead = {
  name: string;
  stage: string;
  claimedAt: string;
  closedAt: string | null;
  commissionCentavos: number | null;
};
export type CloserAssignment = {
  closer: Closer;
  active: AssignmentLead[];
  closed: AssignmentLead[];
  commissionTotalCentavos: number;
};

/** Every closer with their leads grouped into active/closed + commission
 *  total — for the admin assignments view. Batched (no per-closer queries). */
export async function getCloserAssignments(): Promise<{
  rows: CloserAssignment[];
  unassignedCount: number;
}> {
  if (!isSupabaseConfigured()) return { rows: [], unassignedCount: 0 };
  const sb = getSupabase();
  const [closers, leadsRes, commsRes, pool] = await Promise.all([
    listClosers(),
    sb.from('closer_leads').select('signup_id, closer_id, stage, claimed_at, closed_at'),
    sb.from('closer_commissions').select('signup_id, closer_id, amount_centavos'),
    listUnclaimedAbandoned(),
  ]);
  const leadRows = (leadsRes.data ?? []) as Array<{
    signup_id: string; closer_id: string; stage: string; claimed_at: string; closed_at: string | null;
  }>;

  const ids = [...new Set(leadRows.map((r) => r.signup_id))];
  const nameMap = new Map<string, string>();
  if (ids.length) {
    const { data: sigs } = await sb.from('signups').select('id, first_name, last_name').in('id', ids);
    for (const s of (sigs ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
      nameMap.set(s.id, `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || 'Customer');
    }
  }

  const commByCloser = new Map<string, number>();
  const commBySignup = new Map<string, number>();
  for (const c of (commsRes.data ?? []) as Array<{ signup_id: string; closer_id: string; amount_centavos: number }>) {
    commByCloser.set(c.closer_id, (commByCloser.get(c.closer_id) ?? 0) + c.amount_centavos);
    commBySignup.set(c.signup_id, c.amount_centavos);
  }

  const buckets = new Map<string, { active: AssignmentLead[]; closed: AssignmentLead[] }>();
  for (const c of closers) buckets.set(c.id, { active: [], closed: [] });
  for (const r of leadRows) {
    const b = buckets.get(r.closer_id);
    if (!b) continue;
    const lead: AssignmentLead = {
      name: nameMap.get(r.signup_id) ?? 'Customer',
      stage: r.stage,
      claimedAt: r.claimed_at,
      closedAt: r.closed_at,
      commissionCentavos: commBySignup.get(r.signup_id) ?? null,
    };
    (r.stage === 'closed' ? b.closed : b.active).push(lead);
  }

  const rows = closers.map((closer) => ({
    closer,
    active: buckets.get(closer.id)!.active,
    closed: buckets.get(closer.id)!.closed,
    commissionTotalCentavos: commByCloser.get(closer.id) ?? 0,
  }));
  return { rows, unassignedCount: pool.length };
}

/**
 * Called from the payment webhook. If this customer's lead was claimed by a
 * closer, mark it closed and record (or top-up, when the OTO lands later) the
 * commission on the total they paid. No-op if no closer claimed them. Never
 * throws — a CRM hiccup must not break a payment.
 */
export async function closeLeadAndRecordCommission(signupId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const sb = getSupabase();
    const { data: lead } = await sb
      .from('closer_leads')
      .select('id, closer_id')
      .eq('signup_id', signupId)
      .maybeSingle();
    if (!lead) return; // not a closer's lead
    const l = lead as { id: string; closer_id: string };

    const { data: sig } = await sb
      .from('signups')
      .select('amount_centavos, metadata')
      .eq('id', signupId)
      .maybeSingle();
    const total = totalCentavos(
      (sig as { amount_centavos: number | null } | null)?.amount_centavos ?? null,
      (sig as { metadata: Record<string, unknown> | null } | null)?.metadata ?? null,
    );

    const { data: closer } = await sb
      .from('closer_accounts')
      .select('commission_percent')
      .eq('id', l.closer_id)
      .maybeSingle();
    const pct = Number((closer as { commission_percent: number } | null)?.commission_percent ?? 20);
    const amount = Math.round((total * pct) / 100);

    await sb
      .from('closer_leads')
      .update({ stage: 'closed', closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', l.id);

    // Upsert the commission, preserving an existing status (so a later OTO
    // top-up doesn't flip an already-paid commission back to pending).
    const { data: existing } = await sb
      .from('closer_commissions')
      .select('id')
      .eq('signup_id', signupId)
      .maybeSingle();
    if (existing) {
      await sb
        .from('closer_commissions')
        .update({ sale_centavos: total, percent: pct, amount_centavos: amount })
        .eq('id', (existing as { id: string }).id);
    } else {
      await sb.from('closer_commissions').insert({
        closer_id: l.closer_id,
        signup_id: signupId,
        sale_centavos: total,
        percent: pct,
        amount_centavos: amount,
        status: 'pending',
      });
    }
  } catch (err) {
    console.warn('[closers] closeLeadAndRecordCommission skipped:', err instanceof Error ? err.message : err);
  }
}

/* ---- Payouts ------------------------------------------------------------ */

export type CloserPayout = {
  id: string;
  closerId: string;
  amountCentavos: number;
  commissionCount: number;
  slipUrl: string | null;
  slipFilename: string | null;
  note: string | null;
  status: 'paid' | 'voided';
  createdBy: string | null;
  paidAt: string;
  voidedAt: string | null;
};

type CloserPayoutRow = {
  id: string;
  closer_id: string;
  amount_centavos: number;
  commission_count: number;
  slip_url: string | null;
  slip_filename: string | null;
  note: string | null;
  status: 'paid' | 'voided';
  created_by: string | null;
  paid_at: string;
  voided_at: string | null;
};

function rowToPayout(r: CloserPayoutRow): CloserPayout {
  return {
    id: r.id,
    closerId: r.closer_id,
    amountCentavos: Number(r.amount_centavos),
    commissionCount: r.commission_count,
    slipUrl: r.slip_url,
    slipFilename: r.slip_filename,
    note: r.note,
    status: r.status,
    createdBy: r.created_by,
    paidAt: r.paid_at,
    voidedAt: r.voided_at,
  };
}

/** Aggregate pending commissions grouped by closer. Drives the admin
 *  Commissions tab — each row is "Closer X has Y commissions totaling ₱Z". */
export type CloserPendingGroup = {
  closer: Closer;
  totalCentavos: number;
  commissions: CloserCommissionRow[];
};

export async function listPendingCommissionsByCloser(): Promise<CloserPendingGroup[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const [{ data: closers }, { data: comms }] = await Promise.all([
    sb.from('closer_accounts').select('*').order('name', { ascending: true }),
    sb.from('closer_commissions').select('*').eq('status', 'pending'),
  ]);
  // Hydrate names from signups in a single query, mirroring listCloserCommissions.
  const signupIds = ((comms ?? []) as Array<{ signup_id: string }>).map((c) => c.signup_id);
  let nameMap = new Map<string, string>();
  if (signupIds.length > 0) {
    const { data: sigs } = await sb
      .from('signups')
      .select('id, first_name, last_name')
      .in('id', signupIds);
    nameMap = new Map(
      ((sigs ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>).map((s) => [
        s.id,
        [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || 'Customer',
      ]),
    );
  }
  const byCloser = new Map<string, CloserCommissionRow[]>();
  for (const c of (comms ?? []) as Array<{ id: string; closer_id: string; signup_id: string; sale_centavos: number | string; percent: number | string; amount_centavos: number | string; status: string; created_at: string }>) {
    const row: CloserCommissionRow = {
      id: c.id,
      signupId: c.signup_id,
      name: nameMap.get(c.signup_id) ?? 'Customer',
      saleCentavos: Number(c.sale_centavos),
      percent: Number(c.percent),
      amountCentavos: Number(c.amount_centavos),
      status: c.status as 'pending' | 'paid' | 'void',
      createdAt: c.created_at,
    };
    const list = byCloser.get(c.closer_id) ?? [];
    list.push(row);
    byCloser.set(c.closer_id, list);
  }
  return ((closers ?? []) as CloserRow[]).map((c) => {
    const closer = rowToCloser(c);
    const commissions = (byCloser.get(closer.id) ?? []).sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    const totalCentavos = commissions.reduce((s, r) => s + r.amountCentavos, 0);
    return { closer, totalCentavos, commissions };
  });
}

/** Create a payout for one closer: tallies the listed pending commissions,
 *  inserts a payout row, then atomically flips those commissions to
 *  status='paid' with their payout_id pointed at the new payout. */
export async function createCloserPayout(input: {
  closerId: string;
  slipUrl?: string | null;
  slipFilename?: string | null;
  note?: string | null;
  createdBy?: string | null;
}): Promise<CloserPayout | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  // Re-pull the closer's currently-pending commissions at write time so a
  // stale UI doesn't double-pay anything that was just paid by another tab.
  const { data: pending, error: pendErr } = await sb
    .from('closer_commissions')
    .select('id, amount_centavos')
    .eq('closer_id', input.closerId)
    .eq('status', 'pending');
  if (pendErr) throw new Error(`createCloserPayout pending: ${pendErr.message}`);
  const rows = (pending ?? []) as Array<{ id: string; amount_centavos: number | string }>;
  if (rows.length === 0) throw new Error('No pending commissions to pay out');

  const total = rows.reduce((s, r) => s + Number(r.amount_centavos), 0);
  const commissionIds = rows.map((r) => r.id);

  const { data: payoutRow, error: payErr } = await sb
    .from('closer_payouts')
    .insert({
      closer_id: input.closerId,
      amount_centavos: total,
      commission_count: rows.length,
      slip_url: input.slipUrl ?? null,
      slip_filename: input.slipFilename ?? null,
      note: input.note ?? null,
      created_by: input.createdBy ?? null,
    })
    .select('*')
    .single();
  if (payErr || !payoutRow) throw new Error(`createCloserPayout insert: ${payErr?.message ?? 'unknown'}`);

  const payout = rowToPayout(payoutRow as CloserPayoutRow);

  // Flip those commissions to paid and link them. Single update — Postgres
  // is atomic per statement, so either all flip or none.
  const { error: updErr } = await sb
    .from('closer_commissions')
    .update({ status: 'paid', payout_id: payout.id })
    .in('id', commissionIds);
  if (updErr) throw new Error(`createCloserPayout link: ${updErr.message}`);

  return payout;
}

/** Mark a payout voided + revert its commissions back to 'pending'. The
 *  payout row stays for the audit log. */
export async function voidCloserPayout(payoutId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();
  // Flip linked commissions back to pending first so a partial failure
  // can't leave a paid commission orphaned under a voided payout.
  await sb
    .from('closer_commissions')
    .update({ status: 'pending', payout_id: null })
    .eq('payout_id', payoutId);
  await sb
    .from('closer_payouts')
    .update({ status: 'voided', voided_at: new Date().toISOString() })
    .eq('id', payoutId);
}

export type PayoutWithCloser = CloserPayout & { closerName: string; closerUsername: string };

export async function listPayouts(): Promise<PayoutWithCloser[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from('closer_payouts')
    .select('*, closer_accounts!inner(name, username)')
    .order('paid_at', { ascending: false });
  if (error) throw new Error(`listPayouts: ${error.message}`);
  return ((data ?? []) as Array<CloserPayoutRow & { closer_accounts: { name: string; username: string } | null }>).map((r) => ({
    ...rowToPayout(r),
    closerName: r.closer_accounts?.name ?? '—',
    closerUsername: r.closer_accounts?.username ?? '',
  }));
}

export async function listCommissionsByPayout(payoutId: string): Promise<CloserCommissionRow[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from('closer_commissions')
    .select('*')
    .eq('payout_id', payoutId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listCommissionsByPayout: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: string; signup_id: string; sale_centavos: number | string; percent: number | string; amount_centavos: number | string; status: string; created_at: string }>;
  // Hydrate names
  let nameMap = new Map<string, string>();
  if (rows.length > 0) {
    const { data: sigs } = await sb
      .from('signups')
      .select('id, first_name, last_name')
      .in('id', rows.map((r) => r.signup_id));
    nameMap = new Map(
      ((sigs ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>).map((s) => [
        s.id,
        [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || 'Customer',
      ]),
    );
  }
  return rows.map((r) => ({
    id: r.id,
    signupId: r.signup_id,
    name: nameMap.get(r.signup_id) ?? 'Customer',
    saleCentavos: Number(r.sale_centavos),
    percent: Number(r.percent),
    amountCentavos: Number(r.amount_centavos),
    status: r.status as 'pending' | 'paid' | 'void',
    createdAt: r.created_at,
  }));
}

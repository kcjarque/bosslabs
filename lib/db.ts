/**
 * Mini backend storage layer.
 *
 * Two backends with the SAME public API:
 *
 *   1. **Supabase** (production) — used when NEXT_PUBLIC_SUPABASE_URL and
 *      SUPABASE_SERVICE_ROLE_KEY are both present in the environment.
 *      Run `supabase/migrations/0001_init.sql` once to provision tables.
 *
 *   2. **JSON files** in `/data` (dev / single-instance VPS) — used as a
 *      fallback when Supabase env vars are missing. Convenient for local
 *      development without setting up a database. NOT safe on Vercel
 *      because the serverless filesystem is ephemeral.
 *
 * The public API exported below is identical for both backends — every
 * `app/api/*` route and every admin component just imports from here.
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getSupabase, isSupabaseConfigured } from './supabase';

/* --------------------------------------------------------------------- */
/* TYPES                                                                 */
/* --------------------------------------------------------------------- */

export type SignupSource = 'free' | 'paid' | 'contact';
export type SignupStatus =
  | 'registered'
  | 'paid'
  | 'attended'
  | 'no-show'
  | 'refunded'
  | 'unsubscribed';

export type Signup = {
  id: string;
  firstName: string;
  lastName?: string;
  email: string;
  phone: string;
  source: SignupSource;
  status: SignupStatus;
  amountCentavos?: number;
  bumped?: boolean;
  message?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  /** Rendered HTML — what gets sent to Resend. */
  html: string;
  /** Markdown source — when present, the editor opens in text mode and
   *  regenerates html on save. null on legacy templates created before
   *  the text editor. */
  body?: string | null;
};

export type SmsTemplate = {
  id: string;
  name: string;
  body: string;
};

export type PromoDiscountType = 'free' | 'percent' | 'fixed';

export type PromoCode = {
  code: string;
  /** 'free' = 100% off; 'percent' = N%; 'fixed' = N centavos off. */
  discountType: PromoDiscountType;
  /** Ignored when discountType='free'. */
  discountValue: number;
  /** null = unlimited. */
  maxUses?: number | null;
  usesCount: number;
  /** ISO timestamp. null = never expires. */
  expiresAt?: string | null;
  active: boolean;
  note?: string | null;
  createdAt: string;
};

export type Settings = {
  /* Webinar (edit live from /admin/settings — falls back to env vars on cold start) */
  webinarName: string;
  webinarDate: string;
  webinarTime: string;
  webinarTimezone: string;
  webinarStartsAtIso: string;
  /* Email — Resend */
  resendApiKey: string;
  resendFromEmail: string;
  resendFromName: string;
  /** Reply-To header — a monitored inbox. "no-reply" addresses tank
   *  deliverability with Gmail's spam classifier. */
  resendReplyTo: string;
  /* SMS — OneWaySMS */
  onewaysmsEndpoint: string;
  onewaysmsUsername: string;
  onewaysmsPassword: string;
  onewaysmsSenderId: string;
  /* Webinar deliverables */
  zoomRegisterUrl: string;
  zoomJoinUrl: string;
  replayUrl: string;
  messengerGroupUrl: string;
};

const DEFAULT_SETTINGS: Settings = {
  webinarName: 'AI Coding 101 — The BOSSLABS AI Webinar',
  webinarDate: 'To Be Announced',
  webinarTime: '8:00 PM',
  webinarTimezone: 'PHT',
  webinarStartsAtIso: '',
  resendApiKey: '',
  resendFromEmail: 'hello@bosslabs.ai',
  resendFromName: 'BOSSLABS AI',
  resendReplyTo: 'hello@bosslabs.ai',
  // OneWaySMS PH default endpoint. Verified reachable from Vercel egress
  // (port 10001 is open + returns proper -100 / message-id responses).
  // The `gateway.onewaysms.com.ph` variant some old docs cite is a
  // different service behind an Incapsula WAF — do NOT use it.
  // sgateway.onewaysms.com (port 443) was tested and returned empty bodies
  // — likely requires IP allowlisting on the dashboard side.
  onewaysmsEndpoint: 'http://gateway.onewaysms.ph:10001/api.aspx',
  onewaysmsUsername: '',
  onewaysmsPassword: '',
  onewaysmsSenderId: 'BOSSLABS',
  zoomRegisterUrl: '',
  zoomJoinUrl: '',
  replayUrl: '',
  messengerGroupUrl: '',
};

/* --------------------------------------------------------------------- */
/* Row mapping (snake_case ↔ camelCase)                                  */
/* --------------------------------------------------------------------- */

type SignupRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string;
  phone: string;
  source: SignupSource;
  status: SignupStatus;
  amount_centavos: number | null;
  bumped: boolean | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function rowToSignup(r: SignupRow): Signup {
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name ?? undefined,
    email: r.email,
    phone: r.phone,
    source: r.source,
    status: r.status,
    amountCentavos: r.amount_centavos ?? undefined,
    bumped: r.bumped ?? undefined,
    message: r.message ?? undefined,
    metadata: r.metadata ?? undefined,
    createdAt: r.created_at,
  };
}

function signupToRow(s: Signup): SignupRow {
  return {
    id: s.id,
    first_name: s.firstName,
    last_name: s.lastName ?? null,
    email: s.email,
    phone: s.phone,
    source: s.source,
    status: s.status,
    amount_centavos: s.amountCentavos ?? null,
    bumped: s.bumped ?? null,
    message: s.message ?? null,
    metadata: s.metadata ?? null,
    created_at: s.createdAt,
  };
}

type SettingsRow = {
  id: number;
  webinar_name: string;
  webinar_date: string;
  webinar_time: string;
  webinar_timezone: string;
  webinar_starts_at_iso: string;
  resend_api_key: string;
  resend_from_email: string;
  resend_from_name: string;
  resend_reply_to: string;
  onewaysms_endpoint: string;
  onewaysms_username: string;
  onewaysms_password: string;
  onewaysms_sender_id: string;
  zoom_register_url: string;
  zoom_join_url: string;
  replay_url: string;
  messenger_group_url: string;
};

function rowToSettings(r: SettingsRow): Settings {
  return {
    webinarName: r.webinar_name ?? '',
    webinarDate: r.webinar_date ?? '',
    webinarTime: r.webinar_time ?? '',
    webinarTimezone: r.webinar_timezone ?? '',
    webinarStartsAtIso: r.webinar_starts_at_iso ?? '',
    resendApiKey: r.resend_api_key ?? '',
    resendFromEmail: r.resend_from_email ?? '',
    resendFromName: r.resend_from_name ?? '',
    resendReplyTo: r.resend_reply_to ?? '',
    onewaysmsEndpoint: r.onewaysms_endpoint ?? '',
    onewaysmsUsername: r.onewaysms_username ?? '',
    onewaysmsPassword: r.onewaysms_password ?? '',
    onewaysmsSenderId: r.onewaysms_sender_id ?? '',
    zoomRegisterUrl: r.zoom_register_url ?? '',
    zoomJoinUrl: r.zoom_join_url ?? '',
    replayUrl: r.replay_url ?? '',
    messengerGroupUrl: r.messenger_group_url ?? '',
  };
}

function settingsToRow(s: Partial<Settings>): Partial<SettingsRow> {
  const out: Partial<SettingsRow> = { id: 1 };
  if (s.webinarName !== undefined) out.webinar_name = s.webinarName;
  if (s.webinarDate !== undefined) out.webinar_date = s.webinarDate;
  if (s.webinarTime !== undefined) out.webinar_time = s.webinarTime;
  if (s.webinarTimezone !== undefined) out.webinar_timezone = s.webinarTimezone;
  if (s.webinarStartsAtIso !== undefined) out.webinar_starts_at_iso = s.webinarStartsAtIso;
  if (s.resendApiKey !== undefined) out.resend_api_key = s.resendApiKey;
  if (s.resendFromEmail !== undefined) out.resend_from_email = s.resendFromEmail;
  if (s.resendFromName !== undefined) out.resend_from_name = s.resendFromName;
  if (s.resendReplyTo !== undefined) out.resend_reply_to = s.resendReplyTo;
  if (s.onewaysmsEndpoint !== undefined) out.onewaysms_endpoint = s.onewaysmsEndpoint;
  if (s.onewaysmsUsername !== undefined) out.onewaysms_username = s.onewaysmsUsername;
  if (s.onewaysmsPassword !== undefined) out.onewaysms_password = s.onewaysmsPassword;
  if (s.onewaysmsSenderId !== undefined) out.onewaysms_sender_id = s.onewaysmsSenderId;
  if (s.zoomRegisterUrl !== undefined) out.zoom_register_url = s.zoomRegisterUrl;
  if (s.zoomJoinUrl !== undefined) out.zoom_join_url = s.zoomJoinUrl;
  if (s.replayUrl !== undefined) out.replay_url = s.replayUrl;
  if (s.messengerGroupUrl !== undefined) out.messenger_group_url = s.messengerGroupUrl;
  return out;
}

/* --------------------------------------------------------------------- */
/* JSON file fallback (only used when Supabase env vars are missing)     */
/* --------------------------------------------------------------------- */

const DATA_DIR = path.join(process.cwd(), 'data');

async function ensureDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {}
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  await ensureDir();
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Vercel + most serverless platforms expose this as truthy. */
function isServerlessRuntime() {
  return Boolean(
    process.env.VERCEL ||
      process.env.VERCEL_ENV ||
      process.env.AWS_LAMBDA_FUNCTION_NAME,
  );
}

const writeChain: Record<string, Promise<void>> = {};

async function writeJson<T>(file: string, data: T) {
  // Refuse to silently corrupt on read-only / ephemeral filesystems.
  if (isServerlessRuntime()) {
    throw new Error(
      'Storage backend not configured. ' +
        'Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in your Vercel ' +
        'project environment variables, then redeploy. ' +
        'JSON file storage only works on local dev or single-instance VPS.',
    );
  }
  await ensureDir();
  const prev = writeChain[file] || Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      const tmp = path.join(DATA_DIR, `${file}.${process.pid}.${Date.now()}.tmp`);
      const final = path.join(DATA_DIR, file);
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
      await fs.rename(tmp, final);
    });
  writeChain[file] = next;
  return next;
}

/* --------------------------------------------------------------------- */
/* SIGNUPS                                                               */
/* --------------------------------------------------------------------- */

/** Find a single signup by exact (case-insensitive) email match. */
export async function findSignupByEmail(email: string): Promise<Signup | null> {
  const e = email.trim().toLowerCase();
  if (!e || !e.includes('@')) return null;
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('signups')
      .select('*')
      .ilike('email', e)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Supabase findSignupByEmail: ${error.message}`);
    return data ? rowToSignup(data as SignupRow) : null;
  }
  const list = await readJson<Signup[]>('signups.json', []);
  return list.find((s) => s.email.toLowerCase() === e) ?? null;
}

/**
 * Find a single signup by the externalId stashed in metadata. Used by the
 * Xendit webhook + thank-you page — both hot paths that previously did a
 * full table scan. Supabase narrows server-side via jsonb arrow operator.
 */
export async function findSignupByExternalId(externalId: string): Promise<Signup | null> {
  if (!externalId) return null;
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('signups')
      .select('*')
      .filter('metadata->>externalId', 'eq', externalId)
      .maybeSingle();
    if (error) throw new Error(`Supabase findSignupByExternalId: ${error.message}`);
    return data ? rowToSignup(data as SignupRow) : null;
  }
  const list = await readJson<Signup[]>('signups.json', []);
  return (
    list.find((s) => (s.metadata as { externalId?: string } | undefined)?.externalId === externalId) ??
    null
  );
}

/**
 * Find a signup by the Resend message id stored in
 * metadata.recoveryEmailMessageId. Used by the Resend webhook to map
 * delivery/bounce/complaint events back to the signup we sent.
 */
export async function findSignupByRecoveryMessageId(messageId: string): Promise<Signup | null> {
  if (!messageId) return null;
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('signups')
      .select('*')
      .filter('metadata->>recoveryEmailMessageId', 'eq', messageId)
      .maybeSingle();
    if (error) throw new Error(`Supabase findSignupByRecoveryMessageId: ${error.message}`);
    return data ? rowToSignup(data as SignupRow) : null;
  }
  const list = await readJson<Signup[]>('signups.json', []);
  return (
    list.find(
      (s) =>
        (s.metadata as { recoveryEmailMessageId?: string } | undefined)
          ?.recoveryEmailMessageId === messageId,
    ) ?? null
  );
}

export async function getSignups(): Promise<Signup[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('signups')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Supabase getSignups: ${error.message}`);
    return (data as SignupRow[]).map(rowToSignup);
  }
  const list = await readJson<Signup[]>('signups.json', []);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addSignup(
  data: Omit<Signup, 'id' | 'createdAt' | 'status'> & { status?: SignupStatus },
): Promise<Signup> {
  const signup: Signup = {
    id: `sig_${crypto.randomBytes(6).toString('hex')}`,
    createdAt: new Date().toISOString(),
    status: data.status ?? 'registered',
    ...data,
  };

  if (isSupabaseConfigured()) {
    const { error } = await getSupabase().from('signups').insert(signupToRow(signup));
    if (error) throw new Error(`Supabase addSignup: ${error.message}`);
    return signup;
  }

  const list = await readJson<Signup[]>('signups.json', []);
  list.unshift(signup);
  await writeJson('signups.json', list);
  return signup;
}

export async function updateSignup(id: string, patch: Partial<Signup>): Promise<Signup | null> {
  if (isSupabaseConfigured()) {
    const update: Partial<SignupRow> = {};
    if (patch.firstName !== undefined) update.first_name = patch.firstName;
    if (patch.lastName !== undefined) update.last_name = patch.lastName ?? null;
    if (patch.email !== undefined) update.email = patch.email;
    if (patch.phone !== undefined) update.phone = patch.phone;
    if (patch.source !== undefined) update.source = patch.source;
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.amountCentavos !== undefined) update.amount_centavos = patch.amountCentavos ?? null;
    if (patch.bumped !== undefined) update.bumped = patch.bumped ?? null;
    if (patch.message !== undefined) update.message = patch.message ?? null;
    if (patch.metadata !== undefined) update.metadata = patch.metadata ?? null;
    const { data, error } = await getSupabase()
      .from('signups')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();
    if (error) return null;
    return rowToSignup(data as SignupRow);
  }

  const list = await readJson<Signup[]>('signups.json', []);
  const i = list.findIndex((s) => s.id === id);
  if (i === -1) return null;
  list[i] = { ...list[i], ...patch };
  await writeJson('signups.json', list);
  return list[i];
}

export async function deleteSignup(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabase().from('signups').delete().eq('id', id);
    if (error) throw new Error(`Supabase deleteSignup: ${error.message}`);
    return true;
  }
  const list = await readJson<Signup[]>('signups.json', []);
  const next = list.filter((s) => s.id !== id);
  if (next.length === list.length) return false;
  await writeJson('signups.json', next);
  return true;
}

/**
 * Wipe every signup whose metadata.demo === true. Used by the
 * /admin/test-thank-you QA tool to clean up after a test run so the
 * real signups table stays uncontaminated.
 */
export async function deleteDemoSignups(): Promise<number> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('signups')
      .delete()
      .filter('metadata->>demo', 'eq', 'true')
      .select('id');
    if (error) throw new Error(`Supabase deleteDemoSignups: ${error.message}`);
    return data?.length ?? 0;
  }
  const list = await readJson<Signup[]>('signups.json', []);
  const keep = list.filter((s) => (s.metadata as { demo?: boolean } | undefined)?.demo !== true);
  const removed = list.length - keep.length;
  if (removed) await writeJson('signups.json', keep);
  return removed;
}

/* --------------------------------------------------------------------- */
/* EMAIL TEMPLATES                                                       */
/* --------------------------------------------------------------------- */

export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('email_templates')
      .select('id, name, subject, html, body')
      .order('id');
    if (error) throw new Error(`Supabase getEmailTemplates: ${error.message}`);
    return (data as EmailTemplate[]) ?? [];
  }
  return readJson<EmailTemplate[]>('email_templates.json', []);
}

export async function saveEmailTemplate(t: EmailTemplate) {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabase()
      .from('email_templates')
      .upsert({
        id: t.id,
        name: t.name,
        subject: t.subject,
        html: t.html,
        body: t.body ?? null,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(`Supabase saveEmailTemplate: ${error.message}`);
    return;
  }
  const list = await getEmailTemplates();
  const i = list.findIndex((x) => x.id === t.id);
  if (i === -1) list.push(t);
  else list[i] = t;
  await writeJson('email_templates.json', list);
}

/* --------------------------------------------------------------------- */
/* SMS TEMPLATES                                                         */
/* --------------------------------------------------------------------- */

export async function getSmsTemplates(): Promise<SmsTemplate[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('sms_templates')
      .select('id, name, body')
      .order('id');
    if (error) throw new Error(`Supabase getSmsTemplates: ${error.message}`);
    return (data as SmsTemplate[]) ?? [];
  }
  return readJson<SmsTemplate[]>('sms_templates.json', []);
}

export async function saveSmsTemplate(t: SmsTemplate) {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabase()
      .from('sms_templates')
      .upsert({ ...t, updated_at: new Date().toISOString() });
    if (error) throw new Error(`Supabase saveSmsTemplate: ${error.message}`);
    return;
  }
  const list = await getSmsTemplates();
  const i = list.findIndex((x) => x.id === t.id);
  if (i === -1) list.push(t);
  else list[i] = t;
  await writeJson('sms_templates.json', list);
}

/* --------------------------------------------------------------------- */
/* PROMO CODES                                                           */
/* --------------------------------------------------------------------- */

type PromoCodeRow = {
  code: string;
  discount_type: PromoDiscountType;
  discount_value: number;
  max_uses: number | null;
  uses_count: number;
  expires_at: string | null;
  active: boolean;
  note: string | null;
  created_at: string;
};

function rowToPromo(r: PromoCodeRow): PromoCode {
  return {
    code: r.code,
    discountType: r.discount_type,
    discountValue: r.discount_value,
    maxUses: r.max_uses,
    usesCount: r.uses_count,
    expiresAt: r.expires_at,
    active: r.active,
    note: r.note,
    createdAt: r.created_at,
  };
}

export async function getPromoCodes(): Promise<PromoCode[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('promo_codes')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Supabase getPromoCodes: ${error.message}`);
    return (data as PromoCodeRow[]).map(rowToPromo);
  }
  return readJson<PromoCode[]>('promo_codes.json', []);
}

/** Find a promo by exact (case-insensitive) code match. */
export async function findPromoCode(code: string): Promise<PromoCode | null> {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('promo_codes')
      .select('*')
      .ilike('code', c)
      .maybeSingle();
    if (error) throw new Error(`Supabase findPromoCode: ${error.message}`);
    return data ? rowToPromo(data as PromoCodeRow) : null;
  }
  const list = await readJson<PromoCode[]>('promo_codes.json', []);
  return list.find((p) => p.code.toUpperCase() === c) ?? null;
}

export async function savePromoCode(p: PromoCode): Promise<PromoCode> {
  const normalized: PromoCode = { ...p, code: p.code.trim().toUpperCase() };
  if (isSupabaseConfigured()) {
    const row: PromoCodeRow = {
      code: normalized.code,
      discount_type: normalized.discountType,
      discount_value: normalized.discountValue,
      max_uses: normalized.maxUses ?? null,
      uses_count: normalized.usesCount,
      expires_at: normalized.expiresAt ?? null,
      active: normalized.active,
      note: normalized.note ?? null,
      created_at: normalized.createdAt,
    };
    const { error } = await getSupabase().from('promo_codes').upsert(row);
    if (error) throw new Error(`Supabase savePromoCode: ${error.message}`);
    return normalized;
  }
  const list = await readJson<PromoCode[]>('promo_codes.json', []);
  const i = list.findIndex((x) => x.code.toUpperCase() === normalized.code);
  if (i === -1) list.unshift(normalized);
  else list[i] = normalized;
  await writeJson('promo_codes.json', list);
  return normalized;
}

export async function deletePromoCode(code: string): Promise<boolean> {
  const c = code.trim().toUpperCase();
  if (isSupabaseConfigured()) {
    const { error } = await getSupabase().from('promo_codes').delete().eq('code', c);
    if (error) throw new Error(`Supabase deletePromoCode: ${error.message}`);
    return true;
  }
  const list = await readJson<PromoCode[]>('promo_codes.json', []);
  const next = list.filter((p) => p.code.toUpperCase() !== c);
  if (next.length === list.length) return false;
  await writeJson('promo_codes.json', next);
  return true;
}

/**
 * Atomically redeem a promo code: bumps uses_count by 1 and returns the
 * updated row only when the code is currently valid (active, unexpired,
 * not exhausted). Returns null when the redemption was refused — caller
 * must reject the checkout.
 *
 * Supabase path uses the `redeem_promo_code` SQL function from the
 * migration so two simultaneous buyers can't both burn the last seat
 * of a 1-use code. JSON-file path is single-process, so a vanilla
 * read-modify-write is safe enough for local dev.
 */
export async function redeemPromoCode(code: string): Promise<PromoCode | null> {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase().rpc('redeem_promo_code', {
      p_code: c,
    });
    if (error) throw new Error(`Supabase redeemPromoCode: ${error.message}`);
    const rows = (data as PromoCodeRow[] | null) ?? [];
    return rows.length > 0 ? rowToPromo(rows[0]) : null;
  }
  const list = await readJson<PromoCode[]>('promo_codes.json', []);
  const i = list.findIndex((p) => p.code.toUpperCase() === c);
  if (i === -1) return null;
  const p = list[i];
  if (!p.active) return null;
  if (p.expiresAt && new Date(p.expiresAt).getTime() <= Date.now()) return null;
  if (p.maxUses != null && p.usesCount >= p.maxUses) return null;
  const next: PromoCode = { ...p, usesCount: p.usesCount + 1 };
  list[i] = next;
  await writeJson('promo_codes.json', list);
  return next;
}

/**
 * Compute the discount in centavos for a given promo against an order
 * total, capping the discount at the total (we never refund money out
 * via a promo — at most the order becomes free).
 *
 * Returns the discount AMOUNT (positive centavos). Subtract from total
 * to get what the buyer pays.
 */
export function computeDiscountCentavos(
  promo: Pick<PromoCode, 'discountType' | 'discountValue'>,
  totalCentavos: number,
): number {
  if (totalCentavos <= 0) return 0;
  let raw: number;
  switch (promo.discountType) {
    case 'free':
      raw = totalCentavos;
      break;
    case 'percent':
      // Round to nearest centavo — keep PHP whole-centavo arithmetic clean.
      raw = Math.round((totalCentavos * Math.max(0, Math.min(100, promo.discountValue))) / 100);
      break;
    case 'fixed':
      raw = Math.max(0, promo.discountValue);
      break;
    default:
      raw = 0;
  }
  return Math.min(raw, totalCentavos);
}

/* --------------------------------------------------------------------- */
/* SETTINGS                                                              */
/* --------------------------------------------------------------------- */

export async function getSettings(): Promise<Settings> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw new Error(`Supabase getSettings: ${error.message}`);
    if (!data) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...rowToSettings(data as SettingsRow) };
  }
  const stored = await readJson<Partial<Settings>>('settings.json', {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

/** Fields whose value must never leave the server unredacted. */
const SECRET_FIELDS: ReadonlyArray<keyof Settings> = [
  'resendApiKey',
  'onewaysmsPassword',
];

/**
 * Same as getSettings() but with secret fields blanked out — safe to serialize
 * into a server-rendered page or send to the admin browser. Callers that
 * actually need to use the secret (e.g. sending an email) should use
 * getSettings() directly.
 */
export async function getSettingsForAdmin(): Promise<Settings> {
  const s = await getSettings();
  const out: Settings = { ...s };
  for (const k of SECRET_FIELDS) {
    if (out[k]) (out as Record<string, string>)[k as string] = '';
  }
  return out;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  // Merge with current so empty/missing secret fields don't wipe the stored
  // values (the admin UI sends "" for unchanged secrets).
  const current = await getSettings();
  const merged: Settings = { ...current };
  for (const [k, v] of Object.entries(patch) as Array<[keyof Settings, unknown]>) {
    const isSecret = (SECRET_FIELDS as readonly string[]).includes(k as string);
    if (isSecret && (v === '' || v === undefined)) continue; // leave existing value alone
    if (v === undefined) continue;
    (merged as Record<string, unknown>)[k as string] = v;
  }
  if (isSupabaseConfigured()) {
    const row = { ...settingsToRow(merged), id: 1, updated_at: new Date().toISOString() };
    const { error } = await getSupabase().from('settings').upsert(row);
    if (error) throw new Error(`Supabase saveSettings: ${error.message}`);
    return getSettings();
  }
  await writeJson('settings.json', merged);
  return merged;
}

/* --------------------------------------------------------------------- */
/* Template rendering — Mustache-style {{var}} substitution              */
/* --------------------------------------------------------------------- */

export function renderTemplate(
  template: string,
  vars: Record<string, string | number | undefined>,
): string {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

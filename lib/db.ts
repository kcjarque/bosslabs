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
import * as React from 'react';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { isRecoveredPaid, paymentDayOf } from './recovered';

/**
 * Request-scoped caching wrapper.
 *
 * In a Server Component / Route Handler context, React's `cache()` dedupes
 * calls within a single request. Critical because helpers like
 * computeListMembers call getSignups internally — without `cache()` a
 * 5-list page does 5 full-table fetches.
 *
 * In a Node CLI script (e.g. `npx tsx scripts/...`), React's cache export
 * isn't reachable. The fallback identity function lets the same helpers
 * work in scripts (just without the dedupe). Without this fallback, every
 * script that imports lib/db.ts crashes at module load.
 */
// `any[]` is the right shape here — we want the wrapper to preserve the
// inner function's exact parameter + return types, which the stricter
// `unknown[]` constraint collapses to `{}`. Suppress the lint just for
// this utility type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;
const cache: <T extends AnyFn>(fn: T) => T =
  (React as unknown as { cache?: <T extends AnyFn>(fn: T) => T }).cache ??
  (((fn: AnyFn) => fn) as <T extends AnyFn>(fn: T) => T);

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
  /** Which event this signup registered for. Set at registration time from
   *  settings.active_event_id. Null on rows that predate the multi-event
   *  migration (those get tagged with the seeded event during backfill). */
  eventId?: string | null;
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
  /* Email — provider toggle ('resend' | 'ses'); SES creds come from env vars */
  emailProvider: string;
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
  /* Session recording */
  recordingEnabled: boolean;
  /* Telegram bot */
  telegramBotToken: string;
  telegramChatId: string;
  /* Email on the admin account */
  adminEmail: string;
  /* Closers — hours a claimed lead is held before auto-release to the pool */
  closerClaimHoldHours: number;
  /* Closer working hours (Asia/Manila, 24h) — the claim timer only counts down within this window */
  closerWorkStartHour: number;
  closerWorkEndHour: number;
  /* Multi-event */
  /** Which event new signups attach to. Null = no active event (signups
   *  not tagged with an event). Settable from /admin/settings. */
  activeEventId: string | null;
};

const DEFAULT_SETTINGS: Settings = {
  webinarName: 'AI Coding 101 — The BOSSLABS AI Webinar',
  webinarDate: 'To Be Announced',
  webinarTime: '8:00 PM',
  webinarTimezone: 'PHT',
  webinarStartsAtIso: '',
  emailProvider: 'resend',
  resendApiKey: '',
  resendFromEmail: 'bosslabs@conexmedia.ph',
  resendFromName: 'BOSSLABS AI',
  resendReplyTo: 'bosslabs@conexmedia.ph',
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
  recordingEnabled: false,
  telegramBotToken: '',
  telegramChatId: '',
  adminEmail: '',
  closerClaimHoldHours: 6,
  closerWorkStartHour: 9,
  closerWorkEndHour: 20,
  activeEventId: null,
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
  event_id: string | null;
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
    eventId: r.event_id,
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
    event_id: s.eventId ?? null,
  };
}

type SettingsRow = {
  id: number;
  webinar_name: string;
  webinar_date: string;
  webinar_time: string;
  webinar_timezone: string;
  webinar_starts_at_iso: string;
  email_provider: string;
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
  recording_enabled: boolean;
  telegram_bot_token: string;
  telegram_chat_id: string;
  admin_email: string;
  closer_claim_hold_hours: number | string;
  closer_work_start_hour: number | string;
  closer_work_end_hour: number | string;
  active_event_id: string | null;
};

function rowToSettings(r: SettingsRow): Settings {
  return {
    webinarName: r.webinar_name ?? '',
    webinarDate: r.webinar_date ?? '',
    webinarTime: r.webinar_time ?? '',
    webinarTimezone: r.webinar_timezone ?? '',
    webinarStartsAtIso: r.webinar_starts_at_iso ?? '',
    emailProvider: r.email_provider ?? 'resend',
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
    recordingEnabled: r.recording_enabled ?? false,
    telegramBotToken: r.telegram_bot_token ?? '',
    telegramChatId: r.telegram_chat_id ?? '',
    adminEmail: r.admin_email ?? '',
    closerClaimHoldHours: r.closer_claim_hold_hours != null ? Number(r.closer_claim_hold_hours) : 6,
    closerWorkStartHour: r.closer_work_start_hour != null ? Number(r.closer_work_start_hour) : 9,
    closerWorkEndHour: r.closer_work_end_hour != null ? Number(r.closer_work_end_hour) : 20,
    activeEventId: r.active_event_id ?? null,
  };
}

function settingsToRow(s: Partial<Settings>): Partial<SettingsRow> {
  const out: Partial<SettingsRow> = { id: 1 };
  if (s.webinarName !== undefined) out.webinar_name = s.webinarName;
  if (s.webinarDate !== undefined) out.webinar_date = s.webinarDate;
  if (s.webinarTime !== undefined) out.webinar_time = s.webinarTime;
  if (s.webinarTimezone !== undefined) out.webinar_timezone = s.webinarTimezone;
  if (s.webinarStartsAtIso !== undefined) out.webinar_starts_at_iso = s.webinarStartsAtIso;
  if (s.emailProvider !== undefined) out.email_provider = s.emailProvider;
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
  if (s.recordingEnabled !== undefined) out.recording_enabled = s.recordingEnabled;
  if (s.telegramBotToken !== undefined) out.telegram_bot_token = s.telegramBotToken;
  if (s.telegramChatId !== undefined) out.telegram_chat_id = s.telegramChatId;
  if (s.adminEmail !== undefined) out.admin_email = s.adminEmail;
  if (s.closerClaimHoldHours !== undefined) out.closer_claim_hold_hours = s.closerClaimHoldHours;
  if (s.closerWorkStartHour !== undefined) out.closer_work_start_hour = s.closerWorkStartHour;
  if (s.closerWorkEndHour !== undefined) out.closer_work_end_hour = s.closerWorkEndHour;
  if (s.activeEventId !== undefined) out.active_event_id = s.activeEventId;
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
 * Race-safe atomic update of the recovery email status. Delegates to the
 * `upgrade_recovery_email_status` SQL function (see migration), which
 * checks the new status's rank > current rank INSIDE the WHERE clause
 * — preventing two concurrent webhook events (email.sent and
 * email.delivered) from clobbering each other under Vercel's parallel
 * function instances. Idempotent on replays.
 *
 * JSON-file fallback (local dev only) does a vanilla read-modify-write
 * because there's only one process.
 */
export async function upgradeRecoveryEmailStatus(args: {
  signupId: string;
  status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained';
  statusAt: string;
  bounceMessage?: string | null;
}): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabase().rpc('upgrade_recovery_email_status', {
      p_signup_id: args.signupId,
      p_new_status: args.status,
      p_new_status_at: args.statusAt,
      p_bounce_message: args.bounceMessage ?? null,
    });
    if (error) throw new Error(`Supabase upgradeRecoveryEmailStatus: ${error.message}`);
    return;
  }
  const RANK: Record<string, number> = { sent: 1, delivered: 2, opened: 3, clicked: 4, bounced: 10, complained: 10 };
  const list = await readJson<Signup[]>('signups.json', []);
  const i = list.findIndex((s) => s.id === args.signupId);
  if (i === -1) return;
  const meta = (list[i].metadata ?? {}) as Record<string, unknown>;
  const currentRank = RANK[(meta.recoveryEmailStatus as string) ?? ''] ?? 0;
  const newRank = RANK[args.status] ?? 0;
  if (newRank <= currentRank) return;
  list[i] = {
    ...list[i],
    metadata: {
      ...meta,
      recoveryEmailStatus: args.status,
      recoveryEmailStatusAt: args.statusAt,
      ...(args.bounceMessage ? { recoveryEmailBounce: args.bounceMessage } : {}),
    },
  };
  await writeJson('signups.json', list);
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

/**
 * Find the signup whose metadata.adminSends contains an entry with the
 * given Resend provider id. Used by the Resend webhook to attach
 * delivery lifecycle events to specific admin sends.
 *
 * Supabase JSONB containment: `metadata @> { adminSends: [{ providerId }] }`
 * Note: PostgREST encodes this as `metadata.cs.{...}`. We approximate via
 * a coarse select + JS filter — admin sends are append-only and small,
 * so scanning ~30-100 signups is fine.
 */
export async function findSignupByAdminSendProviderId(
  providerId: string,
): Promise<Signup | null> {
  if (!providerId) return null;
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase().from('signups').select('*');
    if (error)
      throw new Error(`findSignupByAdminSendProviderId: ${error.message}`);
    for (const row of (data as SignupRow[]) ?? []) {
      const meta = (row.metadata ?? {}) as { adminSends?: Array<{ providerId?: string }> };
      const sends = meta.adminSends ?? [];
      if (sends.some((s) => s.providerId === providerId)) {
        return rowToSignup(row);
      }
    }
    return null;
  }
  const list = await readJson<Signup[]>('signups.json', []);
  for (const s of list) {
    const meta = (s.metadata ?? {}) as { adminSends?: Array<{ providerId?: string }> };
    if ((meta.adminSends ?? []).some((x) => x.providerId === providerId)) return s;
  }
  return null;
}

/**
 * Update an existing adminSends entry's status (sent → delivered → opened
 * → clicked → bounced → complained). Never downgrades — out-of-order
 * Resend webhooks won't clobber the richer signal.
 */
const ADMIN_SEND_RANK: Record<string, number> = {
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
  bounced: 5, // terminal failures rank above 'good' states
  complained: 5,
};
export type AdminSendStatus = keyof typeof ADMIN_SEND_RANK;

export async function updateAdminSendStatus(
  signupId: string,
  providerId: string,
  status: AdminSendStatus,
  statusAt: string,
): Promise<void> {
  const signup = await getSignupById(signupId);
  if (!signup) return;
  const meta = (signup.metadata ?? {}) as {
    adminSends?: Array<{
      ts: string;
      channel: 'email' | 'sms';
      templateId: string;
      ok?: boolean;
      providerId?: string;
      status?: AdminSendStatus;
      statusAt?: string;
      bounceMessage?: string | null;
    }>;
  };
  const sends = meta.adminSends ?? [];
  const next = sends.map((s) => {
    if (s.providerId !== providerId) return s;
    const currentRank = s.status ? ADMIN_SEND_RANK[s.status] ?? 0 : 0;
    const incomingRank = ADMIN_SEND_RANK[status] ?? 0;
    if (incomingRank <= currentRank) return s; // never downgrade
    return { ...s, status, statusAt };
  });
  await updateSignup(signupId, {
    metadata: { ...(signup.metadata ?? {}), adminSends: next },
  });
}

/** Single-row fetch by signup id. Returns null if not found. */
export const getSignupById = cache(async (id: string): Promise<Signup | null> => {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('signups')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`getSignupById: ${error.message}`);
    return data ? rowToSignup(data as SignupRow) : null;
  }
  const list = await readJson<Signup[]>('signups.json', []);
  return list.find((s) => s.id === id) ?? null;
});

/**
 * Fetch every sequence_send row for a given signup, joined with enough
 * step + sequence + template metadata to render a comms timeline.
 *
 * Used by /admin/customers/[id] to show 'proof of all messages and emails
 * that they have already received.'
 */
export type CustomerSequenceSend = {
  id: string;
  sentAt: string;
  emailOk: boolean;
  smsOk: boolean;
  /** Resend delivery lifecycle for the email leg (null until the webhook fires). */
  emailStatus: string | null;
  emailStatusAt: string | null;
  sequenceName: string;
  scheduleType: SequenceScheduleType;
  hoursOffset: number;
  emailTemplateId: string | null;
  emailTemplateName: string | null;
  smsTemplateId: string | null;
  smsTemplateName: string | null;
};

export async function getCustomerSequenceSends(
  signupId: string,
): Promise<CustomerSequenceSend[]> {
  if (!isSupabaseConfigured()) return [];
  // Nested select pulls step + sequence in one round-trip.
  const { data, error } = await getSupabase()
    .from('sequence_sends')
    .select(
      `
      id, sent_at, email_ok, sms_ok, email_status, email_status_at,
      sequence_step:sequence_step_id (
        schedule_type, hours_offset,
        email_template_id, sms_template_id,
        sequence:sequence_id ( name )
      )
    `,
    )
    .eq('signup_id', signupId)
    .order('sent_at', { ascending: false });
  if (error) throw new Error(`getCustomerSequenceSends: ${error.message}`);

  // Resolve template names separately to keep the join shape simple.
  const rows = (data as Array<Record<string, unknown>>) ?? [];
  const emailIds = new Set<string>();
  const smsIds = new Set<string>();
  for (const r of rows) {
    const step = r.sequence_step as Record<string, unknown> | null;
    if (step?.email_template_id) emailIds.add(step.email_template_id as string);
    if (step?.sms_template_id) smsIds.add(step.sms_template_id as string);
  }
  const [emailTemplates, smsTemplates] = await Promise.all([
    emailIds.size > 0
      ? getSupabase().from('email_templates').select('id, name').in('id', [...emailIds])
      : Promise.resolve({ data: [], error: null }),
    smsIds.size > 0
      ? getSupabase().from('sms_templates').select('id, name').in('id', [...smsIds])
      : Promise.resolve({ data: [], error: null }),
  ]);
  const emailNames = new Map(
    ((emailTemplates.data as Array<{ id: string; name: string }>) ?? []).map((t) => [t.id, t.name]),
  );
  const smsNames = new Map(
    ((smsTemplates.data as Array<{ id: string; name: string }>) ?? []).map((t) => [t.id, t.name]),
  );

  return rows.map((r) => {
    const step = (r.sequence_step ?? {}) as Record<string, unknown>;
    const sequence = (step.sequence ?? {}) as Record<string, unknown>;
    return {
      id: r.id as string,
      sentAt: r.sent_at as string,
      emailOk: Boolean(r.email_ok),
      smsOk: Boolean(r.sms_ok),
      emailStatus: (r.email_status as string | null) ?? null,
      emailStatusAt: (r.email_status_at as string | null) ?? null,
      sequenceName: (sequence.name as string) ?? '(deleted sequence)',
      scheduleType: (step.schedule_type as SequenceScheduleType) ?? 'before_event',
      hoursOffset: (step.hours_offset as number) ?? 0,
      emailTemplateId: (step.email_template_id as string | null) ?? null,
      emailTemplateName:
        step.email_template_id ? (emailNames.get(step.email_template_id as string) ?? null) : null,
      smsTemplateId: (step.sms_template_id as string | null) ?? null,
      smsTemplateName:
        step.sms_template_id ? (smsNames.get(step.sms_template_id as string) ?? null) : null,
    };
  });
}

/**
 * Wrapped with React's `cache()` so multiple calls within the same
 * server-side request hit Supabase ONCE. Critical for pages like
 * /admin/customers/[id] that resolve list memberships in a loop —
 * without this every iteration re-fetches the whole signups table.
 */
export const getSignups = cache(async (): Promise<Signup[]> => {
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
});

export async function addSignup(
  data: Omit<Signup, 'id' | 'createdAt' | 'status'> & { status?: SignupStatus },
): Promise<Signup> {
  // Auto-tag with the currently-active event when the caller doesn't
  // specify one. The checkout + registration routes typically just let
  // this default kick in. Settings.activeEventId can be null (no active
  // event) — in that case the signup remains untagged, which is fine
  // for non-event flows like contact-form leads.
  let eventId: string | null | undefined = data.eventId;
  if (eventId === undefined) {
    try {
      const settings = await getSettings();
      eventId = settings.activeEventId;
    } catch {
      eventId = null;
    }
  }

  const signup: Signup = {
    id: `sig_${crypto.randomBytes(6).toString('hex')}`,
    createdAt: new Date().toISOString(),
    status: data.status ?? 'registered',
    ...data,
    eventId,
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

/**
 * Set the free-text remark on a customer. Stored on the signup
 * (metadata.remarks) so it's a single source of truth shared by the
 * customer profile and the order-bump CRM board. Merges into existing
 * metadata rather than clobbering it.
 */
export async function setSignupRemarks(signupId: string, remarks: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();
  const { data } = await sb.from('signups').select('metadata').eq('id', signupId).maybeSingle();
  const meta = ((data?.metadata as Record<string, unknown> | null) ?? {});
  const { error } = await sb
    .from('signups')
    .update({ metadata: { ...meta, remarks } })
    .eq('id', signupId);
  if (error) throw new Error(`setSignupRemarks: ${error.message}`);
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

/** Bulk delete — `delete().in('id', ids)` is one round-trip on Supabase. */
export async function deleteSignups(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('signups')
      .delete()
      .in('id', ids)
      .select('id');
    if (error) throw new Error(`Supabase deleteSignups: ${error.message}`);
    return data?.length ?? 0;
  }
  const list = await readJson<Signup[]>('signups.json', []);
  const idSet = new Set(ids);
  const next = list.filter((s) => !idSet.has(s.id));
  const removed = list.length - next.length;
  await writeJson('signups.json', next);
  return removed;
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

export const getEmailTemplates = cache(async (): Promise<EmailTemplate[]> => {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('email_templates')
      .select('id, name, subject, html, body')
      .order('id');
    if (error) throw new Error(`Supabase getEmailTemplates: ${error.message}`);
    return (data as EmailTemplate[]) ?? [];
  }
  return readJson<EmailTemplate[]>('email_templates.json', []);
});

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

export const getSmsTemplates = cache(async (): Promise<SmsTemplate[]> => {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('sms_templates')
      .select('id, name, body')
      .order('id');
    if (error) throw new Error(`Supabase getSmsTemplates: ${error.message}`);
    return (data as SmsTemplate[]) ?? [];
  }
  return readJson<SmsTemplate[]>('sms_templates.json', []);
});

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
/* PAGE VIEWS                                                            */
/* --------------------------------------------------------------------- */

export type PageViewInsert = {
  path: string;
  sessionId?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
};

/** Insert a single pageview. Fire-and-forget — beacons are non-critical. */
export async function addPageView(v: PageViewInsert): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabase().from('page_views').insert({
      path: v.path,
      session_id: v.sessionId ?? null,
      referrer: v.referrer ?? null,
      user_agent: v.userAgent ?? null,
    });
    if (error) throw new Error(`Supabase addPageView: ${error.message}`);
    return;
  }
  // JSON fallback: append-only log file. Local dev only.
  const list = await readJson<Array<PageViewInsert & { createdAt: string }>>('page_views.json', []);
  list.push({ ...v, createdAt: new Date().toISOString() });
  await writeJson('page_views.json', list);
}

export type PageViewCounts = {
  /** Total beacons in the window. */
  total: number;
  /** Distinct session_ids in the window. */
  uniqueSessions: number;
};

/**
 * Count paid orders for the Telegram sales alerts: all-time total + today.
 * "Paid" = signups.status === 'paid'. "Today" is by created_at in
 * Asia/Manila, matching the daily-summary convention. Best-effort — returns
 * zeros if Supabase isn't configured or a query errors, so it can never
 * block (or break) a payment notification.
 */
export async function countPaidOrders(): Promise<{ total: number; today: number; recoveredToday: number }> {
  if (!isSupabaseConfigured()) return { total: 0, today: 0, recoveredToday: 0 };
  try {
    const sb = getSupabase();
    const { count: total } = await sb
      .from('signups')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'paid');
    // Manila calendar date (YYYY-MM-DD) → start-of-day at +08:00.
    const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Manila' });
    const { count: today } = await sb
      .from('signups')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'paid')
      .gte('created_at', `${todayStr}T00:00:00+08:00`);
    // Recovered-today = payments that ARRIVED today (confirmationSent) from an
    // earlier signup — abandoned-then-paid, or closer-claimed-then-paid. These
    // sit OUTSIDE the created-today "today" count (their signup day is past),
    // so they compose: today + recoveredToday = all payments received today.
    const [{ data: comms }, { data: paidRows }] = await Promise.all([
      sb.from('closer_commissions').select('signup_id'),
      sb.from('signups').select('id, status, created_at, metadata').in('status', ['paid', 'attended']),
    ]);
    const closerIds = new Set(((comms ?? []) as { signup_id: string }[]).map((c) => c.signup_id));
    let recoveredToday = 0;
    for (const r of (paidRows ?? []) as Array<{ id: string; status: SignupStatus; created_at: string; metadata: Record<string, unknown> | null }>) {
      const s = { id: r.id, status: r.status, createdAt: r.created_at, metadata: r.metadata ?? undefined };
      if (paymentDayOf(s) === todayStr && isRecoveredPaid(s, closerIds)) recoveredToday++;
    }
    return { total: total ?? 0, today: today ?? 0, recoveredToday };
  } catch {
    return { total: 0, today: 0, recoveredToday: 0 };
  }
}

/**
 * Count pageviews (total + distinct sessions) matching a path prefix
 * inside a time window. Used by the admin funnel — Visits = unique
 * sessions that hit /checkout in the period.
 *
 * pathPrefix can be a single path like "/checkout" or an array of
 * acceptable prefixes (matches if any one prefixes the row's path).
 * Pass null/undefined to count everything.
 */
export async function countPageViews(opts: {
  sinceIso: string;
  untilIso?: string;
  pathPrefix?: string | string[] | null;
}): Promise<PageViewCounts> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const prefixes = Array.isArray(opts.pathPrefix)
      ? opts.pathPrefix
      : opts.pathPrefix
        ? [opts.pathPrefix]
        : null;
    // Count + distinct-session in SQL via RPC. Doing the de-dup client-side
    // breaks once page_views exceeds PostgREST's 1000-row response cap: the
    // distinct count would only see the first 1000 beacons (undercounting
    // unique visitors). See migration 0013_page_view_count_rpcs.sql.
    const { data, error } = await sb.rpc('count_page_views', {
      p_since: opts.sinceIso,
      p_until: opts.untilIso ?? null,
      p_prefixes: prefixes && prefixes.length > 0 ? prefixes : null,
    });
    if (error) throw new Error(`Supabase countPageViews: ${error.message}`);
    const row = (data as Array<{ total: number; unique_sessions: number }> | null)?.[0];
    return {
      total: Number(row?.total ?? 0),
      uniqueSessions: Number(row?.unique_sessions ?? 0),
    };
  }
  // JSON fallback for local dev.
  const list = await readJson<Array<PageViewInsert & { createdAt: string }>>('page_views.json', []);
  const since = new Date(opts.sinceIso).getTime();
  const until = opts.untilIso ? new Date(opts.untilIso).getTime() : Infinity;
  const prefixes = Array.isArray(opts.pathPrefix)
    ? opts.pathPrefix
    : opts.pathPrefix
      ? [opts.pathPrefix]
      : null;
  const filtered = list.filter((v) => {
    const t = new Date(v.createdAt).getTime();
    if (t < since || t > until) return false;
    if (!prefixes) return true;
    return prefixes.some((p) => v.path.startsWith(p));
  });
  const sessions = new Set<string>();
  for (const v of filtered) {
    if (v.sessionId) sessions.add(v.sessionId);
  }
  return { total: filtered.length, uniqueSessions: sessions.size };
}

/**
 * Bucket pageviews by time interval. Returns one row per bucket with the
 * unique-session and total counts inside that bucket. Buckets are aligned
 * to the bucketMs grid starting at sinceMs.
 *
 * Used by the funnel chart to show traffic progression over time.
 */
export async function getVisitBuckets(opts: {
  sinceIso: string;
  untilIso?: string;
  bucketMs: number; // e.g. 3600_000 for 1h, 86400_000 for 1d
  pathPrefix?: string | string[] | null;
}): Promise<Array<{ bucketStart: string; uniqueSessions: number; total: number }>> {
  const sinceMs = new Date(opts.sinceIso).getTime();
  const untilMs = opts.untilIso ? new Date(opts.untilIso).getTime() : Date.now();
  const numBuckets = Math.max(1, Math.ceil((untilMs - sinceMs) / opts.bucketMs));

  // Pre-allocate empty buckets so empty hours/days still show 0 (not gaps).
  const buckets: Array<{ bucketStart: string; uniqueSessions: number; total: number; _sessions: Set<string> }> =
    Array.from({ length: numBuckets }, (_, i) => ({
      bucketStart: new Date(sinceMs + i * opts.bucketMs).toISOString(),
      uniqueSessions: 0,
      total: 0,
      _sessions: new Set<string>(),
    }));

  function bucketIndex(ts: number): number {
    return Math.floor((ts - sinceMs) / opts.bucketMs);
  }

  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const prefixes = Array.isArray(opts.pathPrefix)
      ? opts.pathPrefix
      : opts.pathPrefix
        ? [opts.pathPrefix]
        : null;
    // Bucket + distinct-session counts in SQL via RPC. Client-side bucketing
    // breaks once page_views exceeds PostgREST's 1000-row cap (only the first
    // 1000 beacons would be charted). See migration 0013_page_view_count_rpcs.sql.
    const { data, error } = await sb.rpc('bucket_page_views', {
      p_since: opts.sinceIso,
      p_until: new Date(untilMs).toISOString(),
      p_bucket_seconds: Math.round(opts.bucketMs / 1000),
      p_prefixes: prefixes && prefixes.length > 0 ? prefixes : null,
    });
    if (error) throw new Error(`getVisitBuckets: ${error.message}`);
    for (const row of (data as Array<{
      bucket_start: string;
      total: number;
      unique_sessions: number;
    }> | null) ?? []) {
      const i = Math.round((new Date(row.bucket_start).getTime() - sinceMs) / opts.bucketMs);
      if (i < 0 || i >= buckets.length) continue;
      buckets[i].total = Number(row.total);
      buckets[i].uniqueSessions = Number(row.unique_sessions);
    }
  } else {
    // JSON fallback
    const list = await readJson<Array<PageViewInsert & { createdAt: string }>>(
      'page_views.json',
      [],
    );
    const prefixes = Array.isArray(opts.pathPrefix)
      ? opts.pathPrefix
      : opts.pathPrefix
        ? [opts.pathPrefix]
        : null;
    for (const v of list) {
      const ts = new Date(v.createdAt).getTime();
      if (ts < sinceMs || ts >= untilMs) continue;
      if (prefixes && !prefixes.some((p) => v.path.startsWith(p))) continue;
      const i = bucketIndex(ts);
      if (i < 0 || i >= buckets.length) continue;
      buckets[i].total++;
      if (v.sessionId) buckets[i]._sessions.add(v.sessionId);
    }
  }

  return buckets.map((b) => ({
    bucketStart: b.bucketStart,
    // RPC path sets uniqueSessions directly; JSON fallback fills _sessions.
    uniqueSessions: Math.max(b.uniqueSessions, b._sessions.size),
    total: b.total,
  }));
}

/* --------------------------------------------------------------------- */
/* EMAIL PERFORMANCE                                                     */
/* --------------------------------------------------------------------- */

export type EmailStats = {
  totalSent: number;
  reached: number; // delivered (incl. opened/clicked)
  bounced: number;
  complained: number;
  pending: number; // sent but no terminal event yet
  opened: number;
  clicked: number;
  deliverabilityPct: number;
  bouncePct: number;
  complaintPct: number;
  /** null when open/click tracking isn't enabled (no events ever recorded). */
  openPct: number | null;
  clickPct: number | null;
  openTracking: boolean;
  recovery: { emailed: number; paid: number; pct: number };
};

const EMPTY_EMAIL_STATS: EmailStats = {
  totalSent: 0, reached: 0, bounced: 0, complained: 0, pending: 0, opened: 0, clicked: 0,
  deliverabilityPct: 0, bouncePct: 0, complaintPct: 0, openPct: null, clickPct: null,
  openTracking: false, recovery: { emailed: 0, paid: 0, pct: 0 },
};

/**
 * Email performance across all sent emails (drip/sequence + transactional
 * confirmations). Aggregated in SQL (email_stats RPC) so it stays exact as
 * volume grows past PostgREST's row cap. open/click come back null when no
 * such events have ever been recorded (SES open/click tracking not enabled).
 */
export async function getEmailStats(): Promise<EmailStats> {
  if (!isSupabaseConfigured()) return EMPTY_EMAIL_STATS;
  const { data, error } = await getSupabase().rpc('email_stats');
  if (error) throw new Error(`getEmailStats: ${error.message}`);
  const d = (data ?? {}) as {
    reached: number; bounced: number; complained: number; opened: number;
    clicked: number; pending: number; total: number; recoEmailed: number; recoPaid: number;
  };
  const known = d.reached + d.bounced + d.complained;
  const pct = (n: number, den: number) => (den > 0 ? (n / den) * 100 : 0);
  const openTracking = d.opened + d.clicked > 0;
  return {
    totalSent: d.total,
    reached: d.reached,
    bounced: d.bounced,
    complained: d.complained,
    pending: d.pending,
    opened: d.opened,
    clicked: d.clicked,
    deliverabilityPct: pct(d.reached, known),
    bouncePct: pct(d.bounced, known),
    complaintPct: pct(d.complained, known),
    openPct: openTracking ? pct(d.opened, d.reached) : null,
    clickPct: openTracking ? pct(d.clicked, d.reached) : null,
    openTracking,
    recovery: { emailed: d.recoEmailed, paid: d.recoPaid, pct: pct(d.recoPaid, d.recoEmailed) },
  };
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

export const getSettings = cache(async (): Promise<Settings> => {
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
});

/** Fields whose value must never leave the server unredacted. */
const SECRET_FIELDS: ReadonlyArray<keyof Settings> = [
  'resendApiKey',
  'onewaysmsPassword',
  'telegramBotToken',
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
    if (out[k]) (out as unknown as Record<string, string>)[k as string] = '';
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

/* --------------------------------------------------------------------- */
/* Session recordings (rrweb)                                            */
/* --------------------------------------------------------------------- */

export type SessionRecording = {
  id: string;
  sessionId: string;
  page: string;
  events: unknown[];
  sizeBytes: number;
  createdAt: string;
};

type RecordingRow = {
  id: string;
  session_id: string;
  page: string;
  events: unknown[];
  size_bytes: number;
  created_at: string;
};

function rowToRecording(r: RecordingRow): SessionRecording {
  return {
    id: r.id,
    sessionId: r.session_id,
    page: r.page,
    events: r.events,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
  };
}

export async function saveRecording(data: {
  sessionId: string;
  page: string;
  events: unknown[];
}): Promise<string> {
  const json = JSON.stringify(data.events);
  const sizeBytes = Buffer.byteLength(json, 'utf8');
  if (isSupabaseConfigured()) {
    const { data: row, error } = await getSupabase()
      .from('session_recordings')
      .insert({
        session_id: data.sessionId,
        page: data.page,
        events: data.events,
        size_bytes: sizeBytes,
      })
      .select('id')
      .single();
    if (error) throw new Error(`saveRecording: ${error.message}`);
    return row.id;
  }
  const id = crypto.randomUUID();
  const recordings = await readJson<RecordingRow[]>('recordings.json', []);
  recordings.push({
    id,
    session_id: data.sessionId,
    page: data.page,
    events: data.events,
    size_bytes: sizeBytes,
    created_at: new Date().toISOString(),
  });
  await writeJson('recordings.json', recordings);
  return id;
}

export async function getRecordings(): Promise<Omit<SessionRecording, 'events'>[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('session_recordings')
      .select('id, session_id, page, size_bytes, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(`getRecordings: ${error.message}`);
    return (data as RecordingRow[]).map((r) => {
      const { events: _, ...rest } = rowToRecording({ ...r, events: [] } as RecordingRow);
      return rest;
    });
  }
  const rows = await readJson<RecordingRow[]>('recordings.json', []);
  return rows
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((r) => {
      const { events: _, ...rest } = rowToRecording(r);
      return rest;
    });
}

export async function getRecording(id: string): Promise<SessionRecording | null> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('session_recordings')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return rowToRecording(data as RecordingRow);
  }
  const rows = await readJson<RecordingRow[]>('recordings.json', []);
  const row = rows.find((r) => r.id === id);
  return row ? rowToRecording(row) : null;
}

export async function deleteRecording(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabase()
      .from('session_recordings')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`deleteRecording: ${error.message}`);
    return;
  }
  const rows = await readJson<RecordingRow[]>('recordings.json', []);
  await writeJson('recordings.json', rows.filter((r) => r.id !== id));
}

export async function deleteAllRecordings(): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabase()
      .from('session_recordings')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(`deleteAllRecordings: ${error.message}`);
    return;
  }
  await writeJson('recordings.json', []);
}

export async function getRecordingsStorageBytes(): Promise<number> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .rpc('sum_recording_bytes');
    if (error) return 0;
    return (data as number) ?? 0;
  }
  const rows = await readJson<RecordingRow[]>('recordings.json', []);
  return rows.reduce((sum, r) => sum + (r.size_bytes ?? 0), 0);
}

/* --------------------------------------------------------------------- */
/* EMAIL SEQUENCE ENGINE                                                  */
/* --------------------------------------------------------------------- */

export type EventRow = {
  id: string;
  name: string;
  starts_at_iso: string;
  timezone: string;
  active: boolean;
  created_at: string;
  zoom_join_url: string | null;
};

export type EventModel = {
  id: string;
  name: string;
  startsAtIso: string;
  timezone: string;
  active: boolean;
  createdAt: string;
  /** Per-event Zoom link. Empty/null falls back to settings.zoomJoinUrl
   *  in the email var resolution. Lets a 2nd event use a different
   *  meeting without touching global settings. */
  zoomJoinUrl: string;
};

function rowToEvent(r: EventRow): EventModel {
  return {
    id: r.id,
    name: r.name,
    startsAtIso: r.starts_at_iso,
    timezone: r.timezone,
    active: r.active,
    createdAt: r.created_at,
    zoomJoinUrl: r.zoom_join_url ?? '',
  };
}

export type ListFilterType =
  | 'all_paid'
  | 'all_registered'
  | 'all_free'
  | 'all_signups'
  | 'abandoned';

export type ListModel = {
  id: string;
  name: string;
  description: string | null;
  /** UNION of all selected filter types — members are anyone matching at least one. */
  filterTypes: ListFilterType[];
  /** Optional: if set, list only includes signups tagged with this event.
   *  Null = include all events. */
  eventId: string | null;
  createdAt: string;
};

type ListRow = {
  id: string;
  name: string;
  description: string | null;
  /** Legacy single-value column (nullable). Kept readable for back-compat. */
  filter_type: ListFilterType | null;
  filter_types: ListFilterType[] | null;
  event_id: string | null;
  created_at: string;
};

function rowToList(r: ListRow): ListModel {
  // Prefer the new array column; fall back to wrapping the legacy single value
  // so rows written before the migration still resolve correctly.
  const types =
    r.filter_types && r.filter_types.length > 0
      ? r.filter_types
      : r.filter_type
        ? [r.filter_type]
        : [];
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    filterTypes: types,
    eventId: r.event_id ?? null,
    createdAt: r.created_at,
  };
}

export type SequenceModel = {
  id: string;
  listId: string;
  eventId: string | null;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: string;
};

type SequenceRow = {
  id: string;
  list_id: string;
  event_id: string | null;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
};

function rowToSequence(r: SequenceRow): SequenceModel {
  return {
    id: r.id,
    listId: r.list_id,
    eventId: r.event_id,
    name: r.name,
    description: r.description,
    active: r.active,
    createdAt: r.created_at,
  };
}

export type SequenceScheduleType =
  | 'before_event'
  | 'after_event'
  | 'after_subscribe';

export type SequenceStep = {
  id: string;
  sequenceId: string;
  position: number;
  emailTemplateId: string | null;
  smsTemplateId: string | null;
  scheduleType: SequenceScheduleType;
  hoursOffset: number;
  active: boolean;
  createdAt: string;
};

type SequenceStepRow = {
  id: string;
  sequence_id: string;
  position: number;
  email_template_id: string | null;
  sms_template_id: string | null;
  schedule_type: SequenceScheduleType;
  hours_offset: number;
  active: boolean;
  created_at: string;
};

function rowToStep(r: SequenceStepRow): SequenceStep {
  return {
    id: r.id,
    sequenceId: r.sequence_id,
    position: r.position,
    emailTemplateId: r.email_template_id,
    smsTemplateId: r.sms_template_id,
    scheduleType: r.schedule_type,
    hoursOffset: r.hours_offset,
    active: r.active,
    createdAt: r.created_at,
  };
}

/* ─── Events ──────────────────────────────────────────────────────────── */

export const getEvents = cache(async (): Promise<EventModel[]> => {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('events')
    .select('*')
    .order('starts_at_iso', { ascending: false });
  if (error) throw new Error(`getEvents: ${error.message}`);
  return (data as EventRow[]).map(rowToEvent);
});

export async function getEvent(id: string): Promise<EventModel | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabase()
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getEvent: ${error.message}`);
  return data ? rowToEvent(data as EventRow) : null;
}

export async function addEvent(input: {
  name: string;
  startsAtIso: string;
  timezone?: string;
  active?: boolean;
  zoomJoinUrl?: string;
}): Promise<EventModel> {
  if (!isSupabaseConfigured()) throw new Error('addEvent: Supabase not configured');
  const { data, error } = await getSupabase()
    .from('events')
    .insert({
      name: input.name,
      starts_at_iso: input.startsAtIso,
      timezone: input.timezone ?? 'Asia/Manila',
      active: input.active ?? true,
      zoom_join_url: input.zoomJoinUrl ?? '',
    })
    .select('*')
    .single();
  if (error) throw new Error(`addEvent: ${error.message}`);
  return rowToEvent(data as EventRow);
}

export async function updateEvent(
  id: string,
  patch: Partial<Pick<EventModel, 'name' | 'startsAtIso' | 'timezone' | 'active' | 'zoomJoinUrl'>>,
): Promise<EventModel | null> {
  if (!isSupabaseConfigured()) return null;
  const row: Partial<EventRow> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.startsAtIso !== undefined) row.starts_at_iso = patch.startsAtIso;
  if (patch.timezone !== undefined) row.timezone = patch.timezone;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.zoomJoinUrl !== undefined) row.zoom_join_url = patch.zoomJoinUrl;
  const { data, error } = await getSupabase()
    .from('events')
    .update(row)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`updateEvent: ${error.message}`);
  return data ? rowToEvent(data as EventRow) : null;
}

export async function deleteEvent(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase().from('events').delete().eq('id', id);
  if (error) throw new Error(`deleteEvent: ${error.message}`);
}

/* ─── Lists ───────────────────────────────────────────────────────────── */

export const getLists = cache(async (): Promise<ListModel[]> => {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('lists')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`getLists: ${error.message}`);
  return (data as ListRow[]).map(rowToList);
});

export async function getList(id: string): Promise<ListModel | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabase()
    .from('lists')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getList: ${error.message}`);
  return data ? rowToList(data as ListRow) : null;
}

export async function addList(input: {
  name: string;
  description?: string | null;
  filterTypes: ListFilterType[];
  eventId?: string | null;
}): Promise<ListModel> {
  if (!isSupabaseConfigured()) throw new Error('addList: Supabase not configured');
  if (!input.filterTypes.length) {
    throw new Error('addList: at least one filter type is required');
  }
  const { data, error } = await getSupabase()
    .from('lists')
    .insert({
      name: input.name,
      description: input.description ?? null,
      // Legacy column for back-compat with old readers; keep in sync with the array.
      filter_type: input.filterTypes[0],
      filter_types: input.filterTypes,
      event_id: input.eventId ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(`addList: ${error.message}`);
  return rowToList(data as ListRow);
}

export async function updateList(
  id: string,
  patch: Partial<Pick<ListModel, 'name' | 'description' | 'filterTypes' | 'eventId'>>,
): Promise<ListModel | null> {
  if (!isSupabaseConfigured()) return null;
  const row: Partial<ListRow> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.eventId !== undefined) row.event_id = patch.eventId;
  if (patch.filterTypes !== undefined) {
    if (!patch.filterTypes.length) {
      throw new Error('updateList: at least one filter type is required');
    }
    row.filter_types = patch.filterTypes;
    row.filter_type = patch.filterTypes[0]; // keep legacy column synced
  }
  const { data, error } = await getSupabase()
    .from('lists')
    .update(row)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`updateList: ${error.message}`);
  return data ? rowToList(data as ListRow) : null;
}

export async function deleteList(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase().from('lists').delete().eq('id', id);
  if (error) throw new Error(`deleteList: ${error.message}`);
}

/**
 * Predicate for a single filter type — returned as a function so we can
 * union-or multiple filters by OR-ing their predicates.
 */
function filterPredicate(filterType: ListFilterType): (s: Signup) => boolean {
  switch (filterType) {
    case 'all_paid':
      return (s) => s.status === 'paid';
    case 'all_registered':
      // The default "webinar attendees" filter: registered (in-flight) + paid.
      return (s) => s.source === 'paid' && (s.status === 'registered' || s.status === 'paid');
    case 'all_free':
      return (s) => s.source === 'free';
    case 'abandoned':
      return (s) => s.source === 'paid' && s.status === 'registered';
    case 'all_signups':
      return (s) => s.status !== 'unsubscribed';
    default:
      return () => false;
  }
}

/**
 * Resolve a list's filters against the current signups table. Returns
 * the UNION of matches across all selected filter types (deduped by id).
 * Live snapshot — no caching, called once per cron run.
 *
 * Accepts a single filter type, an array, OR a full ListModel (preferred,
 * since that picks up the event_id scope automatically). Older single-arg
 * callers still work.
 */
export async function computeListMembers(
  input: ListFilterType | ListFilterType[] | ListModel,
): Promise<Signup[]> {
  let types: ListFilterType[];
  let eventId: string | null = null;
  if (typeof input === 'string') {
    types = [input];
  } else if (Array.isArray(input)) {
    types = input;
  } else {
    types = input.filterTypes;
    eventId = input.eventId;
  }
  if (types.length === 0) return [];
  const all = await getSignups();
  const predicates = types.map(filterPredicate);
  return all.filter((s) => {
    // Unsubscribed seats never receive anything regardless of filter.
    if (s.status === 'unsubscribed') return false;
    // Event scoping: if the list is tied to an event, signups must match.
    // Null eventId on the list = include all events.
    if (eventId && s.eventId !== eventId) return false;
    return predicates.some((p) => p(s));
  });
}

/* ─── Sequences ───────────────────────────────────────────────────────── */

export const getSequences = cache(async (): Promise<SequenceModel[]> => {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('sequences')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`getSequences: ${error.message}`);
  return (data as SequenceRow[]).map(rowToSequence);
});

export async function getSequence(id: string): Promise<SequenceModel | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabase()
    .from('sequences')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getSequence: ${error.message}`);
  return data ? rowToSequence(data as SequenceRow) : null;
}

export async function getActiveSequences(): Promise<SequenceModel[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('sequences')
    .select('*')
    .eq('active', true);
  if (error) throw new Error(`getActiveSequences: ${error.message}`);
  return (data as SequenceRow[]).map(rowToSequence);
}

export async function addSequence(input: {
  listId: string;
  eventId: string | null;
  name: string;
  description?: string | null;
  active?: boolean;
}): Promise<SequenceModel> {
  if (!isSupabaseConfigured()) throw new Error('addSequence: Supabase not configured');
  const { data, error } = await getSupabase()
    .from('sequences')
    .insert({
      list_id: input.listId,
      event_id: input.eventId,
      name: input.name,
      description: input.description ?? null,
      active: input.active ?? true,
    })
    .select('*')
    .single();
  if (error) throw new Error(`addSequence: ${error.message}`);
  return rowToSequence(data as SequenceRow);
}

export async function updateSequence(
  id: string,
  patch: Partial<
    Pick<SequenceModel, 'listId' | 'eventId' | 'name' | 'description' | 'active'>
  >,
): Promise<SequenceModel | null> {
  if (!isSupabaseConfigured()) return null;
  const row: Partial<SequenceRow> = {};
  if (patch.listId !== undefined) row.list_id = patch.listId;
  if (patch.eventId !== undefined) row.event_id = patch.eventId;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.active !== undefined) row.active = patch.active;
  const { data, error } = await getSupabase()
    .from('sequences')
    .update(row)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`updateSequence: ${error.message}`);
  return data ? rowToSequence(data as SequenceRow) : null;
}

export async function deleteSequence(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase().from('sequences').delete().eq('id', id);
  if (error) throw new Error(`deleteSequence: ${error.message}`);
}

/* ─── Sequence steps ──────────────────────────────────────────────────── */

export async function getSequenceSteps(sequenceId: string): Promise<SequenceStep[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('sequence_steps')
    .select('*')
    .eq('sequence_id', sequenceId)
    .order('position', { ascending: true });
  if (error) throw new Error(`getSequenceSteps: ${error.message}`);
  return (data as SequenceStepRow[]).map(rowToStep);
}

export async function addSequenceStep(input: {
  sequenceId: string;
  position: number;
  emailTemplateId: string | null;
  smsTemplateId: string | null;
  scheduleType: SequenceScheduleType;
  hoursOffset: number;
  active?: boolean;
}): Promise<SequenceStep> {
  if (!isSupabaseConfigured()) throw new Error('addSequenceStep: Supabase not configured');
  const { data, error } = await getSupabase()
    .from('sequence_steps')
    .insert({
      sequence_id: input.sequenceId,
      position: input.position,
      email_template_id: input.emailTemplateId,
      sms_template_id: input.smsTemplateId,
      schedule_type: input.scheduleType,
      hours_offset: input.hoursOffset,
      active: input.active ?? true,
    })
    .select('*')
    .single();
  if (error) throw new Error(`addSequenceStep: ${error.message}`);
  return rowToStep(data as SequenceStepRow);
}

export async function updateSequenceStep(
  id: string,
  patch: Partial<
    Pick<
      SequenceStep,
      | 'position'
      | 'emailTemplateId'
      | 'smsTemplateId'
      | 'scheduleType'
      | 'hoursOffset'
      | 'active'
    >
  >,
): Promise<SequenceStep | null> {
  if (!isSupabaseConfigured()) return null;
  const row: Partial<SequenceStepRow> = {};
  if (patch.position !== undefined) row.position = patch.position;
  if (patch.emailTemplateId !== undefined) row.email_template_id = patch.emailTemplateId;
  if (patch.smsTemplateId !== undefined) row.sms_template_id = patch.smsTemplateId;
  if (patch.scheduleType !== undefined) row.schedule_type = patch.scheduleType;
  if (patch.hoursOffset !== undefined) row.hours_offset = patch.hoursOffset;
  if (patch.active !== undefined) row.active = patch.active;
  const { data, error } = await getSupabase()
    .from('sequence_steps')
    .update(row)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`updateSequenceStep: ${error.message}`);
  return data ? rowToStep(data as SequenceStepRow) : null;
}

export async function deleteSequenceStep(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase()
    .from('sequence_steps')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`deleteSequenceStep: ${error.message}`);
}

/* ─── Sequence sends (idempotency log) ────────────────────────────────── */

/**
 * Has this step already been delivered to this signup? Used as the
 * idempotency check inside the cron — never re-send the same step
 * to the same person.
 */
export async function hasSequenceSend(
  sequenceStepId: string,
  signupId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { data, error } = await getSupabase()
    .from('sequence_sends')
    .select('id')
    .eq('sequence_step_id', sequenceStepId)
    .eq('signup_id', signupId)
    .maybeSingle();
  if (error) throw new Error(`hasSequenceSend: ${error.message}`);
  return Boolean(data);
}

/**
 * Find all signup IDs that have already received a given step.
 * Cheaper than calling hasSequenceSend() in a loop — one query per step.
 */
export async function getSequenceSendRecipients(
  sequenceStepId: string,
): Promise<Set<string>> {
  if (!isSupabaseConfigured()) return new Set();
  const { data, error } = await getSupabase()
    .from('sequence_sends')
    .select('signup_id')
    .eq('sequence_step_id', sequenceStepId);
  if (error) throw new Error(`getSequenceSendRecipients: ${error.message}`);
  return new Set((data as Array<{ signup_id: string }>).map((r) => r.signup_id));
}

export async function recordSequenceSend(input: {
  sequenceStepId: string;
  signupId: string;
  emailOk: boolean;
  smsOk: boolean;
  /** Resend message id for the email leg — lets the Resend webhook stamp
   *  delivered/bounced/opened back onto this row. */
  emailMessageId?: string | null;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase()
    .from('sequence_sends')
    .insert({
      sequence_step_id: input.sequenceStepId,
      signup_id: input.signupId,
      email_ok: input.emailOk,
      sms_ok: input.smsOk,
      email_message_id: input.emailMessageId ?? null,
      // Baseline lifecycle state — the webhook upgrades this as events arrive.
      email_status: input.emailOk ? 'sent' : null,
      email_status_at: input.emailOk ? new Date().toISOString() : null,
    });
  // Unique-violation = someone else already wrote it (concurrent cron). Ignore.
  if (error && !error.message.includes('duplicate')) {
    throw new Error(`recordSequenceSend: ${error.message}`);
  }
}

/** Resolve a sequence_send row from its Resend email message id (webhook match). */
export async function findSequenceSendByEmailMessageId(
  messageId: string,
): Promise<{ id: string; emailStatus: string | null } | null> {
  if (!messageId || !isSupabaseConfigured()) return null;
  const { data } = await getSupabase()
    .from('sequence_sends')
    .select('id, email_status')
    .eq('email_message_id', messageId)
    .maybeSingle();
  if (!data) return null;
  return { id: (data as { id: string }).id, emailStatus: (data as { email_status: string | null }).email_status };
}

// Resend lifecycle rank — never downgrade (out-of-order webhook delivery is
// allowed, so a late 'delivered' must not clobber an earlier 'opened').
const EMAIL_STATUS_RANK: Record<string, number> = {
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
  bounced: 5,
  complained: 6,
};

/** Upgrade a sequence_send's email status, never downgrading rank. */
export async function updateSequenceSendStatus(
  messageId: string,
  status: string,
  statusAt: string,
): Promise<void> {
  if (!messageId || !isSupabaseConfigured()) return;
  const current = await findSequenceSendByEmailMessageId(messageId);
  if (!current) return;
  const curRank = current.emailStatus ? EMAIL_STATUS_RANK[current.emailStatus] ?? 0 : 0;
  const newRank = EMAIL_STATUS_RANK[status] ?? 0;
  if (newRank <= curRank) return; // don't downgrade / re-write same state
  await getSupabase()
    .from('sequence_sends')
    .update({ email_status: status, email_status_at: statusAt })
    .eq('id', current.id);
}

/** Find a signup by the message-id of its paid_confirmation email (stored in
 *  metadata.confirmationMessageId), so a delivery webhook can stamp the real
 *  delivered/bounced status onto a transactional confirmation. */
export async function findSignupByConfirmationMessageId(
  messageId: string,
): Promise<Signup | null> {
  if (!messageId) return null;
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('signups')
      .select('*')
      .filter('metadata->>confirmationMessageId', 'eq', messageId)
      .maybeSingle();
    if (error) throw new Error(`Supabase findSignupByConfirmationMessageId: ${error.message}`);
    return data ? rowToSignup(data as SignupRow) : null;
  }
  const list = await readJson<Signup[]>('signups.json', []);
  return (
    list.find(
      (s) =>
        (s.metadata as { confirmationMessageId?: string } | undefined)
          ?.confirmationMessageId === messageId,
    ) ?? null
  );
}

/** Upgrade the paid_confirmation delivery status on a signup, never downgrading. */
export async function updateConfirmationStatus(
  signupId: string,
  status: string,
  statusAt: string,
): Promise<void> {
  const s = await getSignupById(signupId);
  if (!s) return;
  const cur = (s.metadata as { confirmationStatus?: string } | undefined)?.confirmationStatus;
  const curRank = cur ? EMAIL_STATUS_RANK[cur] ?? 0 : 0;
  const newRank = EMAIL_STATUS_RANK[status] ?? 0;
  if (newRank <= curRank) return; // don't downgrade
  await updateSignup(signupId, {
    metadata: { ...(s.metadata ?? {}), confirmationStatus: status, confirmationStatusAt: statusAt },
  });
}

/** Find a signup by the OneWaySMS message-id of its paid_confirmation SMS
 *  (metadata.confirmationSmsId), so the SMS DLR webhook can stamp its status. */
export async function findSignupByConfirmationSmsId(messageId: string): Promise<Signup | null> {
  if (!messageId) return null;
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('signups')
      .select('*')
      .filter('metadata->>confirmationSmsId', 'eq', messageId)
      .maybeSingle();
    if (error) throw new Error(`Supabase findSignupByConfirmationSmsId: ${error.message}`);
    return data ? rowToSignup(data as SignupRow) : null;
  }
  const list = await readJson<Signup[]>('signups.json', []);
  return (
    list.find(
      (s) => (s.metadata as { confirmationSmsId?: string } | undefined)?.confirmationSmsId === messageId,
    ) ?? null
  );
}

/** Upgrade the paid_confirmation SMS delivery status on a signup, never downgrading. */
export async function updateConfirmationSmsStatus(
  signupId: string,
  status: string,
  statusAt: string,
): Promise<void> {
  const s = await getSignupById(signupId);
  if (!s) return;
  const cur = (s.metadata as { confirmationSmsStatus?: string } | undefined)?.confirmationSmsStatus;
  const curRank = cur ? EMAIL_STATUS_RANK[cur] ?? 0 : 0;
  const newRank = EMAIL_STATUS_RANK[status] ?? 0;
  if (newRank <= curRank) return; // don't downgrade
  await updateSignup(signupId, {
    metadata: { ...(s.metadata ?? {}), confirmationSmsStatus: status, confirmationSmsStatusAt: statusAt },
  });
}

/**
 * Step counts grouped by sequence_id — single query instead of N
 * per-sequence calls. Used by /admin/sequences to render the table.
 */
export async function getStepCountsBySequence(): Promise<Map<string, number>> {
  if (!isSupabaseConfigured()) return new Map();
  const { data, error } = await getSupabase()
    .from('sequence_steps')
    .select('sequence_id');
  if (error) throw new Error(`getStepCountsBySequence: ${error.message}`);
  const counts = new Map<string, number>();
  for (const row of (data as Array<{ sequence_id: string }>) ?? []) {
    counts.set(row.sequence_id, (counts.get(row.sequence_id) ?? 0) + 1);
  }
  return counts;
}

/** Counts of recipients per step in a sequence — used by the admin UI. */
export async function getSequenceStepSendCounts(
  sequenceId: string,
): Promise<Map<string, number>> {
  if (!isSupabaseConfigured()) return new Map();
  const sb = getSupabase();
  const { data: steps, error: e1 } = await sb
    .from('sequence_steps')
    .select('id')
    .eq('sequence_id', sequenceId);
  if (e1) throw new Error(`getSequenceStepSendCounts steps: ${e1.message}`);
  const stepIds = (steps as Array<{ id: string }>).map((s) => s.id);
  if (stepIds.length === 0) return new Map();
  const { data: sends, error: e2 } = await sb
    .from('sequence_sends')
    .select('sequence_step_id')
    .in('sequence_step_id', stepIds);
  if (e2) throw new Error(`getSequenceStepSendCounts sends: ${e2.message}`);
  const counts = new Map<string, number>();
  for (const row of sends as Array<{ sequence_step_id: string }>) {
    counts.set(row.sequence_step_id, (counts.get(row.sequence_step_id) ?? 0) + 1);
  }
  return counts;
}

/* ─── Manual sequence subscriptions ───────────────────────────────────── */

export type SequenceSubscription = {
  id: string;
  sequenceId: string;
  signupId: string;
  subscribedAt: string;
};

type SequenceSubscriptionRow = {
  id: string;
  sequence_id: string;
  signup_id: string;
  subscribed_at: string;
};

function rowToSubscription(r: SequenceSubscriptionRow): SequenceSubscription {
  return {
    id: r.id,
    sequenceId: r.sequence_id,
    signupId: r.signup_id,
    subscribedAt: r.subscribed_at,
  };
}

/** Subscribe a customer to a sequence manually. Idempotent. */
export async function subscribeToSequence(
  sequenceId: string,
  signupId: string,
): Promise<SequenceSubscription> {
  if (!isSupabaseConfigured()) throw new Error('subscribeToSequence: Supabase not configured');
  const { data, error } = await getSupabase()
    .from('sequence_subscriptions')
    .upsert(
      { sequence_id: sequenceId, signup_id: signupId },
      { onConflict: 'sequence_id,signup_id', ignoreDuplicates: false },
    )
    .select('*')
    .single();
  if (error) throw new Error(`subscribeToSequence: ${error.message}`);
  return rowToSubscription(data as SequenceSubscriptionRow);
}

/**
 * Bulk subscribe many customers to one sequence. Filters out anyone
 * already in the sequence — either via the sequence's list filter OR
 * via an existing manual subscription. Returns counts for UI feedback.
 *
 * Why filter? A manual subscription overrides the list-driven anchor
 * with subscribed_at, which would silently restart the schedule for
 * customers who were already getting the right cadence via the list.
 * The cron's union also already covers them, so a second subscription
 * is pure noise.
 */
export async function subscribeManyToSequence(
  sequenceId: string,
  signupIds: string[],
): Promise<{ subscribed: number; skipped: number }> {
  if (signupIds.length === 0) return { subscribed: 0, skipped: 0 };
  if (!isSupabaseConfigured())
    throw new Error('subscribeManyToSequence: Supabase not configured');

  // Resolve who's already covered, in either way.
  const sequence = await getSequence(sequenceId);
  const alreadyIn = new Set<string>();
  if (sequence) {
    const list = await getList(sequence.listId);
    if (list) {
      const members = await computeListMembers(list);
      for (const m of members) alreadyIn.add(m.id);
    }
  }
  const existingSubs = await getSequenceSubscriptions(sequenceId);
  for (const s of existingSubs) alreadyIn.add(s.signupId);

  const fresh = signupIds.filter((id) => !alreadyIn.has(id));
  const skipped = signupIds.length - fresh.length;

  if (fresh.length === 0) return { subscribed: 0, skipped };

  const { data, error } = await getSupabase()
    .from('sequence_subscriptions')
    .upsert(
      fresh.map((sid) => ({ sequence_id: sequenceId, signup_id: sid })),
      { onConflict: 'sequence_id,signup_id', ignoreDuplicates: false },
    )
    .select('id');
  if (error) throw new Error(`subscribeManyToSequence: ${error.message}`);
  return { subscribed: data?.length ?? fresh.length, skipped };
}

/**
 * Find every manual subscription that's redundant — i.e. the customer
 * is already in the sequence via the list filter — and remove it.
 * Used both as a one-time cleanup and called eagerly so a dropping-into-
 * the-list event (e.g. someone newly marked paid) self-heals duplicates.
 *
 * Returns how many redundant rows were deleted, plus a per-sequence
 * breakdown for diagnostics.
 */
export async function cleanupRedundantSubscriptions(): Promise<{
  deleted: number;
  byCustomer: Array<{ signupId: string; sequenceId: string; sequenceName: string }>;
}> {
  if (!isSupabaseConfigured()) return { deleted: 0, byCustomer: [] };

  const sb = getSupabase();
  // Pull all manual subs.
  const subsResult = await sb.from('sequence_subscriptions').select('id, sequence_id, signup_id');
  if (subsResult.error) {
    if (isMissingTableError(subsResult.error.message)) return { deleted: 0, byCustomer: [] };
    throw new Error(`cleanupRedundantSubscriptions subs: ${subsResult.error.message}`);
  }
  const allSubs = (subsResult.data ?? []) as Array<{
    id: string;
    sequence_id: string;
    signup_id: string;
  }>;
  if (allSubs.length === 0) return { deleted: 0, byCustomer: [] };

  // Group by sequence to amortize the list-resolution.
  const bySequence = new Map<string, Array<{ id: string; signupId: string }>>();
  for (const s of allSubs) {
    const arr = bySequence.get(s.sequence_id) ?? [];
    arr.push({ id: s.id, signupId: s.signup_id });
    bySequence.set(s.sequence_id, arr);
  }

  const toDelete: string[] = [];
  const breakdown: Array<{ signupId: string; sequenceId: string; sequenceName: string }> = [];

  for (const [sequenceId, members] of bySequence.entries()) {
    const sequence = await getSequence(sequenceId);
    if (!sequence) continue;
    const list = await getList(sequence.listId);
    if (!list) continue;
    const listMembers = await computeListMembers(list);
    const listMemberIds = new Set(listMembers.map((m) => m.id));

    for (const sub of members) {
      if (listMemberIds.has(sub.signupId)) {
        toDelete.push(sub.id);
        breakdown.push({
          signupId: sub.signupId,
          sequenceId,
          sequenceName: sequence.name,
        });
      }
    }
  }

  if (toDelete.length === 0) return { deleted: 0, byCustomer: [] };

  const del = await sb
    .from('sequence_subscriptions')
    .delete()
    .in('id', toDelete)
    .select('id');
  if (del.error) throw new Error(`cleanupRedundantSubscriptions delete: ${del.error.message}`);

  return { deleted: del.data?.length ?? toDelete.length, byCustomer: breakdown };
}

export async function unsubscribeFromSequence(
  sequenceId: string,
  signupId: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase()
    .from('sequence_subscriptions')
    .delete()
    .eq('sequence_id', sequenceId)
    .eq('signup_id', signupId);
  if (error) throw new Error(`unsubscribeFromSequence: ${error.message}`);
}

/**
 * Treat a "relation does not exist" error as an empty result so the
 * customer profile / cron keep working before the migration is applied
 * on a given Supabase. Any other error is re-thrown.
 */
function isMissingTableError(msg: string): boolean {
  return /does not exist|schema cache|PGRST205/i.test(msg);
}

/** All manual subscriptions for one customer. */
export async function getCustomerSubscriptions(
  signupId: string,
): Promise<SequenceSubscription[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('sequence_subscriptions')
    .select('*')
    .eq('signup_id', signupId);
  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw new Error(`getCustomerSubscriptions: ${error.message}`);
  }
  return (data as SequenceSubscriptionRow[]).map(rowToSubscription);
}

/** All manual subscriptions for one sequence — used by the cron to merge
 *  into the list-driven audience. */
export async function getSequenceSubscriptions(
  sequenceId: string,
): Promise<SequenceSubscription[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('sequence_subscriptions')
    .select('*')
    .eq('sequence_id', sequenceId);
  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw new Error(`getSequenceSubscriptions: ${error.message}`);
  }
  return (data as SequenceSubscriptionRow[]).map(rowToSubscription);
}

/* --------------------------------------------------------------------- */
/* FUNNELS                                                               */
/* --------------------------------------------------------------------- */

export type FunnelKind = 'webinar' | 'event' | 'product';

/** A single line in the value stack (the "Everything you get" breakdown). */
export type ValueStackItem = {
  label: string;
  description: string;
  /** Centavos, or null for "Priceless". */
  valueCentavos: number | null;
};

/** Big-number proof points (e.g. "10 · Builders only"). */
export type FunnelStat = { stat: string; label: string };

/** Cost-comparison cards (agency / freelancer / "someday"). */
export type FunnelAlternative = {
  label: string;
  headline: string;
  timeframe: string;
  detail: string;
};

/**
 * Event-funnel config (the VibeCode Retreat shape). Stored as JSONB so we
 * can extend it without migrations. All money fields are centavos.
 */
export type EventFunnelConfig = {
  /** Public URL of the live funnel page (wherever it's hosted). Surfaced
   *  as a 'View funnel' link in the admin so you can jump to it. */
  publicUrl?: string;
  tagline?: string;
  subtitle?: string;
  location?: string;
  capacity?: number;
  /** Standard all-in price. */
  standardPriceCentavos?: number;
  /** Discounted price if paid in full today. */
  payInFullPriceCentavos?: number;
  /** Slot-securing deposit. */
  depositCentavos?: number;
  /** Human date by which the balance is due, e.g. "June 19". */
  balanceDueDate?: string;
  /** Add-on price to bring an extra person. */
  extraPersonCentavos?: number;
  /** Sum of the value stack for the "Not ₱X" anchor. */
  totalValueCentavos?: number;
  paymentMethods?: string[];
  guarantee?: string;
  valueStack?: ValueStackItem[];
  byTheNumbers?: FunnelStat[];
  alternatives?: FunnelAlternative[];
};

export type FunnelModel = {
  id: string;
  slug: string;
  name: string;
  kind: FunnelKind;
  active: boolean;
  config: EventFunnelConfig & Record<string, unknown>;
  createdAt: string;
};

type FunnelRow = {
  id: string;
  slug: string;
  name: string;
  kind: FunnelKind;
  active: boolean;
  config: Record<string, unknown> | null;
  created_at: string;
};

function rowToFunnel(r: FunnelRow): FunnelModel {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    kind: r.kind,
    active: r.active,
    config: (r.config ?? {}) as EventFunnelConfig & Record<string, unknown>,
    createdAt: r.created_at,
  };
}

export const getFunnels = cache(async (): Promise<FunnelModel[]> => {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('funnels')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw new Error(`getFunnels: ${error.message}`);
  }
  return (data as FunnelRow[]).map(rowToFunnel);
});

export const getFunnel = cache(async (id: string): Promise<FunnelModel | null> => {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabase()
    .from('funnels')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error.message)) return null;
    throw new Error(`getFunnel: ${error.message}`);
  }
  return data ? rowToFunnel(data as FunnelRow) : null;
}) as (id: string) => Promise<FunnelModel | null>;

export async function updateFunnel(
  id: string,
  patch: Partial<Pick<FunnelModel, 'name' | 'active' | 'config'>>,
): Promise<FunnelModel | null> {
  if (!isSupabaseConfigured()) return null;
  const row: Partial<FunnelRow> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.config !== undefined) row.config = patch.config;
  const { data, error } = await getSupabase()
    .from('funnels')
    .update(row)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`updateFunnel: ${error.message}`);
  return data ? rowToFunnel(data as FunnelRow) : null;
}

/* ─── VibeCode Retreat reservations ─────────────────────────────────────── */

export type RetreatPlan = 'full' | 'reservation' | 'installment';
export type RetreatMethod = 'UnionBank' | 'BPI' | 'Credit Card';

export type RetreatReservationInput = {
  name: string;
  email: string;
  phone: string;
  paymentMethod?: RetreatMethod;
  paymentPlan?: RetreatPlan;
  overnight?: boolean;
  diet?: string;
  business?: string;
  buildIdea?: string;
  extraPersonName?: string;
  tshirtSize?: string;
  heardFrom?: string;
  amountDueCentavos?: number;
};

export type RetreatReservation = RetreatReservationInput & {
  id: string;
  createdAt: string;
  status: 'reserved' | 'proof_submitted' | 'paid';
  proofSubmittedAt: string | null;
  paidAt: string | null;
  xenditInvoiceId: string | null;
};

type RetreatReservationRow = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string;
  payment_method: string | null;
  payment_plan: string | null;
  overnight: boolean | null;
  diet: string | null;
  business: string | null;
  build_idea: string | null;
  extra_person_name: string | null;
  tshirt_size: string | null;
  heard_from: string | null;
  amount_due_centavos: number | null;
  status: string;
  proof_submitted_at: string | null;
  paid_at: string | null;
  xendit_invoice_id: string | null;
};

function rowToReservation(r: RetreatReservationRow): RetreatReservation {
  return {
    id: r.id,
    createdAt: r.created_at,
    name: r.name,
    email: r.email,
    phone: r.phone,
    paymentMethod: (r.payment_method as RetreatMethod) ?? undefined,
    paymentPlan: (r.payment_plan as RetreatPlan) ?? undefined,
    overnight: r.overnight ?? undefined,
    diet: r.diet ?? '',
    business: r.business ?? '',
    buildIdea: r.build_idea ?? '',
    extraPersonName: r.extra_person_name ?? '',
    tshirtSize: r.tshirt_size ?? '',
    heardFrom: r.heard_from ?? '',
    amountDueCentavos: r.amount_due_centavos ?? undefined,
    status:
      r.status === 'paid'
        ? 'paid'
        : r.status === 'proof_submitted'
          ? 'proof_submitted'
          : 'reserved',
    proofSubmittedAt: r.proof_submitted_at,
    paidAt: r.paid_at,
    xenditInvoiceId: r.xendit_invoice_id,
  };
}

export async function createRetreatReservation(
  input: RetreatReservationInput,
): Promise<RetreatReservation> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured');
  }
  const { data, error } = await getSupabase()
    .from('retreat_reservations')
    .insert({
      name: input.name,
      email: input.email,
      phone: input.phone,
      payment_method: input.paymentMethod ?? null,
      payment_plan: input.paymentPlan ?? null,
      overnight: input.overnight ?? null,
      diet: input.diet ?? '',
      business: input.business ?? '',
      build_idea: input.buildIdea ?? '',
      extra_person_name: input.extraPersonName ?? '',
      tshirt_size: input.tshirtSize ?? '',
      heard_from: input.heardFrom ?? '',
      amount_due_centavos: input.amountDueCentavos ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(`createRetreatReservation: ${error.message}`);
  return rowToReservation(data as RetreatReservationRow);
}

export async function getRetreatReservation(
  id: string,
): Promise<RetreatReservation | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabase()
    .from('retreat_reservations')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error.message)) return null;
    throw new Error(`getRetreatReservation: ${error.message}`);
  }
  return data ? rowToReservation(data as RetreatReservationRow) : null;
}

export async function markRetreatReservationProof(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase()
    .from('retreat_reservations')
    .update({ status: 'proof_submitted', proof_submitted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`markRetreatReservationProof: ${error.message}`);
}

/** Mark a reservation paid after a successful Xendit card invoice. Stores the
 *  invoice id + paid timestamp so the webhook is idempotent. */
export async function markRetreatReservationPaid(
  id: string,
  opts: { invoiceId?: string | null; paidAtIso?: string } = {},
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase()
    .from('retreat_reservations')
    .update({
      status: 'paid',
      paid_at: opts.paidAtIso ?? new Date().toISOString(),
      xendit_invoice_id: opts.invoiceId ?? null,
    })
    .eq('id', id);
  if (error) throw new Error(`markRetreatReservationPaid: ${error.message}`);
}

/** Fill in the "rest" of a reservation (collected after payment on the
 *  done page) — keeps the upfront reserve form minimal. */
export async function updateRetreatReservation(
  id: string,
  patch: Partial<Pick<RetreatReservationInput,
    'overnight' | 'diet' | 'business' | 'buildIdea' | 'extraPersonName' | 'tshirtSize' | 'heardFrom'>>,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const row: Record<string, unknown> = {};
  if (patch.overnight !== undefined) row.overnight = patch.overnight;
  if (patch.diet !== undefined) row.diet = patch.diet;
  if (patch.business !== undefined) row.business = patch.business;
  if (patch.buildIdea !== undefined) row.build_idea = patch.buildIdea;
  if (patch.extraPersonName !== undefined) row.extra_person_name = patch.extraPersonName;
  if (patch.tshirtSize !== undefined) row.tshirt_size = patch.tshirtSize;
  if (patch.heardFrom !== undefined) row.heard_from = patch.heardFrom;
  if (Object.keys(row).length === 0) return;
  const { error } = await getSupabase().from('retreat_reservations').update(row).eq('id', id);
  if (error) throw new Error(`updateRetreatReservation: ${error.message}`);
}

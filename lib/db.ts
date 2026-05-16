/**
 * Mini backend storage layer.
 *
 * Backs everything with JSON files inside /data so the admin works the moment
 * you `pnpm dev` — no Supabase setup required. Swap the read/write helpers
 * later when you move to a real DB.
 *
 * IMPORTANT: this is for local / single-instance hosting only. On Vercel and
 * other serverless platforms the filesystem is ephemeral — move to Supabase,
 * Upstash KV, or any real DB before deploy.
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

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

/* Serialize writes per file so two concurrent requests don't race on the
 * .tmp → final rename. Simple module-level promise chain — good enough for
 * a JSON-file backed mini-CRM. Swap for a real DB before high load. */
const writeChain: Record<string, Promise<void>> = {};

async function writeJson<T>(file: string, data: T) {
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
  html: string;
};

export type SmsTemplate = {
  id: string;
  name: string;
  body: string;
};

export type Settings = {
  /* Email — Resend */
  resendApiKey: string;
  resendFromEmail: string;
  resendFromName: string;
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
  resendApiKey: '',
  resendFromEmail: 'hello@bosslabs.ai',
  resendFromName: 'BOSSLABS AI',
  onewaysmsEndpoint: 'https://gateway.onewaysms.com.ph:10443/api.aspx',
  onewaysmsUsername: '',
  onewaysmsPassword: '',
  onewaysmsSenderId: 'BOSSLABS',
  zoomRegisterUrl: '',
  zoomJoinUrl: '',
  replayUrl: '',
  messengerGroupUrl: '',
};

/* --------------------------------------------------------------------- */
/* SIGNUPS                                                               */
/* --------------------------------------------------------------------- */

export async function getSignups(): Promise<Signup[]> {
  const list = await readJson<Signup[]>('signups.json', []);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addSignup(
  data: Omit<Signup, 'id' | 'createdAt' | 'status'> & { status?: SignupStatus },
): Promise<Signup> {
  const list = await readJson<Signup[]>('signups.json', []);
  const signup: Signup = {
    id: `sig_${crypto.randomBytes(6).toString('hex')}`,
    createdAt: new Date().toISOString(),
    status: data.status ?? 'registered',
    ...data,
  };
  list.unshift(signup);
  await writeJson('signups.json', list);
  return signup;
}

export async function updateSignup(id: string, patch: Partial<Signup>): Promise<Signup | null> {
  const list = await readJson<Signup[]>('signups.json', []);
  const i = list.findIndex((s) => s.id === id);
  if (i === -1) return null;
  list[i] = { ...list[i], ...patch };
  await writeJson('signups.json', list);
  return list[i];
}

/* --------------------------------------------------------------------- */
/* TEMPLATES                                                             */
/* --------------------------------------------------------------------- */

export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  return readJson<EmailTemplate[]>('email_templates.json', []);
}

export async function saveEmailTemplate(t: EmailTemplate) {
  const list = await getEmailTemplates();
  const i = list.findIndex((x) => x.id === t.id);
  if (i === -1) list.push(t);
  else list[i] = t;
  await writeJson('email_templates.json', list);
}

export async function getSmsTemplates(): Promise<SmsTemplate[]> {
  return readJson<SmsTemplate[]>('sms_templates.json', []);
}

export async function saveSmsTemplate(t: SmsTemplate) {
  const list = await getSmsTemplates();
  const i = list.findIndex((x) => x.id === t.id);
  if (i === -1) list.push(t);
  else list[i] = t;
  await writeJson('sms_templates.json', list);
}

/* --------------------------------------------------------------------- */
/* SETTINGS                                                              */
/* --------------------------------------------------------------------- */

export async function getSettings(): Promise<Settings> {
  const stored = await readJson<Partial<Settings>>('settings.json', {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(patch: Partial<Settings>) {
  const current = await getSettings();
  const next: Settings = { ...current, ...patch };
  await writeJson('settings.json', next);
  return next;
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

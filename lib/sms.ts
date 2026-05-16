/**
 * SMS sending — backed by OneWaySMS (https://onewaysms.com.ph).
 *
 * The OneWaySMS gateway uses a simple HTTP GET API:
 *   GET {endpoint}?apiusername=...&apipassword=...&senderid=...&mobileno=...&message=...
 *
 * Response is a plain-text status code (positive = message id, negative = error).
 * Falls back to a "demo" no-op when credentials are missing.
 */

import { getSettings, getSmsTemplates, renderTemplate } from './db';
export { smsPartCount } from './sms-counter';

export type SendSmsResult =
  | { ok: true; id: string; provider: 'onewaysms' | 'demo' }
  | { ok: false; error: string };

export type SendSmsArgs = {
  to: string;
  templateId?: string;
  body?: string;
  vars?: Record<string, string | number | undefined>;
};

/** Render an SMS template by id. */
export async function renderSms(
  templateId: string,
  vars: Record<string, string | number | undefined> = {},
): Promise<{ body: string } | null> {
  const list = await getSmsTemplates();
  const t = list.find((x) => x.id === templateId);
  if (!t) return null;
  return { body: renderTemplate(t.body, vars) };
}

/** Normalize a PH phone number to OneWaySMS's required format (countrycode + number, no +). */
export function normalizePhPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('63')) return digits;
  if (digits.startsWith('09')) return '63' + digits.slice(1);
  if (digits.startsWith('9') && digits.length === 10) return '63' + digits;
  return digits;
}

export async function sendSms(args: SendSmsArgs): Promise<SendSmsResult> {
  const settings = await getSettings();

  let body = args.body ?? '';
  if (args.templateId) {
    const rendered = await renderSms(args.templateId, args.vars);
    if (!rendered) {
      return { ok: false, error: `SMS template "${args.templateId}" not found` };
    }
    body = rendered.body;
  }
  if (!body) return { ok: false, error: 'body is required' };

  const phone = normalizePhPhone(args.to);

  if (!settings.onewaysmsUsername || !settings.onewaysmsPassword) {
    console.log('[sms/demo]', { to: phone, body });
    return { ok: true, id: `demo_${Date.now()}`, provider: 'demo' };
  }

  const url = new URL(settings.onewaysmsEndpoint);
  url.searchParams.set('apiusername', settings.onewaysmsUsername);
  url.searchParams.set('apipassword', settings.onewaysmsPassword);
  url.searchParams.set('senderid', settings.onewaysmsSenderId || 'BOSSLABS');
  url.searchParams.set('mobileno', phone);
  url.searchParams.set('message', body);

  try {
    const res = await fetch(url.toString());
    const text = (await res.text()).trim();
    // OneWaySMS returns a numeric "message id" on success, negative number on error.
    const num = Number(text);
    if (Number.isNaN(num) || num <= 0) {
      return { ok: false, error: `OneWaySMS error: ${text}` };
    }
    return { ok: true, id: text, provider: 'onewaysms' };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown SMS error',
    };
  }
}


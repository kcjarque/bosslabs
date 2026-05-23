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
    // Don't log full phone/body — Vercel logs are searchable + retained.
    console.log('[sms/demo]', {
      to: phone ? `${phone.slice(0, 3)}***${phone.slice(-2)}` : '[empty]',
      bodyLen: body.length,
    });
    return { ok: true, id: `demo_${Date.now()}`, provider: 'demo' };
  }

  let url: URL;
  try {
    url = new URL(settings.onewaysmsEndpoint);
  } catch {
    return {
      ok: false,
      error: `Endpoint is not a valid URL: "${settings.onewaysmsEndpoint}". Expected something like https://gateway.onewaysms.com.ph:10443/api.aspx`,
    };
  }
  url.searchParams.set('apiusername', settings.onewaysmsUsername);
  url.searchParams.set('apipassword', settings.onewaysmsPassword);
  url.searchParams.set('senderid', settings.onewaysmsSenderId || 'BOSSLABS');
  url.searchParams.set('mobileno', phone);
  url.searchParams.set('message', body);

  // Build a sanitized URL (no credentials) for echoing back in error msgs.
  const sanitizedUrl = `${url.origin}${url.pathname}?apiusername=***&apipassword=***&senderid=${url.searchParams.get('senderid')}&mobileno=***&message=...`;

  try {
    const res = await fetch(url.toString(), {
      // Some PH gateways are slow; cap at 15s so the admin UI doesn't hang forever.
      signal: AbortSignal.timeout(15_000),
    });
    const text = (await res.text()).trim();

    if (!res.ok) {
      return {
        ok: false,
        error: `OneWaySMS HTTP ${res.status} ${res.statusText} from ${sanitizedUrl}${text ? ` — body: "${text.slice(0, 200)}"` : ' — empty body'}`,
      };
    }

    if (!text) {
      return {
        ok: false,
        error: `OneWaySMS returned an empty body (HTTP ${res.status}) from ${sanitizedUrl}. Check that the endpoint path is correct (api.aspx vs api2.aspx) and your IP is allowlisted in OneWaySMS dashboard.`,
      };
    }

    // OneWaySMS returns a numeric "message id" on success, negative number on error.
    // Known PH error codes:
    //   -100 = authentication failed (wrong username/password)
    //   -200 = insufficient credit
    //   -300 = invalid sender id
    //   -400 = invalid mobile number
    //   -500 = invalid message
    //   -600 = generic gateway error
    const num = Number(text);
    if (Number.isNaN(num)) {
      return {
        ok: false,
        error: `OneWaySMS returned non-numeric response: "${text.slice(0, 200)}" from ${sanitizedUrl}`,
      };
    }
    if (num <= 0) {
      const hint = oneWaySmsErrorHint(num);
      return {
        ok: false,
        error: `OneWaySMS error code ${num}${hint ? ` (${hint})` : ''}`,
      };
    }
    return { ok: true, id: text, provider: 'onewaysms' };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return {
        ok: false,
        error: `OneWaySMS request timed out after 15s. The endpoint ${url.origin} may be unreachable from Vercel — try https://gateway.onewaysms.com.ph/api2.aspx (no custom port) or check OneWaySMS status.`,
      };
    }
    // undici (Node fetch) wraps the real network error inside `err.cause`.
    // Extract the actual code so the admin can see ENOTFOUND vs ECONNREFUSED
    // etc. instead of the useless top-level "fetch failed".
    const cause = err instanceof Error
      ? (err as Error & { cause?: { code?: string; message?: string } }).cause
      : undefined;
    const code = cause?.code ?? '';
    const causeMsg = cause?.message ?? '';
    const hint = networkErrorHint(code, url.port);
    const detail = code
      ? `${code}${causeMsg ? `: ${causeMsg}` : ''}`
      : (err instanceof Error ? err.message : 'unknown');
    return {
      ok: false,
      error: `OneWaySMS network error — ${detail}${hint ? `. ${hint}` : ''}`,
    };
  }
}

/** Suggest a fix based on the Node network error code + the port being used. */
function networkErrorHint(code: string, port: string): string {
  switch (code) {
    case 'ENOTFOUND':
      return 'Hostname does not resolve. Check the API endpoint URL above — typo in the domain?';
    case 'ECONNREFUSED':
      return port
        ? `Nothing listening on port ${port} at that host. Try https://gateway.onewaysms.com.ph/api2.aspx (default HTTPS port) instead.`
        : 'Nothing listening on the default port. Try the alternate endpoint https://gateway.onewaysms.com.ph:10443/api.aspx';
    case 'ETIMEDOUT':
    case 'ECONNRESET':
      return port === '10443'
        ? 'Port 10443 may be blocked by Vercel egress. Try the standard-port endpoint https://gateway.onewaysms.com.ph/api2.aspx instead.'
        : 'Network path to OneWaySMS is unreachable. Try an alternate endpoint from your OneWaySMS dashboard.';
    case 'EPROTO':
    case 'CERT_HAS_EXPIRED':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      return 'TLS handshake failed. The cert on this endpoint may be misconfigured — try a different endpoint from your OneWaySMS dashboard.';
    case 'UND_ERR_CONNECT_TIMEOUT':
      return port === '10443'
        ? 'Vercel egress likely blocks port 10443. Try https://gateway.onewaysms.com.ph/api2.aspx (standard HTTPS port).'
        : 'Connection timeout. Try a different OneWaySMS endpoint.';
    default:
      return '';
  }
}

/** Map OneWaySMS PH numeric error codes to a human-readable hint. */
function oneWaySmsErrorHint(code: number): string {
  switch (code) {
    case -100:
      return 'authentication failed — check API username/password';
    case -200:
      return 'insufficient credit — top up at onewaysms.ph';
    case -300:
      return 'invalid sender ID — check the Sender ID field above (11 chars max)';
    case -400:
      return 'invalid mobile number — must be in 639XXXXXXXXX format';
    case -500:
      return 'invalid message — likely contains disallowed characters';
    case -600:
      return 'gateway-side error — try again, then contact OneWaySMS support';
    default:
      return '';
  }
}


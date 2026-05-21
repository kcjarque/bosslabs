/**
 * Meta Conversions API — server-side event tracking.
 *
 * Pairs with the browser pixel for deduplicated, ad-blocker-proof
 * attribution. The Purchase event is the critical one — it fires
 * from /api/webhooks/xendit which can't be blocked, so we get
 * conversion data even when Pixel.js is blocked or the buyer
 * never comes back to a thank-you page.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

import { createHash } from 'crypto';

const META_GRAPH_VERSION = 'v18.0';

export type CapiUserData = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  fbp?: string;
  fbc?: string;
  clientIp?: string;
  clientUserAgent?: string;
  country?: string;
  externalId?: string;
};

export type CapiCustomData = {
  value?: number;
  currency?: string;
  contentName?: string;
  contentIds?: string[];
  contentType?: string;
  numItems?: number;
};

export type SendCapiArgs = {
  eventName:
    | 'ViewContent'
    | 'Lead'
    | 'InitiateCheckout'
    | 'AddPaymentInfo'
    | 'Purchase'
    | 'CompleteRegistration'
    | string;
  eventId: string;
  eventTime?: number; // unix seconds
  eventSourceUrl?: string;
  userData?: CapiUserData;
  customData?: CapiCustomData;
};

export type CapiResult =
  | { ok: true; provider: 'capi' | 'demo'; eventsReceived?: number }
  | { ok: false; error: string };

export function isCapiConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID && process.env.META_CAPI_ACCESS_TOKEN);
}

/**
 * SHA-256 (lowercase trimmed) — Meta's required hashing for user PII.
 * Empty strings are returned undefined so we never send blanks to the API.
 */
function sha256(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const normalized = input.toString().toLowerCase().trim();
  if (!normalized) return undefined;
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Phone numbers must be in E.164 (digits-only, country-code prefixed) before
 * hashing, otherwise PH users typing "09171234567" hash differently from
 * "639171234567" and Meta's match rate collapses.
 *
 * Conventions applied (PH default — appropriate for our market):
 *   - Strip all non-digits
 *   - Numbers starting with `0` → drop the 0 and prepend `63`
 *   - Numbers starting with `9` (10 digits, e.g. 9171234567) → prepend `63`
 *   - Anything else passed through (already prefixed or non-PH)
 */
function normalizePhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits) return undefined;
  if (digits.startsWith('0')) return '63' + digits.slice(1);
  if (digits.length === 10 && digits.startsWith('9')) return '63' + digits;
  return digits;
}

function buildUserDataPayload(user: CapiUserData | undefined): Record<string, unknown> {
  if (!user) return {};
  const payload: Record<string, unknown> = {};
  const em = sha256(user.email);
  const ph = sha256(normalizePhone(user.phone));
  const fn = sha256(user.firstName);
  const ln = sha256(user.lastName);
  const country = sha256(user.country);
  const externalId = sha256(user.externalId);

  if (em) payload.em = [em];
  if (ph) payload.ph = [ph];
  if (fn) payload.fn = [fn];
  if (ln) payload.ln = [ln];
  if (country) payload.country = [country];
  if (externalId) payload.external_id = [externalId];
  if (user.fbp) payload.fbp = user.fbp;
  if (user.fbc) payload.fbc = user.fbc;
  if (user.clientIp) payload.client_ip_address = user.clientIp;
  if (user.clientUserAgent) payload.client_user_agent = user.clientUserAgent;
  return payload;
}

function buildCustomDataPayload(data: CapiCustomData | undefined): Record<string, unknown> {
  if (!data) return {};
  const payload: Record<string, unknown> = {};
  if (data.value !== undefined) payload.value = data.value;
  if (data.currency) payload.currency = data.currency;
  if (data.contentName) payload.content_name = data.contentName;
  if (data.contentIds && data.contentIds.length) payload.content_ids = data.contentIds;
  if (data.contentType) payload.content_type = data.contentType;
  if (data.numItems !== undefined) payload.num_items = data.numItems;
  return payload;
}

/**
 * Fire a single CAPI event. Best-effort — never throws. Logs errors but
 * returns `{ok: false}` so callers can ignore (we never want to break
 * a payment flow because Meta API is having a bad day).
 */
export async function sendCapiEvent(args: SendCapiArgs): Promise<CapiResult> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const token = process.env.META_CAPI_ACCESS_TOKEN;

  // Demo fallback — log and return ok so dev/preview never breaks.
  if (!pixelId || !token) {
    console.log('[capi/demo]', {
      eventName: args.eventName,
      eventId: args.eventId,
      value: args.customData?.value,
    });
    return { ok: true, provider: 'demo' };
  }

  const eventTime = args.eventTime ?? Math.floor(Date.now() / 1000);

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: args.eventName,
        event_time: eventTime,
        event_id: args.eventId,
        action_source: 'website',
        event_source_url: args.eventSourceUrl,
        user_data: buildUserDataPayload(args.userData),
        custom_data: buildCustomDataPayload(args.customData),
      },
    ],
  };

  // Test event code routes the event to Meta's Test Events tab in Events
  // Manager — required while you're verifying setup, leave blank in prod.
  if (process.env.META_CAPI_TEST_EVENT_CODE) {
    body.test_event_code = process.env.META_CAPI_TEST_EVENT_CODE;
  }

  try {
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn('[capi/error]', res.status, text.slice(0, 200));
      return { ok: false, error: `CAPI ${res.status}: ${text.slice(0, 200)}` };
    }
    const json = (await res.json()) as { events_received?: number };
    return { ok: true, provider: 'capi', eventsReceived: json.events_received };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown CAPI error';
    console.warn('[capi/exception]', message);
    return { ok: false, error: message };
  }
}

/**
 * Extract _fbp and _fbc cookies from an incoming Request. These are the
 * primary match keys Meta uses to attribute server events to a specific
 * browser session — having them lifts CAPI match rate from ~40% to ~85%.
 */
export function extractFbCookies(req: Request): { fbp?: string; fbc?: string } {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  }
  return { fbp: cookies['_fbp'], fbc: cookies['_fbc'] };
}

/** Extract the best-guess client IP from common proxy headers. */
export function extractClientIp(req: Request): string | undefined {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    undefined
  );
}

/**
 * Admin auth — single shared password (env var `ADMIN_PASSWORD`).
 *
 * Signs an HMAC cookie so tampering is harder than a static "password=true"
 * string. In production both `ADMIN_PASSWORD` and `ADMIN_COOKIE_SECRET`
 * MUST be set — the module throws on first use if either is missing so we
 * fail closed instead of falling back to a published default.
 */

import crypto from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const ADMIN_COOKIE = 'bl_admin';
const ONE_DAY = 60 * 60 * 24;

function isProd() {
  return process.env.NODE_ENV === 'production';
}

function secret(): string {
  const s = process.env.ADMIN_COOKIE_SECRET;
  if (!s) {
    if (isProd()) {
      throw new Error(
        'ADMIN_COOKIE_SECRET is not set. Generate one with `node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"` and set it in your Vercel env vars.',
      );
    }
    // Dev only — log loudly so first-runner sees it.
    console.warn(
      '[admin-auth] ADMIN_COOKIE_SECRET unset; using insecure dev fallback. NEVER deploy without this set.',
    );
    return 'dev-only-not-for-production';
  }
  return s;
}

export function adminPassword(): string {
  const p = process.env.ADMIN_PASSWORD;
  if (!p) {
    if (isProd()) {
      throw new Error('ADMIN_PASSWORD is not set. Set it in your Vercel env vars before exposing /admin.');
    }
    console.warn('[admin-auth] ADMIN_PASSWORD unset; dev fallback "bosslabs". Set the env var for any non-localhost deploy.');
    return 'bosslabs';
  }
  return p;
}

/**
 * Sign + verify a one-way unsubscribe token. Embedded in transactional
 * email footers as a link a recipient can click to opt out. HMAC-signed
 * with ADMIN_COOKIE_SECRET so a bad actor can't unsubscribe arbitrary
 * users by guessing URLs.
 *
 * Format: `<base64url(email)>.<hmac>` — passed as a single `t` query param.
 */
export function signUnsubscribeToken(email: string): string {
  const e = Buffer.from(email.trim().toLowerCase(), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(`unsub:${e}`).digest('base64url');
  return `${e}.${sig}`;
}

export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const [e, sig] = token.split('.');
  if (!e || !sig) return null;
  const expected = crypto.createHmac('sha256', secret()).update(`unsub:${e}`).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const email = Buffer.from(e, 'base64url').toString('utf8');
    return email && email.includes('@') ? email : null;
  } catch {
    return null;
  }
}

/** Constant-time string equality — defends against timing-attack on password + signature compares. */
export function safeEqual(a: string, b: string): boolean {
  // Equalize lengths first; timingSafeEqual throws on unequal buffer sizes.
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function sign(value: string) {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex');
}

export function buildSessionCookie() {
  const issuedAt = Date.now().toString();
  const sig = sign(issuedAt);
  return `${issuedAt}.${sig}`;
}

/** Staff cookie: a signed base64url JSON payload carrying the role, the
 *  display name, and the section allowlist (perms). Distinct from the admin
 *  cookie (which is bare digits), so getAdminSession can tell them apart. */
export function buildStaffSessionCookie(perms: string[], name: string): string {
  const payload = Buffer.from(
    JSON.stringify({ t: Date.now(), r: 'staff', perms, name }),
    'utf8',
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** Issued-at ms from a (already signature-verified) cookie value. Admin cookies
 *  are bare digits; staff cookies are a base64url JSON payload with `t`. */
function issuedAtMs(val: string): number | null {
  if (/^\d+$/.test(val)) return Number(val);
  try {
    const p = JSON.parse(Buffer.from(val, 'base64url').toString('utf8')) as { t?: number };
    return typeof p.t === 'number' ? p.t : null;
  } catch {
    return null;
  }
}

export function isValidSession(raw: string | undefined | null) {
  if (!raw) return false;
  const [val, sig] = raw.split('.');
  if (!val || !sig) return false;
  if (!safeEqual(sig, sign(val))) return false;
  const issued = issuedAtMs(val);
  if (issued == null) return false;
  const age = (Date.now() - issued) / 1000;
  return age >= 0 && age < 7 * ONE_DAY;
}

export type AdminSession = { role: 'admin' | 'staff'; name: string; perms: string[] };

/** The current verified session, or null. Admin = full access (perms `['*']`);
 *  staff = the allowlist baked into their signed cookie at login. */
export function getAdminSession(): AdminSession | null {
  const raw = cookies().get(ADMIN_COOKIE)?.value;
  if (!raw || !isValidSession(raw)) return null;
  const [val] = raw.split('.');
  if (/^\d+$/.test(val)) return { role: 'admin', name: 'Admin', perms: ['*'] };
  try {
    const p = JSON.parse(Buffer.from(val, 'base64url').toString('utf8')) as {
      name?: string;
      perms?: string[];
    };
    return { role: 'staff', name: p.name || 'Staff', perms: p.perms ?? [] };
  } catch {
    return null;
  }
}

/** Server-component guard. Redirects to /admin/login if not signed in. */
export function requireAdmin() {
  const c = cookies().get(ADMIN_COOKIE)?.value;
  if (!isValidSession(c)) redirect('/admin/login');
}

/** For pages that just want to know without redirecting. */
export function isAdminLoggedIn() {
  const c = cookies().get(ADMIN_COOKIE)?.value;
  return isValidSession(c);
}

/**
 * Lightweight CSRF check for state-changing admin API routes. Verifies the
 * request's Origin/Referer matches our own host so a logged-in admin who
 * lands on a hostile page can't have their session abused via cross-site
 * POST. Returns true when the request is same-origin (or local dev), false
 * when it should be rejected.
 */
export function isSameOrigin(req: Request): boolean {
  const url = new URL(req.url);
  const host = req.headers.get('host') ?? url.host;
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');

  // Origin header is the strongest signal — set by browser on every CORS-able
  // request including fetch() POSTs. Same-origin browsers always send it.
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  // Fallback to Referer for older browsers / non-fetch flows.
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }
  // No Origin and no Referer — almost certainly a curl/fetch from a server.
  // Reject by default; legit admin browser traffic will always have one.
  return false;
}

/**
 * Closer session — a signed cookie scoped to the /closer area. Distinct from
 * the admin cookie: it encodes WHICH closer is logged in, so each closer only
 * ever sees their own leads/commissions and only they see a claimed lead's
 * phone number.
 *
 * Cookie value: `<closerId>.<issuedAt>.<hmac(closer:<closerId>.<issuedAt>)>`
 * The `closer:` context in the signed payload means an admin cookie can never
 * be replayed as a closer cookie (different message), and vice-versa.
 */
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCloserById, type Closer } from './closers';

export const CLOSER_COOKIE = 'bl_closer';
const ONE_DAY = 60 * 60 * 24;
const MAX_AGE_DAYS = 7;

function secret(): string {
  const s = process.env.ADMIN_COOKIE_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ADMIN_COOKIE_SECRET is not set.');
    }
    return 'dev-only-not-for-production';
  }
  return s;
}

function sign(value: string): string {
  return crypto.createHmac('sha256', secret()).update(`closer:${value}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function buildCloserCookie(closerId: string): string {
  const issuedAt = Date.now().toString();
  const payload = `${closerId}.${issuedAt}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the closerId if the cookie is valid + unexpired, else null. */
export function closerIdFromCookie(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const idx = raw.lastIndexOf('.');
  if (idx < 0) return null;
  const payload = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  if (!payload || !sig) return null;
  if (!safeEqual(sig, sign(payload))) return null;
  const [closerId, issuedAt] = payload.split('.');
  if (!closerId || !issuedAt) return null;
  const age = (Date.now() - Number(issuedAt)) / 1000;
  if (!(age >= 0 && age < MAX_AGE_DAYS * ONE_DAY)) return null;
  return closerId;
}

/** Current closer (verifying against the DB so deactivated accounts lose
 *  access immediately), or null. */
export async function getCloserSession(): Promise<Closer | null> {
  const raw = cookies().get(CLOSER_COOKIE)?.value;
  const id = closerIdFromCookie(raw);
  if (!id) return null;
  const closer = await getCloserById(id);
  if (!closer || !closer.active) return null;
  return closer;
}

/** Server-component guard for /closer pages. Redirects to login if absent. */
export async function requireCloser(): Promise<Closer> {
  const closer = await getCloserSession();
  if (!closer) redirect('/closer/login');
  return closer;
}

export const CLOSER_COOKIE_MAX_AGE = MAX_AGE_DAYS * ONE_DAY;

/**
 * Admin auth — single shared password (env var `ADMIN_PASSWORD`).
 *
 * Signs an HMAC cookie so brute-force or tampering is harder than a static
 * "password=true" string. Set `ADMIN_PASSWORD` and `ADMIN_COOKIE_SECRET`
 * in `.env.local`.
 */

import crypto from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const ADMIN_COOKIE = 'bl_admin';
const ONE_DAY = 60 * 60 * 24;

function secret() {
  return process.env.ADMIN_COOKIE_SECRET || 'change-me-please';
}

export function adminPassword() {
  // Default to 'bosslabs' for first-run convenience. Always set ADMIN_PASSWORD
  // in production.
  return process.env.ADMIN_PASSWORD || 'bosslabs';
}

function sign(value: string) {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex');
}

export function buildSessionCookie() {
  const issuedAt = Date.now().toString();
  const sig = sign(issuedAt);
  return `${issuedAt}.${sig}`;
}

export function isValidSession(raw: string | undefined | null) {
  if (!raw) return false;
  const [issuedAt, sig] = raw.split('.');
  if (!issuedAt || !sig) return false;
  const expected = sign(issuedAt);
  if (sig !== expected) return false;
  const age = (Date.now() - Number(issuedAt)) / 1000;
  return age >= 0 && age < 7 * ONE_DAY;
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

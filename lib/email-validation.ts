import { promises as dns } from 'node:dns';

/**
 * Pre-send recipient validation — answers one question: "can this address
 * physically receive mail?" Used ONLY to decide whether to SEND (never to block
 * checkout). Skipping undeliverable addresses keeps junk off our bounce rate and
 * protects sender reputation.
 *
 * Three definitive failures (we skip the send):
 *   - syntax     — not a well-formed address
 *   - disposable — a known throwaway domain (mailinator, 10minutemail, …)
 *   - no_mx      — the domain has no mail servers (e.g. a typo'd "@gmial.com")
 *
 * Everything else passes. Crucially we FAIL OPEN on DNS uncertainty (timeout /
 * transient SERVFAIL): a flaky lookup must never block a real recipient. We only
 * fail closed when DNS is *certain* the domain can't receive mail (ENOTFOUND /
 * ENODATA / empty MX). Note: this is domain-level — it can't see whether an
 * individual mailbox exists (only a paid verification API can), so it won't catch
 * a real-domain typo like "jonh@gmail.com". It kills the big category: bad domains.
 */

export type RecipientValidity = { ok: true } | { ok: false; reason: 'syntax' | 'disposable' | 'no_mx' };

// Pragmatic RFC-5321-ish shape check (not a full grammar — just rejects garbage).
const SHAPE = /^[^\s@"(),:;<>[\]\\]+@[^\s@.]+(\.[^\s@.]+)+$/;

// Common disposable / throwaway domains. Not exhaustive (new ones appear daily),
// but covers the bulk seen on junk signups. Extend freely.
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', '10minutemail.com',
  '10minutemail.net', 'tempmail.com', 'temp-mail.org', 'throwawaymail.com',
  'getnada.com', 'nada.email', 'trashmail.com', 'yopmail.com', 'yopmail.net',
  'maildrop.cc', 'dispostable.com', 'fakeinbox.com', 'sharklasers.com',
  'mailnesia.com', 'mohmal.com', 'mintemail.com', 'mailcatch.com', 'spamgourmet.com',
  'tempinbox.com', 'emailondeck.com', 'tempmailo.com', 'tempmail.plus',
  'discard.email', 'mailto.plus', 'fakemail.net', 'inboxkitten.com', 'burnermail.io',
  'tempr.email', 'moakt.com', 'spam4.me', 'grr.la', 'guerrillamailblock.com',
]);

const TTL_MS = 60 * 60 * 1000; // cache MX result per domain for 1h
const MX_TIMEOUT_MS = 3000;
const mxCache = new Map<string, { ok: boolean; exp: number }>();

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error('mx_timeout'), { code: 'TIMEOUT' })), ms),
    ),
  ]);
}

/** True only when DNS is CERTAIN the domain has no mail server. */
async function domainHasNoMx(domain: string): Promise<boolean> {
  const cached = mxCache.get(domain);
  if (cached && cached.exp > Date.now()) return !cached.ok;

  let ok = true; // default: assume deliverable (fail open)
  try {
    const records = await withTimeout(dns.resolveMx(domain), MX_TIMEOUT_MS);
    ok = Array.isArray(records) && records.length > 0;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    // ENOTFOUND = domain doesn't exist; ENODATA = exists but no MX → undeliverable.
    // Any other error (TIMEOUT / SERVFAIL / network) is uncertain → stay open.
    ok = !(code === 'ENOTFOUND' || code === 'ENODATA');
  }
  mxCache.set(domain, { ok, exp: Date.now() + TTL_MS });
  return !ok;
}

export async function validateRecipient(email: string): Promise<RecipientValidity> {
  const e = (email || '').trim().toLowerCase();
  if (e.length > 254 || !SHAPE.test(e)) return { ok: false, reason: 'syntax' };
  const domain = e.slice(e.lastIndexOf('@') + 1);
  if (DISPOSABLE.has(domain)) return { ok: false, reason: 'disposable' };
  if (await domainHasNoMx(domain)) return { ok: false, reason: 'no_mx' };
  return { ok: true };
}

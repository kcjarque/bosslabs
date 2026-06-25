/**
 * Sign + verify the order id that gates the Vault thank-you password reveal.
 *
 * The /thank-you/vault page renders the buyer's Hub password keyed by `?order=`.
 * Without a signed token, anyone who guesses or sees an order id (referer leak,
 * pixel logs, support screenshare) could fetch the password. The OTO redirect
 * appends `&t=<hmac>`; the page hides the password when the token is missing
 * or invalid (still shows the username + "check your email" fallback).
 *
 * Secret is reused from HUB_PROVISION_TOKEN (already required env var). Sign +
 * verify both run inside bosslabs-ai, so the secret never leaves this project.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

function getSecret(): string | null {
  return process.env.HUB_PROVISION_TOKEN ?? null;
}

export function signVaultOrder(order: string): string | null {
  const secret = getSecret();
  if (!secret || !order) return null;
  return createHmac('sha256', secret).update(order).digest('base64url').slice(0, 16);
}

export function verifyVaultToken(order: string, token: string | undefined | null): boolean {
  if (!order || !token) return false;
  const expected = signVaultOrder(order);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Philippine phone-number formatting — pure + client-safe (no server imports),
 * so it's usable in both client components (sms:/tel: links) and server code.
 *
 * Normalizes any way a PH mobile gets typed — "0917 123 4567", "09171234567",
 * "+63 917 123 4567", "639171234567", "9171234567" — to canonical E.164:
 *   +639XXXXXXXXX
 * Carriers/SMS apps reject the looser local formats, which is why texts fail.
 */
export function toE164Ph(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  let rest: string;
  if (digits.startsWith('63')) rest = digits.slice(2); // 639XXXXXXXXX / +63…
  else if (digits.startsWith('0')) rest = digits.slice(1); // 09XXXXXXXXX
  else rest = digits; // 9XXXXXXXXX (bare)
  return '+63' + rest;
}

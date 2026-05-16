/**
 * Pure-JS SMS character counter — safe to import from client components.
 * Lives in its own file so it doesn't drag in `lib/sms.ts` (which depends on
 * Node `fs` via `lib/db.ts`).
 *
 * SMS: 160 ASCII chars per part, 70 unicode chars per part (with concat 153/67).
 */
export function smsPartCount(body: string) {
  const ASCII = /^[\x00-\x7F]*$/;
  const isAscii = ASCII.test(body);
  const single = isAscii ? 160 : 70;
  const concat = isAscii ? 153 : 67;
  if (body.length <= single) return { parts: 1, perPart: single, length: body.length };
  return {
    parts: Math.ceil(body.length / concat),
    perPart: concat,
    length: body.length,
  };
}

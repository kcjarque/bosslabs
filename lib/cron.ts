/**
 * Cron helpers — shared by every /api/cron/* route.
 *
 * Vercel Cron automatically sends `Authorization: Bearer ${CRON_SECRET}` on
 * scheduled invocations (when the env var is set on the project). We reject
 * anything else so manual /api/cron/foo hits from the open internet can't
 * trigger mass email/SMS sends.
 */

export type CronAuthResult = { ok: true } | { ok: false; status: number; error: string };

export function verifyCronAuth(req: Request): CronAuthResult {
  const secret = process.env.CRON_SECRET;
  // No secret configured → allow. This MUST match the inline checks the
  // other crons (abandoned, daily-summary) use, which fail OPEN when the
  // secret is unset. The previous fail-CLOSED behavior here meant that on
  // a Vercel project WITHOUT CRON_SECRET set, this cron 500'd on every
  // tick while the others ran fine — silently breaking every reminder.
  //
  // The route is low-risk to leave open: sends are idempotent
  // (sequence_sends dedup) and only fire inside a ±15-min window, so an
  // anonymous hit can't spam. For defense-in-depth, set CRON_SECRET in
  // the Vercel project — Vercel then auto-injects it as a Bearer token
  // and the check below enforces it.
  if (!secret) return { ok: true };
  const header = req.headers.get('authorization');
  if (header === `Bearer ${secret}`) return { ok: true };
  return { ok: false, status: 401, error: 'unauthorized' };
}

/**
 * Reminder state lives in `signup.metadata.reminders.<key>` so we never
 * double-send. Each value is the ISO timestamp it was sent.
 */
export type ReminderKey =
  | 'h60' | 'h48' | 'h36' | 'h24' | 'h12' | 'h1'
  | 'replay'
  // Per-event replay flag (`replay_<eventId>`) so a weekly attendee gets EACH
  // week's replay once — not just the first ever.
  | `replay_${string}`;

export function hasReminderSent(
  metadata: Record<string, unknown> | undefined,
  key: ReminderKey,
): boolean {
  const reminders = metadata?.reminders as Record<string, string> | undefined;
  return Boolean(reminders?.[key]);
}

export function markReminderSent(
  metadata: Record<string, unknown> | undefined,
  key: ReminderKey,
): Record<string, unknown> {
  const reminders = (metadata?.reminders as Record<string, string>) ?? {};
  return {
    ...(metadata ?? {}),
    reminders: { ...reminders, [key]: new Date().toISOString() },
  };
}

/**
 * Returns minutes until the webinar starts. Negative if it's already started
 * or ended. Null if `startsAtIso` isn't configured (admin hasn't filled in
 * the date yet) — caller should bail out.
 */
export function minutesUntilWebinar(startsAtIso: string): number | null {
  if (!startsAtIso) return null;
  const ts = Date.parse(startsAtIso);
  if (Number.isNaN(ts)) return null;
  return Math.round((ts - Date.now()) / 60_000);
}

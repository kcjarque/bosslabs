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
  // No secret configured → fail closed in prod, allow in dev for testing.
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, status: 500, error: 'CRON_SECRET not configured' };
    }
    return { ok: true };
  }
  const header = req.headers.get('authorization');
  if (header === `Bearer ${secret}`) return { ok: true };
  return { ok: false, status: 401, error: 'unauthorized' };
}

/**
 * Reminder state lives in `signup.metadata.reminders.<key>` so we never
 * double-send. Each value is the ISO timestamp it was sent.
 */
export type ReminderKey = 'h60' | 'h48' | 'h36' | 'h24' | 'h12' | 'h1' | 'replay';

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

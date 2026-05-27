/**
 * Abandoned-checkout detector.
 *
 * Runs every 10 min. A signup is "abandoned" when:
 *   - source = 'paid' (intent to buy, not a free registration)
 *   - status = 'registered' (Xendit invoice created, payment not received)
 *   - createdAt > 30 minutes ago (gives Xendit + buyer time to clear)
 *   - metadata.abandonedNotified is not yet set (idempotent)
 *
 * Fires a Telegram notification per matching signup, then writes
 * `abandonedNotified=<iso>` into metadata so we don't ping again.
 */

import { NextResponse } from 'next/server';
import { getSignups, updateSignup } from '@/lib/db';
import { sendTelegram, esc } from '@/lib/telegram';

export const runtime = 'nodejs';

const GRACE_MINUTES = 30;

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const graceMs = GRACE_MINUTES * 60 * 1000;

  const all = await getSignups();
  const abandoned = all.filter((s) => {
    if (s.source !== 'paid') return false;
    if (s.status !== 'registered') return false;
    const age = now - new Date(s.createdAt).getTime();
    if (age < graceMs) return false;
    const meta = (s.metadata ?? {}) as { abandonedNotified?: string };
    return !meta.abandonedNotified;
  });

  let sent = 0;
  for (const s of abandoned) {
    const fullName = `${s.firstName} ${s.lastName ?? ''}`.trim();
    const amt = s.amountCentavos
      ? `₱${(s.amountCentavos / 100).toLocaleString()}`
      : '₱0';
    const ageMin = Math.round((now - new Date(s.createdAt).getTime()) / 60000);

    // Mark notified BEFORE sending — a retried cron run that arrives
    // mid-flight sees the marker and bails cleanly. Worst case: we miss
    // a notification (acceptable). Better than spam.
    await updateSignup(s.id, {
      metadata: {
        ...(s.metadata ?? {}),
        abandonedNotified: new Date().toISOString(),
      },
    });

    // Awaited so Vercel doesn't kill the fetch mid-flight when the
    // function returns. Plus the iteration cadence keeps us under
    // Telegram's per-chat rate limit (~1 message/sec).
    await sendTelegram(
      `🚨 <b>Abandoned checkout</b>\n\n` +
        `<b>${esc(fullName)}</b>\n` +
        `${esc(s.email)}\n` +
        (s.phone ? `${esc(s.phone)}\n` : '') +
        `Amount: <b>${amt}</b>${s.bumped ? ' (with bump)' : ''}\n` +
        `Stuck for ${ageMin} min`,
    );
    sent++;
    // Pace to ~1 msg/sec per chat to stay under Telegram's rate limit
    // when a batch of multiple abandoned checkouts is processed.
    if (abandoned.length > 1) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }

  return NextResponse.json({
    ok: true,
    checked: all.length,
    abandoned: abandoned.length,
    sent,
  });
}

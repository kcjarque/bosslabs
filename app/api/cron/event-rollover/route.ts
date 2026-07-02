/**
 * Auto event-rollover cron.
 *
 * Runs every 10 min. 30 minutes after the active webinar session starts, it
 * re-points the backend (active_event_id + displayed date/time/Zoom) to the
 * next upcoming session — so the homepage, countdown, default routing, and
 * email variables move on automatically without a manual rollover.
 *
 * When there's no next upcoming session, it leaves everything as-is and pings
 * Telegram once so a human knows to create the next event.
 */
import { NextResponse } from 'next/server';
import { autoAdvanceActiveEvent } from '@/lib/auto-rollover';
import { sendTelegram, esc } from '@/lib/telegram';

export const runtime = 'nodejs';

// In-memory guard so we don't re-ping "needs next event" every 10 min. Resets
// on cold start (acceptable — worst case one extra ping after a deploy).
let lastNeedsAlertForIso: string | null = null;

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await autoAdvanceActiveEvent();

  if (result.status === 'advanced') {
    await sendTelegram(
      `🔄 <b>Auto-rollover</b>\nActive session advanced:\n<b>${esc(result.fromName)}</b> → <b>${esc(result.toName)}</b>\nSite + emails now point to the next session.`,
    ).catch(() => {});
    lastNeedsAlertForIso = null;
  } else if (result.status === 'needs_next_event') {
    // Only alert once per active-event start so we don't spam every 10 min.
    if (lastNeedsAlertForIso !== result.fromStartsAtIso) {
      await sendTelegram(
        `⚠️ <b>No next session</b>\n"${esc(result.fromName)}" has started but there's no upcoming session to advance to. Create the next event so the funnel keeps selling.`,
      ).catch(() => {});
      lastNeedsAlertForIso = result.fromStartsAtIso;
    }
  }

  return NextResponse.json({ ok: true, ...result });
}

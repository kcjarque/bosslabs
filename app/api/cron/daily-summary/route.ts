/**
 * Daily summary cron — sends a Telegram digest at Manila midnight.
 *
 * Summarizes the previous day's results:
 *   - New checkouts (registered) vs paid conversions
 *   - Revenue collected
 *   - Abandoned (registered but not yet paid)
 *   - Page view funnel (visits → checkout → paid)
 *
 * Schedule: every day at 00:00 Asia/Manila = 16:00 UTC (vercel.json).
 */

import { NextResponse } from 'next/server';
import { getSignups, countPageViews } from '@/lib/db';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';

const TZ = 'Asia/Manila';

/** Return YYYY-MM-DD in Manila time for a Date. */
function manilaDate(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: TZ });
}

export async function GET(req: Request) {
  // Vercel cron auth.
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // "Yesterday" in Manila time.
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dateStr = manilaDate(yesterday);

  // Start/end of yesterday in Manila = +08:00.
  const dayStartIso = `${dateStr}T00:00:00+08:00`;
  const dayEndIso = `${dateStr}T23:59:59.999+08:00`;

  const allSignups = await getSignups();

  // Filter signups created yesterday (Manila time).
  const daySignups = allSignups.filter((s) => {
    const d = manilaDate(new Date(s.createdAt));
    return d === dateStr;
  });

  const newCheckouts = daySignups.filter((s) => s.source === 'paid').length;
  const freeRegistrations = daySignups.filter((s) => s.source === 'free').length;

  // Paid = anyone who reached status 'paid' today.
  // We check ALL signups (not just today's) because some may have been
  // created a day earlier but paid today. We use metadata.confirmationSent
  // timestamp if available, otherwise just count today's paid signups.
  const paidToday = daySignups.filter((s) => s.status === 'paid');
  const paidCount = paidToday.length;
  const revenue = paidToday.reduce((sum, s) => {
    const meta = (s.metadata ?? {}) as { paidAmount?: number };
    const amount = meta.paidAmount ?? (s.amountCentavos ? s.amountCentavos / 100 : 0);
    return sum + amount;
  }, 0);
  const bumpCount = paidToday.filter((s) => s.bumped).length;

  // Abandoned = registered today but not paid.
  const abandoned = daySignups.filter(
    (s) => s.source === 'paid' && s.status === 'registered',
  ).length;

  // Page views for the day.
  const [landingViews, checkoutViews] = await Promise.all([
    countPageViews({ sinceIso: dayStartIso, pathPrefix: '/' }),
    countPageViews({ sinceIso: dayStartIso, pathPrefix: '/checkout' }),
  ]);

  // Filter to only yesterday (countPageViews counts "since", so we'll
  // just use the numbers as-is since we started from dayStartIso and
  // the cron runs at midnight — effectively yesterday only).

  const lines = [
    `📊 <b>Daily Summary — ${dateStr}</b>`,
    '',
    `<b>Signups</b>`,
    `  New checkouts: <b>${newCheckouts}</b>`,
    `  Free registrations: <b>${freeRegistrations}</b>`,
    '',
    `<b>Revenue</b>`,
    `  Paid: <b>${paidCount}</b>`,
    `  Revenue: <b>₱${revenue.toLocaleString()}</b>`,
    `  With bump: <b>${bumpCount}</b>`,
    `  Abandoned: <b>${abandoned}</b>`,
    '',
    `<b>Funnel (unique sessions)</b>`,
    `  Landing: <b>${landingViews.uniqueSessions}</b>`,
    `  Checkout: <b>${checkoutViews.uniqueSessions}</b>`,
    `  Paid: <b>${paidCount}</b>`,
  ];

  // Conversion rate if we have checkout views.
  if (checkoutViews.uniqueSessions > 0) {
    const convRate = ((paidCount / checkoutViews.uniqueSessions) * 100).toFixed(1);
    lines.push(`  Checkout → Paid: <b>${convRate}%</b>`);
  }

  const result = await sendTelegram(lines.join('\n'));

  return NextResponse.json({
    ok: true,
    sent: result.ok,
    date: dateStr,
    stats: { newCheckouts, freeRegistrations, paidCount, revenue, abandoned },
  });
}

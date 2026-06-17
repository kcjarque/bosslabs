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
import {
  getSignups,
  countPageViews,
  purgeIdleRecordings,
  purgeOldRecordings,
  getAdSpendByDay,
} from '@/lib/db';
import { syncAdSpendDaily } from '@/lib/meta-ads';
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

  // Paid = anyone whose PAYMENT cleared yesterday (Manila), regardless of when
  // they first registered. Keyed on metadata.confirmationSent (stamped when the
  // Xendit webhook / manual confirm marks them paid). Counting by creation date
  // instead — as this did before — drops recovered + next-day payments onto the
  // wrong day and miscounts the day's real sales.
  const paidYesterday = allSignups.filter((s) => {
    if (s.status !== 'paid' && s.status !== 'attended') return false;
    const meta = (s.metadata ?? {}) as { confirmationSent?: string };
    const when = meta.confirmationSent ?? s.createdAt;
    return manilaDate(new Date(when)) === dateStr;
  });
  const paidCount = paidYesterday.length;
  const revenue = paidYesterday.reduce((sum, s) => {
    const meta = (s.metadata ?? {}) as { paidAmount?: number };
    const amount = meta.paidAmount ?? (s.amountCentavos ? s.amountCentavos / 100 : 0);
    return sum + amount;
  }, 0);
  const bumpCount = paidYesterday.filter((s) => s.bumped).length;

  // Abandoned = registered today but not paid.
  const abandoned = daySignups.filter(
    (s) => s.source === 'paid' && s.status === 'registered',
  ).length;

  // Funnel conversion must be SAME-COHORT: of the people who *started* checkout
  // yesterday, how many of THEM paid. NOT paidCount — that's a cash-basis count
  // of every payment that cleared yesterday (incl. people who registered on an
  // earlier day and paid late). Mixing the two cohorts produced a nonsensical
  // 100% that contradicted the Abandoned line. cohortPaid + abandoned ≤ newCheckouts.
  const cohortPaid = daySignups.filter(
    (s) => s.source === 'paid' && (s.status === 'paid' || s.status === 'attended'),
  ).length;

  // Unique visitors yesterday (all pages) — bounded to the day so a delayed
  // or manually-triggered run doesn't bleed in today's traffic.
  const visits = await countPageViews({ sinceIso: dayStartIso, untilIso: dayEndIso });

  // Refresh ad spend inline so the summary's ROAS is fresh even if the 00:01
  // ads-sync cron was delayed (best-effort — never block the summary on Meta).
  await syncAdSpendDaily(3).catch(() => undefined);
  const adDay = (await getAdSpendByDay().catch(() => [])).find((d) => d.date === dateStr);
  const adSpend = adDay ? adDay.spendCentavos / 100 : 0;
  const roas = adSpend > 0 ? revenue / adSpend : null;

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
    `  Ad spend: <b>₱${adSpend.toLocaleString()}</b>`,
    `  ROAS: <b>${roas == null ? '—' : `${roas.toFixed(2)}×`}</b>`,
    '',
    `<b>Funnel (yesterday)</b>`,
    `  Visits: <b>${visits.uniqueSessions}</b>`,
    `  Checkout started: <b>${newCheckouts}</b>`,
    `  …of those, paid: <b>${cohortPaid}</b>`,
  ];

  // Checkout started → Paid, SAME cohort: of yesterday's checkout-starters,
  // how many have paid. "started" = filled the form + generated an invoice (a
  // signup), not just a /checkout page-visit. cohortPaid (not paidCount) keeps
  // this internally consistent with the Abandoned line and ≤ 100%.
  if (newCheckouts > 0) {
    const convRate = ((cohortPaid / newCheckouts) * 100).toFixed(1);
    lines.push(`  Checkout → Paid: <b>${convRate}%</b>`);
  }

  const result = await sendTelegram(lines.join('\n'));

  // Daily storage hygiene — delete idle non-purchase recordings (tabs left
  // open) AND enforce a 5-day retention on non-purchase recordings so storage
  // plateaus instead of growing. Paid customers' replays are always kept.
  const purged = await purgeIdleRecordings(10).catch(() => ({ sessions: 0, bytes: 0 }));
  const purgedOld = await purgeOldRecordings(5).catch(() => ({ sessions: 0, bytes: 0 }));

  return NextResponse.json({
    ok: true,
    sent: result.ok,
    date: dateStr,
    stats: { newCheckouts, freeRegistrations, paidCount, cohortPaid, revenue, abandoned },
    recordingsPurged: { idle: purged, old: purgedOld },
  });
}

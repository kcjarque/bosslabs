import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import {
  countPageViews,
  getSettings,
  getSignups,
  getVisitBuckets,
  type Signup,
} from '@/lib/db';
import { formatPHP, OFFER } from '@/lib/config';
import { CustomDateRange } from '@/components/CustomDateRange';

export const dynamic = 'force-dynamic';

/* --------------------------------------------------------------------- */
/* Analytics helpers                                                     */
/* --------------------------------------------------------------------- */

const TZ = 'Asia/Manila';

/** Format a Date as YYYY-MM-DD in Asia/Manila. */
function manilaDate(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: TZ }); // sv-SE → YYYY-MM-DD
}

/** "Today" in Manila as YYYY-MM-DD. */
function manilaToday(): string {
  return manilaDate(new Date());
}

const ABANDONMENT_PRICE_CENTAVOS = OFFER.main.priceCentavos;

/** Bucket signups into day columns between startDate and endDate (inclusive, YYYY-MM-DD, Manila). */
function bucketDaily(signups: Signup[], startDate: string, endDate: string) {
  const buckets = new Map<string, { date: string; total: number; paid: number; revenuePhp: number }>();
  // Build date range by walking from start to end in day increments.
  const cur = new Date(startDate + 'T00:00:00+08:00');
  const last = new Date(endDate + 'T00:00:00+08:00');
  while (cur <= last) {
    const key = manilaDate(cur);
    buckets.set(key, { date: key, total: 0, paid: 0, revenuePhp: 0 });
    cur.setDate(cur.getDate() + 1);
  }
  for (const s of signups) {
    const key = manilaDate(new Date(s.createdAt));
    const b = buckets.get(key);
    if (!b) continue;
    b.total += 1;
    if (s.status === 'paid' || s.status === 'attended') {
      b.paid += 1;
      const meta = (s.metadata as { otoAmount?: number; otoConfirmed?: string } | undefined) ?? {};
      const otoExtra = meta.otoConfirmed && meta.otoAmount ? meta.otoAmount : 0;
      b.revenuePhp += (s.amountCentavos ?? 0) / 100 + otoExtra;
    }
  }
  return Array.from(buckets.values());
}

/* --------------------------------------------------------------------- */
/* Chart date range presets                                              */
/* --------------------------------------------------------------------- */

type ChartRange = { key: string; label: string; start: string; end: string };

function chartRanges(): ChartRange[] {
  const todayStr = manilaToday();
  const todayD = new Date(todayStr + 'T00:00:00+08:00');
  const yesterday = new Date(todayD);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = manilaDate(yesterday);
  const mtdStart = todayStr.slice(0, 8) + '01'; // first of current month
  const d30 = new Date(todayD);
  d30.setDate(d30.getDate() - 29);
  return [
    { key: 'today', label: 'Today', start: todayStr, end: todayStr },
    { key: 'yesterday', label: 'Yesterday', start: yesterdayStr, end: yesterdayStr },
    { key: 'mtd', label: 'MTD', start: mtdStart, end: todayStr },
    { key: '30d', label: '30 days', start: manilaDate(d30), end: todayStr },
  ];
}

/** Count distinct buyers by paymentMethodGroup for paid signups. */
function channelMix(paid: Signup[]) {
  const counts: Record<string, number> = { GCASH: 0, CREDIT_CARD: 0, BANKS: 0, OTHER: 0 };
  for (const s of paid) {
    const m = (s.metadata as { paymentMethodGroup?: string } | undefined)?.paymentMethodGroup;
    if (m && m in counts) counts[m] += 1;
    else counts.OTHER += 1;
  }
  return counts;
}

/** Median time between createdAt and confirmationSent (in seconds). */
function medianTimeToPaySeconds(paid: Signup[]): number | null {
  const deltas: number[] = [];
  for (const s of paid) {
    const sent = (s.metadata as { confirmationSent?: string } | undefined)?.confirmationSent;
    if (!sent) continue;
    const start = new Date(s.createdAt).getTime();
    const end = new Date(sent).getTime();
    if (end > start) deltas.push((end - start) / 1000);
  }
  if (deltas.length === 0) return null;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)];
}

function formatDuration(sec: number | null): string {
  if (sec === null) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

/** Selectable funnel date ranges. Hours-based so we can compute sinceIso
 *  from a single number. Keep this list short — too many options dilute
 *  the dashboard's at-a-glance value. */
const FUNNEL_RANGES = [
  { key: '24h', label: '24h', hours: 24 },
  { key: '7d', label: '7d', hours: 24 * 7 },
  { key: '30d', label: '30d', hours: 24 * 30 },
  { key: '90d', label: '90d', hours: 24 * 90 },
] as const;
type FunnelRangeKey = (typeof FUNNEL_RANGES)[number]['key'];

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: { fr?: string; cr?: string; cs?: string; ce?: string };
}) {
  requireAdmin();

  const frParam = searchParams?.fr;
  const funnelRange =
    FUNNEL_RANGES.find((r) => r.key === frParam) ??
    FUNNEL_RANGES.find((r) => r.key === '7d')!;
  const funnelSinceMs = Date.now() - funnelRange.hours * 3600 * 1000;
  const funnelSinceIso = new Date(funnelSinceMs).toISOString();
  // Previous period of equal length, for the comparison line in the visits chart.
  const prevSinceMs = funnelSinceMs - funnelRange.hours * 3600 * 1000;
  const prevSinceIso = new Date(prevSinceMs).toISOString();

  // Pick bucket size for the visits sparkline: 1h for short ranges,
  // 1d once the range gets too wide to fit hourly points on the SVG.
  const bucketMs = funnelRange.hours <= 24 * 7 ? 3600_000 : 86400_000;

  const [
    signups,
    settings,
    viewsAll,
    viewsCheckout,
    visitsBuckets,
    visitsBucketsPrev,
  ] = await Promise.all([
    getSignups(),
    getSettings(),
    // Top of funnel = anyone who landed on any public page.
    countPageViews({ sinceIso: funnelSinceIso }),
    // Mid-funnel hint = sessions that made it to /checkout.
    countPageViews({ sinceIso: funnelSinceIso, pathPrefix: '/checkout' }),
    // Hourly/daily buckets for the visits sparkline.
    getVisitBuckets({ sinceIso: funnelSinceIso, bucketMs }),
    // Same-length previous window, for the dashed comparison line.
    getVisitBuckets({
      sinceIso: prevSinceIso,
      untilIso: funnelSinceIso,
      bucketMs,
    }),
  ]);

  // Average unique sessions per bucket across the previous period — used as
  // the flat "previous day's avg" baseline shown next to the chart.
  const prevTotalUnique = visitsBucketsPrev.reduce(
    (sum, b) => sum + b.uniqueSessions,
    0,
  );
  const prevAvgPerBucket =
    visitsBucketsPrev.length > 0
      ? prevTotalUnique / visitsBucketsPrev.length
      : 0;

  const now = Date.now();
  const within = (h: number, predicate: (s: Signup) => boolean = () => true) =>
    signups.filter(
      (s) => now - new Date(s.createdAt).getTime() < h * 3600_000 && predicate(s),
    ).length;

  // Status-bucketed counts (the OLD dashboard counted by source='paid' which
  // labelled every checkout-initiator as 'Paid Tickets' even when they
  // hadn't actually paid yet — a misleading metric we just fixed).
  const paid = signups.filter((s) => s.status === 'paid' || s.status === 'attended');
  const registered = signups.filter((s) => s.status === 'registered');
  const refunded = signups.filter((s) => s.status === 'refunded');

  // Revenue from confirmed-paid invoices only. amountCentavos covers main +
  // OTO bump on a single invoice; OTO-after-checkout adds another invoice
  // tracked via metadata.otoConfirmed (added when the BL-OTO webhook fires).
  const revenueCentavos = paid.reduce((sum, s) => {
    const meta = (s.metadata as { otoAmount?: number; otoConfirmed?: string } | undefined) ?? {};
    const otoExtra =
      meta.otoConfirmed && meta.otoAmount ? meta.otoAmount * 100 : 0;
    return sum + (s.amountCentavos ?? 0) + otoExtra;
  }, 0);
  const revenuePhp = revenueCentavos / 100;
  const aovPhp = paid.length > 0 ? revenuePhp / paid.length : 0;

  // Conversion rate = paid / (anyone who hit checkout = registered + paid + refunded).
  // Excludes free-tier signups + contact-form submissions since they aren't
  // funnel-conversion candidates.
  const funnelEntrants = signups.filter((s) => s.source === 'paid').length;
  const conversionRate =
    funnelEntrants > 0 ? (paid.length / funnelEntrants) * 100 : 0;

  // Last-N-hours splits — broken out by paid vs registered for actual signal.
  const last24Paid = within(24, (s) => s.status === 'paid');
  const last24Reg = within(24, (s) => s.status === 'registered');
  const last7dPaid = within(24 * 7, (s) => s.status === 'paid');
  const last7dReg = within(24 * 7, (s) => s.status === 'registered');

  // Abandoned cart deep-dive — every registered signup represents a buyer
  // who got far enough to commit an intent (filled name/email/mobile,
  // clicked Pay, generated a Xendit invoice). Multiply by the price they'd
  // have paid (their amountCentavos already encodes whether they bumped).
  const abandonedRevenuePhp = registered.reduce(
    (sum, s) => sum + (s.amountCentavos ?? ABANDONMENT_PRICE_CENTAVOS) / 100,
    0,
  );
  const abandonedByMethod = registered.reduce<Record<string, number>>((acc, s) => {
    const m = (s.metadata as { paymentMethodGroup?: string } | undefined)?.paymentMethodGroup ?? 'OTHER';
    acc[m] = (acc[m] ?? 0) + 1;
    return acc;
  }, {});
  const oldestAbandonment = registered.reduce<number | null>((min, s) => {
    const age = now - new Date(s.createdAt).getTime();
    return min === null || age > min ? age : min;
  }, null);

  // Chart date range — defaults to 30 days.
  const ranges = chartRanges();
  const crParam = searchParams?.cr;
  const csParam = searchParams?.cs;
  const ceParam = searchParams?.ce;
  let chartRange: ChartRange;
  if (crParam === 'custom' && csParam && ceParam) {
    chartRange = { key: 'custom', label: 'Custom', start: csParam, end: ceParam };
  } else {
    chartRange = ranges.find((r) => r.key === crParam) ?? ranges.find((r) => r.key === '30d')!;
  }
  const daily = bucketDaily(signups, chartRange.start, chartRange.end);
  const dailyMax = Math.max(1, ...daily.map((d) => d.total));

  // Channel mix on PAID signups (not stuck) — which method works best.
  const paidChannelMix = channelMix(paid);
  const paidChannelTotal = Object.values(paidChannelMix).reduce((a, b) => a + b, 0);

  // OTO attach rate — paid signups whose bumped=true OR who have otoConfirmed.
  const bumpedCount = paid.filter((s) => {
    const meta = (s.metadata as { otoConfirmed?: string } | undefined) ?? {};
    return s.bumped || Boolean(meta.otoConfirmed);
  }).length;
  const otoAttachRate = paid.length > 0 ? (bumpedCount / paid.length) * 100 : 0;

  // Median time-to-pay across paid signups.
  const ttpSec = medianTimeToPaySeconds(paid);

  // Funnel: Visits → Checkout Started → Paid, scoped to the selected range.
  // "Visits" = unique browsers that hit any public page in the window.
  // "Checkout Started" = signups created in the window with paid source
  // (filled the form + clicked a Pay button → invoice issued).
  // "Paid" = those that completed payment.
  const funnelStarts = signups.filter(
    (s) => new Date(s.createdAt).getTime() >= funnelSinceMs && s.source === 'paid',
  ).length;
  const funnelPaid = signups.filter(
    (s) =>
      new Date(s.createdAt).getTime() >= funnelSinceMs &&
      (s.status === 'paid' || s.status === 'attended'),
  ).length;
  const visitToCheckoutPct =
    viewsAll.uniqueSessions > 0 ? (funnelStarts / viewsAll.uniqueSessions) * 100 : 0;
  const checkoutToPaidPct =
    funnelStarts > 0 ? (funnelPaid / funnelStarts) * 100 : 0;
  const visitToPaidPct =
    viewsAll.uniqueSessions > 0 ? (funnelPaid / viewsAll.uniqueSessions) * 100 : 0;
  // For the first few days after the tracker ships, signups in the
  // window outnumber visits (the signups existed before page_views did),
  // so the % comes out > 100%. Render "—" in that case so the dashboard
  // doesn't display nonsense rates while traffic data backfills.
  const fmtRate = (pct: number) => (pct > 100 || !Number.isFinite(pct) ? '—' : `${pct.toFixed(1)}%`);

  const recent = signups.slice(0, 8);
  const channelStatus = {
    email: !!settings.resendApiKey,
    sms: !!settings.onewaysmsUsername && !!settings.onewaysmsPassword,
    messenger: !!settings.messengerGroupUrl,
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Live view of registrations + delivery channels.
          </p>
        </div>
        <Link href="/admin/customers" className="btn btn-secondary self-start sm:self-auto">
          View all customers →
        </Link>
      </header>

      {/* Revenue + headline metrics — these are the numbers that matter */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard
          label="Revenue"
          value={formatPHP(revenueCentavos)}
          sub={`${paid.length} paid · AOV ${formatPHP(Math.round(aovPhp * 100))}`}
          tone="green"
        />
        <StatCard
          label="Paid tickets"
          value={paid.length.toString()}
          sub={`+${last24Paid} in 24h · +${last7dPaid} in 7d`}
          tone="green"
        />
        <StatCard
          label="Conversion rate"
          value={`${conversionRate.toFixed(1)}%`}
          sub={`${paid.length} of ${funnelEntrants} checkout-starts`}
        />
        <StatCard
          label="Stuck (unpaid)"
          value={registered.length.toString()}
          sub={`Started checkout, never paid · ${refunded.length} refunded`}
          tone={registered.length > 0 ? 'amber' : undefined}
          href={registered.length > 0 ? '/admin/pending-payments' : undefined}
        />
      </div>

      {/* Funnel + activity row */}
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard
          label="Total signups (all sources)"
          value={signups.length.toString()}
          sub={`${funnelEntrants} via paid funnel`}
        />
        <StatCard
          label="Last 24 hours"
          value={(last24Paid + last24Reg).toString()}
          sub={`${last24Paid} paid · ${last24Reg} stuck`}
        />
        <StatCard
          label="Last 7 days"
          value={(last7dPaid + last7dReg).toString()}
          sub={`${last7dPaid} paid · ${last7dReg} stuck`}
        />
      </div>

      {/* FUNNEL — Visits → Checkout Started → Paid, range-filterable */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-base font-semibold text-slate-900">Funnel</h2>
              <FunnelDateFilter activeKey={funnelRange.key} />
            </div>
            <p className="mt-1 text-[12px] text-slate-500">
              Unique browser sessions over the last {funnelRange.label}. Tracked
              since the PageviewTracker shipped — older history isn&rsquo;t in the table.
            </p>
          </div>
          <div className="sm:text-right">
            <div className="text-[11px] uppercase tracking-[0.06em] text-slate-500 sm:text-xs">
              Visits → Paid
            </div>
            <div className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {fmtRate(visitToPaidPct)}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3 sm:gap-4">
          <FunnelStage
            label="Visits"
            value={viewsAll.uniqueSessions}
            sub={`${viewsAll.total} total beacons`}
            tone="cyan"
            widthPct={100}
          />
          <FunnelStage
            label="Checkout started"
            value={funnelStarts}
            sub={`${fmtRate(visitToCheckoutPct)} of visits`}
            tone="amber"
            widthPct={Math.max(20, Math.min(100, visitToCheckoutPct))}
          />
          <FunnelStage
            label="Paid"
            value={funnelPaid}
            sub={`${fmtRate(checkoutToPaidPct)} of checkouts`}
            tone="emerald"
            widthPct={Math.max(20, Math.min(100, checkoutToPaidPct))}
          />
        </div>

        {/* Visits-over-time sparkline (current vs previous period) */}
        <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/40 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Visits over time
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {bucketMs === 3600_000 ? 'Hourly' : 'Daily'} unique sessions ·
                dashed line = previous {funnelRange.label} avg per{' '}
                {bucketMs === 3600_000 ? 'hour' : 'day'}
              </p>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-3 bg-cyan-500" />
                Current
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-0.5 w-3"
                  style={{
                    background:
                      'repeating-linear-gradient(to right, #94a3b8 0, #94a3b8 3px, transparent 3px, transparent 6px)',
                  }}
                />
                Prev avg ({prevAvgPerBucket.toFixed(1)})
              </span>
            </div>
          </div>
          <VisitsSparkline
            buckets={visitsBuckets}
            prevAverage={prevAvgPerBucket}
            bucketMs={bucketMs}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
          <span>
            Sessions that hit /checkout: <strong className="text-slate-700">{viewsCheckout.uniqueSessions}</strong>
          </span>
          <span>·</span>
          <span>
            Browse → intent: <strong className="text-slate-700">{fmtRate(visitToCheckoutPct)}</strong>
          </span>
          <span>·</span>
          <span>
            Intent → close: <strong className="text-slate-700">{fmtRate(checkoutToPaidPct)}</strong>
          </span>
        </div>
      </section>

      {/* ABANDONED CART SPOTLIGHT — visible revenue at risk + one-click recovery */}
      {registered.length > 0 && (
        <Link
          href="/admin/pending-payments"
          className="block rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100/40 p-5 transition hover:border-amber-400 hover:shadow-md sm:p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                Abandoned cart · revenue at risk
              </div>
              <div className="mt-3 flex flex-wrap items-baseline gap-3">
                <span className="text-3xl font-semibold tracking-tight text-amber-900 sm:text-4xl">
                  {formatPHP(Math.round(abandonedRevenuePhp * 100))}
                </span>
                <span className="text-sm text-amber-800">
                  across <strong>{registered.length}</strong> stuck buyer{registered.length === 1 ? '' : 's'}
                  {oldestAbandonment !== null && (
                    <> · oldest {formatDuration(oldestAbandonment / 1000)} ago</>
                  )}
                </span>
              </div>
              {/* By-method breakdown */}
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-amber-900">
                {Object.entries(abandonedByMethod)
                  .filter(([, n]) => n > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([method, n]) => (
                    <span
                      key={method}
                      className="rounded-full border border-amber-300/60 bg-white/60 px-2.5 py-0.5"
                    >
                      <strong>{n}</strong>{' '}
                      {method === 'GCASH'
                        ? 'GCash'
                        : method === 'CREDIT_CARD'
                          ? 'Card'
                          : method === 'BANKS'
                            ? 'Banks'
                            : 'Other'}
                    </span>
                  ))}
              </div>
              <p className="mt-3 text-[13px] text-amber-800">
                These buyers filled the form + clicked Pay but never completed.
                Fire a recovery DM/email — most are still within their 24-hour
                Xendit invoice window.
              </p>
            </div>
            <div className="flex-none">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-900 px-4 py-2.5 text-[13px] font-medium text-amber-50">
                Open recovery flow →
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* ACTIVITY CHART */}
      <div className="card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-base font-semibold text-slate-900">
                {chartRange.key === 'today'
                  ? 'Today'
                  : chartRange.key === 'yesterday'
                    ? 'Yesterday'
                    : chartRange.key === 'mtd'
                      ? 'Month to date'
                      : chartRange.key === 'custom'
                        ? `${chartRange.start} → ${chartRange.end}`
                        : 'Last 30 days'}{' '}
                · signups vs paid
              </h2>
              <ChartDateFilter activeKey={chartRange.key} ranges={ranges} />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              All times Asia/Manila (PHT, UTC+8)
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm bg-slate-300" />
              Total
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm bg-emerald-500" />
              Paid
            </span>
          </div>
        </div>
        <DailyChart data={daily} max={dailyMax} />
      </div>

      {/* CHANNEL MIX + OTO ATTACH + TIME-TO-PAY */}
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        {/* Payment-method distribution of PAID buyers */}
        <div className="card">
          <div className="text-[11px] uppercase tracking-[0.06em] text-slate-500">
            Payment channel mix (paid)
          </div>
          {paidChannelTotal > 0 ? (
            <div className="mt-3 space-y-2">
              {(['GCASH', 'CREDIT_CARD', 'BANKS', 'OTHER'] as const).map((m) => {
                const n = paidChannelMix[m];
                if (n === 0) return null;
                const pct = (n / paidChannelTotal) * 100;
                const label =
                  m === 'GCASH'
                    ? 'GCash'
                    : m === 'CREDIT_CARD'
                      ? 'Credit Card'
                      : m === 'BANKS'
                        ? 'Banks'
                        : 'Other';
                const color =
                  m === 'GCASH'
                    ? 'bg-cyan-500'
                    : m === 'CREDIT_CARD'
                      ? 'bg-violet-500'
                      : m === 'BANKS'
                        ? 'bg-amber-500'
                        : 'bg-slate-400';
                return (
                  <div key={m}>
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-medium text-slate-800">{label}</span>
                      <span className="tabular-nums text-slate-500">
                        {n} · {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-slate-500">
              No paid buyers yet — chart populates after first payment.
            </p>
          )}
        </div>

        {/* OTO attach rate */}
        <div className="card">
          <div className="text-[11px] uppercase tracking-[0.06em] text-slate-500">
            OTO attach rate
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            {otoAttachRate.toFixed(0)}%
          </div>
          <div className="mt-1 text-[12px] text-slate-500">
            {bumpedCount} of {paid.length} took the 1:1 Audit upsell
          </div>
          <div className="mt-3 text-[11px] text-slate-500">
            Target: 30%+. Each attached audit adds ₱1,997 — at 50% attach
            rate, AOV climbs from ₱999 to ₱2,000+.
          </div>
        </div>

        {/* Median time-to-pay */}
        <div className="card">
          <div className="text-[11px] uppercase tracking-[0.06em] text-slate-500">
            Median time-to-pay
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            {formatDuration(ttpSec)}
          </div>
          <div className="mt-1 text-[12px] text-slate-500">
            From form submit to payment confirmed
          </div>
          <div className="mt-3 text-[11px] text-slate-500">
            Under 5min = healthy. 10min+ means buyers are hitting the GCash
            QR expiration loop or hesitating on card details.
          </div>
        </div>
      </div>

      {/* Channel status */}
      <div className="card">
        <h2 className="text-base font-semibold text-slate-900">Delivery channels</h2>
        <p className="mt-1 text-sm text-slate-500">
          Configure tokens in{' '}
          <Link href="/admin/settings" className="text-cyan-600 underline">
            Settings
          </Link>{' '}
          to switch out of demo mode.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <ChannelBadge
            name="Email · Resend"
            ok={channelStatus.email}
            okLabel="Live"
            offLabel="Demo mode"
          />
          <ChannelBadge
            name="SMS · OneWaySMS"
            ok={channelStatus.sms}
            okLabel="Live"
            offLabel="Demo mode"
          />
          <ChannelBadge
            name="Messenger group"
            ok={channelStatus.messenger}
            okLabel="Configured"
            offLabel="Not set"
          />
        </div>
      </div>

      {/* Recent signups */}
      <div className="card overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Recent signups</h2>
          <Link href="/admin/customers" className="text-sm text-slate-500 hover:text-slate-900">
            See all →
          </Link>
        </div>

        {recent.length === 0 ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="hidden sm:table-cell">Email</th>
                  <th className="hidden sm:table-cell">Phone</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s) => (
                  <SignupRow key={s.id} s={s} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'green' | 'amber';
  href?: string;
}) {
  const toneClass =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50/40'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50/40'
        : '';
  const body = (
    <div className={`card ${toneClass}`.trim()}>
      <div className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {value}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.06em] text-slate-500 sm:text-xs">
        {label}
      </div>
      {sub && <div className="mt-2 text-[11px] text-slate-500">{sub}</div>}
      {href && (
        <div className="mt-2 text-[11px] text-cyan-600 underline-offset-4 hover:underline">
          View →
        </div>
      )}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/**
 * ChartDateFilter — server-rendered pill row for the daily chart.
 * Presets: Today, Yesterday, MTD, 30d. Custom opens date inputs.
 */
function ChartDateFilter({
  activeKey,
  ranges,
}: {
  activeKey: string;
  ranges: ChartRange[];
}) {
  return (
    <div
      role="group"
      aria-label="Chart date range"
      className="inline-flex flex-wrap items-center gap-1"
    >
      <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
        {ranges.map((r) => {
          const active = r.key === activeKey;
          return (
            <Link
              key={r.key}
              href={`/admin?cr=${r.key}`}
              scroll={false}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition sm:text-xs ${
                active
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              {r.label}
            </Link>
          );
        })}
      </div>
      <CustomDateRange active={activeKey === 'custom'} />
    </div>
  );
}

/**
 * FunnelDateFilter — server-rendered pill row. Each pill is a Link that
 * sets ?fr=<key> on the dashboard. No client JS needed — the dashboard
 * re-renders server-side with the new range. Matches the rest of the
 * dashboard which is also pure RSC.
 */
function FunnelDateFilter({ activeKey }: { activeKey: FunnelRangeKey }) {
  return (
    <div
      role="group"
      aria-label="Funnel date range"
      className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5"
    >
      {FUNNEL_RANGES.map((r) => {
        const active = r.key === activeKey;
        return (
          <Link
            key={r.key}
            href={`/admin?fr=${r.key}`}
            scroll={false}
            className={`rounded-full px-3 py-1 text-[11px] font-medium transition sm:text-xs ${
              active
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
          >
            {r.label}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * FunnelStage — one bar in the 3-step funnel. The widthPct controls how
 * filled the bar is relative to the previous stage, so visual length
 * communicates drop-off at a glance. Tone keys the bar to the funnel
 * progression: cyan (top, broad), amber (middle, narrowing), emerald
 * (bottom, conversion).
 */
function FunnelStage({
  label,
  value,
  sub,
  tone,
  widthPct,
}: {
  label: string;
  value: number;
  sub: string;
  tone: 'cyan' | 'amber' | 'emerald';
  widthPct: number;
}) {
  const palette = {
    cyan: { fill: 'bg-cyan-500', track: 'bg-cyan-100', text: 'text-cyan-700' },
    amber: { fill: 'bg-amber-500', track: 'bg-amber-100', text: 'text-amber-700' },
    emerald: { fill: 'bg-emerald-500', track: 'bg-emerald-100', text: 'text-emerald-700' },
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${palette.text} sm:text-xs`}>
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {value.toLocaleString()}
      </div>
      <div className={`mt-3 h-1.5 w-full overflow-hidden rounded-full ${palette.track}`}>
        <div className={`h-full ${palette.fill} transition-all`} style={{ width: `${widthPct}%` }} />
      </div>
      <div className="mt-2 text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

/**
 * DailyChart — inline SVG bar chart, no library. Each day is a stacked
 * column: slate bar for total signups, emerald bar on top for paid.
 * Tooltips via native <title> so hover-on-bar shows the exact numbers.
 */
function DailyChart({
  data,
  max,
}: {
  data: Array<{ date: string; total: number; paid: number; revenuePhp: number }>;
  max: number;
}) {
  const W = 720; // viewBox width — SVG scales to container
  const H = 140;
  const padX = 4;
  const padY = 18;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const slotW = innerW / data.length;
  const barW = Math.max(4, slotW * 0.7);

  // Total revenue across the window for the top-right label.
  const totalRevenue = data.reduce((s, d) => s + d.revenuePhp, 0);
  const totalPaid = data.reduce((s, d) => s + d.paid, 0);

  return (
    <div className="mt-4 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full text-slate-300">
        {/* Subtle horizontal gridlines */}
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={W - padX}
            y1={padY + innerH * (1 - t)}
            y2={padY + innerH * (1 - t)}
            stroke="currentColor"
            strokeWidth="0.5"
            opacity="0.3"
            strokeDasharray="2 3"
          />
        ))}
        {data.map((d, i) => {
          const x = padX + slotW * i + (slotW - barW) / 2;
          const totalH = (d.total / max) * innerH;
          const paidH = (d.paid / max) * innerH;
          const totalY = padY + innerH - totalH;
          const paidY = padY + innerH - paidH;
          const dateLabel = new Date(d.date + 'T00:00:00+08:00').toLocaleDateString('en-PH', {
            month: 'short',
            day: 'numeric',
            timeZone: 'Asia/Manila',
          });
          return (
            <g key={d.date}>
              <title>{`${dateLabel} · ${d.total} signups · ${d.paid} paid · ₱${Math.round(d.revenuePhp).toLocaleString()}`}</title>
              {/* Total signups (back) */}
              {d.total > 0 && (
                <rect
                  x={x}
                  y={totalY}
                  width={barW}
                  height={totalH}
                  rx="1"
                  fill="#CBD5E1"
                />
              )}
              {/* Paid (front, overlapping) */}
              {d.paid > 0 && (
                <rect
                  x={x}
                  y={paidY}
                  width={barW}
                  height={paidH}
                  rx="1"
                  fill="#10B981"
                />
              )}
            </g>
          );
        })}
        {/* X-axis: first + middle + last date */}
        <text
          x={padX}
          y={H - 4}
          fontSize="9"
          fill="#94A3B8"
          textAnchor="start"
        >
          {new Date(data[0]?.date + 'T00:00:00+08:00').toLocaleDateString('en-PH', {
            month: 'short',
            day: 'numeric',
            timeZone: 'Asia/Manila',
          })}
        </text>
        {data.length > 2 && (
          <text
            x={W / 2}
            y={H - 4}
            fontSize="9"
            fill="#94A3B8"
            textAnchor="middle"
          >
            {new Date(data[Math.floor(data.length / 2)]?.date + 'T00:00:00+08:00').toLocaleDateString('en-PH', {
              month: 'short',
              day: 'numeric',
              timeZone: 'Asia/Manila',
            })}
          </text>
        )}
        <text
          x={W - padX}
          y={H - 4}
          fontSize="9"
          fill="#94A3B8"
          textAnchor="end"
        >
          {data.length === 1
            ? new Date(data[0]?.date + 'T00:00:00+08:00').toLocaleDateString('en-PH', {
                month: 'short',
                day: 'numeric',
                timeZone: 'Asia/Manila',
              })
            : 'Today'}
        </text>
      </svg>
      <div className="mt-2 flex justify-between text-[11px] text-slate-500">
        <span>{data.length} day{data.length === 1 ? '' : 's'} · hover bars for daily detail</span>
        <span>
          <strong className="text-slate-700">{totalPaid}</strong> paid ·{' '}
          <strong className="text-slate-700">
            {formatPHP(Math.round(totalRevenue * 100))}
          </strong>{' '}
          revenue
        </span>
      </div>
    </div>
  );
}

function ChannelBadge({
  name,
  ok,
  okLabel,
  offLabel,
}: {
  name: string;
  ok: boolean;
  okLabel: string;
  offLabel: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
      <span className="text-sm font-medium text-slate-800">{name}</span>
      <span className={ok ? 'pill pill-green' : 'pill pill-amber'}>
        <span
          className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${
            ok ? 'bg-emerald-500' : 'bg-amber-500'
          }`}
        />
        {ok ? okLabel : offLabel}
      </span>
    </div>
  );
}

function SignupRow({ s }: { s: Signup }) {
  return (
    <tr>
      <td>
        <div className="font-medium text-slate-900">
          {s.firstName} {s.lastName ?? ''}
        </div>
        <div className="text-xs text-slate-500 sm:hidden">{s.email}</div>
      </td>
      <td className="hidden sm:table-cell">{s.email}</td>
      <td className="hidden text-slate-500 sm:table-cell">{s.phone}</td>
      <td>
        <SourcePill source={s.source} />
      </td>
      <td>
        <StatusPill status={s.status} />
      </td>
      <td className="text-slate-500">{formatRelative(s.createdAt)}</td>
    </tr>
  );
}

function SourcePill({ source }: { source: Signup['source'] }) {
  const map: Record<Signup['source'], string> = {
    free: 'pill pill-cyan',
    paid: 'pill pill-green',
    contact: 'pill',
  };
  return <span className={map[source]}>{source}</span>;
}

function StatusPill({ status }: { status: Signup['status'] }) {
  const map: Record<Signup['status'], string> = {
    registered: 'pill pill-cyan',
    paid: 'pill pill-green',
    attended: 'pill pill-green',
    'no-show': 'pill pill-amber',
    refunded: 'pill pill-red',
    unsubscribed: 'pill pill-red',
  };
  return <span className={map[status] || 'pill'}>{status}</span>;
}

function Empty() {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm text-slate-500">
        No signups yet. Try the registration form on the landing page — it routes here.
      </p>
    </div>
  );
}

function formatRelative(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * VisitsSparkline — SVG line chart of unique sessions per bucket.
 * Cyan solid line = current period. Dashed slate line = previous period's
 * average per bucket (flat baseline). Tooltips via <title>.
 */
function VisitsSparkline({
  buckets,
  prevAverage,
  bucketMs,
}: {
  buckets: Array<{ bucketStart: string; uniqueSessions: number; total: number }>;
  prevAverage: number;
  bucketMs: number;
}) {
  if (buckets.length === 0) {
    return (
      <p className="mt-4 text-[11px] text-slate-500">No traffic in this window.</p>
    );
  }

  const W = 720;
  const H = 140;
  const padX = 8;
  const padY = 14;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  // Y-axis scale = max of current points OR previous-period average so the
  // dashed baseline always lands inside the plot area.
  const dataMax = Math.max(
    1,
    ...buckets.map((b) => b.uniqueSessions),
    prevAverage,
  );
  // 10% headroom so the line never hits the top edge.
  const yMax = dataMax * 1.1;

  const slotW = innerW / Math.max(1, buckets.length - 1);
  function px(i: number): number {
    return padX + slotW * i;
  }
  function py(v: number): number {
    return padY + innerH * (1 - v / yMax);
  }

  // Build the polyline path string for the current period.
  const linePath = buckets
    .map((b, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(b.uniqueSessions).toFixed(1)}`)
    .join(' ');

  // Area fill under the line (subtle gradient look via opacity).
  const areaPath = [
    `M ${px(0)} ${padY + innerH}`,
    ...buckets.map((b, i) => `L ${px(i).toFixed(1)} ${py(b.uniqueSessions).toFixed(1)}`),
    `L ${px(buckets.length - 1)} ${padY + innerH}`,
    'Z',
  ].join(' ');

  const yPrev = py(prevAverage);

  // Format the bucket time for tooltips/labels.
  const hourly = bucketMs === 3600_000;
  function fmtBucket(iso: string): string {
    const d = new Date(iso);
    return hourly
      ? d.toLocaleString('en-PH', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          hour12: true,
          timeZone: 'Asia/Manila',
        })
      : d.toLocaleDateString('en-PH', {
          month: 'short',
          day: 'numeric',
          timeZone: 'Asia/Manila',
        });
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full text-slate-300">
        {/* Y-axis gridlines (25/50/75/100% of yMax) */}
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={W - padX}
            y1={padY + innerH * (1 - t)}
            y2={padY + innerH * (1 - t)}
            stroke="currentColor"
            strokeWidth="0.5"
            opacity="0.3"
            strokeDasharray="2 3"
          />
        ))}

        {/* Area fill under current line */}
        <path d={areaPath} fill="#06b6d4" opacity="0.08" />

        {/* Previous-period average — dashed horizontal */}
        <line
          x1={padX}
          x2={W - padX}
          y1={yPrev}
          y2={yPrev}
          stroke="#94a3b8"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <text
          x={W - padX - 2}
          y={yPrev - 3}
          fontSize="9"
          fill="#64748b"
          textAnchor="end"
        >
          prev avg {prevAverage.toFixed(1)}
        </text>

        {/* Current period line */}
        <path
          d={linePath}
          fill="none"
          stroke="#06b6d4"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Hover targets — invisible squares per bucket with <title> tooltip */}
        {buckets.map((b, i) => (
          <g key={b.bucketStart}>
            <title>{`${fmtBucket(b.bucketStart)} · ${b.uniqueSessions} unique sessions · ${b.total} beacons`}</title>
            <circle
              cx={px(i)}
              cy={py(b.uniqueSessions)}
              r="2"
              fill="#06b6d4"
              opacity={b.uniqueSessions > 0 ? 1 : 0}
            />
            <rect
              x={px(i) - slotW / 2}
              y={padY}
              width={slotW}
              height={innerH}
              fill="transparent"
            />
          </g>
        ))}

        {/* X-axis labels: first, middle, last bucket */}
        <text x={padX} y={H - 2} fontSize="9" fill="#94a3b8" textAnchor="start">
          {fmtBucket(buckets[0].bucketStart)}
        </text>
        {buckets.length > 4 && (
          <text x={W / 2} y={H - 2} fontSize="9" fill="#94a3b8" textAnchor="middle">
            {fmtBucket(buckets[Math.floor(buckets.length / 2)].bucketStart)}
          </text>
        )}
        <text x={W - padX} y={H - 2} fontSize="9" fill="#94a3b8" textAnchor="end">
          {fmtBucket(buckets[buckets.length - 1].bucketStart)}
        </text>

        {/* Y-axis max label */}
        <text x={padX} y={padY + 2} fontSize="9" fill="#94a3b8" textAnchor="start">
          {Math.round(yMax)}
        </text>
      </svg>
    </div>
  );
}

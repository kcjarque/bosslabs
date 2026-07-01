import { Suspense } from 'react';
import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import {
  countPageViews,
  getSettings,
  getSignups,
  getVisitBuckets,
  getEmailStats,
  getAdSpendByDay,
  type Signup,
} from '@/lib/db';
import { formatPHP, formatPHPWhole, OFFER, FACEBOOK_GROUP_URL } from '@/lib/config';
import { getCloserRecoveredSignupIds } from '@/lib/closers';
import { sumWebinarIncomeCentavos } from '@/lib/retreat-crm';
import { sumDfyIncomeCentavos } from '@/lib/dfy-crm';
import { isRecoveredPaid } from '@/lib/recovered';
import { DailyChart } from '@/components/DailyChart';
import { AdSpendRoasChart } from '@/components/AdSpendRoasChart';
import { RefreshButton } from './ads/RefreshButton';
import { CustomPeriodPicker } from '@/components/CustomPeriodPicker';
import { DashboardRefreshButton } from './DashboardRefreshButton';
import { DashboardSkeleton } from './DashboardSkeleton';

export const dynamic = 'force-dynamic';

/* --------------------------------------------------------------------- */
/* Cached fetches — wrapped in unstable_cache so a hot reopen of the     */
/* dashboard hits in-memory cache (under 100ms) instead of re-running    */
/* every Supabase query. The "Refresh" button at the top busts all of    */
/* them via revalidateTag('dashboard'). 60s TTL = cards stay current     */
/* while preventing thundering-herd on hot reloads.                      */
/* --------------------------------------------------------------------- */
const CACHE_TTL_SECONDS = 60;
const CACHE_TAG = 'dashboard';
const cacheOpts = { revalidate: CACHE_TTL_SECONDS, tags: [CACHE_TAG] };

/* Timing instrumentation — wraps each cached call so the Vercel function log
 * shows per-fetch wall-clock + a HIT/MISS guess (sub-5ms ≈ in-memory cache
 * hit; longer ≈ underlying Supabase round-trip). Verify-only: cheap, no PII.
 * Strip this `timed()` wrapping once the speed numbers look right. */
function timed<TArgs extends unknown[], TR>(
  label: string,
  fn: (...a: TArgs) => Promise<TR>,
): (...a: TArgs) => Promise<TR> {
  return async (...a: TArgs) => {
    const start = performance.now();
    try {
      return await fn(...a);
    } finally {
      const ms = performance.now() - start;
      const tag = ms < 5 ? 'HIT ' : 'MISS';
      console.log(`[dash:${label}] ${tag} ${ms.toFixed(0)}ms`);
    }
  };
}

const cachedGetSignups = timed('signups', unstable_cache(getSignups, ['dashboard:signups'], cacheOpts));
const cachedGetEmailStats = timed('email-stats', unstable_cache(getEmailStats, ['dashboard:email-stats'], cacheOpts));
const cachedGetAdSpend = timed('ad-spend', unstable_cache(getAdSpendByDay, ['dashboard:ad-spend'], cacheOpts));
/* IMPORTANT: unstable_cache JSON-serializes results, which turns a Set into
 * `{}` (no .has()) and crashes downstream. Cache the plain-array form and
 * rebuild the Set at the call site. Same trap for any Map return. */
const cachedGetCloserRecoveredArr = timed('closer-recovered', unstable_cache(
  async () => Array.from(await getCloserRecoveredSignupIds()),
  ['dashboard:closer-recovered'],
  cacheOpts,
));
const cachedCountPageViews = timed('page-views', unstable_cache(countPageViews, ['dashboard:page-views'], cacheOpts));
const cachedGetVisitBuckets = timed('visit-buckets', unstable_cache(getVisitBuckets, ['dashboard:visit-buckets'], cacheOpts));
const cachedSumWebinarIncome = timed('webinar-income', unstable_cache(
  sumWebinarIncomeCentavos, ['dashboard:webinar-income'], cacheOpts,
));
const cachedSumDfyIncome = timed('dfy-income', unstable_cache(sumDfyIncomeCentavos, ['dashboard:dfy-income'], cacheOpts));

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

/**
 * Bucket signups into day columns (inclusive, YYYY-MM-DD, Manila).
 *
 * Cash-by-day model: SIGNUPS are counted on the day they registered, but
 * PAYMENTS (count + revenue) are counted on the day the cash actually
 * arrived (confirmationSent). A payment is split into:
 *   - paid      = direct, paid the same day they signed up
 *   - recovered = abandoned-then-paid (later day) OR closer-claimed-then-paid
 * The cohort conversion-rate KPI is computed elsewhere by signup date, so a
 * recovered sale still keeps its signup-day conversion credit.
 */
function bucketDaily(
  signups: Signup[],
  startDate: string,
  endDate: string,
  closerRecoveredIds: Set<string>,
) {
  const buckets = new Map<
    string,
    { date: string; total: number; paid: number; recovered: number; revenuePhp: number }
  >();
  // Build date range by walking from start to end in day increments.
  const cur = new Date(startDate + 'T00:00:00+08:00');
  const last = new Date(endDate + 'T00:00:00+08:00');
  while (cur <= last) {
    const key = manilaDate(cur);
    buckets.set(key, { date: key, total: 0, paid: 0, recovered: 0, revenuePhp: 0 });
    cur.setDate(cur.getDate() + 1);
  }
  for (const s of signups) {
    // Signups land on their registration day.
    const signupKey = manilaDate(new Date(s.createdAt));
    const signupBucket = buckets.get(signupKey);
    if (signupBucket) signupBucket.total += 1;

    // Payments land on the day the cash arrived.
    if (s.status === 'paid' || s.status === 'attended') {
      const meta = (s.metadata as { otoAmount?: number; otoConfirmed?: string; confirmationSent?: string } | undefined) ?? {};
      const payKey = manilaDate(new Date(meta.confirmationSent ?? s.createdAt));
      const payBucket = buckets.get(payKey);
      if (payBucket) {
        const otoExtra = meta.otoConfirmed && meta.otoAmount ? meta.otoAmount : 0;
        payBucket.revenuePhp += (s.amountCentavos ?? 0) / 100 + otoExtra;
        const recovered = closerRecoveredIds.has(s.id) || payKey > signupKey;
        if (recovered) payBucket.recovered += 1;
        else payBucket.paid += 1;
      }
    }
  }
  return Array.from(buckets.values());
}

/* --------------------------------------------------------------------- */
/* Dashboard date range — scopes the headline KPI cards. Default: all time */
/* --------------------------------------------------------------------- */

const DASH_RANGES = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'mtd', label: 'This month' },
] as const;

type DashRange = { key: string; label: string; startMs: number; endMs: number } | null;

/** Resolve the ?dr= preset (or a custom from/to range) into a start+end
 *  cutoff (ms). null = all time. Presets end "now"; custom uses Manila
 *  calendar dates [from 00:00, to 23:59:59], capped at now. */
function resolveDashRange(dr?: string, from?: string, to?: string): DashRange {
  const now = Date.now();
  const todayStr = manilaToday();
  const midnight = new Date(todayStr + 'T00:00:00+08:00').getTime();
  const monthStart = new Date(todayStr.slice(0, 8) + '01T00:00:00+08:00').getTime();
  switch (dr) {
    case 'today':
      return { key: 'today', label: 'today', startMs: midnight, endMs: now };
    case 'yesterday':
      return { key: 'yesterday', label: 'yesterday', startMs: midnight - 86400_000, endMs: midnight };
    case '7d':
      return { key: '7d', label: 'the last 7 days', startMs: now - 7 * 86400_000, endMs: now };
    case '30d':
      return { key: '30d', label: 'the last 30 days', startMs: now - 30 * 86400_000, endMs: now };
    case 'mtd':
      return { key: 'mtd', label: 'this month', startMs: monthStart, endMs: now };
    case 'custom': {
      const valid = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
      if (!valid(from) || !valid(to)) return null;
      const startMs = new Date(`${from}T00:00:00+08:00`).getTime();
      const endMs = Math.min(now, new Date(`${to}T23:59:59.999+08:00`).getTime());
      if (!(endMs > startMs)) return null;
      return { key: 'custom', label: `${from} – ${to}`, startMs, endMs };
    }
    default:
      return null;
  }
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

/* --------------------------------------------------------------------- */
/* Page outer — instant chrome (header + period picker + refresh button) */
/* Heavy fetching + render happens in <DashboardBody> inside Suspense so */
/* the chrome paints immediately on cold loads.                          */
/* --------------------------------------------------------------------- */
export default function AdminDashboard({
  searchParams,
}: {
  searchParams: { dr?: string; from?: string; to?: string };
}) {
  requireAdmin();
  const activeRange = resolveDashRange(searchParams?.dr, searchParams?.from, searchParams?.to);
  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Live view of registrations + delivery channels.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardRefreshButton />
          <Link href="/admin/customers" className="btn btn-secondary">
            View all customers →
          </Link>
        </div>
      </header>

      {/* Period filter — pure UI (no data fetch) so it can live outside the
          Suspense boundary and stay interactive while body data is loading. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.06em] text-slate-500">
          Period
        </span>
        <DashboardDateFilter activeKey={activeRange?.key ?? 'all'} />
        <CustomPeriodPicker
          active={activeRange?.key === 'custom'}
          from={searchParams?.from}
          to={searchParams?.to}
        />
      </div>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DashboardBody({
  searchParams,
}: {
  searchParams: { dr?: string; from?: string; to?: string };
}) {

  // ── ONE global period (?dr=) drives the KPI cards, funnel, AND chart.
  const now = Date.now();
  const dashRange = resolveDashRange(searchParams?.dr, searchParams?.from, searchParams?.to);
  const periodLabel = dashRange ? dashRange.label : 'all time';
  // End of the window — "now" for presets, the chosen end for a custom range.
  const rangeEnd = dashRange ? dashRange.endMs : now;

  // Funnel window derived from the global period. "All time" looks back a
  // year (bounded so we don't generate thousands of empty buckets).
  const funnelSinceMs = dashRange ? dashRange.startMs : now - 365 * 86400_000;
  const lengthMs = Math.max(3600_000, rangeEnd - funnelSinceMs);
  const funnelSinceIso = new Date(funnelSinceMs).toISOString();
  const funnelUntilIso = new Date(rangeEnd).toISOString();
  // Previous period of equal length, for the comparison line in the visits chart.
  const prevSinceIso = new Date(funnelSinceMs - lengthMs).toISOString();
  // 1h buckets for short ranges, 1d once it gets too wide for the SVG.
  const bucketMs = lengthMs <= 7 * 86400_000 ? 3600_000 : 86400_000;

  const [
    signups,
    settings,
    viewsAll,
    viewsCheckout,
    visitsBuckets,
    visitsBucketsPrev,
    closerRecoveredIds,
    emailStats,
    adSpendByDay,
    webinarIncomeCentavos,
    dfyIncomeCentavos,
    webinarIncomeAllCentavos,
    dfyIncomeAllCentavos,
  ] = await (async () => {
    const _allStart = performance.now();
    console.log(`[dash] body fetch start · period=${dashRange?.key ?? 'all'}`);
    const result = await Promise.all([
      // Cached versions — bust on Refresh-button click (revalidateTag('dashboard'))
      cachedGetSignups(),
      getSettings(), // light, not cached
      cachedCountPageViews({ sinceIso: funnelSinceIso, untilIso: funnelUntilIso }),
      cachedCountPageViews({ sinceIso: funnelSinceIso, untilIso: funnelUntilIso, pathPrefix: '/checkout' }),
      cachedGetVisitBuckets({ sinceIso: funnelSinceIso, untilIso: funnelUntilIso, bucketMs }),
      cachedGetVisitBuckets({ sinceIso: prevSinceIso, untilIso: funnelSinceIso, bucketMs }),
      // Array-form of the closer-recovered set (see unstable_cache Set gotcha above)
      cachedGetCloserRecoveredArr().then((arr) => new Set(arr)),
      cachedGetEmailStats(),
      cachedGetAdSpend(),
      cachedSumWebinarIncome(dashRange?.startMs, rangeEnd),
      cachedSumDfyIncome(dashRange?.startMs, rangeEnd),
      cachedSumWebinarIncome(),
      cachedSumDfyIncome(),
    ]);
    console.log(`[dash] body fetch done in ${(performance.now() - _allStart).toFixed(0)}ms`);
    return result;
  })();

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

  // LTV — all-time, per DISTINCT buyer (by email, so a repeat/weekly attendee
  // counts once). "Lifetime" by definition, so LTV does NOT follow the duration
  // picker. (Ave. cost per customer, computed below, DOES follow the picker.)
  const distinctCustomers = new Set(
    paid.map((s) => (s.email ?? '').trim().toLowerCase()).filter(Boolean),
  ).size;
  // Webinar (front-end) LTV — ₱999 + OTO only; shown as the card's subline.
  const ltvCentavos = distinctCustomers > 0 ? Math.round(revenueCentavos / distinctCustomers) : 0;
  // Total LTV — front-end + all back-end (Retreat + DFY) per customer. Back-end
  // buyers are the same leads (verified), so their cash lifts each lead's LTV.
  const totalLtvCentavos =
    distinctCustomers > 0
      ? Math.round((revenueCentavos + webinarIncomeAllCentavos + dfyIncomeAllCentavos) / distinctCustomers)
      : 0;

  // Conversion rate = paid / (anyone who hit checkout = registered + paid + refunded).
  // Excludes free-tier signups + contact-form submissions since they aren't
  // funnel-conversion candidates.
  const funnelEntrants = signups.filter((s) => s.source === 'paid').length;
  const conversionRate =
    funnelEntrants > 0 ? (paid.length / funnelEntrants) * 100 : 0;

  // Headline KPI cards scoped to the global period (by createdAt).
  const scoped = dashRange
    ? signups.filter((s) => {
        const t = new Date(s.createdAt).getTime();
        return t >= dashRange.startMs && t <= rangeEnd;
      })
    : signups;
  const sPaid = scoped.filter((s) => s.status === 'paid' || s.status === 'attended');
  const sRegistered = scoped.filter((s) => s.status === 'registered');
  const sRefunded = scoped.filter((s) => s.status === 'refunded');
  const sRevenueCentavos = sPaid.reduce((sum, s) => {
    const meta = (s.metadata as { otoAmount?: number; otoConfirmed?: string } | undefined) ?? {};
    const otoExtra = meta.otoConfirmed && meta.otoAmount ? meta.otoAmount * 100 : 0;
    return sum + (s.amountCentavos ?? 0) + otoExtra;
  }, 0);
  const sAovPhp = sPaid.length > 0 ? sRevenueCentavos / 100 / sPaid.length : 0;
  const sFunnelEntrants = scoped.filter((s) => s.source === 'paid').length;
  const sConversion = sFunnelEntrants > 0 ? (sPaid.length / sFunnelEntrants) * 100 : 0;

  // All cash RECEIVED in the period, scoped by PAYMENT day, then PARTITIONED
  // into direct vs recovered so the two never overlap:
  //   - recovered = closer-claimed OR abandoned-then-paid (paid a later day
  //     than signup). A closer-claimed sale was, by definition, abandoned
  //     first, so it counts ONLY as recovered — never as a paid ticket.
  //   - direct = everything else (paid in the same session, never abandoned).
  // Paid tickets (direct) + Recovered = every payment, each counted once, so
  // Revenue = direct + recovered with no double count.
  // Main payment (₱999 + any SAME-invoice checkout bump), credited to the main
  // pay date. The POST-payment OTO upsell is added separately, by its OWN pay
  // date (otoConfirmed), so an OTO paid days after the ticket lands on the day
  // it was actually paid — not the parent's original purchase day.
  const revOf = (s: Signup) => s.amountCentavos ?? 0;
  const otoRevenueInWindow = (sinceMs?: number, untilMs?: number) =>
    signups.reduce((sum, s) => {
      const meta = (s.metadata as { otoConfirmed?: string; otoAmount?: number } | undefined) ?? {};
      if (!meta.otoConfirmed || !meta.otoAmount) return sum;
      const t = new Date(meta.otoConfirmed).getTime();
      if (sinceMs != null && t < sinceMs) return sum;
      if (untilMs != null && t > untilMs) return sum;
      return sum + meta.otoAmount * 100;
    }, 0);
  const sPaidByPaymentList = signups.filter((s) => {
    if (s.status !== 'paid' && s.status !== 'attended') return false;
    if (!dashRange) return true; // all time
    const cs = (s.metadata as { confirmationSent?: string } | undefined)?.confirmationSent;
    const payMs = new Date(cs ?? s.createdAt).getTime();
    return payMs >= dashRange.startMs && payMs <= rangeEnd;
  });
  const sRecoveredList = sPaidByPaymentList.filter((s) => isRecoveredPaid(s, closerRecoveredIds));
  const sDirectList = sPaidByPaymentList.filter((s) => !isRecoveredPaid(s, closerRecoveredIds));
  const sRecoveredRevenueCentavos = sRecoveredList.reduce((sum, s) => sum + revOf(s), 0);
  const sDirectRevenueCentavos = sDirectList.reduce((sum, s) => sum + revOf(s), 0);
  const sOtoRevenueCentavos = dashRange
    ? otoRevenueInWindow(dashRange.startMs, rangeEnd)
    : otoRevenueInWindow();
  const sRevenueByPaymentCentavos =
    sDirectRevenueCentavos + sRecoveredRevenueCentavos + sOtoRevenueCentavos;

  // Prior-period comparison (same-length window immediately before) → trend
  // chips. Computed from the already-fetched signups (no extra query); null for
  // all-time (no meaningful "previous" window).
  let prevRevenueCentavos = 0;
  let prevDirectCount = 0;
  if (dashRange) {
    const prevStart = dashRange.startMs - (rangeEnd - dashRange.startMs);
    const prevList = signups.filter((s) => {
      if (s.status !== 'paid' && s.status !== 'attended') return false;
      const cs = (s.metadata as { confirmationSent?: string } | undefined)?.confirmationSent;
      const payMs = new Date(cs ?? s.createdAt).getTime();
      return payMs >= prevStart && payMs < dashRange.startMs;
    });
    prevRevenueCentavos =
      prevList.reduce((sum, s) => sum + revOf(s), 0) +
      otoRevenueInWindow(prevStart, dashRange.startMs - 1);
    prevDirectCount = prevList.filter((s) => !isRecoveredPaid(s, closerRecoveredIds)).length;
  }
  const trendPct = (cur: number, prev: number): number | null => {
    if (!dashRange) return null;
    if (prev === 0) return cur > 0 ? 100 : null;
    return Math.round(((cur - prev) / prev) * 100);
  };
  const revenueTrend = trendPct(sRevenueByPaymentCentavos, prevRevenueCentavos);
  const paidTrend = trendPct(sDirectList.length, prevDirectCount);

  // ── Ad spend & ROAS (period-scoped). Spend is keyed by calendar day
  // (Manila); revenue is the cash received in the period. ROAS = front-end
  // revenue ÷ spend — back-end webinar sales are upside on top.
  const adDayInPeriod = (d: { date: string }) => {
    if (!dashRange) return true; // all time
    const dayStart = new Date(d.date + 'T00:00:00+08:00').getTime();
    const dayEnd = dayStart + 86400_000;
    return dayEnd > dashRange.startMs && dayStart <= rangeEnd;
  };
  const adSpendInPeriodCentavos = adSpendByDay.reduce(
    (sum, d) => (adDayInPeriod(d) ? sum + d.spendCentavos : sum),
    0,
  );
  const adPaidCount = sPaidByPaymentList.length;
  const adRoas =
    adSpendInPeriodCentavos > 0 ? sRevenueByPaymentCentavos / adSpendInPeriodCentavos : null;
  const adCostPerSaleCentavos =
    adPaidCount > 0 ? Math.round(adSpendInPeriodCentavos / adPaidCount) : 0;
  const adNetCentavos = sRevenueByPaymentCentavos - adSpendInPeriodCentavos;
  // Ave. cost per customer — follows the duration picker: ad spend in the period
  // ÷ DISTINCT customers acquired in it (by payment date, matching the ROAS
  // card's basis). All-time when no period is selected.
  const periodCustomers = new Set(
    sPaidByPaymentList.map((s) => (s.email ?? '').trim().toLowerCase()).filter(Boolean),
  ).size;
  const cacCentavos =
    periodCustomers > 0 ? Math.round(adSpendInPeriodCentavos / periodCustomers) : 0;
  // Total revenue (all streams) + the blended/overall ROAS — front-end + VCR +
  // DFY ÷ ad spend. Distinct from the front-end-only ROAS in the Ad spend card.
  const totalIncomeCentavos = sRevenueByPaymentCentavos + webinarIncomeCentavos + dfyIncomeCentavos;
  const overallRoas = adSpendInPeriodCentavos > 0 ? totalIncomeCentavos / adSpendInPeriodCentavos : null;
  // Revenue per payment-day (Manila), for the daily spend-vs-revenue table.
  const revenueByDayCentavos = new Map<string, number>();
  const addRev = (day: string, cents: number) =>
    revenueByDayCentavos.set(day, (revenueByDayCentavos.get(day) ?? 0) + cents);
  for (const s of paid) {
    const meta = (s.metadata as { otoAmount?: number; otoConfirmed?: string; confirmationSent?: string } | undefined) ?? {};
    // Main on its pay day; the OTO upsell on ITS own pay day (otoConfirmed).
    addRev(manilaDate(new Date(meta.confirmationSent ?? s.createdAt)), s.amountCentavos ?? 0);
    if (meta.otoConfirmed && meta.otoAmount) {
      addRev(manilaDate(new Date(meta.otoConfirmed)), meta.otoAmount * 100);
    }
  }
  // Daily rows for the table — period days (or all of them for all-time),
  // newest first, capped so the table stays compact.
  const adDailyRows = [...adSpendByDay.filter(adDayInPeriod)]
    .reverse()
    .slice(0, 31)
    .map((d) => {
      const rev = revenueByDayCentavos.get(d.date) ?? 0;
      return {
        date: d.date,
        spendCentavos: d.spendCentavos,
        revCentavos: rev,
        roas: d.spendCentavos > 0 ? rev / d.spendCentavos : null,
      };
    });

  // Paid signups in the last 24h — used in the channel-mix caption below.
  const last24Paid = within(24, (s) => s.status === 'paid');

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

  // Activity chart scoped to the same global period.
  const chartStart = manilaDate(new Date(funnelSinceMs));
  const chartEnd = manilaDate(new Date(rangeEnd));
  const daily = bucketDaily(signups, chartStart, chartEnd, closerRecoveredIds);
  // Wide windows (esp. "all time" = 365 days) start long before the first
  // signup, squishing the real bars into an unhoverable sliver on the right.
  // Drop the leading empty stretch so the bars are wide enough to read + hover.
  const firstActiveIdx = daily.findIndex(
    (d) => d.total > 0 || d.paid > 0 || d.recovered > 0,
  );
  const dailyVisible = firstActiveIdx > 0 ? daily.slice(firstActiveIdx) : daily;
  // Recovered stacks on top of the signups bar, so size the axis to the
  // tallest signups + recovered column (not just signups).
  const dailyMax = Math.max(1, ...dailyVisible.map((d) => d.total + d.recovered));

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
  // Email channel reflects the active provider. SES auth lives in env vars
  // (checked directly so the dashboard doesn't pull in the AWS SDK).
  const emailIsSes = settings.emailProvider === 'ses';
  const sesConfigured = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  const emailChannelName = emailIsSes ? 'Email · Amazon SES' : 'Email · Resend';
  const channelStatus = {
    email: emailIsSes ? sesConfigured : !!settings.resendApiKey,
    sms: !!settings.onewaysmsUsername && !!settings.onewaysmsPassword,
    facebook: !!FACEBOOK_GROUP_URL,
  };

  return (
    <>
      {/* Revenue + headline metrics — these are the numbers that matter */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard
          label="Revenue"
          value={formatPHPWhole(sRevenueByPaymentCentavos)}
          trend={revenueTrend}
          sub={
            sRecoveredRevenueCentavos > 0
              ? `incl. ${formatPHPWhole(sRecoveredRevenueCentavos)} recovered`
              : `${sPaid.length} paid · AOV ${formatPHPWhole(Math.round(sAovPhp * 100))}`
          }
          tone="green"
        />
        <StatCard
          label="Paid tickets"
          value={sDirectList.length.toString()}
          trend={paidTrend}
          sub={
            dashRange
              ? `direct · in ${dashRange.label}`
              : `direct · +${last24Paid} in 24h`
          }
          tone="green"
        />
        <StatCard
          label="Conversion rate"
          value={`${sConversion.toFixed(1)}%`}
          sub={`${sPaid.length} of ${sFunnelEntrants} checkout-starts`}
        />
        <StatCard
          label="Stuck (unpaid)"
          value={sRegistered.length.toString()}
          sub={`Started checkout, never paid · ${sRefunded.length} refunded`}
          tone={sRegistered.length > 0 ? 'amber' : undefined}
          href={sRegistered.length > 0 ? '/admin/pending-payments' : undefined}
        />
      </div>

      {/* Funnel + activity row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard
          label="Total signups (all sources)"
          value={scoped.length.toString()}
          sub={`${sFunnelEntrants} via paid funnel`}
        />
        <StatCard
          label="Recovered"
          value={sRecoveredList.length.toString()}
          tone="orange"
          sub={`${formatPHPWhole(sRecoveredRevenueCentavos)} · paid after abandoning`}
        />
        <StatCard
          label="Ave. cost per customer"
          value={formatPHPWhole(cacCentavos)}
          sub={`${formatPHPWhole(adSpendInPeriodCentavos)} ad spend · ${periodCustomers} customers`}
        />
        <StatCard
          label="LTV (lifetime value)"
          value={formatPHPWhole(totalLtvCentavos)}
          tone="green"
          sub={`Webinar LTV ${formatPHPWhole(ltvCentavos)} · incl. Retreat + DFY`}
        />
      </div>

      {/* INCOME — front-end (₱999) + VCR webinar income + DFY, rolled into a
          total. Back-end income (VCR + DFY) is deliberately kept OUT of ROAS +
          daily sales below (those stay ₱999-front-end only) so ad performance
          isn't inflated by backend closes. */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Income</h2>
          <span className="text-[11px] text-slate-400">
            {periodLabel} · total = front-end + webinar + DFY
          </span>
        </div>
        <p className="mt-1 text-[12px] text-slate-500">
          Front-end = ₱999 webinar + bumps/OTO. Webinar income = VCR high-ticket cash (retreat CRM).
          DFY = cash collected on Done-For-You deals. Overall ROAS = total income ÷ ad spend (incl.
          back-end). The Ad spend &amp; ROAS card below stays front-end-only.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 sm:gap-4">
          <StatCard
            label="Total revenue"
            value={formatPHPWhole(totalIncomeCentavos)}
            sub={`${periodLabel} · front-end + back-end`}
            tone="green"
          />
          <StatCard
            label="Front-end (₱999)"
            value={formatPHPWhole(sRevenueByPaymentCentavos)}
            sub="webinar tickets + bumps/OTO"
          />
          <StatCard
            label="Webinar income (VCR)"
            value={formatPHPWhole(webinarIncomeCentavos)}
            sub="high-ticket retreat cash"
            tone={webinarIncomeCentavos > 0 ? 'green' : undefined}
          />
          <StatCard
            label="DFY income"
            value={formatPHPWhole(dfyIncomeCentavos)}
            sub="cash collected"
            tone={dfyIncomeCentavos > 0 ? 'green' : undefined}
          />
          <StatCard
            label="Overall ROAS"
            value={overallRoas == null ? '—' : `${overallRoas.toFixed(2)}×`}
            sub="total revenue ÷ ad spend"
            tone={overallRoas == null ? undefined : overallRoas >= 1 ? 'green' : 'amber'}
          />
        </div>
      </section>

      {/* AD SPEND & ROAS — Meta spend vs actual paid revenue, period-scoped */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Ad spend &amp; ROAS</h2>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] text-slate-400">
              BOSSLABS AI | SALES · {periodLabel} · Meta, synced 12:01am
            </span>
            <RefreshButton />
          </div>
        </div>
        <p className="mt-1 text-[12px] text-slate-500">
          Spend vs cash received in the period. ROAS = revenue ÷ spend on the ₱999
          front-end — any high-ticket closed at the webinar is upside on top.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <StatCard
            label="Ad spend"
            value={formatPHPWhole(adSpendInPeriodCentavos)}
            sub={`${periodLabel} · Meta`}
          />
          <StatCard
            label="ROAS"
            value={adRoas == null ? '—' : `${adRoas.toFixed(2)}×`}
            sub={`${formatPHPWhole(sRevenueByPaymentCentavos)} revenue`}
            tone={adRoas == null ? undefined : adRoas >= 1 ? 'green' : 'amber'}
          />
          <StatCard
            label="Cost / sale"
            value={
              adPaidCount > 0 && adSpendInPeriodCentavos > 0
                ? formatPHPWhole(adCostPerSaleCentavos)
                : '—'
            }
            sub={`${adPaidCount} paid in period`}
          />
          <StatCard
            label="Net (rev − spend)"
            value={formatPHPWhole(adNetCentavos)}
            sub="front-end only"
            tone={adNetCentavos >= 0 ? 'green' : 'amber'}
          />
        </div>

        {adDailyRows.length > 0 ? (
          <AdSpendRoasChart rows={adDailyRows} />
        ) : (
          <p className="mt-5 text-[13px] text-slate-500">No ad-spend data in this period.</p>
        )}
      </section>

      {/* FUNNEL — Visits → Checkout Started → Paid, range-filterable */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-base font-semibold text-slate-900">Funnel</h2>
            </div>
            <p className="mt-1 text-[12px] text-slate-500">
              Unique browser sessions · {periodLabel}. Tracked since the
              PageviewTracker shipped — older history isn&rsquo;t in the table.
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
                dashed line = previous-period avg per{' '}
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

      {/* EMAIL PERFORMANCE — deliverability, bounce, open, click, recovery */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Email performance</h2>
          <span className="text-[11px] text-slate-400">
            {emailStats.totalSent.toLocaleString()} emails ·{' '}
            {emailStats.pending > 0 ? `${emailStats.pending} awaiting status` : 'all settled'}
          </span>
        </div>
        <p className="mt-1 text-[12px] text-slate-500">
          Across all drip + confirmation emails. Deliverability &amp; bounce come from real
          provider events.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <EmailStat
            label="Deliverability"
            value={`${emailStats.deliverabilityPct.toFixed(1)}%`}
            sub={`${emailStats.reached.toLocaleString()} reached inbox`}
            tone="good"
          />
          <EmailStat
            label="Bounce rate"
            value={`${emailStats.bouncePct.toFixed(1)}%`}
            sub={`${emailStats.bounced.toLocaleString()} bounced`}
            tone={emailStats.bouncePct >= 5 ? 'bad' : emailStats.bouncePct >= 2 ? 'warn' : 'neutral'}
          />
          <EmailStat
            label="Blocked · pre-send"
            value={emailStats.blocked.toLocaleString()}
            sub="bad address, never sent"
            tone={emailStats.blocked > 0 ? 'good' : 'muted'}
          />
          <EmailStat
            label="Open rate"
            value={emailStats.openPct == null ? '—' : `${emailStats.openPct.toFixed(1)}%`}
            sub={
              emailStats.openPct == null
                ? 'awaiting tracked sends'
                : `${emailStats.trackableOpened} of ${emailStats.trackableReached} tracked`
            }
            tone={emailStats.openPct == null ? 'muted' : 'neutral'}
          />
          <EmailStat
            label="Click rate"
            value={emailStats.clickPct == null ? '—' : `${emailStats.clickPct.toFixed(1)}%`}
            sub={
              emailStats.clickPct == null
                ? 'awaiting tracked sends'
                : `${emailStats.trackableClicked} of ${emailStats.trackableReached} tracked`
            }
            tone={emailStats.clickPct == null ? 'muted' : 'neutral'}
          />
          <EmailStat
            label="Cart recovery · email"
            value={`${emailStats.recovery.pct.toFixed(1)}%`}
            sub={`${emailStats.recovery.paid} of ${emailStats.recovery.emailed} paid`}
            tone="good"
          />
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          Open &amp; click rates cover only emails sent since open-tracking went live
          {emailStats.trackableReached > 0 ? ` (${emailStats.trackableReached} so far)` : ''} —
          older sends couldn&rsquo;t be tracked, so they&rsquo;re excluded.{' '}
          <span className="text-slate-500">Blocked</span> = addresses refused before sending
          (bad syntax, disposable domain, or no mail server) — they never become bounces, so
          each one is a bounce prevented.
        </p>
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
                Signups vs paid · {periodLabel}
              </h2>
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
        <DailyChart data={dailyVisible} max={dailyMax} />
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
            {bumpedCount} of {paid.length} took the 1on1 MVP Session upsell
          </div>
          <div className="mt-3 text-[11px] text-slate-500">
            Target: 30%+. Each attached session adds ₱1,997 — at 50% attach
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
            name={emailChannelName}
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
            name="Facebook group"
            ok={channelStatus.facebook}
            okLabel="Live"
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
    </>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
  href,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'green' | 'amber' | 'orange';
  href?: string;
  /** % change vs the prior period. Renders a ▲/▼ chip. null = no comparison. */
  trend?: number | null;
}) {
  const toneClass =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50/40'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50/40'
        : tone === 'orange'
          ? 'border-orange-200 bg-orange-50/50'
          : '';
  const body = (
    <div className={`card ${toneClass}`.trim()}>
      <div className="bl-private tnum text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl lg:text-3xl">
        {value}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.06em] text-slate-500 sm:text-xs">
        {label}
      </div>
      {typeof trend === 'number' && (
        <div
          className={`bl-private mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
            trend >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}
        >
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
          <span className="font-normal text-slate-400">vs prev</span>
        </div>
      )}
      {sub && <div className="bl-private mt-2 text-[11px] text-slate-500">{sub}</div>}
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
 * DashboardDateFilter — pill row that scopes the headline KPI cards via
 * ?dr=<key>. Pure RSC, matches the chart/funnel filters.
 */
function DashboardDateFilter({ activeKey }: { activeKey: string }) {
  return (
    <div
      role="group"
      aria-label="Dashboard date range"
      className="inline-flex flex-wrap rounded-full border border-slate-200 bg-slate-50 p-0.5"
    >
      {DASH_RANGES.map((r) => {
        const active = r.key === activeKey;
        return (
          <Link
            key={r.key}
            href={`/admin?dr=${r.key}`}
            scroll={false}
            // inline white wins over admin.css `.admin-shell a { color: inherit }`.
            style={active ? { color: '#fff' } : undefined}
            className={`rounded-full px-3 py-1 text-[11px] font-medium transition sm:text-xs ${
              active
                ? 'bg-slate-900 shadow-sm'
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
function EmailStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: 'good' | 'bad' | 'warn' | 'muted' | 'neutral';
}) {
  const valueCls =
    tone === 'good'
      ? 'text-emerald-600'
      : tone === 'bad'
        ? 'text-rose-600'
        : tone === 'warn'
          ? 'text-amber-600'
          : tone === 'muted'
            ? 'text-slate-300'
            : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold tracking-tight ${valueCls}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>
    </div>
  );
}

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

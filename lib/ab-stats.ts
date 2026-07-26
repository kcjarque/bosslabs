/**
 * A/B test results — per-arm and overall performance inside the test window.
 *
 * Sales are attributed by `metadata.homeVariant` ('a' | 'b'), stamped at
 * checkout from the same config the homepage router used. Visits come from the
 * per-arm view beacons (/__ab/home-a, /__ab/home-b).
 *
 * Everything is scoped to [startedAt, endedAt ?? now] so a finished test keeps
 * reporting the numbers it actually earned, not whatever happened afterwards.
 */
import { countPageViews, getSignups, type Signup } from './db';
import type { AbTestConfig } from './ab';

export type ArmStats = {
  arm: 'a' | 'b';
  visits: number;
  checkoutStarts: number;
  customers: number;
  revenueCentavos: number;
  /** paid ÷ visits (falls back to paid ÷ checkout-starts when no beacon data). */
  convPct: number;
  /** Average order value across this arm's paid customers. */
  aovCentavos: number;
};

export type AbResults = {
  windowStartIso: string;
  windowEndIso: string;
  /** Whole days the test has been collecting (min 1). */
  days: number;
  a: ArmStats;
  b: ArmStats;
  /** Combined across both arms — the "how is this funnel doing overall" row. */
  total: {
    visits: number;
    checkoutStarts: number;
    customers: number;
    revenueCentavos: number;
    convPct: number;
    aovCentavos: number;
  };
  /** Relative conversion lift of B over A, in %. Null when A has no data. */
  liftPct: number | null;
  /** 'a' | 'b' | null (too close / not enough data). */
  leader: 'a' | 'b' | null;
  /** Total paid across both arms — the sample size the call rests on. */
  sampleSize: number;
};

function revenueOf(s: Signup): number {
  const meta = (s.metadata as { otoAmount?: number; otoConfirmed?: string } | undefined) ?? {};
  const oto = meta.otoConfirmed && meta.otoAmount ? meta.otoAmount * 100 : 0;
  return (s.amountCentavos ?? 0) + oto;
}

function armOf(s: Signup): 'a' | 'b' | null {
  const v = (s.metadata as { homeVariant?: string } | undefined)?.homeVariant;
  return v === 'a' || v === 'b' ? v : null;
}

function statsFor(rows: Signup[], arm: 'a' | 'b', visits: number): ArmStats {
  const mine = rows.filter((s) => armOf(s) === arm);
  const checkoutStarts = mine.filter((s) => s.source === 'paid').length;
  const paid = mine.filter((s) => s.status === 'paid' || s.status === 'attended');
  const revenueCentavos = paid.reduce((sum, s) => sum + revenueOf(s), 0);
  const denominator = visits > 0 ? visits : checkoutStarts;
  return {
    arm,
    visits,
    checkoutStarts,
    customers: paid.length,
    revenueCentavos,
    convPct: denominator > 0 ? (paid.length / denominator) * 100 : 0,
    aovCentavos: paid.length > 0 ? Math.round(revenueCentavos / paid.length) : 0,
  };
}

/** Compute the full result set for a test. */
export async function getAbResults(test: AbTestConfig): Promise<AbResults> {
  const startMs = Date.parse(test.startedAt);
  const endMs = test.endedAt ? Date.parse(test.endedAt) : Date.now();
  const windowStartIso = new Date(startMs).toISOString();
  const windowEndIso = new Date(endMs).toISOString();

  const [signups, viewsA, viewsB] = await Promise.all([
    getSignups(),
    countPageViews({ sinceIso: windowStartIso, untilIso: windowEndIso, pathPrefix: '/__ab/home-a' }),
    countPageViews({ sinceIso: windowStartIso, untilIso: windowEndIso, pathPrefix: '/__ab/home-b' }),
  ]);

  // Only signups created inside the window count toward the test.
  const inWindow = signups.filter((s) => {
    const t = new Date(s.createdAt).getTime();
    return t >= startMs && t <= endMs;
  });

  const a = statsFor(inWindow, 'a', viewsA.uniqueSessions);
  const b = statsFor(inWindow, 'b', viewsB.uniqueSessions);

  const totalCustomers = a.customers + b.customers;
  const totalRevenue = a.revenueCentavos + b.revenueCentavos;
  const totalVisits = a.visits + b.visits;
  const totalStarts = a.checkoutStarts + b.checkoutStarts;
  const totalDenom = totalVisits > 0 ? totalVisits : totalStarts;

  const liftPct = a.convPct > 0 ? ((b.convPct - a.convPct) / a.convPct) * 100 : null;
  // Only call a leader once there's a real gap AND a usable sample; otherwise
  // the number is noise and shouldn't be dressed up as a result.
  const gapIsMeaningful = Math.abs(b.convPct - a.convPct) >= 0.1;
  const leader =
    totalCustomers >= 10 && gapIsMeaningful ? (b.convPct > a.convPct ? 'b' : 'a') : null;

  return {
    windowStartIso,
    windowEndIso,
    days: Math.max(1, Math.ceil((endMs - startMs) / 86_400_000)),
    a,
    b,
    total: {
      visits: totalVisits,
      checkoutStarts: totalStarts,
      customers: totalCustomers,
      revenueCentavos: totalRevenue,
      convPct: totalDenom > 0 ? (totalCustomers / totalDenom) * 100 : 0,
      aovCentavos: totalCustomers > 0 ? Math.round(totalRevenue / totalCustomers) : 0,
    },
    liftPct,
    leader,
    sampleSize: totalCustomers,
  };
}

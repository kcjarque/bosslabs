/** Ads Council account priors — empirical baselines computed from the
 *  account's own delivery history (doctrine §4.1): daily CPP variance,
 *  weekday seasonality, typical winner lifespan, and CPP drift. These feed
 *  every later verdict/debate as "is this move signal or normal account
 *  noise?" Recomputed weekly by the pipeline (Task 10) via `refreshPriors`. */
import { getAdSeries, savePriors } from './db';
import type { AdSeries, Brand, PriorsRow } from './types';

const MS_DAY = 86400000;
const MIN_SAMPLE_DAYS = 14;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Weekday key '0'..'6' for `date` (YYYY-MM-DD) — the literal calendar
 *  weekday of the Manila ops-date (Sunday=0..Saturday=6). `date` is already
 *  a Manila-calendar date string, so no zone conversion is needed: parsing
 *  it as UTC midnight and reading getUTCDay() returns that date's real
 *  weekday directly. */
function weekdayKey(date: string): string {
  return String(new Date(`${date}T00:00:00Z`).getUTCDay());
}

/** OLS slope of `ys` against its own index (0..n-1) — the "(dayIndex, cpp)
 *  pairs" the brief specifies. */
function slopeOverIndex(ys: number[]): number {
  const n = ys.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  ys.forEach((y, x) => { sumX += x; sumY += y; sumXY += x * y; sumXX += x * x; });
  const denom = n * sumXX - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

/** Pure: account priors from an already-loaded set of ad series. */
export function computePriors(brand: Brand, series: AdSeries[]): PriorsRow {
  // sampleDays: distinct dates with any delivery, across every series —
  // NOT the same count as the purchase-day gate below (a delivery day can
  // have zero purchases).
  const deliveryDates = new Set<string>();
  for (const s of series) for (const d of s.days) deliveryDates.add(d.date);
  const sampleDays = deliveryDates.size;

  // Daily campaign CPP: sum spend + purchases per date across ALL series,
  // then keep only dates with purchases > 0.
  const byDate = new Map<string, { spend: number; purchases: number }>();
  for (const s of series) {
    for (const d of s.days) {
      const agg = byDate.get(d.date) ?? { spend: 0, purchases: 0 };
      agg.spend += d.spendCentavos;
      agg.purchases += d.purchases;
      byDate.set(d.date, agg);
    }
  }
  const cppByDate = [...byDate.entries()]
    .filter(([, v]) => v.purchases > 0)
    .map(([date, v]) => ({ date, cpp: v.spend / v.purchases }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Data-mode guard: every field below needs a real sample. sampleDays is
  // still the true delivery-day count, computed above regardless.
  if (cppByDate.length < MIN_SAMPLE_DAYS) {
    return {
      brand, sampleDays,
      dailyCppSigmaPct: null, weekdayMultipliers: null,
      medianWinnerLifespanDays: null, cppDriftPctPerWeek: null,
    };
  }

  const cppValues = cppByDate.map((p) => p.cpp);
  const overallMean = mean(cppValues);

  // Zero-mean guard: a degenerate sample (every purchase-day CPP is 0).
  // Nulls every analytical field, including medianWinnerLifespanDays even
  // though it doesn't itself divide by overallMean — a half-null PriorsRow
  // on a degenerate sample is worse than an all-null one, and real spend
  // data won't hit this (it needs $0 aggregate spend on a day with
  // purchases attributed).
  if (overallMean === 0) {
    return {
      brand, sampleDays,
      dailyCppSigmaPct: null, weekdayMultipliers: null,
      medianWinnerLifespanDays: null, cppDriftPctPerWeek: null,
    };
  }

  const variance = mean(cppValues.map((v) => (v - overallMean) ** 2));
  const dailyCppSigmaPct = (Math.sqrt(variance) / overallMean) * 100;

  const byWeekday = new Map<string, number[]>();
  for (const p of cppByDate) {
    const key = weekdayKey(p.date);
    const arr = byWeekday.get(key) ?? [];
    arr.push(p.cpp);
    byWeekday.set(key, arr);
  }
  const weekdayMultipliers: Record<string, number> = {};
  for (let wd = 0; wd <= 6; wd++) {
    const arr = byWeekday.get(String(wd));
    weekdayMultipliers[String(wd)] = arr && arr.length > 0 ? mean(arr) / overallMean : 1;
  }

  const spans: number[] = [];
  for (const s of series) {
    const lifetimePurchases = s.days.reduce((a, d) => a + d.purchases, 0);
    if (lifetimePurchases < 10) continue;
    const spendDates = s.days.filter((d) => d.spendCentavos > 0).map((d) => d.date).sort();
    if (spendDates.length === 0) continue;
    const span = Math.round(
      (Date.parse(spendDates[spendDates.length - 1]) - Date.parse(spendDates[0])) / MS_DAY,
    ) + 1;
    spans.push(span);
  }
  const medianWinnerLifespanDays = spans.length > 0 ? median(spans) : null;

  // Subsumed by the >=14 gate above today (n is always >=14 here, so this
  // never fires), but kept as the brief's stated formula explicitly
  // includes a <2-points null case.
  const cppDriftPctPerWeek = cppValues.length < 2
    ? null
    : (slopeOverIndex(cppValues) * 7 / overallMean) * 100;

  return {
    brand, sampleDays,
    dailyCppSigmaPct, weekdayMultipliers,
    medianWinnerLifespanDays, cppDriftPctPerWeek,
  };
}

/** Loads the account's series, computes priors, persists them, and returns
 *  the row — the weekly refresh entry point the pipeline (Task 10) calls. */
export async function refreshPriors(brand: Brand): Promise<PriorsRow> {
  const series = await getAdSeries(brand);
  const row = computePriors(brand, series);
  await savePriors(row);
  return row;
}

/**
 * Ads results over time — daily/weekly spend, revenue, and ROAS for a date
 * range. Spend comes from the stored ad_spend_daily rows (synced from Meta);
 * revenue is our actual paid revenue per Manila pay-day (front-end + OTO upsell,
 * each credited on its own pay date — same rule the dashboard uses). ROAS =
 * revenue ÷ spend. Pure data work, admin-only.
 */
import { getAdSpendByDay, getSignups } from '@/lib/db';

export type Granularity = 'daily' | 'weekly';

export type AdResultRow = {
  key: string; // bucket key (date or week-start date)
  label: string; // human label
  budgetSetCentavos: number | null; // budget configured in Ads Manager
  spendCentavos: number;
  revCentavos: number;
  roas: number | null;
  sales: number; // front-end purchases counted that bucket
};

export type AdsResults = {
  rows: AdResultRow[]; // chronological (oldest → newest)
  totals: {
    budgetSetCentavos: number | null;
    spendCentavos: number;
    revCentavos: number;
    roas: number | null;
    sales: number;
  };
};

const DAY_MS = 86_400_000;

/** YYYY-MM-DD calendar date in Asia/Manila. */
function manilaDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/** Iterate calendar dates (YYYY-MM-DD) from `from` to `to` inclusive. */
function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return out;
  for (let t = start; t <= end; t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Monday-start of the week a YYYY-MM-DD falls in (as YYYY-MM-DD). */
function weekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

function fmtDay(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  });
}

export async function getAdsResults(opts: {
  fromDate: string;
  toDate: string;
  granularity: Granularity;
}): Promise<AdsResults> {
  const { fromDate, toDate, granularity } = opts;
  const [spendDays, signups] = await Promise.all([getAdSpendByDay(), getSignups()]);

  // Revenue + sales per Manila pay-day (main on confirmation day, OTO on its own).
  const revByDay = new Map<string, number>();
  const salesByDay = new Map<string, number>();
  for (const s of signups) {
    if (s.status !== 'paid') continue;
    const meta = (s.metadata ?? {}) as {
      confirmationSent?: string;
      otoConfirmed?: string;
      otoAmount?: number;
    };
    const mainDay = manilaDate(new Date(meta.confirmationSent ?? s.createdAt));
    revByDay.set(mainDay, (revByDay.get(mainDay) ?? 0) + (s.amountCentavos ?? 0));
    salesByDay.set(mainDay, (salesByDay.get(mainDay) ?? 0) + 1);
    if (meta.otoConfirmed && meta.otoAmount) {
      const otoDay = manilaDate(new Date(meta.otoConfirmed));
      revByDay.set(otoDay, (revByDay.get(otoDay) ?? 0) + meta.otoAmount * 100);
    }
  }
  const spendByDay = new Map<string, number>();
  const budgetByDay = new Map<string, number | null>();
  for (const d of spendDays) {
    spendByDay.set(d.date, d.spendCentavos);
    budgetByDay.set(d.date, d.budgetSetCentavos);
  }

  // One entry per day in the range, then fold into weekly buckets if asked.
  type Bucket = { spend: number; rev: number; sales: number; budget: number; hasBudget: boolean };
  const buckets = new Map<string, Bucket>();
  for (const day of dateRange(fromDate, toDate)) {
    const key = granularity === 'weekly' ? weekStart(day) : day;
    const b = buckets.get(key) ?? { spend: 0, rev: 0, sales: 0, budget: 0, hasBudget: false };
    b.spend += spendByDay.get(day) ?? 0;
    b.rev += revByDay.get(day) ?? 0;
    b.sales += salesByDay.get(day) ?? 0;
    const bud = budgetByDay.get(day);
    if (bud != null) {
      b.budget += bud;
      b.hasBudget = true;
    }
    buckets.set(key, b);
  }

  const rows: AdResultRow[] = [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, b]) => ({
      key,
      label: granularity === 'weekly' ? `Week of ${fmtDay(key)}` : fmtDay(key),
      budgetSetCentavos: b.hasBudget ? b.budget : null,
      spendCentavos: b.spend,
      revCentavos: b.rev,
      roas: b.spend > 0 ? b.rev / b.spend : null,
      sales: b.sales,
    }));

  const totalSpend = rows.reduce((s, r) => s + r.spendCentavos, 0);
  const totalRev = rows.reduce((s, r) => s + r.revCentavos, 0);
  const totalSales = rows.reduce((s, r) => s + r.sales, 0);
  const budgetRows = rows.filter((r) => r.budgetSetCentavos != null);
  const totalBudget = budgetRows.length
    ? budgetRows.reduce((s, r) => s + (r.budgetSetCentavos ?? 0), 0)
    : null;

  return {
    rows,
    totals: {
      budgetSetCentavos: totalBudget,
      spendCentavos: totalSpend,
      revCentavos: totalRev,
      roas: totalSpend > 0 ? totalRev / totalSpend : null,
      sales: totalSales,
    },
  };
}

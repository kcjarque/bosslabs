/**
 * Profit & Loss — a daily (EOD) tally combining every income stream against
 * costs. Pure computation over existing records (no new tables), so it's
 * inherently "backfilled" across all of history.
 *
 * Income (itemized per day):
 *   - Webinar  — front-end funnel revenue (₱999 main on its confirmation day +
 *                the OTO upsell on its own pay day), from paid signups.
 *   - VCR      — VibeCode Retreat payments (retreat CRM payment log).
 *   - DFY      — Done-For-You payments (DFY CRM payment log).
 * Costs:
 *   - Ads      — daily Meta spend × 1.12 (12% PH VAT included), from ad_spend_daily.
 *   - OpEx     — all Finance expenses that day (single + project + recurring),
 *                via the monthly consolidation (overrides/skips already applied).
 * Net = income − (ads + opex).
 */
import { getAdSpendByDay, getSignups } from './db';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { getMonthlyConsolidation } from './finance';

export const ADS_VAT_RATE = 0.12;
const DAY_MS = 86_400_000;

export type PnlRow = {
  date: string;
  webinarCentavos: number;
  vcrCentavos: number;
  dfyCentavos: number;
  incomeCentavos: number;
  adsCentavos: number; // VAT included
  opexCentavos: number;
  outCentavos: number; // ads + opex
  netCentavos: number;
};

export type Pnl = {
  rows: PnlRow[]; // chronological (oldest → newest)
  totals: Omit<PnlRow, 'date'>;
};

function manilaDate(d: Date | string | number): string {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}
function add(map: Map<string, number>, day: string, cents: number) {
  if (!cents) return;
  map.set(day, (map.get(day) ?? 0) + cents);
}
function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return out;
  for (let t = start; t <= end; t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
function monthsInRange(from: string, to: string): { year: number; month: number }[] {
  const s = Number(from.slice(0, 4)) * 12 + (Number(from.slice(5, 7)) - 1);
  const e = Number(to.slice(0, 4)) * 12 + (Number(to.slice(5, 7)) - 1);
  const out: { year: number; month: number }[] = [];
  for (let i = s; i <= e; i++) out.push({ year: Math.floor(i / 12), month: (i % 12) + 1 });
  return out;
}

/** Sum a CRM table's payment log by Manila pay-day. */
async function paymentsByDay(table: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!isSupabaseConfigured()) return map;
  const { data, error } = await getSupabase().from(table).select('payments');
  if (error) return map;
  for (const row of (data ?? []) as { payments: { amountCentavos?: number; at?: string }[] | null }[]) {
    for (const p of row.payments ?? []) {
      if (p?.at && p.amountCentavos) add(map, manilaDate(p.at), p.amountCentavos);
    }
  }
  return map;
}

export async function getPnl(opts: { fromDate: string; toDate: string }): Promise<Pnl> {
  const { fromDate, toDate } = opts;

  const [adsDays, signups, vcrByDay, dfyByDay] = await Promise.all([
    getAdSpendByDay(),
    getSignups(),
    paymentsByDay('retreat_crm_cards'),
    paymentsByDay('dfy_crm_cards'),
  ]);

  // Webinar (front-end) revenue per Manila pay-day.
  const webinarByDay = new Map<string, number>();
  for (const s of signups) {
    if (s.status !== 'paid') continue;
    const m = (s.metadata ?? {}) as { confirmationSent?: string; otoConfirmed?: string; otoAmount?: number };
    add(webinarByDay, manilaDate(m.confirmationSent ?? s.createdAt), s.amountCentavos ?? 0);
    if (m.otoConfirmed && m.otoAmount) add(webinarByDay, manilaDate(m.otoConfirmed), m.otoAmount * 100);
  }

  // Ads per day, VAT included.
  const adsByDay = new Map<string, number>();
  for (const d of adsDays) adsByDay.set(d.date, Math.round(d.spendCentavos * (1 + ADS_VAT_RATE)));

  // Finance expenses per day (single + project + recurring), via consolidation.
  const opexByDay = new Map<string, number>();
  for (const { year, month } of monthsInRange(fromDate, toDate)) {
    const c = await getMonthlyConsolidation(year, month);
    for (const r of c.rows) add(opexByDay, r.date, r.amountCentavos);
  }

  const rows: PnlRow[] = [];
  const totals: Omit<PnlRow, 'date'> = {
    webinarCentavos: 0, vcrCentavos: 0, dfyCentavos: 0, incomeCentavos: 0,
    adsCentavos: 0, opexCentavos: 0, outCentavos: 0, netCentavos: 0,
  };
  for (const date of dateRange(fromDate, toDate)) {
    const webinar = webinarByDay.get(date) ?? 0;
    const vcr = vcrByDay.get(date) ?? 0;
    const dfy = dfyByDay.get(date) ?? 0;
    const income = webinar + vcr + dfy;
    const ads = adsByDay.get(date) ?? 0;
    const opex = opexByDay.get(date) ?? 0;
    const out = ads + opex;
    const net = income - out;
    if (income === 0 && out === 0) continue; // skip days with no activity at all
    rows.push({
      date,
      webinarCentavos: webinar,
      vcrCentavos: vcr,
      dfyCentavos: dfy,
      incomeCentavos: income,
      adsCentavos: ads,
      opexCentavos: opex,
      outCentavos: out,
      netCentavos: net,
    });
    totals.webinarCentavos += webinar;
    totals.vcrCentavos += vcr;
    totals.dfyCentavos += dfy;
    totals.incomeCentavos += income;
    totals.adsCentavos += ads;
    totals.opexCentavos += opex;
    totals.outCentavos += out;
    totals.netCentavos += net;
  }

  return { rows, totals };
}

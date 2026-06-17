import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { formatPHP } from '@/lib/config';
import { PageHeader } from '@/components/admin/PageHeader';
import { getPnl } from '@/lib/finance-pnl';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'P&L · BOSSLABS AI' };

const DAY_MS = 86_400_000;
const isDate = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}
function minusDays(dateStr: string, n: number): string {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) - n * DAY_MS).toISOString().slice(0, 10);
}
function fmtDay(d: string): string {
  return new Date(`${d}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  });
}

type RangeKey = '7d' | '30d' | 'mtd' | 'custom';
const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: 'Past 7 days' },
  { key: '30d', label: 'Past 30 days' },
  { key: 'mtd', label: 'MTD' },
  { key: 'custom', label: 'Custom' },
];

export default async function PnlPage({
  searchParams,
}: {
  searchParams: { range?: string; from?: string; to?: string };
}) {
  requireAdmin();
  let range: RangeKey =
    searchParams.range === '7d' || searchParams.range === 'mtd' || searchParams.range === 'custom'
      ? searchParams.range
      : '30d';
  const today = manilaToday();
  let fromDate: string;
  let toDate: string;
  if (range === '7d') {
    toDate = today;
    fromDate = minusDays(today, 6);
  } else if (range === 'mtd') {
    toDate = today;
    fromDate = `${today.slice(0, 7)}-01`;
  } else if (range === 'custom') {
    fromDate = isDate(searchParams.from) ? searchParams.from : minusDays(today, 29);
    toDate = isDate(searchParams.to) ? searchParams.to : today;
    if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
  } else {
    range = '30d';
    toDate = today;
    fromDate = minusDays(today, 29);
  }

  const { rows, totals } = await getPnl({ fromDate, toDate });
  const tableRows = [...rows].reverse(); // newest first
  const href = (over: Record<string, string>) =>
    `/admin/finance/pnl?${new URLSearchParams({
      range,
      ...(range === 'custom' ? { from: fromDate, to: toDate } : {}),
      ...over,
    }).toString()}`;

  return (
    <div>
      <PageHeader
        title="P&L"
        subtitle="Daily profit & loss — every income stream (Webinar, VCR, DFY) against ads (incl. 12% VAT) and operating expenses. Tallied end-of-day."
      />

      {/* Range */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium uppercase tracking-[0.06em] text-slate-500">Range</span>
        <div className="inline-flex flex-wrap rounded-full border border-slate-200 bg-slate-50 p-0.5">
          {RANGES.map((r) => {
            const active = r.key === range;
            return (
              <Link
                key={r.key}
                href={href({ range: r.key })}
                scroll={false}
                style={active ? { color: '#fff' } : undefined}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition sm:text-xs ${
                  active ? 'bg-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                {r.label}
              </Link>
            );
          })}
        </div>
      </div>

      {range === 'custom' && (
        <form method="GET" action="/admin/finance/pnl" className="mb-5 flex flex-wrap items-end gap-3">
          <input type="hidden" name="range" value="custom" />
          <div>
            <label className="label">From</label>
            <input type="date" name="from" defaultValue={fromDate} max={today} className="input" />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" name="to" defaultValue={toDate} max={today} className="input" />
          </div>
          <button type="submit" className="btn btn-secondary">
            Apply
          </button>
        </form>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card label="Income" value={formatPHP(totals.incomeCentavos)} tone="emerald" />
        <Card label="Ads (VAT incl.)" value={formatPHP(totals.adsCentavos)} tone="rose" />
        <Card label="Operating expenses" value={formatPHP(totals.opexCentavos)} tone="rose" />
        <Card label="Total expenses" value={formatPHP(totals.outCentavos)} tone="rose" />
        <Card
          label="Net profit"
          value={`${totals.netCentavos < 0 ? '-' : ''}${formatPHP(Math.abs(totals.netCentavos))}`}
          tone={totals.netCentavos >= 0 ? 'emerald' : 'rose'}
        />
      </div>

      {/* Daily ledger */}
      <div className="card mt-6 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-center text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5 text-left font-semibold">Date</th>
                <th className="px-3 py-2.5 font-semibold">Webinar</th>
                <th className="px-3 py-2.5 font-semibold">VCR</th>
                <th className="px-3 py-2.5 font-semibold">DFY</th>
                <th className="px-3 py-2.5 font-semibold text-emerald-600">Income</th>
                <th className="px-3 py-2.5 font-semibold">Ads +VAT</th>
                <th className="px-3 py-2.5 font-semibold">OpEx</th>
                <th className="px-3 py-2.5 font-semibold">Net</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    No activity in this range.
                  </td>
                </tr>
              ) : (
                tableRows.map((r) => (
                  <tr
                    key={r.date}
                    className="border-b border-slate-100 text-center transition last:border-0 hover:bg-slate-50/70"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-slate-800">
                      {fmtDay(r.date)}
                    </td>
                    <Money c={r.webinarCentavos} />
                    <Money c={r.vcrCentavos} />
                    <Money c={r.dfyCentavos} />
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-emerald-600">
                      {r.incomeCentavos ? formatPHP(r.incomeCentavos) : '—'}
                    </td>
                    <Money c={r.adsCentavos} negative />
                    <Money c={r.opexCentavos} negative />
                    <td
                      className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums ${
                        r.netCentavos >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {r.netCentavos < 0 ? '-' : ''}
                      {formatPHP(Math.abs(r.netCentavos))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {tableRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 text-center text-[13px] font-semibold">
                  <td className="px-3 py-3 text-left">Total</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{dash(totals.webinarCentavos)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{dash(totals.vcrCentavos)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{dash(totals.dfyCentavos)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{formatPHP(totals.incomeCentavos)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-rose-600">{dash(totals.adsCentavos)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-rose-600">{dash(totals.opexCentavos)}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${totals.netCentavos >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {totals.netCentavos < 0 ? '-' : ''}
                    {formatPHP(Math.abs(totals.netCentavos))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        Income is counted on each payment&rsquo;s pay-day. Ads include 12% VAT (Meta PH). Operating
        expenses are your Finance expenses (single + project + recurring) on their date. Net = income −
        ads − operating expenses.
      </p>
    </div>
  );
}

function Money({ c, negative }: { c: number; negative?: boolean }) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${
        c === 0 ? 'text-slate-300' : negative ? 'text-rose-600' : 'text-slate-600'
      }`}
    >
      {c === 0 ? '—' : formatPHP(c)}
    </td>
  );
}
function dash(c: number): string {
  return c === 0 ? '—' : formatPHP(c);
}

function Card({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'emerald' | 'rose';
}) {
  const color = tone === 'emerald' ? 'text-emerald-600' : tone === 'rose' ? 'text-rose-600' : 'text-slate-900';
  return (
    <div className="card">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${color}`}>{value}</div>
    </div>
  );
}

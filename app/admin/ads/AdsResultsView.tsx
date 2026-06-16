import Link from 'next/link';
import { formatPHP } from '@/lib/config';
import { getAdsResults, type Granularity } from '@/lib/ads-results';
import { AdsTrendChart } from '@/components/AdsTrendChart';

const DAY_MS = 86_400_000;
const isDate = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}
function minusDays(dateStr: string, n: number): string {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) - n * DAY_MS).toISOString().slice(0, 10);
}

type RangeKey = '7d' | '30d' | 'mtd' | 'custom';
const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: 'Past 7 days' },
  { key: '30d', label: 'Past 30 days' },
  { key: 'mtd', label: 'MTD' },
  { key: 'custom', label: 'Custom' },
];

export async function AdsResultsView({
  searchParams,
}: {
  searchParams: { gran?: string; range?: string; from?: string; to?: string };
}) {
  const gran: Granularity = searchParams.gran === 'weekly' ? 'weekly' : 'daily';
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
    fromDate = `${today.slice(0, 7)}-01`; // 1st of the current month
  } else if (range === 'custom') {
    fromDate = isDate(searchParams.from) ? searchParams.from : minusDays(today, 29);
    toDate = isDate(searchParams.to) ? searchParams.to : today;
    if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
  } else {
    range = '30d';
    toDate = today;
    fromDate = minusDays(today, 29);
  }

  const { rows, totals } = await getAdsResults({ fromDate, toDate, granularity: gran });

  // Build hrefs that preserve the other controls.
  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams({
      view: 'results',
      gran,
      range,
      ...(range === 'custom' ? { from: fromDate, to: toDate } : {}),
      ...over,
    });
    return `/admin/ads?${p.toString()}`;
  };

  const tableRows = [...rows].reverse(); // newest first

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Budget, revenue, and ROAS over time. Spend is synced from Meta; revenue is your actual paid
        revenue (front-end + upsell) on each pay-day.
      </p>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium uppercase tracking-[0.06em] text-slate-500">Group</span>
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
          {(['daily', 'weekly'] as Granularity[]).map((g) => {
            const active = g === gran;
            return (
              <Link
                key={g}
                href={href({ gran: g })}
                scroll={false}
                style={active ? { color: '#fff' } : undefined}
                className={`rounded-full px-3 py-1 text-[11px] font-medium capitalize transition sm:text-xs ${
                  active ? 'bg-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                {g}
              </Link>
            );
          })}
        </div>

        <span className="ml-1 text-xs font-medium uppercase tracking-[0.06em] text-slate-500">
          Range
        </span>
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

      {/* Custom range picker (native GET form — no client JS) */}
      {range === 'custom' && (
        <form method="GET" action="/admin/ads" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="view" value="results" />
          <input type="hidden" name="gran" value={gran} />
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card
          label="Budget set"
          value={totals.budgetSetCentavos == null ? '—' : formatPHP(totals.budgetSetCentavos)}
        />
        <Card label="Budget spent" value={formatPHP(totals.spendCentavos)} />
        <Card label="Revenue" value={formatPHP(totals.revCentavos)} tone="emerald" />
        <Card
          label="ROAS"
          value={totals.roas == null ? '—' : `${totals.roas.toFixed(2)}×`}
          tone={totals.roas == null ? 'slate' : totals.roas >= 1 ? 'emerald' : 'rose'}
        />
        <Card label="Sales" value={totals.sales.toLocaleString()} />
      </div>

      {/* Trend chart */}
      <div className="card">
        <h3 className="mb-1 text-sm font-semibold text-slate-900">Trends</h3>
        <AdsTrendChart rows={rows} />
      </div>

      {/* Table — centered columns, row hover, horizontal scroll on mobile */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-center text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 font-semibold">{gran === 'weekly' ? 'Week' : 'Date'}</th>
                <th className="px-4 py-2.5 font-semibold">Set</th>
                <th className="px-4 py-2.5 font-semibold">Spent</th>
                <th className="px-4 py-2.5 font-semibold">Revenue</th>
                <th className="px-4 py-2.5 font-semibold">Net</th>
                <th className="px-4 py-2.5 font-semibold">ROAS</th>
                <th className="px-4 py-2.5 font-semibold">Sales</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    No data in this range.
                  </td>
                </tr>
              ) : (
                tableRows.map((r) => {
                  const net = r.revCentavos - r.spendCentavos;
                  return (
                    <tr
                      key={r.key}
                      className="border-b border-slate-100 text-center transition last:border-0 hover:bg-slate-50/70"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800">
                        {r.label}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-500">
                        {r.budgetSetCentavos == null ? '—' : formatPHP(r.budgetSetCentavos)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-600">
                        {formatPHP(r.spendCentavos)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-semibold tabular-nums text-emerald-600">
                        {formatPHP(r.revCentavos)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-2.5 font-medium tabular-nums ${
                          net >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {net >= 0 ? '' : '-'}
                        {formatPHP(Math.abs(net))}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-2.5 font-semibold tabular-nums ${
                          r.roas == null ? 'text-slate-400' : r.roas >= 1 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {r.roas == null ? '—' : `${r.roas.toFixed(2)}×`}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-600">
                        {r.sales}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
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
  const color =
    tone === 'emerald' ? 'text-emerald-600' : tone === 'rose' ? 'text-rose-600' : 'text-slate-900';
  return (
    <div className="card">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${color}`}>{value}</div>
    </div>
  );
}

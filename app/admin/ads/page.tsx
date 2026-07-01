import { Fragment } from 'react';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { formatPHP } from '@/lib/config';
import { RefreshButton } from './RefreshButton';
import { AdsResultsView } from './AdsResultsView';
import { AdPreviewCell } from '@/components/admin/ads/AdPreviewCell';
import {
  getAdsReportCached,
  ADS_RANGES,
  type AdsRangeKey,
  type AdEntity,
} from '@/lib/meta-ads';

export const dynamic = 'force-dynamic';

/* Live Meta Ads metrics for the BOSSLABS AI | SALES campaign — pulled straight
 * from the Graph API (campaign → ad sets → ads). Pure metrics: spend, results,
 * cost/result, link CTR, CPM, frequency, ROAS. No AI, no recommendations. */

function isRangeKey(v: string | undefined): v is AdsRangeKey {
  return !!v && ADS_RANGES.some((r) => r.key === v);
}

/* ── formatting ──────────────────────────────────────────────────────────── */
const peso = (n: number) => formatPHP(Math.round(n * 100));
const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(2)}%`);
const dec = (n: number | null) => (n == null ? '—' : n.toFixed(2));
const roasf = (n: number | null) => (n == null ? '—' : `${n.toFixed(2)}×`);
const intf = (n: number) => Math.round(n).toLocaleString();

/* ── colour logic (no AI — simple, defensible thresholds) ────────────────── */
type Tone = 'good' | 'warn' | 'bad' | 'muted';
const toneCls: Record<Tone, string> = {
  good: 'text-emerald-600',
  warn: 'text-amber-600',
  bad: 'text-rose-600',
  muted: 'text-slate-400',
};
const roasTone = (n: number | null): Tone =>
  n == null ? 'muted' : n >= 1.5 ? 'good' : n >= 1 ? 'warn' : 'bad';
const freqTone = (n: number | null): Tone =>
  n == null ? 'muted' : n < 2 ? 'good' : n < 3.5 ? 'warn' : 'bad';
/** cost-per-result vs the campaign average (lower is better). */
const cprTone = (n: number | null, benchmark: number | null): Tone => {
  if (n == null) return 'muted';
  if (!benchmark) return 'muted';
  if (n <= benchmark) return 'good';
  if (n <= benchmark * 1.5) return 'warn';
  return 'bad';
};

function AdsTabs({ view }: { view: 'live' | 'results' }) {
  const tabs = [
    { key: 'live' as const, label: 'Live (Meta)', href: '/admin/ads' },
    { key: 'results' as const, label: 'Results over time', href: '/admin/ads?view=results' },
  ];
  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200">
      {tabs.map((t) => {
        const active = t.key === view;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition ${
              active
                ? 'border-cyan-600 text-cyan-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

export default async function AdsPage({
  searchParams,
}: {
  searchParams: { range?: string; active?: string; view?: string; gran?: string; from?: string; to?: string };
}) {
  requireAdmin();

  // Tabbed: "Live (Meta)" (default) and "Results over time" (stored daily/weekly
  // spend + revenue + ROAS). Branch before the Meta fetch so the results tab
  // doesn't hit the Graph API.
  if (searchParams?.view === 'results') {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Ads</h1>
        </header>
        <AdsTabs view="results" />
        <AdsResultsView searchParams={searchParams} />
      </div>
    );
  }

  const rangeKey: AdsRangeKey = isRangeKey(searchParams?.range) ? searchParams.range : 'all';
  const activeOnly = searchParams?.active === '1';
  const report = await getAdsReportCached(rangeKey);

  // Active-only filters the table rows (the summary stays campaign-level).
  const adsets = report.configured
    ? activeOnly
      ? report.adsets.filter((a) => a.active)
      : report.adsets
    : [];
  const ads = report.configured
    ? activeOnly
      ? report.ads.filter((a) => a.active)
      : report.ads
    : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Ads</h1>
          <p className="mt-1 text-sm text-slate-500">
            Live Meta performance for <strong>BOSSLABS AI | SALES</strong> — campaign, ad sets, and
            ads. Pulled directly from Meta; no data stored.
          </p>
        </div>
      </header>

      <AdsTabs view="live" />

      {!report.configured ? (
        <ConnectTokenCard />
      ) : (
        <>
          {/* Controls: period · active-only · refresh */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-slate-500">
              Period
            </span>
            <div className="inline-flex flex-wrap rounded-full border border-slate-200 bg-slate-50 p-0.5">
              {ADS_RANGES.map((r) => {
                const active = r.key === rangeKey;
                return (
                  <Link
                    key={r.key}
                    href={`/admin/ads?range=${r.key}${activeOnly ? '&active=1' : ''}`}
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

            {/* Active-only toggle */}
            <Link
              href={`/admin/ads?range=${rangeKey}${activeOnly ? '' : '&active=1'}`}
              scroll={false}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition sm:text-xs ${
                activeOnly
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${activeOnly ? 'bg-emerald-500' : 'bg-slate-400'}`}
              />
              Active only
            </Link>

            <div className="ml-auto flex items-center gap-3">
              <span className="text-[11px] text-slate-400">{report.rangeLabel} · live from Meta</span>
              <RefreshButton />
            </div>
          </div>

          {report.error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">
              Meta returned an error: {report.error}
            </div>
          )}

          <AdsDashboard campaign={report.campaign} adCount={ads.length} activeOnly={activeOnly} />

          <AdsTable campaign={report.campaign} adsets={adsets} ads={ads} />
        </>
      )}
    </div>
  );
}

/* ── summary dashboard (campaign totals) ─────────────────────────────────── */
function AdsDashboard({
  campaign,
  adCount,
  activeOnly,
}: {
  campaign: AdEntity | null;
  adCount: number;
  activeOnly: boolean;
}) {
  if (!campaign) {
    return (
      <div className="card text-center text-sm text-slate-500">
        No campaign data in this period.
      </div>
    );
  }
  const c = campaign;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
      <Stat label="Ad spend" value={peso(c.spend)} />
      <Stat label="Results" value={intf(c.results)} sub={`${adCount} ${activeOnly ? 'active ' : ''}ads`} />
      <Stat label="Cost / result" value={c.costPerResult == null ? '—' : peso(c.costPerResult)} />
      <Stat label="CTR (link)" value={pct(c.linkCtr)} />
      <Stat label="CPM" value={c.cpm == null ? '—' : peso(c.cpm)} />
      <Stat label="Frequency" value={dec(c.frequency)} tone={freqTone(c.frequency)} />
      <Stat label="ROAS" value={roasf(c.roas)} tone={roasTone(c.roas)} />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}) {
  return (
    <div className="card min-w-0">
      <div
        className={`truncate text-base font-semibold leading-tight tracking-tight tabular-nums sm:text-xl ${
          tone ? toneCls[tone] : 'text-slate-900'
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.06em] text-slate-500 sm:text-[11px]">
        {label}
      </div>
      {sub && <div className="mt-1 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

/* ── hierarchical table: campaign → ad sets → ads ────────────────────────── */
function AdsTable({
  campaign,
  adsets,
  ads,
}: {
  campaign: AdEntity | null;
  adsets: AdEntity[];
  ads: AdEntity[];
}) {
  const benchmark = campaign?.costPerResult ?? null;
  const sortedAdsets = [...adsets].sort((a, b) => b.spend - a.spend);
  const adsByParent = new Map<string, AdEntity[]>();
  for (const ad of ads) {
    const key = ad.parentId ?? 'orphan';
    const list = adsByParent.get(key) ?? [];
    list.push(ad);
    adsByParent.set(key, list);
  }
  for (const list of adsByParent.values()) list.sort((a, b) => b.spend - a.spend);
  const orphans = adsByParent.get('orphan') ?? [];

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/60 text-[10px] uppercase tracking-[0.06em] text-slate-500">
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Spend</th>
              <th className="px-3 py-2 text-right font-medium">Results</th>
              <th className="px-3 py-2 text-right font-medium">Cost / result</th>
              <th className="px-3 py-2 text-right font-medium">CTR (link)</th>
              <th className="px-3 py-2 text-right font-medium">CPM</th>
              <th className="px-3 py-2 text-right font-medium">Freq.</th>
              <th className="px-3 py-2 text-right font-medium">Reach</th>
              <th className="px-3 py-2 text-right font-medium">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {campaign && <Row e={campaign} benchmark={benchmark} indent={0} bold tint="bg-slate-50" />}
            {sortedAdsets.map((aset) => (
              <Fragment key={aset.id}>
                <Row e={aset} benchmark={benchmark} indent={1} tint="bg-slate-50/40" />
                {(adsByParent.get(aset.id) ?? []).map((ad) => (
                  <Row key={ad.id} e={ad} benchmark={benchmark} indent={2} />
                ))}
              </Fragment>
            ))}
            {orphans.length > 0 &&
              orphans.map((ad) => <Row key={ad.id} e={ad} benchmark={benchmark} indent={2} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  e,
  benchmark,
  indent,
  bold,
  tint,
}: {
  e: AdEntity;
  benchmark: number | null;
  indent: number;
  bold?: boolean;
  tint?: string;
}) {
  const levelLabel = e.level === 'campaign' ? 'Campaign' : e.level === 'adset' ? 'Ad set' : 'Ad';
  return (
    <tr className={`border-b border-slate-100 ${tint ?? ''}`}>
      <td className="px-3 py-2" style={{ paddingLeft: `${12 + indent * 16}px` }}>
        <div className="flex items-center gap-2">
          {e.level === 'ad' && (
            <AdPreviewCell adId={e.id} thumbnailUrl={e.thumbnailUrl ?? null} adName={e.name} />
          )}
          <div className="min-w-0">
            <div className={`truncate ${bold ? 'font-semibold text-slate-900' : 'text-slate-800'}`} style={{ maxWidth: 260 }}>
              {e.name}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">{levelLabel}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            e.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${e.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          {e.active ? 'Active' : 'Paused'}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{peso(e.spend)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-900">{intf(e.results)}</td>
      <td className={`px-3 py-2 text-right tabular-nums font-medium ${toneCls[cprTone(e.costPerResult, benchmark)]}`}>
        {e.costPerResult == null ? '—' : peso(e.costPerResult)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{pct(e.linkCtr)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
        {e.cpm == null ? '—' : peso(e.cpm)}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums ${toneCls[freqTone(e.frequency)]}`}>
        {dec(e.frequency)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{intf(e.reach)}</td>
      <td className={`px-3 py-2 text-right tabular-nums font-medium ${toneCls[roasTone(e.roas)]}`}>
        {roasf(e.roas)}
      </td>
    </tr>
  );
}

function ConnectTokenCard() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 text-center">
      <h2 className="text-base font-semibold text-slate-900">Connect Meta to see live ads</h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] text-slate-500">
        Add <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px]">META_ADS_TOKEN</code> to
        the environment to pull live campaign, ad-set, and ad metrics. It&rsquo;s the same System-User
        token (with <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px]">ads_read</code>)
        used by the daily ROAS sync — once it&rsquo;s set, this page lights up automatically.
      </p>
    </div>
  );
}

import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { aggregateSurfaceHeatmap } from '@/lib/recordings-heatmap';
import { HeatmapCanvas } from '@/components/HeatmapCanvas';
import { FUNNEL_TABS, isFunnelTab, tabPages, type FunnelTab } from '@/lib/recordings-funnel';

export const dynamic = 'force-dynamic';

const PAGE_LABEL: Record<string, string> = {
  '/': 'Homepage (₱999 funnel entry)',
  '/checkout': 'Checkout',
  '/oto': 'Order bump (/oto)',
};

// Heatmap tabs are the per-surface ones (a heatmap is always one page).
const HEATMAP_TABS = FUNNEL_TABS.filter((t) => t.key !== 'all');

export default async function HeatmapPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  requireAdmin();
  const sp = await searchParams;
  const tab: FunnelTab = isFunnelTab(sp.tab) && sp.tab !== 'all' ? sp.tab : 'main';

  // One consolidated heatmap per recorded surface that feeds this tab.
  const pages = tabPages(tab);
  const surfaces = await Promise.all(pages.map((p) => aggregateSurfaceHeatmap(p)));
  const hasAny = surfaces.some((s) => s.chunkCount > 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Consolidated heatmap
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Every click, tap, and mouse movement across <strong>all</strong> recorded sessions,
            folded into one map per page (scroll position included). Hotter = more activity.
            Admin-only — adds nothing to your funnel&rsquo;s load.
          </p>
        </div>
        <Link
          href={`/admin/recordings?tab=${tab}`}
          className="rounded-full bg-slate-100 px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-200"
        >
          ← Back to sessions
        </Link>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {HEATMAP_TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={`/admin/recordings/heatmap?tab=${t.key}`}
              title={t.hint}
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

      {!hasAny ? (
        <div className="card text-center text-sm text-slate-500">
          No recorded activity for this surface yet. Turn recording on and let some visitors
          through, then come back.
        </div>
      ) : (
        <div className="space-y-10">
          {surfaces.map((s) => (
            <section key={s.page} className="space-y-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-lg font-semibold text-slate-900">
                  {PAGE_LABEL[s.page] ?? s.page}
                </h2>
                <span className="text-[12px] text-slate-500">
                  {s.sessionCount} session{s.sessionCount === 1 ? '' : 's'} · {s.clickCount} clicks ·{' '}
                  {s.chunkCount} chunks
                </span>
              </div>
              {s.chunkCount === 0 ? (
                <div className="card text-center text-[13px] text-slate-400">
                  No recordings on {s.page} yet.
                </div>
              ) : (
                <HeatmapCanvas
                  backdrop={s.backdrop}
                  recordedWidth={s.recordedWidth}
                  clicks={s.clicks}
                  moves={s.moves}
                />
              )}
            </section>
          ))}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-slate-400">
        Coordinates are page-absolute (scroll folded in). The backdrop is a representative captured
        snapshot of the page; click/move density is aggregated across every recorded visit. Input
        values stay masked — heatmaps use position only, never what was typed.
      </p>
    </div>
  );
}

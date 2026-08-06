'use client';

import { useState } from 'react';
import type { Tier, VerdictResult } from '@/lib/council/types';

/** Clickable headline → fixed right-side drawer with the ad's full council
 *  advice. Same overlay pattern as AdPreviewCell's modal (fixed inset-0
 *  scrim, click-outside-to-close, inner panel stops propagation) but docked
 *  to the right edge instead of centered. History fetches lazily on first
 *  open from GET /api/admin/council/ad-history. */

const TIER_SQUARE: Record<Tier, string> = {
  WINNING: 'bg-emerald-500',
  WATCH: 'bg-amber-500',
  LOSER: 'bg-rose-500',
  LEARNING: 'bg-sky-500',
};

const METRIC_LABELS: Record<string, string> = {
  cpp_7d: 'CPP (7d)',
  cpp_prior_7d: 'CPP (prior 7d)',
  cpp_delta_pct: 'CPP delta',
  spend_share_7d: 'Spend share (7d)',
  spend_share_delta: 'Spend share delta',
  freq_7d: 'Frequency (7d)',
  ctr_7d: 'CTR (7d)',
  lifetime_purchases: 'Lifetime purchases',
};

function formatMetric(key: string, value: number | null): string {
  if (value == null) return '—';
  switch (key) {
    case 'cpp_7d':
    case 'cpp_prior_7d':
      return `₱${Math.round(value / 100).toLocaleString()}`;
    case 'cpp_delta_pct':
      return `${value > 0 ? '+' : ''}${value}%`;
    case 'spend_share_7d':
      return `${(value * 100).toFixed(1)}%`;
    case 'spend_share_delta':
      return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
    case 'freq_7d':
      return value.toFixed(2);
    case 'ctr_7d':
      return `${value.toFixed(2)}%`;
    default:
      return value.toLocaleString();
  }
}

export function AdviseDrawer({
  adId,
  adName,
  headline,
}: {
  adId: string;
  adName: string;
  headline: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<VerdictResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onOpen() {
    setOpen(true);
    if (history || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/council/ad-history?adId=${encodeURIComponent(adId)}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(json)) {
        setError((json && json.error) || `HTTP ${res.status}`);
      } else {
        setHistory(json as VerdictResult[]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  const latest = history?.[0] ?? null;
  const strip = history ? [...history].slice(0, 30).reverse() : []; // oldest -> newest (newest right)

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        title={headline}
        className="block max-w-[220px] truncate text-left text-[12px] text-slate-600 underline-offset-2 hover:text-cyan-700 hover:underline"
      >
        {headline}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-[14px] font-semibold text-slate-900">{adName}</h2>
                <p className="text-[11px] text-slate-500">Ad ID {adId}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loading && <p className="text-[13px] text-slate-500">Loading…</p>}

              {!loading && error && (
                <div>
                  <p className="text-[13px] font-medium text-rose-700">Couldn&rsquo;t load history</p>
                  <p className="mt-1 text-[12px] text-slate-500">{error}</p>
                </div>
              )}

              {!loading && !error && !latest && (
                <p className="text-[13px] text-slate-500">No verdict history yet for this ad.</p>
              )}

              {!loading && !error && latest && (
                <div className="space-y-5">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">
                      Interpretation
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-700">{latest.interpretation}</p>
                  </div>

                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">
                      Deciding metrics
                    </div>
                    <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
                      {Object.entries(latest.decidingMetrics).map(([k, val]) => (
                        <div key={k} className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-1">
                          <dt className="truncate text-[11px] text-slate-500">{METRIC_LABELS[k] ?? k}</dt>
                          <dd className="whitespace-nowrap text-[12px] font-medium tabular-nums text-slate-800">
                            {formatMetric(k, val)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">
                      Tier-flip condition
                    </div>
                    <p className="mt-1 text-[13px] text-slate-700">{latest.tierFlipCondition}</p>
                  </div>

                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">
                      Last {strip.length} day{strip.length === 1 ? '' : 's'}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-[3px]">
                      {strip.map((v) => (
                        <span
                          key={v.date}
                          title={v.date}
                          className={`h-4 w-4 rounded-sm ${TIER_SQUARE[v.verdict]}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

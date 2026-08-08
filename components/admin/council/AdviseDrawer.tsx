'use client';

import { useEffect, useState } from 'react';
import type { Tier, VerdictResult } from '@/lib/council/types';
import type { CreativeDetail } from '@/lib/council/creative-context';

/** Clickable headline → FULL-WINDOW modal with the ad's full council advice.
 *  Fills the whole viewport (readable centred column inside, two columns on
 *  desktop, single column on mobile), sticky header, Escape-to-close and
 *  body-scroll lock. History fetches lazily on first open from
 *  GET /api/admin/council/ad-history. */

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
  const [creative, setCreative] = useState<CreativeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Full-window modal manners: Escape closes it, and the page behind it
  // doesn't scroll while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function onOpen() {
    setOpen(true);
    if (history || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/council/ad-history?adId=${encodeURIComponent(adId)}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !Array.isArray(json.history)) {
        setError((json && json.error) || `HTTP ${res.status}`);
      } else {
        setHistory(json.history as VerdictResult[]);
        setCreative((json.creative as CreativeDetail | null) ?? null);
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
        className="line-clamp-2 max-w-[240px] text-left text-[12px] leading-snug text-slate-600 underline-offset-2 hover:text-cyan-700 hover:underline"
      >
        {headline}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-semibold text-slate-900 sm:text-base">{adName}</h2>
                <p className="text-[11px] text-slate-500">Ad ID {adId}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
            <div className="mx-auto w-full max-w-5xl">
              {loading && <p className="text-[13px] text-slate-500">Loading…</p>}

              {!loading && error && (
                <div>
                  <p className="text-[13px] font-medium text-rose-700">Couldn&rsquo;t load history</p>
                  <p className="mt-1 text-[12px] text-slate-500">{error}</p>
                </div>
              )}

              {!loading && !error && !latest && !creative && (
                <p className="text-[13px] text-slate-500">No verdict history yet for this ad.</p>
              )}

              {!loading && !error && (latest || creative) && (
                <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
                  {/* LEFT — what the creative IS */}
                  <div className="space-y-5">
                    <div>
                      <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">
                        Creative
                      </div>
                      {creative ? (
                        <>
                          <div className="mt-1.5">
                            <span className="inline-flex items-center rounded-full bg-cyan-50 px-2.5 py-0.5 text-[13px] font-semibold text-cyan-800 ring-1 ring-inset ring-cyan-600/20">
                              {creative.creativeTag}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {[creative.format, creative.angle, creative.persona, creative.awarenessLevel]
                              .filter(Boolean)
                              .map((t) => (
                                <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] capitalize text-slate-700">
                                  {t.replace(/-/g, ' ')}
                                </span>
                              ))}
                            {creative.visualQuality != null && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                                quality {creative.visualQuality}/5
                              </span>
                            )}
                            {creative.onBrand === true && (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">on-brand</span>
                            )}
                            {creative.onBrand === false && (
                              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">off-brand</span>
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="mt-1 text-[13px] text-slate-400">Not analysed yet.</p>
                      )}
                    </div>

                    {creative?.hook && (
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">Hook</div>
                        <p className="mt-1 text-[14px] italic leading-relaxed text-slate-700">&ldquo;{creative.hook}&rdquo;</p>
                      </div>
                    )}
                    {creative && creative.tags.length > 0 && (
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                        {creative.tags.map((t) => (
                          <span key={t} className="text-[11px] text-slate-400">#{t.replace(/\s+/g, '')}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* RIGHT — what the council decided */}
                  <div className="space-y-6">
                    {latest ? (
                      <>
                        <div>
                          <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">
                            Interpretation
                          </div>
                          <p className="mt-1 text-[14px] leading-relaxed text-slate-700">{latest.interpretation}</p>
                        </div>

                        <div>
                          <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">
                            Deciding metrics
                          </div>
                          <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
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
                          <p className="mt-1 text-[14px] leading-relaxed text-slate-700">{latest.tierFlipCondition}</p>
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
                      </>
                    ) : (
                      <p className="text-[13px] text-slate-500">No verdict history yet for this ad.</p>
                    )}
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

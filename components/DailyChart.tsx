'use client';

import { useState } from 'react';

type Day = { date: string; total: number; paid: number; revenuePhp: number };

function fmtDate(date: string): string {
  if (!date) return '';
  return new Date(date + 'T00:00:00+08:00').toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  });
}

function peso(php: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
  }).format(Math.round(php));
}

/** Least-squares linear fit over y-values (x = index). Returns the fitted
 *  start/end values + slope, or null when there's nothing to fit. */
function trend(ys: number[]): { start: number; end: number; slope: number } | null {
  const n = ys.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += ys[i];
    sxy += i * ys[i];
    sxx += i * i;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { start: intercept, end: intercept + slope * (n - 1), slope };
}

/** Up / down / flat arrow for a slope (per-day change). */
function TrendArrow({ slope }: { slope: number | undefined }) {
  if (slope == null || Math.abs(slope) < 0.01) {
    return <span className="font-semibold text-slate-400">→ flat</span>;
  }
  return slope > 0 ? (
    <span className="font-semibold text-emerald-600">↗ up</span>
  ) : (
    <span className="font-semibold text-rose-500">↘ down</span>
  );
}

/**
 * DailyChart — inline SVG bar chart (no library). Each day is a stacked
 * column: slate bar for total signups, emerald bar on top for paid. Hovering
 * a column shows an instant styled tooltip with the exact values and dims
 * the other bars.
 */
export function DailyChart({ data, max }: { data: Day[]; max: number }) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 720;
  const H = 140;
  const padX = 4;
  const padY = 18;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const slotW = innerW / Math.max(1, data.length);
  const barW = Math.max(4, slotW * 0.7);

  const totalRevenue = data.reduce((s, d) => s + d.revenuePhp, 0);
  const totalPaid = data.reduce((s, d) => s + d.paid, 0);

  // Best-fit trend lines over the visible window.
  const totalTrend = trend(data.map((d) => d.total));
  const paidTrend = trend(data.map((d) => d.paid));
  const xOf = (i: number) => padX + slotW * i + slotW / 2;
  const yOf = (v: number) => padY + innerH - (Math.max(0, Math.min(max, v)) / max) * innerH;

  const active = hover != null ? data[hover] : null;
  // Tooltip x as a % of chart width, clamped so it never overflows an edge.
  const rawLeft = hover != null ? ((padX + slotW * hover + slotW / 2) / W) * 100 : 0;
  const tipLeft = Math.min(86, Math.max(14, rawLeft));

  return (
    <div className="mt-4">
      <div className="relative overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full text-slate-300">
          {[0.25, 0.5, 0.75, 1].map((t) => (
            <line
              key={t}
              x1={padX}
              x2={W - padX}
              y1={padY + innerH * (1 - t)}
              y2={padY + innerH * (1 - t)}
              stroke="currentColor"
              strokeWidth="0.5"
              opacity="0.3"
              strokeDasharray="2 3"
            />
          ))}
          {data.map((d, i) => {
            const x = padX + slotW * i + (slotW - barW) / 2;
            const totalH = (d.total / max) * innerH;
            const paidH = (d.paid / max) * innerH;
            const totalY = padY + innerH - totalH;
            const paidY = padY + innerH - paidH;
            const dim = hover != null && hover !== i;
            return (
              <g
                key={d.date}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Full-height transparent hit area — hovering anywhere in the
                    column triggers the tooltip, not just the thin bar. */}
                <rect
                  x={padX + slotW * i}
                  y={padY}
                  width={slotW}
                  height={innerH}
                  fill="transparent"
                />
                {d.total > 0 && (
                  <rect
                    x={x}
                    y={totalY}
                    width={barW}
                    height={totalH}
                    rx="1"
                    fill="#CBD5E1"
                    opacity={dim ? 0.45 : 1}
                  />
                )}
                {d.paid > 0 && (
                  <rect
                    x={x}
                    y={paidY}
                    width={barW}
                    height={paidH}
                    rx="1"
                    fill="#10B981"
                    opacity={dim ? 0.45 : 1}
                  />
                )}
              </g>
            );
          })}
          {/* Trend lines (best-fit). Drawn over the bars in darker shades. */}
          {totalTrend && data.length > 1 && (
            <line
              x1={xOf(0)}
              y1={yOf(totalTrend.start)}
              x2={xOf(data.length - 1)}
              y2={yOf(totalTrend.end)}
              stroke="#475569"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray="4 3"
              opacity={hover != null ? 0.35 : 0.9}
            />
          )}
          {paidTrend && data.length > 1 && (
            <line
              x1={xOf(0)}
              y1={yOf(paidTrend.start)}
              x2={xOf(data.length - 1)}
              y2={yOf(paidTrend.end)}
              stroke="#047857"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity={hover != null ? 0.35 : 0.95}
            />
          )}
          <text x={padX} y={H - 4} fontSize="9" fill="#94A3B8" textAnchor="start">
            {fmtDate(data[0]?.date)}
          </text>
          {data.length > 2 && (
            <text x={W / 2} y={H - 4} fontSize="9" fill="#94A3B8" textAnchor="middle">
              {fmtDate(data[Math.floor(data.length / 2)]?.date)}
            </text>
          )}
          <text x={W - padX} y={H - 4} fontSize="9" fill="#94A3B8" textAnchor="end">
            {data.length === 1 ? fmtDate(data[0]?.date) : 'Today'}
          </text>
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-lg"
            style={{ left: `${tipLeft}%` }}
          >
            <div className="font-semibold text-slate-900">{fmtDate(active.date)}</div>
            <div className="mt-1.5 flex items-center gap-1.5 text-slate-600">
              <span className="inline-block h-2 w-2 rounded-sm bg-slate-300" />
              {active.total} signup{active.total === 1 ? '' : 's'}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-slate-600">
              <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />
              {active.paid} paid
            </div>
            <div className="mt-1.5 font-semibold text-emerald-700">
              {peso(active.revenuePhp)}
            </div>
          </div>
        )}
      </div>
      {/* Trend legend — also doubles as the up/down indicator. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="6" className="overflow-visible">
            <line x1="0" y1="3" x2="16" y2="3" stroke="#475569" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
          </svg>
          Signups trend <TrendArrow slope={totalTrend?.slope} />
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="6">
            <line x1="0" y1="3" x2="16" y2="3" stroke="#047857" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Paid trend <TrendArrow slope={paidTrend?.slope} />
        </span>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>
          {data.length} day{data.length === 1 ? '' : 's'} · hover bars for daily detail
        </span>
        <span>
          <strong className="text-slate-700">{totalPaid}</strong> paid ·{' '}
          <strong className="text-slate-700">{peso(totalRevenue)}</strong> revenue
        </span>
      </div>
    </div>
  );
}

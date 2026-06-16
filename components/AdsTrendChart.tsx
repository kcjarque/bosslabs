'use client';

import { useState } from 'react';

type Row = {
  key: string;
  label: string;
  spendCentavos: number;
  revCentavos: number;
  roas: number | null;
};

const peso = (centavos: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
  }).format(Math.round(centavos / 100));

/**
 * Trends as three lines: Budget (spend) + Revenue on the ₱ axis, ROAS on a
 * secondary ×-axis with a dashed 1× breakeven line. Hovering a bucket shows a
 * tooltip and a guide line. Chronological left→right. Client component so hover
 * is instant.
 */
export function AdsTrendChart({ rows }: { rows: Row[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const N = rows.length;
  const padX = 24;
  const padTop = 18;
  const padBottom = 30;
  const H = 280;
  const W = 760; // fixed viewBox → stable size regardless of bucket count
  const innerH = H - padTop - padBottom;
  const baseY = padTop + innerH;

  const spend = rows.map((d) => d.spendCentavos / 100);
  const rev = rows.map((d) => d.revCentavos / 100);
  const leftMax = Math.max(1, ...spend, ...rev) * 1.12;
  const roasVals = rows.map((d) => d.roas).filter((r): r is number => r != null);
  const rightMax = Math.max(2, Math.ceil(Math.max(1, ...roasVals)));

  // x positions — centered points across the inner width (handles N===1).
  const innerW = W - padX * 2;
  const cx = (i: number) => (N <= 1 ? W / 2 : padX + (innerW * i) / (N - 1));
  const yLeft = (php: number) => padTop + innerH * (1 - php / leftMax);
  const yRoas = (v: number) => padTop + innerH * (1 - v / rightMax);

  // Build a polyline path for a left-axis series.
  const linePath = (vals: number[]) =>
    vals.map((v, i) => `${i ? 'L' : 'M'} ${cx(i).toFixed(1)} ${yLeft(v).toFixed(1)}`).join(' ');

  // ROAS line, broken where a bucket has no ROAS.
  const roasSegments: string[] = [];
  let cur: string[] = [];
  rows.forEach((d, i) => {
    if (d.roas == null) {
      if (cur.length) {
        roasSegments.push(cur.join(' '));
        cur = [];
      }
      return;
    }
    cur.push(`${cur.length ? 'L' : 'M'} ${cx(i).toFixed(1)} ${yRoas(d.roas).toFixed(1)}`);
  });
  if (cur.length) roasSegments.push(cur.join(' '));

  const labelEvery = Math.max(1, Math.ceil(N / 10));
  const pesoK = (php: number) =>
    php >= 1000 ? `₱${(php / 1000).toFixed(php >= 10000 ? 0 : 1)}k` : `₱${Math.round(php)}`;

  const active = hover != null ? rows[hover] : null;
  const tipLeftPct = hover != null ? Math.min(86, Math.max(14, (cx(hover) / W) * 100)) : 0;

  if (N === 0) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50/30 p-8 text-center text-sm text-slate-400">
        No data in this range yet.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 bg-slate-400" />Budget
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 bg-emerald-500" />Revenue
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 bg-cyan-600" />ROAS
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-3"
            style={{
              background:
                'repeating-linear-gradient(to right,#f59e0b 0,#f59e0b 3px,transparent 3px,transparent 6px)',
            }}
          />
          1× breakeven
        </span>
      </div>

      <div className="relative rounded-xl border border-slate-100 bg-slate-50/30 p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full text-slate-300">
          {/* left-axis gridlines */}
          {[0.25, 0.5, 0.75, 1].map((t) => (
            <line
              key={t}
              x1={padX}
              x2={W - padX}
              y1={baseY - innerH * t}
              y2={baseY - innerH * t}
              stroke="currentColor"
              strokeWidth="0.5"
              opacity="0.4"
              strokeDasharray="2 3"
            />
          ))}
          <line x1={padX} x2={W - padX} y1={baseY} y2={baseY} stroke="#cbd5e1" strokeWidth="1" />

          {/* ROAS = 1 breakeven */}
          <line
            x1={padX}
            x2={W - padX}
            y1={yRoas(1)}
            y2={yRoas(1)}
            stroke="#f59e0b"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.85"
          />

          {/* hover guide */}
          {hover != null && (
            <line
              x1={cx(hover)}
              x2={cx(hover)}
              y1={padTop}
              y2={baseY}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.6"
            />
          )}

          {/* Budget + Revenue lines */}
          <path d={linePath(spend)} fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
          <path d={linePath(rev)} fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />

          {/* ROAS line */}
          {roasSegments.map((seg, i) => (
            <path key={i} d={seg} fill="none" stroke="#0891b2" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
          ))}

          {/* point dots on the hovered bucket */}
          {hover != null && (
            <>
              <circle cx={cx(hover)} cy={yLeft(spend[hover])} r="3" fill="#64748b" />
              <circle cx={cx(hover)} cy={yLeft(rev[hover])} r="3" fill="#10b981" />
              {rows[hover].roas != null && (
                <circle cx={cx(hover)} cy={yRoas(rows[hover].roas!)} r="3" fill="#0891b2" />
              )}
            </>
          )}

          {/* x-axis labels */}
          {rows.map((d, i) =>
            i % labelEvery === 0 || i === N - 1 ? (
              <text key={'x' + d.key} x={cx(i)} y={H - 10} fontSize="9" fill="#94a3b8" textAnchor="middle">
                {d.label.replace('Week of ', '')}
              </text>
            ) : null,
          )}

          {/* axis max labels */}
          <text x={padX} y={padTop - 6} fontSize="9" fill="#94a3b8" textAnchor="start">
            {pesoK(leftMax)}
          </text>
          <text x={W - padX} y={padTop - 6} fontSize="9" fill="#0891b2" textAnchor="end">
            {rightMax}×
          </text>

          {/* hover hit areas */}
          {rows.map((d, i) => {
            const half = N <= 1 ? innerW / 2 : innerW / (N - 1) / 2;
            return (
              <rect
                key={'h' + d.key}
                x={cx(i) - half}
                y={padTop}
                width={Math.max(8, half * 2)}
                height={innerH}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-lg"
            style={{ left: `${tipLeftPct}%` }}
          >
            <div className="font-semibold text-slate-900">{active.label}</div>
            <div className="mt-1.5 flex items-center gap-1.5 text-slate-600">
              <span className="inline-block h-0.5 w-3 bg-slate-400" />Budget {peso(active.spendCentavos)}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-slate-600">
              <span className="inline-block h-0.5 w-3 bg-emerald-500" />Revenue {peso(active.revCentavos)}
            </div>
            <div className="mt-1 font-semibold text-cyan-700">
              ROAS {active.roas == null ? '—' : `${active.roas.toFixed(2)}×`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
 * One combo chart, dual-axis:
 *   • LEFT (₱): Budget + Revenue as lines (Revenue filled — the gap is profit).
 *   • RIGHT (×): ROAS as BARS so its magnitude/"gravity" reads at a glance,
 *     green ≥1× / red <1×, with a dashed 1× breakeven. Bars sit behind the
 *     lines (low opacity) so the two encodings never get confused.
 * Shared hover guide + one tooltip (Revenue / Budget / Net / ROAS). Fixed
 * viewBox + w-full → mobile-responsive.
 */
export function AdsTrendChart({ rows }: { rows: Row[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const N = rows.length;
  const W = 720;
  const padX = 14;
  const padTop = 18;
  const padBottom = 26;
  const H = 296;
  const innerH = H - padTop - padBottom;
  const baseY = padTop + innerH;
  const innerW = W - padX * 2;

  const spend = rows.map((d) => d.spendCentavos / 100);
  const rev = rows.map((d) => d.revCentavos / 100);
  const leftMax = Math.max(1, ...spend, ...rev) * 1.12;
  const roasVals = rows.map((d) => d.roas).filter((r): r is number => r != null);
  const rightMax = Math.max(2, Math.ceil(Math.max(1, ...roasVals)));

  // Slot-centered x so bars and line points align perfectly (no edge clipping).
  const slotW = innerW / Math.max(1, N);
  const x = (i: number) => padX + slotW * (i + 0.5);
  const yL = (php: number) => baseY - (php / leftMax) * innerH;
  const yR = (v: number) => baseY - (Math.min(v, rightMax) / rightMax) * innerH;
  const barW = Math.min(24, slotW * 0.6);

  const linePath = (vals: number[]) =>
    vals.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${yL(v).toFixed(1)}`).join(' ');
  const revArea =
    N > 0
      ? `M ${x(0).toFixed(1)} ${baseY} ${rev
          .map((v, i) => `L ${x(i).toFixed(1)} ${yL(v).toFixed(1)}`)
          .join(' ')} L ${x(N - 1).toFixed(1)} ${baseY} Z`
      : '';

  const labelEvery = Math.max(1, Math.ceil(N / 8));
  const pesoK = (php: number) =>
    php >= 1000 ? `₱${(php / 1000).toFixed(php >= 10000 ? 0 : 1)}k` : `₱${Math.round(php)}`;

  const active = hover != null ? rows[hover] : null;
  const net = active ? active.revCentavos - active.spendCentavos : 0;
  const tipLeftPct = hover != null ? Math.min(84, Math.max(16, (x(hover) / W) * 100)) : 0;

  if (N === 0) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50/30 p-8 text-center text-sm text-slate-400">
        No data in this range yet.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2.5 rounded-sm bg-emerald-400/60" />Revenue
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 bg-slate-400" />Budget
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2 rounded-[1px] bg-cyan-500/50" />ROAS (bars)
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

      <div className="relative rounded-xl border border-slate-100 bg-slate-50/30 p-1.5">
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

          {/* ROAS bars (behind), green ≥1× / red <1× */}
          {rows.map((d, i) =>
            d.roas == null ? null : (
              <rect
                key={'b' + d.key}
                x={x(i) - barW / 2}
                y={yR(d.roas)}
                width={barW}
                height={Math.max(0, baseY - yR(d.roas))}
                rx="1.5"
                fill={d.roas >= 1 ? '#10b981' : '#ef4444'}
                opacity={hover === i ? 0.5 : 0.22}
              />
            ),
          )}

          {/* 1× breakeven (right-axis scale) */}
          <line
            x1={padX}
            x2={W - padX}
            y1={yR(1)}
            y2={yR(1)}
            stroke="#f59e0b"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.9"
          />

          {/* Revenue area + lines on top */}
          <path d={revArea} fill="#10b981" opacity="0.12" />
          <path d={linePath(spend)} fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
          <path d={linePath(rev)} fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />

          {/* hover guide + line points */}
          {hover != null && (
            <>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={padTop}
                y2={baseY}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.6"
              />
              <circle cx={x(hover)} cy={yL(rev[hover])} r="3.4" fill="#10b981" />
              <circle cx={x(hover)} cy={yL(spend[hover])} r="3.4" fill="#64748b" />
            </>
          )}

          {/* axis labels */}
          <text x={padX} y={padTop - 5} fontSize="9.5" fill="#94a3b8" textAnchor="start">
            {pesoK(leftMax)}
          </text>
          <text x={W - padX} y={padTop - 5} fontSize="9.5" fill="#0e7490" textAnchor="end">
            {rightMax}× ROAS
          </text>

          {/* x-axis labels */}
          {rows.map((d, i) =>
            i % labelEvery === 0 || i === N - 1 ? (
              <text key={'x' + d.key} x={x(i)} y={H - 8} fontSize="9" fill="#94a3b8" textAnchor="middle">
                {d.label.replace('Week of ', '')}
              </text>
            ) : null,
          )}

          {/* hover hit areas */}
          {rows.map((d, i) => (
            <rect
              key={'h' + d.key}
              x={padX + slotW * i}
              y={padTop}
              width={slotW}
              height={innerH}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute top-1.5 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-lg"
            style={{ left: `${tipLeftPct}%` }}
          >
            <div className="font-semibold text-slate-900">{active.label}</div>
            <div className="mt-1.5 flex items-center justify-between gap-3 text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />Revenue
              </span>
              <span className="font-medium tabular-nums">{peso(active.revCentavos)}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-3 text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-slate-400" />Budget
              </span>
              <span className="font-medium tabular-nums">{peso(active.spendCentavos)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-100 pt-1">
              <span className={net >= 0 ? 'text-emerald-700' : 'text-rose-600'}>Net</span>
              <span className={`font-semibold tabular-nums ${net >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                {net >= 0 ? '' : '-'}
                {peso(Math.abs(net))}
              </span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-3">
              <span className="text-cyan-700">ROAS</span>
              <span className="font-semibold tabular-nums text-cyan-700">
                {active.roas == null ? '—' : `${active.roas.toFixed(2)}×`}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
 * Two stacked panels sharing one x-axis + one hover, so each panel keeps a
 * SINGLE scale (the cardinal rule a dual-axis line chart breaks):
 *   • Money panel — Revenue (filled area) vs Budget (line). The gap between them
 *     is profit, readable at a glance.
 *   • ROAS panel  — ROAS line with a 1× breakeven; points are green ≥1× / red <1×.
 * Hovering anywhere drops a guide across both panels and shows one tooltip
 * (Revenue / Budget / Net / ROAS). Fixed viewBox + w-full → mobile-responsive.
 */
export function AdsTrendChart({ rows }: { rows: Row[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const N = rows.length;
  const W = 720;
  const padX = 10;
  const moneyTop = 16;
  const moneyH = 128;
  const moneyBase = moneyTop + moneyH;
  const roasTop = moneyBase + 30;
  const roasH = 46;
  const roasBase = roasTop + roasH;
  const H = roasBase + 22;

  const spend = rows.map((d) => d.spendCentavos / 100);
  const rev = rows.map((d) => d.revCentavos / 100);
  const leftMax = Math.max(1, ...spend, ...rev) * 1.12;
  const roasVals = rows.map((d) => d.roas).filter((r): r is number => r != null);
  const rightMax = Math.max(2, Math.ceil(Math.max(1, ...roasVals)));

  const innerW = W - padX * 2;
  const cx = (i: number) => (N <= 1 ? W / 2 : padX + (innerW * i) / (N - 1));
  const yM = (php: number) => moneyBase - (php / leftMax) * moneyH;
  const yR = (v: number) => roasBase - (Math.min(v, rightMax) / rightMax) * roasH;

  const linePath = (vals: number[], y: (v: number) => number) =>
    vals.map((v, i) => `${i ? 'L' : 'M'} ${cx(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  const revArea =
    N > 0
      ? `M ${cx(0)} ${moneyBase} ${rev
          .map((v, i) => `L ${cx(i).toFixed(1)} ${yM(v).toFixed(1)}`)
          .join(' ')} L ${cx(N - 1)} ${moneyBase} Z`
      : '';

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
    cur.push(`${cur.length ? 'L' : 'M'} ${cx(i).toFixed(1)} ${yR(d.roas).toFixed(1)}`);
  });
  if (cur.length) roasSegments.push(cur.join(' '));

  const labelEvery = Math.max(1, Math.ceil(N / 8));
  const pesoK = (php: number) =>
    php >= 1000 ? `₱${(php / 1000).toFixed(php >= 10000 ? 0 : 1)}k` : `₱${Math.round(php)}`;

  const active = hover != null ? rows[hover] : null;
  const net = active ? active.revCentavos - active.spendCentavos : 0;
  const tipLeftPct = hover != null ? Math.min(84, Math.max(16, (cx(hover) / W) * 100)) : 0;

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

      <div className="relative rounded-xl border border-slate-100 bg-slate-50/30 p-1.5">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full text-slate-300">
          {/* ── MONEY PANEL ─────────────────────────────────────────────── */}
          {[0.5, 1].map((t) => (
            <line
              key={t}
              x1={padX}
              x2={W - padX}
              y1={moneyBase - moneyH * t}
              y2={moneyBase - moneyH * t}
              stroke="currentColor"
              strokeWidth="0.5"
              opacity="0.4"
              strokeDasharray="2 3"
            />
          ))}
          <line x1={padX} x2={W - padX} y1={moneyBase} y2={moneyBase} stroke="#cbd5e1" strokeWidth="1" />
          {/* revenue area + lines */}
          <path d={revArea} fill="#10b981" opacity="0.12" />
          <path d={linePath(spend, yM)} fill="none" stroke="#94a3b8" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
          <path d={linePath(rev, yM)} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <text x={padX} y={moneyTop - 4} fontSize="9" fill="#94a3b8" textAnchor="start">
            {pesoK(leftMax)}
          </text>
          <text x={padX} y={moneyTop + 7} fontSize="8.5" fill="#94a3b8" textAnchor="start" opacity="0.7">
            Budget vs Revenue
          </text>

          {/* ── ROAS PANEL ──────────────────────────────────────────────── */}
          <line x1={padX} x2={W - padX} y1={roasBase} y2={roasBase} stroke="#e2e8f0" strokeWidth="1" />
          <line
            x1={padX}
            x2={W - padX}
            y1={yR(1)}
            y2={yR(1)}
            stroke="#f59e0b"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.85"
          />
          {roasSegments.map((seg, i) => (
            <path key={i} d={seg} fill="none" stroke="#0891b2" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {rows.map((d, i) =>
            d.roas == null ? null : (
              <circle
                key={'rd' + d.key}
                cx={cx(i)}
                cy={yR(d.roas)}
                r={hover === i ? 3 : 1.8}
                fill={d.roas >= 1 ? '#10b981' : '#ef4444'}
              />
            ),
          )}
          <text x={W - padX} y={roasTop - 3} fontSize="9" fill="#0891b2" textAnchor="end">
            {rightMax}× ROAS
          </text>

          {/* ── shared hover guide + points ─────────────────────────────── */}
          {hover != null && (
            <>
              <line
                x1={cx(hover)}
                x2={cx(hover)}
                y1={moneyTop}
                y2={roasBase}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.6"
              />
              <circle cx={cx(hover)} cy={yM(rev[hover])} r="3.2" fill="#10b981" />
              <circle cx={cx(hover)} cy={yM(spend[hover])} r="3.2" fill="#64748b" />
            </>
          )}

          {/* x-axis labels (shared) */}
          {rows.map((d, i) =>
            i % labelEvery === 0 || i === N - 1 ? (
              <text key={'x' + d.key} x={cx(i)} y={H - 6} fontSize="9" fill="#94a3b8" textAnchor="middle">
                {d.label.replace('Week of ', '')}
              </text>
            ) : null,
          )}

          {/* full-height hover hit areas */}
          {rows.map((d, i) => {
            const half = N <= 1 ? innerW / 2 : innerW / (N - 1) / 2;
            return (
              <rect
                key={'h' + d.key}
                x={cx(i) - half}
                y={moneyTop}
                width={Math.max(8, half * 2)}
                height={roasBase - moneyTop}
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

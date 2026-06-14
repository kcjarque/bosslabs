'use client';

import { useState } from 'react';

type Row = { date: string; spendCentavos: number; revCentavos: number; roas: number | null };

const peso = (centavos: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
  }).format(Math.round(centavos / 100));

const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00+08:00').toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  });

/**
 * Daily Spend vs Revenue as grouped bars (left ₱ axis) + a ROAS line on a
 * secondary axis with a dashed 1× breakeven line. Hovering a day shows an
 * instant styled tooltip (Spend / Revenue / ROAS) and dims the other days.
 * Client component so the hover is immediate — not the laggy native <title>.
 */
export function AdSpendRoasChart({ rows }: { rows: Row[] }) {
  const [hover, setHover] = useState<number | null>(null);

  // Chronological (oldest → newest, left → right).
  const days = [...rows].reverse();
  const N = days.length;
  const padX = 20;
  const padTop = 18;
  const padBottom = 30;
  const H = 260;
  const W = 760; // FIXED viewBox width → the chart is the same size for any day
  // count (sizing it to N made a 1-day view scale up ~14× with w-full).
  const innerH = H - padTop - padBottom;
  const baseY = padTop + innerH;
  // Distribute days across the fixed width; cap the slot so 1–2 days don't
  // sprawl, and center the content when it doesn't fill the width.
  const slotW = Math.min(64, (W - padX * 2) / N);
  const startX = (W - slotW * N) / 2;

  const spend = days.map((d) => d.spendCentavos / 100);
  const rev = days.map((d) => d.revCentavos / 100);
  const leftMax = Math.max(1, ...spend, ...rev) * 1.12;
  const roasVals = days.map((d) => d.roas).filter((r): r is number => r != null);
  const rightMax = Math.max(2, Math.ceil(Math.max(1, ...roasVals)));

  const slotX = (i: number) => startX + slotW * i;
  const cx = (i: number) => slotX(i) + slotW / 2;
  const barH = (v: number) => (v / leftMax) * innerH;
  const yRoas = (v: number) => padTop + innerH * (1 - v / rightMax);
  const barW = Math.min(16, slotW * 0.34);

  // ROAS line, broken wherever a day has no ROAS.
  const segments: string[] = [];
  let cur: string[] = [];
  days.forEach((d, i) => {
    if (d.roas == null) {
      if (cur.length) {
        segments.push(cur.join(' '));
        cur = [];
      }
      return;
    }
    cur.push(`${cur.length ? 'L' : 'M'} ${cx(i).toFixed(1)} ${yRoas(d.roas).toFixed(1)}`);
  });
  if (cur.length) segments.push(cur.join(' '));

  const labelEvery = Math.ceil(N / 10);
  const pesoK = (php: number) =>
    php >= 1000 ? `₱${(php / 1000).toFixed(php >= 10000 ? 0 : 1)}k` : `₱${Math.round(php)}`;

  const active = hover != null ? days[hover] : null;
  const tipLeftPct = hover != null ? Math.min(86, Math.max(14, (cx(hover) / W) * 100)) : 0;

  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2.5 rounded-sm bg-slate-300" />Spend
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2.5 rounded-sm bg-emerald-500" />Revenue
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

          {/* grouped spend / revenue bars */}
          {days.map((d, i) => {
            const s = barH(spend[i]);
            const r = barH(rev[i]);
            const dim = hover != null && hover !== i;
            return (
              <g key={d.date} opacity={dim ? 0.4 : 1}>
                <rect x={cx(i) - barW - 1} y={baseY - s} width={barW} height={s} rx="1.5" fill="#cbd5e1" />
                <rect x={cx(i) + 1} y={baseY - r} width={barW} height={r} rx="1.5" fill="#10b981" />
              </g>
            );
          })}

          {/* ROAS line + dots */}
          {segments.map((seg, i) => (
            <path
              key={i}
              d={seg}
              fill="none"
              stroke="#0891b2"
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={hover != null ? 0.5 : 1}
            />
          ))}
          {days.map((d, i) =>
            d.roas == null ? null : (
              <circle
                key={d.date}
                cx={cx(i)}
                cy={yRoas(d.roas)}
                r={hover === i ? 3.2 : 2.2}
                fill="#0891b2"
              />
            ),
          )}

          {/* x-axis date labels */}
          {days.map((d, i) =>
            i % labelEvery === 0 || i === N - 1 ? (
              <text key={'x' + d.date} x={cx(i)} y={H - 10} fontSize="9" fill="#94a3b8" textAnchor="middle">
                {fmtDate(d.date)}
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

          {/* full-height hover hit areas (last so they sit on top) */}
          {days.map((d, i) => (
            <rect
              key={'h' + d.date}
              x={slotX(i)}
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
            className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-lg"
            style={{ left: `${tipLeftPct}%` }}
          >
            <div className="font-semibold text-slate-900">{fmtDate(active.date)}</div>
            <div className="mt-1.5 flex items-center gap-1.5 text-slate-600">
              <span className="inline-block h-2 w-2 rounded-sm bg-slate-300" />
              Spend {peso(active.spendCentavos)}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-slate-600">
              <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />
              Revenue {peso(active.revCentavos)}
            </div>
            <div className="mt-1.5 font-semibold text-cyan-700">
              ROAS {active.roas == null ? '—' : `${active.roas.toFixed(2)}×`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

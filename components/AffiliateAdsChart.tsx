'use client';

import { useState } from 'react';

export type AdDailyPoint = { date: string; impressions: number; revenue: number; commission: number };

const peso = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 }).format(
    Math.round(n),
  );
const compact = (n: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/**
 * Dual-line daily chart for an affiliate's ads: Views (impressions, cyan, left
 * scale) + Earnings (pixel revenue, emerald, right scale). Hand-rolled SVG to
 * match the app's other charts. Shared hover guide → one readout line.
 */
export function AffiliateAdsChart({ daily }: { daily: AdDailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 230;
  const padL = 6;
  const padR = 6;
  const padT = 12;
  const padB = 22;
  const n = daily.length;
  const maxImp = Math.max(1, ...daily.map((d) => d.impressions));
  const maxRev = Math.max(1, ...daily.map((d) => d.revenue));
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
  const yImp = (v: number) => padT + (1 - v / maxImp) * (H - padT - padB);
  const yRev = (v: number) => padT + (1 - v / maxRev) * (H - padT - padB);
  const impPath = daily.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${yImp(d.impressions).toFixed(1)}`).join(' ');
  const revPath = daily.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${yRev(d.revenue).toFixed(1)}`).join(' ');
  const totalImp = daily.reduce((s, d) => s + d.impressions, 0);
  const totalRev = daily.reduce((s, d) => s + d.revenue, 0);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((rel - padL) / (W - padL - padR)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const h = hover != null ? daily[hover] : null;
  const labelIdx = n > 1 ? [0, Math.floor(n / 2), n - 1] : [0];

  return (
    <div>
      <div className="flex items-center gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-cyan-500" /> Views
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Earnings (₱)
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full touch-none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <path d={impPath} fill="none" stroke="#06b6d4" strokeWidth={1.5} strokeLinejoin="round" />
        <path d={revPath} fill="none" stroke="#10b981" strokeWidth={1.5} strokeLinejoin="round" />
        {h && hover != null && (
          <>
            <line x1={x(hover)} y1={padT} x2={x(hover)} y2={H - padB} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={yImp(h.impressions)} r={3} fill="#06b6d4" />
            <circle cx={x(hover)} cy={yRev(h.revenue)} r={3} fill="#10b981" />
          </>
        )}
        {labelIdx.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            fontSize={9}
            fill="#94a3b8"
            textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
          >
            {daily[i]?.date.slice(5)}
          </text>
        ))}
      </svg>
      <div className="mt-1 text-[12px] text-slate-500">
        {h ? (
          <span>
            <strong className="text-slate-700">{h.date}</strong> — {compact(h.impressions)} views ·{' '}
            {peso(h.revenue)} earnings · <span className="text-emerald-700">{peso(h.commission)} your cut</span>
          </span>
        ) : (
          <span>
            {compact(totalImp)} total views · {peso(totalRev)} earnings over the window. Hover a day for detail.
          </span>
        )}
      </div>
    </div>
  );
}

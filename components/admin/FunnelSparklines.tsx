'use client';

import { useState, type MouseEvent } from 'react';

/** Nearest-bucket hover: maps the cursor's x within the chart to a bucket index. */
function useNearest(n: number): [number | null, (e: MouseEvent<HTMLDivElement>) => void, () => void] {
  const [hi, setHi] = useState<number | null>(null);
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || n <= 1) return;
    const frac = (e.clientX - rect.left) / rect.width;
    setHi(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  };
  return [hi, onMove, () => setHi(null)];
}

function Tooltip({ leftPct, primary, secondary }: { leftPct: number; primary: string; secondary: string }) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-white shadow-lg"
      style={{ left: `${leftPct}%` }}
    >
      <div className="text-[11px] font-medium leading-tight">{primary}</div>
      <div className="text-[10px] leading-tight text-slate-300">{secondary}</div>
    </div>
  );
}

/**
 * VisitsSparkline — SVG line chart of unique sessions per bucket.
 * Cyan solid line = current period. Dashed slate line = previous period's
 * average per bucket (flat baseline). Interactive crosshair + tooltip on hover.
 */
export function VisitsSparkline({
  buckets,
  prevAverage,
  bucketMs,
}: {
  buckets: Array<{ bucketStart: string; uniqueSessions: number; total: number }>;
  prevAverage: number;
  bucketMs: number;
}) {
  const [hi, onMove, onLeave] = useNearest(buckets.length);
  if (buckets.length === 0) {
    return <p className="mt-4 text-[11px] text-slate-500">No traffic in this window.</p>;
  }

  const W = 720;
  const H = 140;
  const padX = 8;
  const padY = 14;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  const dataMax = Math.max(1, ...buckets.map((b) => b.uniqueSessions), prevAverage);
  const yMax = dataMax * 1.1;
  const slotW = innerW / Math.max(1, buckets.length - 1);
  const px = (i: number) => padX + slotW * i;
  const py = (v: number) => padY + innerH * (1 - v / yMax);

  const linePath = buckets
    .map((b, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(b.uniqueSessions).toFixed(1)}`)
    .join(' ');
  const areaPath = [
    `M ${px(0)} ${padY + innerH}`,
    ...buckets.map((b, i) => `L ${px(i).toFixed(1)} ${py(b.uniqueSessions).toFixed(1)}`),
    `L ${px(buckets.length - 1)} ${padY + innerH}`,
    'Z',
  ].join(' ');
  const yPrev = py(prevAverage);

  const hourly = bucketMs === 3600_000;
  const fmtBucket = (iso: string) =>
    new Date(iso).toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      ...(hourly ? { hour: 'numeric', hour12: true } : {}),
      timeZone: 'Asia/Manila',
    });

  const leftPct = hi == null ? 0 : Math.max(6, Math.min(94, (px(hi) / W) * 100));

  return (
    <div className="relative mt-3" onMouseMove={onMove} onMouseLeave={onLeave}>
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

        <path d={areaPath} fill="#06b6d4" opacity="0.08" />

        <line x1={padX} x2={W - padX} y1={yPrev} y2={yPrev} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4" />
        <text x={W - padX - 2} y={yPrev - 3} fontSize="9" fill="#64748b" textAnchor="end">
          prev avg {prevAverage.toFixed(1)}
        </text>

        <path d={linePath} fill="none" stroke="#06b6d4" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />

        {buckets.map((b, i) => (
          <circle key={b.bucketStart} cx={px(i)} cy={py(b.uniqueSessions)} r="2" fill="#06b6d4" opacity={b.uniqueSessions > 0 ? 1 : 0} />
        ))}

        {hi != null && (
          <>
            <line x1={px(hi)} x2={px(hi)} y1={padY} y2={padY + innerH} stroke="#0891b2" strokeWidth="0.9" strokeDasharray="2 2" opacity="0.8" />
            <circle cx={px(hi)} cy={py(buckets[hi].uniqueSessions)} r="3.4" fill="#06b6d4" stroke="#ffffff" strokeWidth="1.4" />
          </>
        )}

        <text x={padX} y={H - 2} fontSize="9" fill="#94a3b8" textAnchor="start">
          {fmtBucket(buckets[0].bucketStart)}
        </text>
        {buckets.length > 4 && (
          <text x={W / 2} y={H - 2} fontSize="9" fill="#94a3b8" textAnchor="middle">
            {fmtBucket(buckets[Math.floor(buckets.length / 2)].bucketStart)}
          </text>
        )}
        <text x={W - padX} y={H - 2} fontSize="9" fill="#94a3b8" textAnchor="end">
          {fmtBucket(buckets[buckets.length - 1].bucketStart)}
        </text>
        <text x={padX} y={padY + 2} fontSize="9" fill="#94a3b8" textAnchor="start">
          {Math.round(yMax)}
        </text>
      </svg>

      {hi != null && (
        <Tooltip
          leftPct={leftPct}
          primary={`${buckets[hi].uniqueSessions.toLocaleString()} sessions`}
          secondary={`${fmtBucket(buckets[hi].bucketStart)} · ${buckets[hi].total.toLocaleString()} beacons`}
        />
      )}
    </div>
  );
}

/**
 * ConversionSparkline — visits → paid %, as a trailing rolling rate (raw per-bucket
 * conversion is 0/spike noise). A least-squares trend line shows shift vs stable.
 * Interactive crosshair + tooltip on hover.
 */
export function ConversionSparkline({
  buckets,
  bucketMs,
}: {
  buckets: Array<{ bucketStart: string; visits: number; paid: number }>;
  bucketMs: number;
}) {
  const [hi, onMove, onLeave] = useNearest(buckets.length);
  if (buckets.length === 0) {
    return <p className="mt-4 text-[11px] text-slate-500">No conversion data in this window.</p>;
  }
  const hourly = bucketMs === 3600_000;
  const win = hourly ? 24 : 3;

  const series = buckets.map((_, i) => {
    let v = 0;
    let p = 0;
    for (let j = Math.max(0, i - win + 1); j <= i; j++) {
      v += buckets[j].visits;
      p += buckets[j].paid;
    }
    return v > 0 ? (p / v) * 100 : 0;
  });

  const totV = buckets.reduce((a, b) => a + b.visits, 0);
  const totP = buckets.reduce((a, b) => a + b.paid, 0);
  const avgPct = totV > 0 ? (totP / totV) * 100 : 0;
  const n = series.length;
  let si = 0;
  let sy = 0;
  let sii = 0;
  let siy = 0;
  for (let i = 0; i < n; i++) {
    si += i;
    sy += series[i];
    sii += i * i;
    siy += i * series[i];
  }
  const denom = n * sii - si * si;
  const slope = denom !== 0 ? (n * siy - si * sy) / denom : 0;
  const intercept = n > 0 ? (sy - slope * si) / n : 0;
  const trendAt = (i: number) => intercept + slope * i;
  const deltaPP = trendAt(n - 1) - trendAt(0);
  const trendLabel =
    Math.abs(deltaPP) < 0.2 ? 'stable' : deltaPP > 0 ? `rising +${deltaPP.toFixed(1)}pp` : `falling ${deltaPP.toFixed(1)}pp`;

  const W = 720;
  const H = 140;
  const padX = 8;
  const padY = 14;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const sorted = [...series].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
  const yMax = Math.max(1, p95, trendAt(0), trendAt(n - 1)) * 1.2;
  const slotW = innerW / Math.max(1, n - 1);
  const px = (i: number) => padX + slotW * i;
  const py = (v: number) => padY + innerH * (1 - Math.min(1, Math.max(0, v) / yMax));

  const linePath = series.map((y, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(y).toFixed(1)}`).join(' ');
  const areaPath = [
    `M ${px(0)} ${padY + innerH}`,
    ...series.map((y, i) => `L ${px(i).toFixed(1)} ${py(y).toFixed(1)}`),
    `L ${px(n - 1)} ${padY + innerH}`,
    'Z',
  ].join(' ');

  const fmtBucket = (iso: string) =>
    new Date(iso).toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      ...(hourly ? { hour: 'numeric', hour12: true } : {}),
      timeZone: 'Asia/Manila',
    });

  const leftPct = hi == null ? 0 : Math.max(6, Math.min(94, (px(hi) / W) * 100));

  return (
    <div className="relative mt-3" onMouseMove={onMove} onMouseLeave={onLeave}>
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

        <path d={areaPath} fill="#10b981" opacity="0.08" />

        <line x1={px(0)} y1={py(trendAt(0))} x2={px(n - 1)} y2={py(trendAt(n - 1))} stroke="#94a3b8" strokeWidth="1.25" strokeDasharray="4 4" />
        <text x={W - padX - 2} y={Math.max(padY + 8, py(trendAt(n - 1)) - 3)} fontSize="9" fill="#64748b" textAnchor="end">
          trend · {trendLabel}
        </text>

        <path d={linePath} fill="none" stroke="#10b981" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />

        {hi != null && (
          <>
            <line x1={px(hi)} x2={px(hi)} y1={padY} y2={padY + innerH} stroke="#059669" strokeWidth="0.9" strokeDasharray="2 2" opacity="0.8" />
            <circle cx={px(hi)} cy={py(series[hi])} r="3.4" fill="#10b981" stroke="#ffffff" strokeWidth="1.4" />
          </>
        )}

        <text x={padX} y={H - 2} fontSize="9" fill="#94a3b8" textAnchor="start">
          {fmtBucket(buckets[0].bucketStart)}
        </text>
        {buckets.length > 4 && (
          <text x={W / 2} y={H - 2} fontSize="9" fill="#94a3b8" textAnchor="middle">
            {fmtBucket(buckets[Math.floor(buckets.length / 2)].bucketStart)}
          </text>
        )}
        <text x={W - padX} y={H - 2} fontSize="9" fill="#94a3b8" textAnchor="end">
          {fmtBucket(buckets[buckets.length - 1].bucketStart)}
        </text>
        <text x={padX} y={padY + 2} fontSize="9" fill="#94a3b8" textAnchor="start">
          {yMax.toFixed(1)}%
        </text>
        <text x={W / 2} y={padY + 2} fontSize="9" fill="#64748b" textAnchor="middle">
          avg {avgPct.toFixed(2)}%
        </text>
      </svg>

      {hi != null && (
        <Tooltip
          leftPct={leftPct}
          primary={`${series[hi].toFixed(2)}% conversion`}
          secondary={`${fmtBucket(buckets[hi].bucketStart)} · ${win}${hourly ? 'h' : 'd'} rolling`}
        />
      )}
    </div>
  );
}

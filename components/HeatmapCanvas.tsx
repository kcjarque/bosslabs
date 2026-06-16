'use client';

import { useEffect, useRef, useState } from 'react';
import type { HeatPoint } from '@/lib/recordings-heatmap';

/**
 * Consolidated heatmap surface (admin-only). Renders the REAL funnel page in a
 * sandboxed iframe as a static backdrop, then overlays a canvas density map of
 * every click / move aggregated across all sessions.
 *
 * Why a live iframe instead of replaying rrweb: rrweb's bare Replayer painted a
 * blank/short frame (heat squished into a thin bar) and pulled in a heavy import
 * just to draw one static frame — slow + useless. The iframe loads the actual
 * page's server-rendered HTML + CSS, so the backdrop is always the real page and
 * renders instantly. `sandbox="allow-same-origin"` (no allow-scripts) means the
 * framed page runs ZERO JavaScript — no tracking, no pixel, no recording — while
 * still being same-origin so we can measure its full scroll height.
 *
 * Coordinate model: x is a fraction (0..1) of the device's screen width and y
 * is page-absolute (scroll folded in by the server). The iframe renders the
 * responsive page at this device's representative backdrop width; we CSS-scale
 * the whole stage to fit the admin column, so the canvas draws at backdrop
 * width and inherits the same scale.
 */

type Mode = 'clicks' | 'moves';

const MAX_CANVAS_HEIGHT = 8000; // guard against pathological page heights

export function HeatmapCanvas({
  page,
  backdropWidth,
  clicks,
  moves,
}: {
  page: string;
  backdropWidth: number;
  clicks: HeatPoint[];
  moves: HeatPoint[];
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('clicks');
  const [height, setHeight] = useState(0);
  const [scale, setScale] = useState(1);
  const [ready, setReady] = useState(false);

  // Height derived from the heat points — used until the iframe reports its real
  // scroll height (and as a fallback if same-origin measurement is blocked).
  const pointHeight = (() => {
    const maxY = [...clicks, ...moves].reduce((m, p) => Math.max(m, p.y), 0);
    return Math.min(MAX_CANVAS_HEIGHT, Math.max(800, maxY + 200));
  })();

  // Fit the stage to the admin column width whenever it (or the backdrop width)
  // changes.
  useEffect(() => {
    function fit() {
      const outer = outerRef.current;
      const fitWidth = outer ? outer.clientWidth : backdropWidth;
      setScale(Math.min(1, fitWidth / Math.max(1, backdropWidth)));
    }
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [backdropWidth]);

  // Measure the iframe's real page height once it loads (same-origin read). The
  // page runs no scripts, so layout is stable by load — but we re-measure after
  // a short delay to catch late web-font / image reflow.
  function measure() {
    const iframe = iframeRef.current;
    let measured = 0;
    try {
      const doc = iframe?.contentDocument;
      if (doc) {
        measured = Math.max(
          doc.body?.scrollHeight ?? 0,
          doc.documentElement?.scrollHeight ?? 0,
        );
      }
    } catch {
      /* cross-origin (shouldn't happen) — fall back to point height */
    }
    const h = Math.min(MAX_CANVAS_HEIGHT, measured > 0 ? measured : pointHeight);
    setHeight(h);
    setReady(true);
  }

  function onIframeLoad() {
    measure();
    window.setTimeout(measure, 600);
  }

  // Paint the heatmap whenever the data, mode, or measured size changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready || height === 0) return;
    // Render the heat at a capped resolution (≤640px wide) and CSS-upscale to
    // fill — blobs are low-frequency so it's visually identical, but the
    // per-pixel colorize loop drops from millions of pixels to a fraction.
    const RES = Math.min(1, 640 / Math.max(1, backdropWidth));
    const w = Math.max(1, Math.round(backdropWidth * RES));
    const h = Math.max(1, Math.round(height * RES));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    const points = mode === 'clicks' ? clicks : moves;
    if (points.length === 0) return;

    // Pass 1 — additive grayscale intensity via radial gradients.
    const radius = (mode === 'clicks' ? 28 : 18) * RES;
    const alpha = mode === 'clicks' ? 0.5 : 0.18;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of points) {
      if (p.y > height) continue; // bounds check in recorded coords
      const x = p.xFrac * w; // xFrac is a fraction of screen width → canvas px
      const y = p.y * RES;
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, `rgba(0,0,0,${alpha})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Pass 2 — map accumulated alpha → blue→cyan→green→yellow→red ramp.
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a === 0) continue;
      const t = Math.min(1, a / 255);
      const [r, gg, b] = ramp(t);
      d[i] = r;
      d[i + 1] = gg;
      d[i + 2] = b;
      d[i + 3] = Math.min(220, a * 1.6); // lift faint regions, cap opacity
    }
    ctx.putImageData(img, 0, 0);
  }, [ready, height, mode, clicks, moves, backdropWidth]);

  const scaledHeight = (height || pointHeight) * scale;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode('clicks')}
          className={`rounded-full px-3 py-1 text-[12px] font-medium ${
            mode === 'clicks' ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          Clicks / taps ({clicks.length})
        </button>
        <button
          type="button"
          onClick={() => setMode('moves')}
          className={`rounded-full px-3 py-1 text-[12px] font-medium ${
            mode === 'moves' ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          Movement / attention ({moves.length})
        </button>
        <span className="ml-2 flex items-center gap-1.5 text-[11px] text-slate-400">
          low
          <span className="h-2 w-24 rounded-full bg-gradient-to-r from-blue-500 via-green-400 via-yellow-300 to-red-500" />
          high
        </span>
      </div>

      <div
        ref={outerRef}
        className="relative overflow-hidden rounded-lg border border-slate-200 bg-white"
        style={{ height: scaledHeight || 480 }}
      >
        {!ready && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-400">
            Loading page backdrop…
          </div>
        )}
        <div
          style={{
            width: backdropWidth,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'relative',
          }}
        >
          {/* real page backdrop — scripts disabled, so it fires no tracking */}
          <iframe
            ref={iframeRef}
            src={page}
            onLoad={onIframeLoad}
            title={`Backdrop for ${page}`}
            sandbox="allow-same-origin"
            scrolling="no"
            tabIndex={-1}
            aria-hidden="true"
            style={{
              width: backdropWidth,
              height: height || pointHeight,
              border: 0,
              display: 'block',
              pointerEvents: 'none',
            }}
          />
          {/* density overlay */}
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute left-0 top-0"
            style={{ width: backdropWidth, height: height || pointHeight }}
          />
        </div>
      </div>
    </div>
  );
}

/** blue → cyan → green → yellow → red color ramp for intensity t∈[0,1]. */
function ramp(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0.0, [37, 99, 235]], // blue
    [0.35, [34, 211, 238]], // cyan
    [0.55, [34, 197, 94]], // green
    [0.75, [250, 204, 21]], // yellow
    [1.0, [239, 68, 68]], // red
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (t - t0) / (t1 - t0 || 1);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

'use client';

import { useEffect, useRef, useState } from 'react';
import type { HeatPoint } from '@/lib/recordings-heatmap';

/**
 * Consolidated heatmap surface (admin-only). Renders a representative rrweb
 * snapshot as a static backdrop (bare rrweb Replayer, paused at frame 0), then
 * overlays a canvas density map of every click / move aggregated across all
 * sessions. rrweb is dynamically imported, so this never touches the funnel.
 *
 * Coordinate model: points are page-absolute (scroll already folded in by the
 * server). We render the backdrop at its recorded width and CSS-scale the whole
 * wrapper to fit the admin column, so the canvas can draw in raw recorded
 * coordinates and inherit the same scale — no per-point math.
 */

type Mode = 'clicks' | 'moves';

const MAX_CANVAS_HEIGHT = 6000; // guard against pathological page heights

export function HeatmapCanvas({
  backdrop,
  recordedWidth,
  clicks,
  moves,
}: {
  backdrop: unknown[] | null;
  recordedWidth: number;
  clicks: HeatPoint[];
  moves: HeatPoint[];
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const replayMountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('clicks');
  const [height, setHeight] = useState(0);
  const [scale, setScale] = useState(1);
  const [ready, setReady] = useState(false);

  // 1) Render the static backdrop + measure full page height.
  useEffect(() => {
    let destroyed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let replayer: any = null;

    (async () => {
      // Fallback height from the points if there's no backdrop to measure.
      const pts = [...clicks, ...moves];
      const maxY = pts.reduce((m, p) => Math.max(m, p.y), 0);
      let fullHeight = Math.min(MAX_CANVAS_HEIGHT, Math.max(800, maxY + 200));

      const mount = replayMountRef.current;
      if (backdrop && Array.isArray(backdrop) && backdrop.length >= 2 && mount) {
        try {
          const mod = await import('rrweb');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const Replayer = (mod as any).Replayer;
          replayer = new Replayer(backdrop, {
            root: mount,
            speed: 1,
            skipInactive: false,
            mouseTail: false,
            showWarning: false,
            showDebug: false,
            UNSAFE_replayCanvas: false,
          });
          replayer.pause(0);
          const iframe: HTMLIFrameElement | undefined = replayer.iframe;
          if (iframe) {
            iframe.style.pointerEvents = 'none';
            const doc = iframe.contentDocument;
            const measured = doc
              ? Math.max(doc.body?.scrollHeight ?? 0, doc.documentElement?.scrollHeight ?? 0)
              : 0;
            if (measured > 0) fullHeight = Math.min(MAX_CANVAS_HEIGHT, measured);
            iframe.style.height = `${fullHeight}px`;
            iframe.style.border = '0';
          }
        } catch {
          /* fall through to blank backdrop */
        }
      }

      if (destroyed) return;
      const outer = outerRef.current;
      const fitWidth = outer ? outer.clientWidth : recordedWidth;
      setScale(Math.min(1, fitWidth / recordedWidth));
      setHeight(fullHeight);
      setReady(true);
    })();

    return () => {
      destroyed = true;
      try {
        replayer?.destroy?.();
      } catch {
        /* ignore */
      }
      if (replayMountRef.current) replayMountRef.current.innerHTML = '';
    };
  }, [backdrop, recordedWidth, clicks, moves]);

  // 2) Paint the heatmap whenever the data, mode, or measured size changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready || height === 0) return;
    const w = recordedWidth;
    const h = height;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    const points = mode === 'clicks' ? clicks : moves;
    if (points.length === 0) return;

    // Pass 1 — additive grayscale intensity via radial gradients.
    const radius = mode === 'clicks' ? 28 : 18;
    const alpha = mode === 'clicks' ? 0.5 : 0.18;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of points) {
      if (p.y > h) continue;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      g.addColorStop(0, `rgba(0,0,0,${alpha})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
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
  }, [ready, height, mode, clicks, moves, recordedWidth]);

  const scaledHeight = height * scale;

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
        style={{ height: ready ? scaledHeight : 480 }}
      >
        {!ready && (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Rendering heatmap…
          </div>
        )}
        <div
          ref={stageRef}
          style={{
            width: recordedWidth,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'relative',
          }}
        >
          {/* static page backdrop */}
          <div ref={replayMountRef} className="heatmap-backdrop" />
          {/* density overlay */}
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute left-0 top-0"
            style={{ width: recordedWidth, height }}
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

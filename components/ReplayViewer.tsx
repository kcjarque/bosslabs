'use client';

import { useEffect, useRef } from 'react';

export function ReplayViewer({ events }: { events: unknown[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || events.length === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let player: any = null;

    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import('rrweb-player');
      const Player = mod.default;
      player = new Player({
        target: containerRef.current!,
        props: {
          events,
          width: 900,
          height: 600,
          autoPlay: false,
          showController: true,
          speedOption: [1, 2, 4, 8],
        },
      });
    })();

    return () => {
      player?.$destroy?.();
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="card text-center text-sm text-slate-500">
        This recording has no events.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
    />
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const SESSION_KEY = 'bl_session_id';
const RECORDED_PAGES = ['/checkout', '/oto', '/'];
const FLUSH_INTERVAL_MS = 30_000;

// rrweb event types we care about for chunk self-containment.
const META = 4;
const FULL_SNAPSHOT = 2;

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(SESSION_KEY) || '';
  } catch {
    return '';
  }
}

type RrwebEvent = { type?: number };

export function SessionRecorder() {
  const pathname = usePathname();
  const stopRef = useRef<(() => void) | null>(null);
  const eventsRef = useRef<unknown[]>([]);
  const flushedRef = useRef(false);
  // Last Meta + FullSnapshot seen — prepended to any flushed chunk that lacks
  // its own FullSnapshot, so EVERY stored chunk is independently replayable.
  // Without this, only the first flush replays; later chunks (incrementals
  // only) rebuild as a blank canvas.
  const lastMetaRef = useRef<unknown | null>(null);
  const lastFullRef = useRef<unknown | null>(null);

  useEffect(() => {
    if (!pathname || !RECORDED_PAGES.includes(pathname)) return;

    let cancelled = false;
    const sessionId = getSessionId();
    if (!sessionId) return;

    eventsRef.current = [];
    flushedRef.current = false;
    lastMetaRef.current = null;
    lastFullRef.current = null;

    // Build a self-contained chunk: if these events don't include a
    // FullSnapshot, prepend the last-known [Meta, FullSnapshot] so the
    // recording rebuilds the real DOM on replay.
    function selfContained(events: unknown[]): unknown[] {
      const e0 = events[0] as RrwebEvent | undefined;
      const e1 = events[1] as RrwebEvent | undefined;
      // Already begins with Meta + FullSnapshot → replayable as-is.
      if (e0?.type === META && e1?.type === FULL_SNAPSHOT) return events;
      // Otherwise prepend the last-known Meta + FullSnapshot so the chunk
      // rebuilds the real DOM instead of replaying as a blank canvas.
      if (lastMetaRef.current && lastFullRef.current) {
        return [lastMetaRef.current, lastFullRef.current, ...events];
      }
      return events;
    }

    function flush() {
      if (flushedRef.current) return;
      if (eventsRef.current.length === 0) return;
      flushedRef.current = true;

      const payload = JSON.stringify({
        sessionId,
        page: pathname,
        events: selfContained(eventsRef.current),
      });

      try {
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon('/api/recordings', blob);
          return;
        }
      } catch {
        /* fall through */
      }

      try {
        void fetch('/api/recordings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        });
      } catch {
        /* best effort */
      }
    }

    (async () => {
      try {
        const res = await fetch('/api/recordings');
        const data = (await res.json()) as { enabled?: boolean };
        if (!data.enabled || cancelled) return;
      } catch {
        return;
      }

      const rrweb = await import('rrweb');
      if (cancelled) return;

      const { record } = rrweb;
      const stop = record({
        emit(event) {
          const t = (event as RrwebEvent).type;
          // Remember the most recent Meta + FullSnapshot so we can prepend
          // them to incremental-only chunks at flush time.
          if (t === META) lastMetaRef.current = event;
          if (t === FULL_SNAPSHOT) lastFullRef.current = event;
          eventsRef.current.push(event);
        },
        // Periodically re-take a full checkout (Meta + FullSnapshot) so the
        // prepended snapshot stays current and replay stays coherent.
        checkoutEveryNms: FLUSH_INTERVAL_MS,
        sampling: {
          mousemove: 100,
          mouseInteraction: true,
          scroll: 150,
          input: 'last',
        },
        blockClass: 'rr-block',
        maskInputOptions: { password: true },
      });

      stopRef.current = stop ?? null;

      const interval = setInterval(() => {
        if (eventsRef.current.length > 0 && !flushedRef.current) {
          const payload = JSON.stringify({
            sessionId,
            page: pathname,
            events: selfContained(eventsRef.current),
          });
          eventsRef.current = [];

          try {
            void fetch('/api/recordings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payload,
            });
          } catch {
            /* best effort */
          }
        }
      }, FLUSH_INTERVAL_MS);

      window.addEventListener('beforeunload', flush);

      stopRef.current = () => {
        stop?.();
        clearInterval(interval);
        window.removeEventListener('beforeunload', flush);
        flush();
      };
    })();

    return () => {
      cancelled = true;
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [pathname]);

  return null;
}

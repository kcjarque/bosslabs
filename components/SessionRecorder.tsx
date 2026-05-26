'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const SESSION_KEY = 'bl_session_id';
const RECORDED_PAGES = ['/checkout', '/oto', '/'];
const FLUSH_INTERVAL_MS = 30_000;

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(SESSION_KEY) || '';
  } catch {
    return '';
  }
}

export function SessionRecorder() {
  const pathname = usePathname();
  const stopRef = useRef<(() => void) | null>(null);
  const eventsRef = useRef<unknown[]>([]);
  const flushedRef = useRef(false);

  useEffect(() => {
    if (!pathname || !RECORDED_PAGES.includes(pathname)) return;

    let cancelled = false;
    const sessionId = getSessionId();
    if (!sessionId) return;

    eventsRef.current = [];
    flushedRef.current = false;

    function flush() {
      if (flushedRef.current) return;
      if (eventsRef.current.length === 0) return;
      flushedRef.current = true;

      const payload = JSON.stringify({
        sessionId,
        page: pathname,
        events: eventsRef.current,
      });

      try {
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon('/api/recordings', blob);
          return;
        }
      } catch { /* fall through */ }

      try {
        void fetch('/api/recordings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        });
      } catch { /* best effort */ }
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
          eventsRef.current.push(event);
        },
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
            events: eventsRef.current,
          });
          eventsRef.current = [];

          try {
            void fetch('/api/recordings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payload,
            });
          } catch { /* best effort */ }
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

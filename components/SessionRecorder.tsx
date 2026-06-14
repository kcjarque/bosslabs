'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Self-hosted session replay (rrweb) capture — load-safe by construction.
 *
 * Mounted once in the root layout; self-gates to an allowlist of funnel
 * routes. rrweb is dynamically imported ONLY after the server kill-switch
 * returns { enabled: true }, so a visitor who isn't being recorded downloads
 * zero replay code and the funnel's First-Load-JS is unaffected. Every capture
 * / flush is wrapped so a failure can never break the page for a real customer.
 *
 * Chunking: each recorded page load is its own rrweb session (one Meta +
 * FullSnapshot, then incrementals). We flush the buffer to POST /api/recordings
 * every 30s, on SPA route change, when the tab is hidden, and on unload — then
 * stitch all chunks back into one continuous replay in the admin. A chunk that
 * starts mid-stream (no snapshot) gets the last-known Meta + FullSnapshot
 * prepended so every stored row is independently replayable.
 *
 * Privacy: maskAllInputs masks ALL typed input (email, name, phone, payment)
 * — only clicks / scrolls / movement are recorded, never keystroke values.
 * `.rr-block` elements are excluded entirely.
 */

const SESSION_KEY = 'bl_session_id';
// Record ONLY the buyer-intent pages. Homepage-only bounces were the bulk of
// storage (~500MB/day) for little value — a visitor who reaches /checkout or
// /oto still gets a full replay of the part that matters; pure homepage
// browsers are no longer recorded at all.
const RECORDED_PAGES = ['/checkout', '/oto'];
const ENDPOINT = '/api/recordings';
const FLUSH_INTERVAL_MS = 30_000;
// Hard cap per page: a tab left open keeps the live countdown mutating the DOM,
// so rrweb re-snapshots every 30s and records forever — that's what produced a
// 54-hour / 737-chunk session. Stop after 12 min; the useful part of a funnel
// visit is the first few minutes anyway.
const MAX_RECORD_MS = 12 * 60 * 1000;

// rrweb event type constants (stable wire-format values).
const EVENT_FULL_SNAPSHOT = 2;
const EVENT_META = 4;

/** Read the shared funnel session id; create one if missing so a recording is
 *  never dropped for lack of an id (the key is shared with pageview tracking,
 *  so the visitor keeps one consistent id across both). */
function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = window.localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `anon-${Math.random().toString(36).slice(2, 10)}`;
  }
}

type RrwebEvent = { type?: number };

export function SessionRecorder() {
  const pathname = usePathname();
  // Buffer survives re-renders; grabbed + cleared synchronously on each flush.
  const bufferRef = useRef<unknown[]>([]);

  useEffect(() => {
    if (!pathname || !RECORDED_PAGES.includes(pathname)) return;

    let cancelled = false;
    let flushTimer: ReturnType<typeof setInterval> | null = null;
    let capTimer: ReturnType<typeof setTimeout> | null = null;
    let stopRecording: (() => void) | null = null;
    const sessionId = getSessionId();
    if (!sessionId) return;

    // rrweb takes ONE full snapshot per record() session, so a chunk flushed
    // mid-stream has no snapshot and would replay as a blank frame. Keep the
    // most recent Meta + FullSnapshot and prepend them to any chunk that
    // doesn't already begin with one — making every stored row replayable.
    let lastMeta: RrwebEvent | null = null;
    let lastFullSnapshot: RrwebEvent | null = null;

    /**
     * Send buffered events and clear the buffer. Never throws.
     *
     * `unloading` selects the transport:
     *   - false (DEFAULT — interval, SPA route change, tab-hidden): a plain
     *     fetch. The page is still alive so the request completes normally and
     *     has NO body-size cap. rrweb chunks carry a full DOM snapshot
     *     (~400KB–1MB), which sendBeacon's ~64KB cap would silently drop.
     *   - true (real document unload — tab close / hard reload): sendBeacon +
     *     keepalive fetch. Both cap at ~64KB, so only a small trailing chunk
     *     survives — but the interval / route-change / tab-hidden flushes have
     *     already stored everything up to the last ~30s.
     */
    function flush(unloading: boolean) {
      let events = bufferRef.current;
      if (!events.length) return;
      bufferRef.current = [];

      const head = (events[0] as RrwebEvent | undefined)?.type;
      const second = (events[1] as RrwebEvent | undefined)?.type;
      const startsWithSnapshot =
        head === EVENT_FULL_SNAPSHOT ||
        (head === EVENT_META && second === EVENT_FULL_SNAPSHOT);
      if (!startsWithSnapshot && lastFullSnapshot) {
        const prefix = lastMeta ? [lastMeta, lastFullSnapshot] : [lastFullSnapshot];
        events = [...prefix, ...events];
      }

      let payload: string;
      try {
        payload = JSON.stringify({ sessionId, page: pathname, events });
      } catch {
        return;
      }

      if (!unloading) {
        try {
          void fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
          }).catch(() => {});
        } catch {
          /* swallow — telemetry must not surface errors */
        }
        return;
      }

      try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          const blob = new Blob([payload], { type: 'application/json' });
          if (navigator.sendBeacon(ENDPOINT, blob)) return;
        }
        void fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* swallow */
      }
    }

    // Real document-teardown → size-limited beacon path.
    const onUnload = () => flush(true);
    // Tab hidden fires while the page is still alive (most reliable "leaving"
    // signal on mobile) → flush via the plain-fetch path so large chunks land.
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush(false);
    };

    (async () => {
      try {
        // Server kill-switch — only record when explicitly enabled.
        const res = await fetch(ENDPOINT, { method: 'GET' });
        const data = (await res.json().catch(() => ({ enabled: false }))) as {
          enabled?: boolean;
        };
        if (cancelled || !data?.enabled) return;

        const rrweb = await import('rrweb');
        if (cancelled) return;

        const stop = rrweb.record({
          emit(event) {
            const e = event as RrwebEvent;
            if (e.type === EVENT_META) lastMeta = e;
            if (e.type === EVENT_FULL_SNAPSHOT) lastFullSnapshot = e;
            bufferRef.current.push(event);
          },
          // Re-take a full snapshot every 30s so prepended snapshots stay
          // current and replay stays coherent on long sessions.
          checkoutEveryNms: FLUSH_INTERVAL_MS,
          sampling: {
            mousemove: 100,
            scroll: 150,
            input: 'last',
            mouseInteraction: true,
          },
          blockClass: 'rr-block',
          // Mask EVERY input value (email, name, phone, payment) — we keep the
          // behaviour (clicks/scroll/movement), never the keystrokes.
          maskAllInputs: true,
        });
        stopRecording = stop ?? null;

        flushTimer = setInterval(() => flush(false), FLUSH_INTERVAL_MS);
        // Stop recording this page after the hard cap so a left-open tab can't
        // bloat storage forever. Flush what we have, then halt rrweb.
        capTimer = setTimeout(() => {
          flush(false);
          try {
            stopRecording?.();
          } catch {
            /* ignore */
          }
          stopRecording = null;
          if (flushTimer) {
            clearInterval(flushTimer);
            flushTimer = null;
          }
        }, MAX_RECORD_MS);
        window.addEventListener('beforeunload', onUnload);
        // pagehide is more reliable than beforeunload on mobile Safari.
        window.addEventListener('pagehide', onUnload);
        document.addEventListener('visibilitychange', onHide);
      } catch {
        /* swallow — rrweb failed to load/record; the page is unaffected */
      }
    })();

    // Cleanup: SPA route change away or unmount → stop + final flush. A client
    // route change does NOT unload the document, so flush via the plain-fetch
    // path (no 64KB cap) — this is the common "left the recorded page" case.
    return () => {
      cancelled = true;
      if (flushTimer) clearInterval(flushTimer);
      if (capTimer) clearTimeout(capTimer);
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('pagehide', onUnload);
      document.removeEventListener('visibilitychange', onHide);
      try {
        stopRecording?.();
      } catch {
        /* swallow */
      }
      flush(false);
    };
  }, [pathname]);

  return null;
}

'use client';

/**
 * PageviewTracker — beacons one row to /api/track on every mount.
 *
 * Mounted once in app/layout.tsx so it fires on every route the user
 * lands on. Uses navigator.sendBeacon when available (works during
 * page unload too), falls back to fetch with keepalive.
 *
 * Session id is a browser-local UUID persisted in localStorage so a
 * returning visitor counts as the same session. Unique-session math
 * in the dashboard funnel uses this id.
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const SESSION_KEY = 'bl_session_id';

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // Private mode / localStorage blocked — fall back to a per-load id.
    return `n_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

export function PageviewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    // Skip admin paths — they shouldn't pollute the public funnel data
    // (the admin reloads /admin many times per session while QA'ing).
    if (pathname.startsWith('/admin')) return;

    const payload = JSON.stringify({
      path: pathname,
      sessionId: getOrCreateSessionId(),
      referrer: document.referrer || null,
    });

    // sendBeacon is the right tool here — POSTs are queued by the
    // browser and survive an immediate page navigation. Falls back to
    // fetch with keepalive when sendBeacon isn't available.
    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/track', blob);
        return;
      }
    } catch {
      // sendBeacon throws on some Safari versions when CSP is strict —
      // fall through to fetch.
    }

    try {
      void fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      });
    } catch {
      // Last-resort failure — nothing to do.
    }
  }, [pathname]);

  return null;
}

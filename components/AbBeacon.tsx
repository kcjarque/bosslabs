'use client';

/**
 * AbBeacon — logs one extra page_views row with a synthetic path (e.g.
 * "/__ab/home-b") when a visitor is served an A/B variant. Same session id as
 * PageviewTracker, so variant visits are queryable next to normal traffic
 * (unique sessions on "/__ab/home-b" = visitors who SAW the variant).
 */
import { useEffect } from 'react';
import { isFramedView } from '@/lib/is-framed';

const SESSION_KEY = 'bl_session_id';

export function AbBeacon({ path }: { path: string }) {
  useEffect(() => {
    if (isFramedView()) return; // skip the admin heatmap's iframe backdrop load
    let sessionId = '';
    try {
      sessionId = window.localStorage.getItem(SESSION_KEY) || '';
    } catch {
      /* private mode — send without a session id */
    }
    const payload = JSON.stringify({ path, sessionId, referrer: document.referrer });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
      } else {
        void fetch('/api/track', { method: 'POST', body: payload, keepalive: true });
      }
    } catch {
      /* tracking is best-effort */
    }
  }, [path]);
  return null;
}

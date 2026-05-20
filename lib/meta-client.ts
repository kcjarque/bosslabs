/**
 * Meta Pixel — client-side helpers.
 *
 * The pixel itself is installed by <MetaPixel /> in app/layout.tsx (which
 * uses next/script). This module exports tiny helpers for firing custom
 * events with deduplication IDs that match what the server sends via CAPI.
 *
 * All helpers are no-ops when window/fbq is missing — safe to call from
 * any component without guarding.
 */

type FbqArgs = ['track', string, Record<string, unknown>, { eventID?: string }?];

declare global {
  interface Window {
    fbq?: (...args: FbqArgs) => void;
  }
}

/**
 * Fire a pixel track event. `eventID` should match the server-side CAPI
 * event_id for deduplication — Meta will count it once across both sources.
 */
export function trackPixelEvent(
  name: string,
  params: Record<string, unknown> = {},
  eventID?: string,
): void {
  if (typeof window === 'undefined') return;
  const fbq = window.fbq;
  if (!fbq) return;
  if (eventID) {
    fbq('track', name, params, { eventID });
  } else {
    fbq('track', name, params);
  }
}

/**
 * Read _fbp and _fbc cookies. Pass these to the server so CAPI can match
 * the event back to the original ad click — lifts match rate ~2x.
 */
export function getFbCookies(): { fbp?: string; fbc?: string } {
  if (typeof document === 'undefined') return {};
  const out: Record<string, string> = {};
  for (const part of document.cookie.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = val;
  }
  return { fbp: out['_fbp'], fbc: out['_fbc'] };
}

/** Stable event ID — use the same one for both pixel + CAPI to dedupe. */
export function newEventId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

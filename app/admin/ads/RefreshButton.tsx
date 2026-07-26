'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { refreshAdsData } from './actions';

/**
 * Refresh button — re-pulls the latest spend from Meta (overwriting partial
 * days with full-day totals) then re-renders the live page. The Ads table is
 * already live; this also keeps the ROAS dashboard's stored data current.
 *
 * The last refresh time is remembered per-browser so the operator can always
 * tell how stale the numbers are — not only in the moment they click.
 */

const STORE_KEY = 'bl_ads_last_refresh';

/** "2:47 PM" when it happened today, "Jul 25, 2:47 PM" once it didn't. */
function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  const isToday = new Date().toDateString() === d.toDateString();
  return isToday
    ? time
    : `${d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}, ${time}`;
}

export function RefreshButton() {
  const [pending, startTransition] = useTransition();
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Restore the previous refresh time on mount (client-only, so the server
  // render and first paint agree — no hydration mismatch on the timestamp).
  useEffect(() => {
    try {
      setLastAt(window.localStorage.getItem(STORE_KEY));
    } catch {
      /* private mode — just show nothing */
    }
  }, []);

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {!pending && error && <span className="text-[11px] text-rose-600">{error}</span>}
      {!pending && !error && lastAt && (
        <span className="text-[11px] text-slate-400">
          {result ? `✓ Refreshed ${result} · ` : 'Last refreshed '}
          {formatStamp(lastAt)}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            setResult(null);
            const r = await refreshAdsData();
            if (r.ok) {
              setResult(`${r.synced} day${r.synced === 1 ? '' : 's'}`);
              setLastAt(r.at);
              try {
                window.localStorage.setItem(STORE_KEY, r.at);
              } catch {
                /* best-effort */
              }
            } else {
              setError(r.error || 'Refresh failed');
            }
            router.refresh();
          })
        }
        className="inline-flex items-center gap-1.5 rounded-full bg-cyan-600 px-3 py-1 text-[11px] font-medium text-white shadow-sm transition hover:bg-cyan-700 disabled:opacity-60 sm:text-xs"
        style={{ color: '#fff' }}
      >
        <span className={pending ? 'animate-spin' : ''}>↻</span>
        {pending ? 'Refreshing…' : 'Refresh data'}
      </button>
    </span>
  );
}

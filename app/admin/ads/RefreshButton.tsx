'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { refreshAdsData } from './actions';

/**
 * Refresh button — re-pulls the latest spend from Meta (overwriting partial
 * days with full-day totals) then re-renders the live page. The Ads table is
 * already live; this also keeps the ROAS dashboard's stored data current.
 */
export function RefreshButton() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const router = useRouter();

  return (
    <span className="inline-flex items-center gap-2">
      {done && !pending && <span className="text-[11px] text-slate-400">{done}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setDone(null);
            const r = await refreshAdsData();
            setDone(r.ok ? `Updated ${r.synced} day${r.synced === 1 ? '' : 's'}` : (r.error || 'Failed'));
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

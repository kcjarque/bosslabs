'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { refreshDashboard } from './actions';

/** Top-of-dashboard refresh — busts the 60s server-side cache for all KPI
 *  fetches AND re-renders the page so the new numbers paint. Distinct from
 *  the Ad-only refresh inside the Ad spend card (that one only syncs Meta
 *  → ad_spend_daily; this one busts the page cache). */
export function DashboardRefreshButton() {
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const router = useRouter();

  function onClick() {
    startTransition(async () => {
      await refreshDashboard();
      router.refresh();
      setSavedAt(Date.now());
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      {savedAt && !pending && (
        <span className="text-[11px] text-slate-400">
          Refreshed {new Date(savedAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className={pending ? 'animate-spin' : ''}>
          <path d="M3 12a9 9 0 0 1 15.8-6m1.7-3v6h-6M21 12a9 9 0 0 1-15.8 6m-1.7 3v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {pending ? 'Refreshing…' : 'Refresh'}
      </button>
    </span>
  );
}

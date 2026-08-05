'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

/** Header stats + URL-driven filter row for /admin/customers.
 *  All state lives in the query string so back-button, bookmarks and share
 *  links preserve the view. Debounced search (300 ms) keeps typing snappy. */
type Counts = { total: number; paid: number; unpaid: number; today: number };
type Status = 'all' | 'paid' | 'abandoned' | 'refunded' | 'unsubscribed';

const STATUS_TABS: { key: Status; label: string; countKey?: keyof Counts }[] = [
  { key: 'all', label: 'All', countKey: 'total' },
  { key: 'paid', label: 'Paid', countKey: 'paid' },
  { key: 'abandoned', label: 'Abandoned', countKey: 'unpaid' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'unsubscribed', label: 'Unsubscribed' },
];

export function CustomersToolbar({
  counts,
  events,
  initialQ,
  status,
  event,
}: {
  counts: Counts;
  events: { id: string; name: string }[];
  initialQ: string;
  status: Status;
  event: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(initialQ);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQ(initialQ);
  }, [initialQ]);

  function pushParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params?.toString() ?? '');
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k);
      else next.set(k, v);
    }
    // Filter change → reset to page 1 so pagination doesn't land on an empty page.
    next.delete('page');
    startTransition(() => router.push(`/admin/customers?${next.toString()}`));
  }

  function onSearchChange(v: string) {
    setQ(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushParams({ q: v || null }), 300);
  }

  const hasActiveFilter = Boolean(event || status !== 'all' || q);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Total" value={counts.total} />
        <Stat label="Paid + attended" value={counts.paid} tone="emerald" />
        <Stat label="Abandoned" value={counts.unpaid} tone="amber" />
        <Stat label="Signed up today" value={counts.today} tone="cyan" />
      </div>

      <div className="card flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex flex-wrap gap-1">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => pushParams({ status: t.key === 'all' ? null : t.key })}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  status === t.key
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t.label}
                {t.countKey && (
                  <span
                    className={`ml-1.5 text-[11px] ${
                      status === t.key ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {counts[t.countKey]?.toLocaleString()}
                  </span>
                )}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name, email, phone…"
            className="input sm:max-w-xs sm:flex-1"
          />
        </div>

        {events.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <select
              className="select sm:w-auto"
              value={event}
              onChange={(e) => pushParams({ event: e.target.value || null })}
              aria-label="Filter by event"
            >
              <option value="">All events</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  setQ('');
                  pushParams({ q: null, status: null, event: null });
                }}
                className="text-xs text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
              >
                Reset filters
              </button>
            )}
            {isPending && <span className="text-xs text-slate-400">Loading…</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'emerald' | 'amber' | 'cyan';
}) {
  const color =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : tone === 'cyan'
          ? 'text-cyan-700'
          : 'text-slate-900';
  return (
    <div className="card">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}

'use client';

/**
 * Typeahead picker for linking a contract to an existing customer (signup).
 * Hits /api/admin/signups-search?q= as the user types, shows up to 12 hits.
 * Selecting a hit fires onPick({signupId, email, firstName, lastName, ...}).
 *
 * Self-contained — no state lifted out. The parent passes `linked` to show
 * the current selection chip, and `onPick(null)` clears it.
 */
import { useEffect, useRef, useState } from 'react';

export type LinkedCustomer = {
  signupId: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
};

type Hit = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
};

export function CustomerLinkPicker({
  linked,
  onPick,
}: {
  linked: LinkedCustomer | null;
  onPick: (c: LinkedCustomer | null) => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced search — 220ms after the last keystroke.
  useEffect(() => {
    if (linked) return; // not searching while a customer is linked
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/admin/signups-search?q=${encodeURIComponent(q.trim())}`);
        const json = (await r.json().catch(() => ({}))) as { hits?: Hit[] };
        setHits(json.hits ?? []);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, linked]);

  // Close dropdown on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (linked) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50/60 px-3 py-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-none text-emerald-600">
          <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold text-emerald-900">
            {[linked.firstName, linked.lastName].filter(Boolean).join(' ') || linked.email}
          </div>
          <div className="truncate text-[11.5px] text-emerald-700">
            {linked.email} · {linked.status}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onPick(null)}
          className="text-[12px] font-medium text-emerald-700 hover:text-emerald-900"
        >
          Unlink
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search by name or email…"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading && <div className="p-3 text-[12px] text-slate-400">Searching…</div>}
          {!loading && hits.length === 0 && (
            <div className="p-3 text-[12px] text-slate-400">No matches. The contract still saves without a link.</div>
          )}
          {!loading &&
            hits.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  onPick({
                    signupId: h.id,
                    email: h.email,
                    firstName: h.firstName,
                    lastName: h.lastName,
                    status: h.status,
                  });
                  setQ('');
                  setOpen(false);
                }}
                className="block w-full border-b border-slate-100 px-3 py-2 text-left text-[13px] hover:bg-cyan-50 last:border-0"
              >
                <div className="font-semibold text-slate-900">
                  {[h.firstName, h.lastName].filter(Boolean).join(' ') || h.email}
                </div>
                <div className="text-[11.5px] text-slate-500">
                  {h.email} · <span className="uppercase tracking-wide">{h.status}</span>
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

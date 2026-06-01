'use client';

import { useState } from 'react';

/**
 * Custom date-range pill for the dashboard period filter. Opens two date
 * inputs; Apply navigates to ?dr=custom&from=…&to=… (the page resolves it).
 */
export function CustomPeriodPicker({
  active,
  from,
  to,
}: {
  active: boolean;
  from?: string;
  to?: string;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(from ?? '');
  const [t, setT] = useState(to ?? '');

  function apply() {
    if (!f || !t) return;
    const [a, b] = f <= t ? [f, t] : [t, f]; // tolerate reversed order
    window.location.href = `/admin?dr=custom&from=${a}&to=${b}`;
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`rounded-full border px-3 py-1 text-[11px] font-medium transition sm:text-xs ${
          active
            ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white hover:text-slate-900'
        }`}
      >
        {active && from && to ? `${from} → ${to}` : '📅 Custom'}
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg">
          <label className="label">From</label>
          <input type="date" className="input" value={f} max={t || undefined} onChange={(e) => setF(e.target.value)} />
          <label className="label mt-2">To</label>
          <input type="date" className="input" value={t} min={f || undefined} onChange={(e) => setT(e.target.value)} />
          <div className="mt-3 flex items-center gap-2">
            <button onClick={apply} disabled={!f || !t} className="btn btn-primary text-xs disabled:opacity-50">
              Apply
            </button>
            <button onClick={() => setOpen(false)} className="btn btn-ghost text-xs">
              Cancel
            </button>
            {active && (
              <a href="/admin" className="ml-auto text-[11px] text-slate-400 hover:text-slate-600">
                Clear
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

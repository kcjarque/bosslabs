'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CustomDateRange({ active }: { active: boolean }) {
  const [open, setOpen] = useState(active);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const router = useRouter();

  function apply() {
    if (!start || !end) return;
    router.push(`/admin?cr=custom&cs=${start}&ce=${end}`);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`rounded-full px-3 py-1 text-[11px] font-medium transition sm:text-xs ${
          active
            ? 'bg-slate-900 text-white shadow-sm'
            : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-white hover:text-slate-900'
        }`}
      >
        Custom
      </button>
      {open && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700"
          />
          <span className="text-[11px] text-slate-400">→</span>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700"
          />
          <button
            type="button"
            onClick={apply}
            disabled={!start || !end}
            className="rounded-full bg-cyan-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-cyan-700 disabled:bg-slate-300"
          >
            Go
          </button>
        </div>
      )}
    </>
  );
}

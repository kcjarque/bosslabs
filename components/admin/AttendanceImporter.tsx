'use client';

import { useState } from 'react';
import { importAttendanceAction, type ImportResult } from '@/app/admin/attendance/actions';

export function AttendanceImporter({ events }: { events: Array<{ id: string; name: string }> }) {
  // React 18 has no useActionState — drive the server action from a plain
  // submit handler, tracking pending/result with useState. FormData is built
  // synchronously before the await so e.currentTarget stays live.
  const [state, setState] = useState<ImportResult>(null);
  const [pending, setPending] = useState(false);
  const [csv, setCsv] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    try {
      setState(await importAttendanceAction(state, fd));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4">
      <div>
        <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-600">Event</label>
        <select
          name="eventId"
          defaultValue={events[0]?.id ?? ''}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
        >
          {events.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-600">
          Zoom participant CSV
        </label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setCsv(await f.text());
          }}
          className="mb-2 block w-full text-[13px] text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
        />
        <textarea
          name="csv"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={6}
          placeholder="…or paste the Zoom participant export here. We just harvest the emails and match them to your signups."
          className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-[12px] focus:border-cyan-400 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-cyan-600 px-5 py-2 text-[14px] font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-60"
      >
        {pending ? 'Importing…' : 'Import attendance'}
      </button>

      {state && (
        <div
          className={`rounded-xl border p-4 text-[13.5px] ${
            state.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {state.ok ? (
            <>
              ✓ Matched <strong>{state.matched}</strong> of {state.total} emails → marked attended.
              {state.unmatched.length > 0 && (
                <div className="mt-2 text-[12px] text-slate-500">
                  {state.unmatched.length} not in your list (guests / different email):{' '}
                  {state.unmatched.slice(0, 8).join(', ')}
                  {state.unmatched.length > 8 ? '…' : ''}
                </div>
              )}
            </>
          ) : (
            state.error
          )}
        </div>
      )}
    </form>
  );
}

'use client';

import { useState } from 'react';
import { saveCloserSettingsAction } from '@/app/admin/closers/actions';

export function CloserSettingsForm({
  initialHours,
  initialWorkStart,
  initialWorkEnd,
}: {
  initialHours: number;
  initialWorkStart: number;
  initialWorkEnd: number;
}) {
  // Hold is stored in hours but edited in days (it's a multi-day window now).
  const [days, setDays] = useState(String(initialHours / 24));
  const [msg, setMsg] = useState('');

  async function save() {
    const d = Number(days);
    if (!(d > 0)) return setMsg('Hold days must be > 0');
    const res = await saveCloserSettingsAction({
      holdHours: d * 24,
      // Work-hours no longer gate the hold (it runs 24/7); pass the stored
      // values through unchanged so they're preserved.
      workStartHour: initialWorkStart,
      workEndHour: initialWorkEnd,
    });
    setMsg(res.ok ? 'Saved ✓' : res.error || 'Failed');
    setTimeout(() => setMsg(''), 2400);
  }

  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-slate-400">Closer settings</div>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Claim hold time (days)</label>
          <input className="input w-28" value={days} onChange={(e) => setDays(e.target.value)} inputMode="decimal" />
        </div>
        <button onClick={save} className="btn btn-primary text-xs">Save</button>
        {msg && <span className="text-xs text-emerald-600">{msg}</span>}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        A closer holds a claimed lead for <strong>{days || '7'} day{Number(days) === 1 ? '' : 's'}</strong>,
        counted 24/7. Once the hold runs out, the lead auto-releases back to the pool (New) for anyone
        to re-claim.
      </p>
    </div>
  );
}

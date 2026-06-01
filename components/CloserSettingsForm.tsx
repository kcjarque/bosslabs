'use client';

import { useState } from 'react';
import { saveCloserSettingsAction } from '@/app/admin/closers/actions';

export function CloserSettingsForm({ initialHours }: { initialHours: number }) {
  const [hours, setHours] = useState(String(initialHours));
  const [msg, setMsg] = useState('');

  async function save() {
    const h = Number(hours);
    if (!(h > 0)) {
      setMsg('Enter hours greater than 0');
      return;
    }
    const res = await saveCloserSettingsAction(h);
    setMsg(res.ok ? 'Saved ✓' : res.error || 'Failed');
    setTimeout(() => setMsg(''), 2200);
  }

  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-slate-400">Closer settings</div>
      <div className="mt-2 flex items-end gap-3">
        <div>
          <label className="label">Claim hold time (hours)</label>
          <input
            className="input w-28"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <button onClick={save} className="btn btn-primary text-xs">Save</button>
        {msg && <span className="text-xs text-emerald-600">{msg}</span>}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        A claimed lead auto-releases back to the pool (New) after this many hours if the closer
        hasn&rsquo;t closed it.
      </p>
    </div>
  );
}

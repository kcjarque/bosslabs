'use client';

import { useState } from 'react';
import { saveCloserSettingsAction } from '@/app/admin/closers/actions';

const hourLabel = (h: number) => {
  const hr = ((h % 24) + 24) % 24;
  const ampm = hr < 12 ? 'am' : 'pm';
  const display = hr % 12 === 0 ? 12 : hr % 12;
  return `${display}${ampm}`;
};

export function CloserSettingsForm({
  initialHours,
  initialWorkStart,
  initialWorkEnd,
}: {
  initialHours: number;
  initialWorkStart: number;
  initialWorkEnd: number;
}) {
  const [hours, setHours] = useState(String(initialHours));
  const [start, setStart] = useState(String(initialWorkStart));
  const [end, setEnd] = useState(String(initialWorkEnd));
  const [msg, setMsg] = useState('');

  async function save() {
    const h = Number(hours);
    const ws = Number(start);
    const we = Number(end);
    if (!(h > 0)) return setMsg('Hold hours must be > 0');
    if (!(we > ws)) return setMsg('Work end must be after start');
    const res = await saveCloserSettingsAction({ holdHours: h, workStartHour: ws, workEndHour: we });
    setMsg(res.ok ? 'Saved ✓' : res.error || 'Failed');
    setTimeout(() => setMsg(''), 2400);
  }

  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-slate-400">Closer settings</div>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Claim hold time (hours)</label>
          <input className="input w-28" value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <label className="label">Work starts (0–23)</label>
          <input className="input w-24" value={start} onChange={(e) => setStart(e.target.value)} inputMode="numeric" />
        </div>
        <div>
          <label className="label">Work ends (0–24)</label>
          <input className="input w-24" value={end} onChange={(e) => setEnd(e.target.value)} inputMode="numeric" />
        </div>
        <button onClick={save} className="btn btn-primary text-xs">Save</button>
        {msg && <span className="text-xs text-emerald-600">{msg}</span>}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        The {hours || '6'}h hold counts <strong>only working hours</strong> ({hourLabel(Number(start) || 9)}–
        {hourLabel(Number(end) || 20)} Manila) — the countdown pauses overnight and resumes when work
        starts. A lead auto-releases to the pool (New) once its working-hour hold runs out.
      </p>
    </div>
  );
}

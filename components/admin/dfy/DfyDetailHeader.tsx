'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DFY_LANES, DFY_LANE_LABEL, type DfyLane, type DfyProject } from '@/lib/dfy';

/** Detail-page header: customer + project name on the left, lane dropdown
 *  and delete button on the right. Lane change PATCHes server then refreshes
 *  the route so server-rendered tabs see the new state. */
export function DfyDetailHeader({ project }: { project: DfyProject }) {
  const router = useRouter();
  const [lane, setLane] = useState<DfyLane>(project.lane);
  const [busy, setBusy] = useState(false);

  async function changeLane(next: DfyLane) {
    const prev = lane;
    setLane(next);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/dfy-projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lane: next, position: Date.now() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      console.error('[dfy/header] lane change failed', err);
      window.alert('Could not move project.');
      setLane(prev);
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    if (!window.confirm(`Delete project "${project.customerName}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/dfy-projects/${project.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push('/admin/dfy');
    } catch (err) {
      console.error('[dfy/header] delete failed', err);
      window.alert('Delete failed.');
      setBusy(false);
    }
  }

  return (
    <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-semibold text-slate-900">{project.customerName}</h1>
        {project.projectName && (
          <p className="mt-0.5 truncate text-[13px] text-slate-500">{project.projectName}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Lane</label>
        <select
          value={lane}
          onChange={(e) => changeLane(e.target.value as DfyLane)}
          disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-900 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200"
        >
          {DFY_LANES.map((l) => (
            <option key={l} value={l}>
              {DFY_LANE_LABEL[l]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={destroy}
          disabled={busy}
          className="rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </header>
  );
}

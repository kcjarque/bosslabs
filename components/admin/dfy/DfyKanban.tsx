'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DFY_LANES, DFY_LANE_LABEL, type DfyLane, type DfyProject } from '@/lib/dfy';
import { CustomerLinkPicker, type LinkedCustomer } from '@/components/admin/CustomerLinkPicker';

/** Kanban board with native HTML5 drag-drop. Cards link to /admin/dfy/[id].
 *  Optimistic updates: moving a card flips local state first, then PATCHes
 *  the server; on failure we revert. */
export function DfyKanban({ initial }: { initial: DfyProject[] }) {
  const [projects, setProjects] = useState<DfyProject[]>(initial);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverLane, setHoverLane] = useState<DfyLane | null>(null);
  const [creatingLane, setCreatingLane] = useState<DfyLane | null>(null);

  const byLane = useMemo(() => {
    const map: Record<DfyLane, DfyProject[]> = {
      lite: [], contract: [], production: [], feedback: [], launch: [], maintenance: [],
    };
    for (const p of projects) map[p.lane].push(p);
    return map;
  }, [projects]);

  async function moveToLane(projectId: string, lane: DfyLane) {
    const prev = projects;
    setProjects((all) =>
      all.map((p) => (p.id === projectId ? { ...p, lane, position: Date.now() } : p)),
    );
    try {
      const res = await fetch(`/api/admin/dfy-projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lane, position: Date.now() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error('[dfy] move failed', err);
      setProjects(prev);
      window.alert('Could not move card. Please try again.');
    }
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
      <div className="flex min-w-max gap-4">
        {DFY_LANES.map((lane) => {
          const items = byLane[lane];
          const isHover = hoverLane === lane && draggingId;
          return (
            <div
              key={lane}
              onDragOver={(e) => {
                if (draggingId) {
                  e.preventDefault();
                  if (hoverLane !== lane) setHoverLane(lane);
                }
              }}
              onDragLeave={() => {
                if (hoverLane === lane) setHoverLane(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain') || draggingId;
                if (id) moveToLane(id, lane);
                setHoverLane(null);
                setDraggingId(null);
              }}
              className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-slate-100/60 p-3 transition ${
                isHover ? 'border-cyan-400 bg-cyan-50 ring-2 ring-cyan-200' : 'border-slate-200'
              }`}
            >
              <header className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13px] font-bold uppercase tracking-wider text-slate-700">
                    {DFY_LANE_LABEL[lane]}
                  </h2>
                  <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm">
                    {items.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCreatingLane(lane)}
                  className="rounded-md bg-white px-2 py-1 text-[12px] font-semibold text-cyan-700 shadow-sm transition hover:bg-cyan-50"
                  title={`Add project to ${DFY_LANE_LABEL[lane]}`}
                >
                  + Add
                </button>
              </header>

              <div className="flex flex-col gap-2">
                {items.map((p) => (
                  <CardTile
                    key={p.id}
                    project={p}
                    onDragStart={() => setDraggingId(p.id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setHoverLane(null);
                    }}
                  />
                ))}
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white/60 px-3 py-6 text-center text-[12px] text-slate-400">
                    Drop here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {creatingLane && (
        <NewProjectModal
          lane={creatingLane}
          onClose={() => setCreatingLane(null)}
          onCreated={(p) => {
            setProjects((all) => [...all, p]);
            setCreatingLane(null);
          }}
        />
      )}
    </div>
  );
}

function CardTile({
  project,
  onDragStart,
  onDragEnd,
}: {
  project: DfyProject;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const done = project.buildSteps.filter((s) => s.checkedAt).length;
  const total = project.buildSteps.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const hasLinks = !!(project.gitUrl || project.stagingUrl || project.prodUrl);

  return (
    <Link
      href={`/admin/dfy/${project.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', project.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="group block cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-cyan-300 hover:shadow active:cursor-grabbing"
    >
      <div className="line-clamp-1 text-[13px] font-semibold text-slate-900 group-hover:text-cyan-700">
        {project.customerName}
      </div>
      {project.projectName && (
        <div className="mt-0.5 line-clamp-1 text-[11.5px] text-slate-500">{project.projectName}</div>
      )}
      <div className="mt-2 flex items-center gap-2 text-[10.5px] text-slate-400">
        <span className="tabular-nums">{done}/{total}</span>
        <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className="absolute inset-y-0 left-0 bg-cyan-500" style={{ width: `${pct}%` }} />
        </div>
        {hasLinks && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="text-slate-400">
            <path d="M10 14a5 5 0 0 1 7-7l3 3a5 5 0 0 1-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M14 10a5 5 0 0 1-7 7l-3-3a5 5 0 0 1 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </div>
    </Link>
  );
}

function NewProjectModal({
  lane,
  onClose,
  onCreated,
}: {
  lane: DfyLane;
  onClose: () => void;
  onCreated: (p: DfyProject) => void;
}) {
  const [customerName, setCustomerName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [linked, setLinked] = useState<LinkedCustomer | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Auto-fill customer name from the picked signup so the user doesn't
  // double-type. If they then edit it, leave their edit alone.
  useEffect(() => {
    if (!linked) return;
    const auto = `${linked.firstName} ${linked.lastName}`.trim() || linked.email;
    setCustomerName((current) => (current.trim() ? current : auto));
  }, [linked]);

  async function submit() {
    if (!customerName.trim()) {
      window.alert('Customer name is required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/dfy-projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          projectName: projectName.trim() || null,
          signupId: linked?.signupId ?? null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { project?: DfyProject; error?: string };
      if (!res.ok || !json.project) throw new Error(json.error || `HTTP ${res.status}`);
      // The server seeds lane='lite' regardless; if the user opened this modal
      // from another lane, move the new card into that lane immediately.
      let created = json.project;
      if (lane !== 'lite') {
        const moveRes = await fetch(`/api/admin/dfy-projects/${created.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ lane }),
        });
        const moved = (await moveRes.json().catch(() => ({}))) as { project?: DfyProject };
        if (moved.project) created = moved.project;
      }
      onCreated(created);
    } catch (err) {
      console.error('[dfy] create failed', err);
      window.alert(err instanceof Error ? err.message : 'Create failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 className="text-base font-semibold text-slate-900">New DFY project</h2>
        <p className="mt-1 text-[12px] text-slate-500">
          Will land in <strong>{DFY_LANE_LABEL[lane]}</strong>.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Link customer (optional)
            </label>
            <CustomerLinkPicker linked={linked} onPick={setLinked} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Customer name *
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200"
              placeholder="e.g. Lead Empire OPC"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Project name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200"
              placeholder="e.g. Anaya Ops v2"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-300 px-4 py-1.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="rounded-full bg-cyan-600 px-5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-wait disabled:opacity-70"
          >
            {submitting ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  );
}

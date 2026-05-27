'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import type { SequenceModel, ListModel, EventModel } from '@/lib/db';

export function SequencesEditor({
  initial,
  lists,
  events,
  stepCounts,
  onCreate,
  onUpdate,
  onDelete,
}: {
  initial: SequenceModel[];
  lists: ListModel[];
  events: EventModel[];
  stepCounts: Record<string, number>;
  onCreate: (fd: FormData) => Promise<void>;
  onUpdate: (
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      listId?: string;
      eventId?: string | null;
      active?: boolean;
    },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const canCreate = lists.length > 0;

  const listById = Object.fromEntries(lists.map((l) => [l.id, l]));
  const eventById = Object.fromEntries(events.map((e) => [e.id, e]));

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">All sequences</h2>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setCreating((v) => !v)}
          disabled={!canCreate}
        >
          {creating ? 'Cancel' : '+ New sequence'}
        </button>
      </div>

      {creating && (
        <form
          action={async (fd) => {
            await onCreate(fd);
            setCreating(false);
          }}
          className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4"
        >
          <div>
            <label className="label">Name</label>
            <input name="name" className="input" required placeholder="VIP nurture sequence" />
          </div>
          <div>
            <label className="label">Description (optional)</label>
            <input name="description" className="input" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">List</label>
              <select name="listId" className="select" required>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Event (timing anchor)</label>
              <select name="eventId" className="select">
                <option value="">— None (subscribe-relative only) —</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              Create sequence
            </button>
          </div>
        </form>
      )}

      {initial.length === 0 && !creating && (
        <p className="mt-4 text-sm text-slate-500">No sequences yet.</p>
      )}

      {initial.length > 0 && (
        <table className="mt-4">
          <thead>
            <tr>
              <th>Name</th>
              <th>List</th>
              <th>Event</th>
              <th className="text-right">Steps</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {initial.map((seq) => (
              <tr key={seq.id}>
                <td>
                  <Link
                    href={`/admin/sequences/${seq.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {seq.name}
                  </Link>
                  {seq.description && (
                    <div className="mt-0.5 text-xs text-slate-500">{seq.description}</div>
                  )}
                </td>
                <td>
                  {listById[seq.listId] ? (
                    <span className="pill pill-cyan">{listById[seq.listId].name}</span>
                  ) : (
                    <span className="pill pill-red">missing list</span>
                  )}
                </td>
                <td>
                  {seq.eventId && eventById[seq.eventId] ? (
                    <span className="pill">{eventById[seq.eventId].name}</span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="text-right font-mono">{stepCounts[seq.id] ?? 0}</td>
                <td>
                  {seq.active ? (
                    <span className="pill pill-green">Active</span>
                  ) : (
                    <span className="pill">Paused</span>
                  )}
                </td>
                <td className="text-right">
                  <Link href={`/admin/sequences/${seq.id}`} className="btn btn-ghost">
                    Edit
                  </Link>
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      startTransition(() => onUpdate(seq.id, { active: !seq.active }))
                    }
                  >
                    {seq.active ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    className="btn btn-ghost text-red-600"
                    onClick={() => {
                      if (
                        !confirm(
                          `Delete sequence "${seq.name}"? All its steps + send history will be deleted.`,
                        )
                      )
                        return;
                      startTransition(() => onDelete(seq.id));
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

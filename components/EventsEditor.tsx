'use client';

import { useState, useTransition } from 'react';
import type { EventModel } from '@/lib/db';

export function EventsEditor({
  initial,
  onCreate,
  onUpdate,
  onDelete,
}: {
  initial: EventModel[];
  onCreate: (fd: FormData) => Promise<void>;
  onUpdate: (
    id: string,
    patch: { name?: string; startsAtIso?: string; timezone?: string; active?: boolean },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">All events</h2>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCreating((v) => !v)}
          >
            {creating ? 'Cancel' : '+ New event'}
          </button>
        </div>

        {creating && (
          <form
            action={async (fd) => {
              await onCreate(fd);
              setCreating(false);
            }}
            className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-3"
          >
            <div className="sm:col-span-3">
              <label className="label">Event name</label>
              <input
                name="name"
                className="input"
                placeholder="BOSSLABS AI Webinar — May 21"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Starts at (ISO 8601)</label>
              <input
                name="startsAtIso"
                className="input"
                placeholder="2026-05-21T20:00:00+08:00"
                required
              />
            </div>
            <div>
              <label className="label">Timezone</label>
              <input name="timezone" className="input" defaultValue="Asia/Manila" />
            </div>
            <div className="sm:col-span-3">
              <button type="submit" className="btn btn-primary" disabled={isPending}>
                Create event
              </button>
            </div>
          </form>
        )}

        {initial.length === 0 && !creating && (
          <p className="mt-4 text-sm text-slate-500">No events yet. Create one to start scheduling sequences.</p>
        )}

        {initial.length > 0 && (
          <table className="mt-4">
            <thead>
              <tr>
                <th>Name</th>
                <th>Starts at</th>
                <th>Timezone</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {initial.map((ev) => (
                <EventRow
                  key={ev.id}
                  ev={ev}
                  editing={editingId === ev.id}
                  onEdit={() => setEditingId(ev.id === editingId ? null : ev.id)}
                  onSave={(patch) => {
                    startTransition(async () => {
                      await onUpdate(ev.id, patch);
                      setEditingId(null);
                    });
                  }}
                  onDelete={() => {
                    if (!confirm(`Delete event "${ev.name}"? Attached sequences will lose their anchor.`)) return;
                    startTransition(() => onDelete(ev.id));
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function EventRow({
  ev,
  editing,
  onEdit,
  onSave,
  onDelete,
}: {
  ev: EventModel;
  editing: boolean;
  onEdit: () => void;
  onSave: (patch: { name?: string; startsAtIso?: string; timezone?: string; active?: boolean }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(ev.name);
  const [startsAtIso, setStartsAtIso] = useState(ev.startsAtIso);
  const [timezone, setTimezone] = useState(ev.timezone);
  const [active, setActive] = useState(ev.active);

  let formatted = ev.startsAtIso;
  try {
    formatted = new Date(ev.startsAtIso).toLocaleString('en-US', {
      timeZone: ev.timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {}

  if (!editing) {
    return (
      <tr>
        <td className="font-medium text-slate-900">{ev.name}</td>
        <td className="font-mono text-xs text-slate-600">{formatted}</td>
        <td>{ev.timezone}</td>
        <td>
          {ev.active ? (
            <span className="pill pill-green">Active</span>
          ) : (
            <span className="pill">Inactive</span>
          )}
        </td>
        <td className="text-right">
          <button className="btn btn-ghost" onClick={onEdit}>Edit</button>
          <button className="btn btn-ghost text-red-600" onClick={onDelete}>Delete</button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td>
        <input
          className="input font-mono text-xs"
          value={startsAtIso}
          onChange={(e) => setStartsAtIso(e.target.value)}
          placeholder="2026-05-21T20:00:00+08:00"
        />
      </td>
      <td>
        <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
      </td>
      <td>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
      </td>
      <td className="text-right">
        <button
          className="btn btn-primary"
          onClick={() => onSave({ name, startsAtIso, timezone, active })}
        >
          Save
        </button>
        <button className="btn btn-ghost" onClick={onEdit}>Cancel</button>
      </td>
    </tr>
  );
}

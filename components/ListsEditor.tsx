'use client';

import { useState, useTransition } from 'react';
import type { ListModel, ListFilterType } from '@/lib/db';

const FILTER_OPTIONS: { value: ListFilterType; label: string; hint: string }[] = [
  { value: 'all_registered', label: 'All Webinar Attendees', hint: 'Paid source + status registered or paid' },
  { value: 'all_paid', label: 'Paid only', hint: 'Status = paid' },
  { value: 'all_free', label: 'Free signups', hint: 'Source = free (no payment intent)' },
  { value: 'abandoned', label: 'Abandoned checkouts', hint: 'Paid source + still registered (no payment)' },
  { value: 'all_signups', label: 'Everyone', hint: 'Every signup (excludes unsubscribed)' },
];

export function ListsEditor({
  initial,
  memberCounts,
  onCreate,
  onUpdate,
  onDelete,
}: {
  initial: ListModel[];
  memberCounts: Record<string, number>;
  onCreate: (fd: FormData) => Promise<void>;
  onUpdate: (
    id: string,
    patch: { name?: string; description?: string | null; filterType?: ListFilterType },
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
          <h2 className="text-base font-semibold text-slate-900">All lists</h2>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCreating((v) => !v)}
          >
            {creating ? 'Cancel' : '+ New list'}
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
              <input name="name" className="input" placeholder="VIP buyers" required />
            </div>
            <div>
              <label className="label">Description (optional)</label>
              <input
                name="description"
                className="input"
                placeholder="What this list represents"
              />
            </div>
            <div>
              <label className="label">Filter</label>
              <select name="filterType" className="select" required defaultValue="all_registered">
                {FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} — {opt.hint}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <button type="submit" className="btn btn-primary" disabled={isPending}>
                Create list
              </button>
            </div>
          </form>
        )}

        {initial.length === 0 && !creating && (
          <p className="mt-4 text-sm text-slate-500">No lists yet.</p>
        )}

        {initial.length > 0 && (
          <table className="mt-4">
            <thead>
              <tr>
                <th>Name</th>
                <th>Filter</th>
                <th className="text-right">Members</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {initial.map((list) => (
                <ListRow
                  key={list.id}
                  list={list}
                  memberCount={memberCounts[list.id] ?? 0}
                  editing={editingId === list.id}
                  onEdit={() => setEditingId(list.id === editingId ? null : list.id)}
                  onSave={(patch) => {
                    startTransition(async () => {
                      await onUpdate(list.id, patch);
                      setEditingId(null);
                    });
                  }}
                  onDelete={() => {
                    if (
                      !confirm(
                        `Delete list "${list.name}"? Any sequences attached will be deleted too.`,
                      )
                    )
                      return;
                    startTransition(() => onDelete(list.id));
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

function ListRow({
  list,
  memberCount,
  editing,
  onEdit,
  onSave,
  onDelete,
}: {
  list: ListModel;
  memberCount: number;
  editing: boolean;
  onEdit: () => void;
  onSave: (patch: { name?: string; description?: string | null; filterType?: ListFilterType }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? '');
  const [filterType, setFilterType] = useState<ListFilterType>(list.filterType);

  const filterLabel = FILTER_OPTIONS.find((o) => o.value === list.filterType)?.label ?? list.filterType;

  if (!editing) {
    return (
      <tr>
        <td>
          <div className="font-medium text-slate-900">{list.name}</div>
          {list.description && (
            <div className="mt-0.5 text-xs text-slate-500">{list.description}</div>
          )}
        </td>
        <td>
          <span className="pill pill-cyan">{filterLabel}</span>
        </td>
        <td className="text-right font-mono">{memberCount}</td>
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
        <input
          className="input mt-2"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
        />
      </td>
      <td>
        <select
          className="select"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as ListFilterType)}
        >
          {FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </td>
      <td className="text-right font-mono">{memberCount}</td>
      <td className="text-right">
        <button
          className="btn btn-primary"
          onClick={() =>
            onSave({
              name,
              description: description || null,
              filterType,
            })
          }
        >
          Save
        </button>
        <button className="btn btn-ghost" onClick={onEdit}>Cancel</button>
      </td>
    </tr>
  );
}

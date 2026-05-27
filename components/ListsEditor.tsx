'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { ListModel, ListFilterType, EventModel } from '@/lib/db';
import { EventPill } from './EventPill';

const FILTER_OPTIONS: { value: ListFilterType; label: string; hint: string }[] = [
  { value: 'all_registered', label: 'All Webinar Attendees', hint: 'Paid source + status registered or paid' },
  { value: 'all_paid', label: 'Paid only', hint: 'Status = paid' },
  { value: 'all_free', label: 'Free signups', hint: 'Source = free (no payment intent)' },
  { value: 'abandoned', label: 'Abandoned checkouts', hint: 'Paid source + still registered (no payment)' },
  { value: 'all_signups', label: 'Everyone', hint: 'Every signup (excludes unsubscribed)' },
];

export function ListsEditor({
  initial,
  events,
  memberCounts,
  onCreate,
  onUpdate,
  onDelete,
}: {
  initial: ListModel[];
  events: EventModel[];
  memberCounts: Record<string, number>;
  onCreate: (fd: FormData) => Promise<void>;
  onUpdate: (
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      filterTypes?: ListFilterType[];
      eventId?: string | null;
    },
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
          <CreateListForm
            events={events}
            onCreate={async (fd) => {
              await onCreate(fd);
              setCreating(false);
            }}
            isPending={isPending}
          />
        )}

        {initial.length === 0 && !creating && (
          <p className="mt-4 text-sm text-slate-500">No lists yet.</p>
        )}

        {initial.length > 0 && (
          <div className="mt-4 -mx-5 overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Filters</th>
                  <th>Event</th>
                  <th className="text-right">Members</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {initial.map((list) => (
                  <ListRow
                    key={list.id}
                    list={list}
                    events={events}
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
          </div>
        )}
      </div>
    </div>
  );
}

function CreateListForm({
  events,
  onCreate,
  isPending,
}: {
  events: EventModel[];
  onCreate: (fd: FormData) => Promise<void>;
  isPending: boolean;
}) {
  const [selected, setSelected] = useState<ListFilterType[]>(['all_registered']);

  return (
    <form
      action={onCreate}
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
        <label className="label">Event</label>
        <select name="eventId" className="select" defaultValue="">
          <option value="">All events (any registered)</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-slate-500">
          Scope the list to signups registered for one specific event.
        </p>
      </div>
      <div>
        <label className="label">
          Filters{' '}
          <span className="ml-1 normal-case tracking-normal text-[10px] text-slate-400">
            (members = UNION across selected filters)
          </span>
        </label>
        <FilterCheckboxes
          selected={selected}
          onChange={setSelected}
          formFieldName="filterTypes"
        />
        {selected.length === 0 && (
          <p className="mt-1 text-xs text-red-600">Pick at least one filter.</p>
        )}
      </div>
      <div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isPending || selected.length === 0}
        >
          Create list
        </button>
      </div>
    </form>
  );
}

function ListRow({
  list,
  events,
  memberCount,
  editing,
  onEdit,
  onSave,
  onDelete,
}: {
  list: ListModel;
  events: EventModel[];
  memberCount: number;
  editing: boolean;
  onEdit: () => void;
  onSave: (patch: {
    name?: string;
    description?: string | null;
    filterTypes?: ListFilterType[];
    eventId?: string | null;
  }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? '');
  const [filterTypes, setFilterTypes] = useState<ListFilterType[]>(list.filterTypes);
  const [eventId, setEventId] = useState<string>(list.eventId ?? '');

  const eventName = list.eventId
    ? events.find((e) => e.id === list.eventId)?.name ?? '(missing event)'
    : null;

  if (!editing) {
    return (
      <tr>
        <td>
          <Link
            href={`/admin/lists/${list.id}`}
            className="font-medium text-slate-900 hover:underline"
          >
            {list.name}
          </Link>
          {list.description && (
            <div className="mt-0.5 text-xs text-slate-500">{list.description}</div>
          )}
        </td>
        <td>
          <div className="flex flex-wrap gap-1">
            {list.filterTypes.length === 0 ? (
              <span className="pill pill-red">no filter</span>
            ) : (
              list.filterTypes.map((ft) => {
                const label = FILTER_OPTIONS.find((o) => o.value === ft)?.label ?? ft;
                return (
                  <span key={ft} className="pill pill-cyan">
                    {label}
                  </span>
                );
              })
            )}
          </div>
        </td>
        <td>
          {eventName ? (
            <EventPill name={eventName} />
          ) : (
            <span className="text-xs text-slate-400">All events</span>
          )}
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
        <FilterCheckboxes selected={filterTypes} onChange={setFilterTypes} />
        {filterTypes.length === 0 && (
          <p className="mt-1 text-xs text-red-600">Pick at least one filter.</p>
        )}
      </td>
      <td>
        <select
          className="select"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
        >
          <option value="">All events</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </select>
      </td>
      <td className="text-right font-mono">{memberCount}</td>
      <td className="text-right">
        <button
          className="btn btn-primary"
          disabled={filterTypes.length === 0}
          onClick={() =>
            onSave({
              name,
              description: description || null,
              filterTypes,
              eventId: eventId || null,
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

/**
 * Multi-select dropdown for filter types. The trigger button shows a
 * summary of what's currently selected ("Paid only" or "3 filters")
 * and a menu opens with one row per option. Hidden inputs let a parent
 * <form> collect the selected values via formData.getAll(formFieldName).
 *
 * Replaced the inline stacked-card UI which took too much vertical
 * space on the lists page once we added the event column.
 */
function FilterCheckboxes({
  selected,
  onChange,
  formFieldName,
}: {
  selected: ListFilterType[];
  onChange: (next: ListFilterType[]) => void;
  /** When set, also emits hidden inputs so a parent <form> can collect via formData.getAll(). */
  formFieldName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  function toggle(value: ListFilterType, checked: boolean) {
    if (checked) onChange([...new Set([...selected, value])]);
    else onChange(selected.filter((v) => v !== value));
  }

  function openMenu() {
    // position: fixed lets the menu escape ancestor `overflow: hidden`
    // (e.g. the lists table's overflow-x-auto wrapper). Recompute the
    // coords from the trigger's bounding rect every time we open.
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPos({
        top: rect.bottom + 4,
        left: rect.left,
        // Wider than the trigger so option descriptions stay readable
        // even when the trigger gets squeezed inside a narrow table cell.
        width: Math.max(rect.width, 260),
      });
    }
    setOpen(true);
  }

  // Close on outside click / Escape. Menu lives in fixed coords so the
  // listener needs to consider both the trigger and the menu element.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onScroll() {
      // Trigger moves with the page but the fixed-position menu doesn't,
      // so just close instead of recomputing on every scroll tick.
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const summary =
    selected.length === 0
      ? 'Pick filters…'
      : selected.length === 1
        ? (FILTER_OPTIONS.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} filters`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="flex w-full items-center justify-between gap-2 truncate rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 transition hover:border-slate-400"
      >
        <span className={`truncate ${selected.length === 0 ? 'text-slate-400' : ''}`}>
          {summary}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && menuPos && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, width: menuPos.width }}
          className="z-50 max-h-80 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg"
        >
          {FILTER_OPTIONS.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 transition ${
                  checked ? 'bg-cyan-50/60' : 'hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggle(opt.value, e.target.checked)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-900">{opt.label}</div>
                  <div className="text-xs text-slate-500">{opt.hint}</div>
                </div>
              </label>
            );
          })}
        </div>
      )}

      {/* Hidden inputs so a parent <form> can read filterTypes via formData.getAll */}
      {formFieldName &&
        selected.map((v) => (
          <input key={v} type="hidden" name={formFieldName} value={v} />
        ))}
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import type { EventModel } from '@/lib/db';
import {
  combineLocalAndTimezone,
  isoToLocalDateTime,
  COMMON_TIMEZONES,
} from '@/lib/datetime';

export function EventsEditor({
  initial,
  onCreate,
  onUpdate,
  onDelete,
  defaultTimezone = 'Asia/Manila',
}: {
  initial: EventModel[];
  onCreate: (fd: FormData) => Promise<void>;
  onUpdate: (
    id: string,
    patch: {
      name?: string;
      startsAtLocal?: string;
      timezone?: string;
      active?: boolean;
      zoomJoinUrl?: string;
    },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  defaultTimezone?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [view, setView] = useState<'list' | 'calendar'>('calendar');
  // Calendar modal — create (with a prefilled day) or edit an existing event.
  const [modal, setModal] = useState<
    { mode: 'create'; dateLocal: string } | { mode: 'edit'; event: EventModel } | null
  >(null);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">All events</h2>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[12px] font-medium">
              <button
                type="button"
                onClick={() => setView('calendar')}
                className={`rounded-md px-3 py-1 transition ${
                  view === 'calendar' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Calendar
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                className={`rounded-md px-3 py-1 transition ${
                  view === 'list' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                List
              </button>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (view === 'calendar') {
                  setModal({ mode: 'create', dateLocal: defaultCreateDateLocal() });
                } else {
                  setCreating((v) => !v);
                }
              }}
            >
              {view === 'list' && creating ? 'Cancel' : '+ New event'}
            </button>
          </div>
        </div>

        {view === 'list' && creating && (
          <CreateEventForm
            defaultTimezone={defaultTimezone}
            onSubmit={async (fd) => {
              await onCreate(fd);
              setCreating(false);
            }}
            isPending={isPending}
          />
        )}

        {initial.length === 0 && view === 'list' && !creating && (
          <p className="mt-4 text-sm text-slate-500">
            No events yet. Create one to start scheduling sequences.
          </p>
        )}

        {view === 'calendar' && (
          <CalendarView
            events={initial}
            onPickDay={(dateLocal) => setModal({ mode: 'create', dateLocal })}
            onPickEvent={(event) => setModal({ mode: 'edit', event })}
          />
        )}

        {view === 'list' && initial.length > 0 && (
          <div className="mt-4 -mx-5 overflow-x-auto">
            <table className="min-w-full">
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
                      if (
                        !confirm(
                          `Delete event "${ev.name}"? Attached sequences will lose their anchor.`,
                        )
                      )
                        return;
                      startTransition(() => onDelete(ev.id));
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <EventModal
          modal={modal}
          defaultTimezone={defaultTimezone}
          onClose={() => setModal(null)}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

/** Default create date = next Thursday at 19:00 local, as a datetime-local
 *  string. The webinar cadence is weekly Thursday 7pm, so this pre-fills the
 *  most likely slot; the admin can still change it. */
function defaultCreateDateLocal(): string {
  const d = new Date();
  const day = d.getDay(); // 0 Sun … 4 Thu
  const daysUntilThu = (4 - day + 7) % 7 || 7; // always the NEXT Thursday
  d.setDate(d.getDate() + daysUntilThu);
  d.setHours(19, 0, 0, 0);
  return toLocalInputValue(d);
}

/** A specific calendar day (YYYY-MM-DD) at 19:00 → datetime-local value. */
function dayAt7pm(year: number, month: number, day: number): string {
  const d = new Date(year, month, day, 19, 0, 0, 0);
  return toLocalInputValue(d);
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function CalendarView({
  events,
  onPickDay,
  onPickEvent,
}: {
  events: EventModel[];
  onPickDay: (dateLocal: string) => void;
  onPickEvent: (event: EventModel) => void;
}) {
  // Which month is on screen. Defaults to the month of the soonest upcoming
  // event (so the calendar opens showing where the action is), else today.
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    const upcoming = [...events]
      .map((e) => new Date(e.startsAtIso))
      .filter((d) => !isNaN(d.getTime()) && d >= new Date(now.getFullYear(), now.getMonth(), 1))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const base = upcoming ?? now;
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  // Bucket events by local YYYY-MM-DD for O(1) day lookup.
  const byDay = new Map<string, EventModel[]>();
  for (const e of events) {
    const d = new Date(e.startsAtIso);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const list = byDay.get(key) ?? [];
    list.push(e);
    byDay.set(key, list);
  }

  const firstOfMonth = new Date(cursor.year, cursor.month, 1);
  const startWeekday = firstOfMonth.getDay(); // 0..6, leading blanks
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === cursor.year &&
    today.getMonth() === cursor.month &&
    today.getDate() === day;

  // Build a padded cell array (leading blanks + days). 6 rows × 7 = 42 max.
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const m = c.month + delta;
      return { year: c.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  };

  const fmtTime = (e: EventModel) => {
    try {
      return new Date(e.startsAtIso).toLocaleString('en-US', {
        timeZone: e.timezone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="mt-4">
      {/* Month nav */}
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[15px] font-semibold text-slate-900">
          {MONTHS[cursor.month]} {cursor.year}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="rounded-md border border-slate-200 px-2.5 py-1 text-[13px] text-slate-600 transition hover:bg-slate-50"
            aria-label="Previous month"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
            className="rounded-md border border-slate-200 px-3 py-1 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="rounded-md border border-slate-200 px-2.5 py-1 text-[13px] text-slate-600 transition hover:bg-slate-50"
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="min-h-[92px] rounded-lg bg-slate-50/40" />;
          const dayEvents = byDay.get(`${cursor.year}-${cursor.month}-${day}`) ?? [];
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPickDay(dayAt7pm(cursor.year, cursor.month, day))}
              className={`group min-h-[92px] rounded-lg border p-1.5 text-left transition hover:border-cyan-300 hover:bg-cyan-50/30 ${
                isToday(day) ? 'border-cyan-400 bg-cyan-50/40' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[12px] font-semibold ${
                    isToday(day) ? 'text-cyan-700' : 'text-slate-600'
                  }`}
                >
                  {day}
                </span>
                <span className="text-[14px] leading-none text-slate-300 opacity-0 transition group-hover:opacity-100">
                  +
                </span>
              </div>
              <div className="mt-1 space-y-1">
                {dayEvents.map((e) => (
                  <span
                    key={e.id}
                    role="button"
                    tabIndex={0}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onPickEvent(e);
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.stopPropagation();
                        onPickEvent(e);
                      }
                    }}
                    className={`block cursor-pointer truncate rounded px-1.5 py-1 text-[10.5px] font-medium transition ${
                      e.active
                        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                    title={`${e.name} · ${fmtTime(e)}`}
                  >
                    {fmtTime(e)} {e.name.replace(/^.*?—\s*/, '').trim() || e.name}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-slate-400">
        Click a day to create an event (defaults to 7:00 PM). Click an event to edit or delete it.
        Green = active.
      </p>
    </div>
  );
}

function EventModal({
  modal,
  defaultTimezone,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  modal: { mode: 'create'; dateLocal: string } | { mode: 'edit'; event: EventModel };
  defaultTimezone: string;
  onClose: () => void;
  onCreate: (fd: FormData) => Promise<void>;
  onUpdate: (
    id: string,
    patch: { name?: string; startsAtLocal?: string; timezone?: string; active?: boolean; zoomJoinUrl?: string },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const isEdit = modal.mode === 'edit';
  const ev = isEdit ? modal.event : null;
  const [name, setName] = useState(ev?.name ?? '');
  const [startsAtLocal, setStartsAtLocal] = useState(
    isEdit && ev ? isoToLocalDateTime(ev.startsAtIso) : modal.mode === 'create' ? modal.dateLocal : '',
  );
  const [timezone, setTimezone] = useState(ev?.timezone ?? defaultTimezone);
  const [active, setActive] = useState(ev?.active ?? true);
  const [zoomJoinUrl, setZoomJoinUrl] = useState(ev?.zoomJoinUrl ?? '');
  const [busy, setBusy] = useState(false);

  const preview = startsAtLocal && timezone ? combineLocalAndTimezone(startsAtLocal, timezone) : '';

  async function save() {
    if (!name.trim() || !startsAtLocal) {
      window.alert('Event name and start time are required.');
      return;
    }
    setBusy(true);
    try {
      if (isEdit && ev) {
        await onUpdate(ev.id, { name, startsAtLocal, timezone, active, zoomJoinUrl });
      } else {
        const fd = new FormData();
        fd.set('name', name);
        fd.set('startsAtLocal', startsAtLocal);
        fd.set('timezone', timezone);
        fd.set('zoomJoinUrl', zoomJoinUrl);
        await onCreate(fd);
      }
      onClose();
    } catch (err) {
      console.error('[events] save failed', err);
      window.alert('Save failed. Try again.');
      setBusy(false);
    }
  }

  async function destroy() {
    if (!ev) return;
    if (!window.confirm(`Delete event "${ev.name}"? Attached sequences will lose their anchor.`)) return;
    setBusy(true);
    try {
      await onDelete(ev.id);
      onClose();
    } catch {
      window.alert('Delete failed.');
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            {isEdit ? 'Edit event' : 'New event'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Event name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="AI Vibe Coding 101 — July 16" />
          </div>
          <div>
            <label className="label">Starts at</label>
            <input type="datetime-local" className="input" value={startsAtLocal} onChange={(e) => setStartsAtLocal(e.target.value)} />
          </div>
          <div>
            <label className="label">Timezone</label>
            <select className="select" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Zoom join URL</label>
            <input className="input" value={zoomJoinUrl} onChange={(e) => setZoomJoinUrl(e.target.value)} placeholder="https://zoom.us/j/… (blank = global Settings link)" />
          </div>
          {isEdit && (
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Active
              </label>
            </div>
          )}
          {preview && (
            <div className="sm:col-span-2">
              <p className="text-xs text-slate-500">
                Saved as <span className="font-mono text-slate-700">{preview}</span>
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <div>
            {isEdit && (
              <button type="button" onClick={destroy} disabled={busy} className="btn btn-ghost text-red-600">
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost">Cancel</button>
            <button type="button" onClick={save} disabled={busy} className="btn btn-primary">
              {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create event'}
            </button>
          </div>
        </div>

        {!isEdit && (
          <p className="mt-3 text-[11px] text-slate-400">
            Note: creating an event here makes a bare row. To also spin up its Paid/Abandoned lists +
            reminder sequences, use the weekly rollover flow.
          </p>
        )}
      </div>
    </div>
  );
}

function CreateEventForm({
  defaultTimezone,
  onSubmit,
  isPending,
}: {
  defaultTimezone: string;
  onSubmit: (fd: FormData) => Promise<void>;
  isPending: boolean;
}) {
  const [startsAtLocal, setStartsAtLocal] = useState('');
  const [timezone, setTimezone] = useState(defaultTimezone);

  const preview =
    startsAtLocal && timezone ? combineLocalAndTimezone(startsAtLocal, timezone) : '';

  return (
    <form
      action={onSubmit}
      className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <label className="label">Event name</label>
        <input
          name="name"
          className="input"
          placeholder="BOSSLABS AI Webinar — May 21"
          required
        />
      </div>
      <div>
        <label className="label">Starts at</label>
        <input
          type="datetime-local"
          name="startsAtLocal"
          className="input"
          value={startsAtLocal}
          onChange={(e) => setStartsAtLocal(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label">Timezone</label>
        <select
          name="timezone"
          className="select"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Zoom join URL</label>
        <input
          name="zoomJoinUrl"
          className="input"
          placeholder="https://zoom.us/j/… (blank = use global Settings link)"
        />
        <p className="mt-1 text-xs text-slate-500">
          Per-event link. Leave blank to fall back to the global Zoom link in
          Settings.
        </p>
      </div>
      {preview && (
        <div className="sm:col-span-2">
          <p className="text-xs text-slate-500">
            Will be saved as{' '}
            <span className="font-mono text-slate-700">{preview}</span>
          </p>
        </div>
      )}
      <div className="sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          Create event
        </button>
      </div>
    </form>
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
  onSave: (patch: {
    name?: string;
    startsAtLocal?: string;
    timezone?: string;
    active?: boolean;
    zoomJoinUrl?: string;
  }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(ev.name);
  const [startsAtLocal, setStartsAtLocal] = useState(isoToLocalDateTime(ev.startsAtIso));
  const [timezone, setTimezone] = useState(ev.timezone);
  const [active, setActive] = useState(ev.active);
  const [zoomJoinUrl, setZoomJoinUrl] = useState(ev.zoomJoinUrl ?? '');

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
        <td>
          <div className="text-slate-900">{formatted}</div>
          <div className="font-mono text-[10px] text-slate-400">{ev.startsAtIso}</div>
        </td>
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
          type="datetime-local"
          className="input"
          value={startsAtLocal}
          onChange={(e) => setStartsAtLocal(e.target.value)}
        />
        {startsAtLocal && (
          <div className="mt-1 font-mono text-[10px] text-slate-400">
            {combineLocalAndTimezone(startsAtLocal, timezone)}
          </div>
        )}
      </td>
      <td>
        <select
          className="select"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Active
        </label>
        <input
          className="input mt-2 text-xs"
          value={zoomJoinUrl}
          onChange={(e) => setZoomJoinUrl(e.target.value)}
          placeholder="Zoom URL (blank = global)"
        />
      </td>
      <td className="text-right">
        <button
          className="btn btn-primary"
          onClick={() => onSave({ name, startsAtLocal, timezone, active, zoomJoinUrl })}
        >
          Save
        </button>
        <button className="btn btn-ghost" onClick={onEdit}>Cancel</button>
      </td>
    </tr>
  );
}

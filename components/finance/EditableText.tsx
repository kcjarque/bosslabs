'use client';

import { useState } from 'react';

/**
 * Click-to-edit name cell for the Expenses table. Display mode shows the
 * description; clicking reveals an inline input that submits a server action
 * (rename a stored expense, or rename a recurring subscription). Mirrors
 * EditableAmount so the table stays server-rendered while every row's name is
 * editable in place.
 */
export function EditableText({
  value,
  action,
  fields,
  title = 'Click to rename',
}: {
  value: string;
  action: (fd: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  title?: string;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title={title}
        className="text-left font-medium text-slate-800 underline decoration-dotted decoration-slate-300 underline-offset-4 hover:text-cyan-700"
      >
        {value}
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-1">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input
        name="description"
        defaultValue={value}
        autoFocus
        className="input !w-48 !px-2 !py-1"
      />
      <button type="submit" className="text-[12px] font-medium text-cyan-700 hover:underline">
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-[12px] text-slate-400 hover:text-slate-700"
      >
        ✕
      </button>
    </form>
  );
}

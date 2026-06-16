'use client';

import { useState } from 'react';

/**
 * Click-to-edit amount cell for the Expenses table. Display mode shows the
 * formatted peso amount; clicking reveals an inline input that submits a server
 * action (correct a stored expense, or override a recurring occurrence). Keeps
 * the page server-rendered while making every row's amount editable in place.
 */
export function EditableAmount({
  display,
  amountCentavos,
  action,
  fields,
}: {
  display: string;
  amountCentavos: number;
  action: (fd: FormData) => void | Promise<void>;
  fields: Record<string, string>;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Click to edit amount"
        className="font-semibold tabular-nums text-slate-900 underline decoration-dotted decoration-slate-300 underline-offset-4 hover:text-cyan-700"
      >
        {display}
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center justify-end gap-1">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <span className="text-slate-400">₱</span>
      <input
        name="amount"
        inputMode="decimal"
        defaultValue={(amountCentavos / 100).toString()}
        autoFocus
        className="input !w-24 !px-2 !py-1 text-right tabular-nums"
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

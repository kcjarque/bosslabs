'use client';

import { useState, useTransition } from 'react';
import { addPayerAction } from '@/app/admin/finance/actions';

/**
 * "Paid by" picker used in every expense form (single / project / recurring).
 * Renders <select name="paidBy"> from the persistent payer list, plus an inline
 * "+ Add person" that saves a new payer (addPayerAction) and immediately selects
 * them — so a just-added person is usable here and in every other form next load.
 */
export function PaidBySelect({
  payers,
  directLabel = '— Business paid directly —',
  help,
  defaultValue = '',
}: {
  payers: string[];
  directLabel?: string;
  help?: string;
  defaultValue?: string;
}) {
  const [list, setList] = useState<string[]>(payers);
  const [value, setValue] = useState(defaultValue);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();

  function add() {
    const name = draft.trim();
    if (!name) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set('name', name);
      await addPayerAction(fd);
      setList((l) => (l.some((p) => p.toLowerCase() === name.toLowerCase()) ? l : [...l, name].sort()));
      setValue(name);
      setDraft('');
      setAdding(false);
    });
  }

  return (
    <div>
      <label className="label">Paid by (optional)</label>
      <select
        name="paidBy"
        className="select"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">{directLabel}</option>
        {list.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      {adding ? (
        <div className="mt-1.5 flex gap-1.5">
          <input
            autoFocus
            className="input"
            placeholder="New person's name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" onClick={add} disabled={pending} className="btn btn-secondary whitespace-nowrap">
            {pending ? 'Adding…' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setDraft('');
            }}
            className="rounded-md px-2 text-[12px] text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-1.5 text-[11px] font-medium text-cyan-700 hover:underline"
        >
          + Add person
        </button>
      )}

      {help && <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{help}</p>}
    </div>
  );
}

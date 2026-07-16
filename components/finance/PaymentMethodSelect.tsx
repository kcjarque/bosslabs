'use client';

import { useState, useTransition } from 'react';
import { addPaymentMethodAction } from '@/app/admin/finance/actions';

/**
 * "Payment method" picker for the expense form. Renders <select name="paymentMethod">
 * from the persistent method list, plus an inline "+ Add payment method" that saves a
 * new one (addPaymentMethodAction) and immediately selects it — mirrors PaidBySelect.
 */
export function PaymentMethodSelect({
  methods,
  directLabel = '— Not specified —',
  defaultValue = '',
}: {
  methods: string[];
  directLabel?: string;
  defaultValue?: string;
}) {
  const [list, setList] = useState<string[]>(methods);
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
      await addPaymentMethodAction(fd);
      setList((l) => (l.some((m) => m.toLowerCase() === name.toLowerCase()) ? l : [...l, name].sort()));
      setValue(name);
      setDraft('');
      setAdding(false);
    });
  }

  return (
    <div>
      <label className="label">Payment method (optional)</label>
      <select
        name="paymentMethod"
        className="select"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">{directLabel}</option>
        {list.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      {adding ? (
        <div className="mt-1.5 flex gap-1.5">
          <input
            autoFocus
            className="input"
            placeholder="New payment method"
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
          + Add payment method
        </button>
      )}
    </div>
  );
}

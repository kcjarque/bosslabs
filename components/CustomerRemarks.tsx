'use client';

import { useState } from 'react';
import { setRemarksAction } from '@/app/admin/customers/actions';

/**
 * Editable remarks for a customer. Shared store with the order-bump CRM
 * board (signup metadata.remarks), so a remark added on either surface shows
 * on the other.
 */
export function CustomerRemarks({
  signupId,
  initial,
}: {
  signupId: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState<string>(initial);
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle');

  const dirty = value !== saved;

  async function save() {
    setState('saving');
    await setRemarksAction(signupId, value.trim());
    setSaved(value.trim());
    setValue(value.trim());
    setState('done');
    setTimeout(() => setState('idle'), 1600);
  }

  return (
    <section className="card">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-slate-900">Remarks</h2>
        <span className="text-xs text-slate-400">Synced with the order-bump board</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add a remark about this customer…"
        className="input mt-3 min-h-[80px] w-full text-sm"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || state === 'saving'}
          className="btn btn-primary text-xs disabled:opacity-50"
        >
          {state === 'saving' ? 'Saving…' : state === 'done' ? 'Saved ✓' : 'Save remark'}
        </button>
        {dirty && state === 'idle' && (
          <span className="text-[11px] text-amber-600">Unsaved changes</span>
        )}
      </div>
    </section>
  );
}

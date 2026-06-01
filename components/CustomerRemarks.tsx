'use client';

import { useState } from 'react';
import { setRemarksAction } from '@/app/admin/customers/actions';

/**
 * Compact, embeddable remarks editor — sits at the bottom of the Profile
 * card. Shared store with the order-bump CRM board (signup metadata.remarks).
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
    <div className="mt-4 border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.06em] text-slate-500">Remarks</span>
        <span className="text-[10px] text-slate-400">Synced with order-bump board</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add a remark…"
        style={{ minHeight: '56px' }}
        className="input mt-2 w-full text-sm"
      />
      <div className="mt-1.5 flex items-center gap-2">
        <button
          onClick={save}
          disabled={!dirty || state === 'saving'}
          className="btn btn-secondary text-xs disabled:opacity-50"
        >
          {state === 'saving' ? 'Saving…' : state === 'done' ? 'Saved ✓' : 'Save'}
        </button>
        {dirty && state === 'idle' && <span className="text-[10px] text-amber-600">Unsaved</span>}
      </div>
    </div>
  );
}

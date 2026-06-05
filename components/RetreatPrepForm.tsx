'use client';

import { useState } from 'react';
import type { PrepInput } from '@/app/vibecode-retreat/reserve/[id]/done/actions';

type SaveFn = (id: string, input: PrepInput) => Promise<{ ok: boolean; error?: string }>;

const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15';

export function RetreatPrepForm({ id, onSave }: { id: string; onSave: SaveFn }) {
  const [overnight, setOvernight] = useState<'yes' | 'no' | ''>('');
  const [diet, setDiet] = useState('');
  const [buildIdea, setBuildIdea] = useState('');
  const [business, setBusiness] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setState('saving');
    setErr(null);
    const res = await onSave(id, {
      overnight: overnight === '' ? undefined : overnight === 'yes',
      diet,
      buildIdea,
      business,
    });
    if (res.ok) setState('done');
    else {
      setState('error');
      setErr(res.error || 'Could not save.');
    }
  }

  if (state === 'done') {
    return (
      <div className="rounded-2xl border border-emerald-300/60 bg-emerald-50 px-6 py-5 text-center text-sm text-emerald-800">
        Got it — thanks! That helps us prep for you. See you at the villa. 🎉
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 text-left shadow-[0_12px_36px_-26px_rgba(20,50,90,0.4)] sm:p-7">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-700">
        Quick prep · optional
      </div>
      <h3 className="mt-1 font-serif text-xl text-slate-900 sm:text-2xl">
        A couple of things to help us prep for you
      </h3>
      <p className="mt-1 text-sm text-slate-500">Takes 20 seconds — or skip it, totally fine.</p>

      <div className="mt-5 space-y-4">
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            Okay to stay overnight with us?
          </div>
          <div className="flex gap-2">
            {(['yes', 'no'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setOvernight(v)}
                className={`flex-1 rounded-xl border px-3 py-3 text-sm font-medium capitalize transition ${
                  overnight === v
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700 ring-2 ring-cyan-500/15'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            What do you want to build that weekend?
          </div>
          <textarea
            className={`${inputCls} min-h-[72px] resize-y`}
            placeholder="A booking system, a CRM, an online store… a sentence is fine."
            value={buildIdea}
            onChange={(e) => setBuildIdea(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Dietary restrictions
            </div>
            <input
              className={inputCls}
              placeholder="Vegetarian, allergies…"
              value={diet}
              onChange={(e) => setDiet(e.target.value)}
            />
          </div>
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Your business
            </div>
            <input
              className={inputCls}
              placeholder="What do you do?"
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
            />
          </div>
        </div>
      </div>

      {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}

      <button
        type="button"
        onClick={save}
        disabled={state === 'saving'}
        className="mt-5 w-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-6 py-3 font-sans text-base font-medium text-white shadow-[0_14px_34px_-12px_rgba(0,150,200,0.6)] transition hover:from-cyan-400 hover:to-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === 'saving' ? 'Saving…' : 'Save my prep details'}
      </button>
    </div>
  );
}

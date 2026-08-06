'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { executeVerdictAction } from '@/app/admin/ads/council-actions';

/** Chair verdicts are free text, so executions are operator-composed: pick a
 *  concrete action + target and the executor enforces guardrails server-side. */
export function ActionComposer({
  roster,
  mode,
}: {
  roster: { adId: string; adName: string; verdict: string }[];
  mode: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<'pause_ad' | 'unpause_ad' | 'set_budget'>('pause_ad');
  const [targetId, setTargetId] = useState('');
  const [budgetPesos, setBudgetPesos] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const disabled = mode === 'recommend';

  function run() {
    if (!window.confirm(`Execute ${type.replace('_', ' ')} on ${targetId}? Guardrails apply.`)) return;
    setResult(null);
    start(async () => {
      const r = await executeVerdictAction({
        type,
        targetId,
        budgetPesos: type === 'set_budget' ? Number(budgetPesos) : undefined,
      });
      setResult(`${r.ok ? '✓' : '✗'} ${r.result}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[12px] text-slate-500">
          Action
          <select className="select mt-1" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="pause_ad">Pause ad</option>
            <option value="unpause_ad">Unpause ad</option>
            <option value="set_budget">Set campaign budget</option>
          </select>
        </label>
        {type === 'set_budget' ? (
          <>
            <label className="text-[12px] text-slate-500">
              Campaign ID
              <input className="input mt-1 w-52" value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="1202…" />
            </label>
            <label className="text-[12px] text-slate-500">
              Daily budget (₱)
              <input className="input mt-1 w-32" inputMode="numeric" value={budgetPesos} onChange={(e) => setBudgetPesos(e.target.value)} />
            </label>
          </>
        ) : (
          <label className="text-[12px] text-slate-500">
            Ad
            <select className="select mt-1 max-w-xs" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">Select an ad…</option>
              {roster.map((r) => (
                <option key={r.adId} value={r.adId}>
                  {r.adName} · {r.verdict}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={run}
          disabled={disabled || pending || !targetId}
          title={disabled ? 'Switch mode to one-click or autopilot to enable' : undefined}
          className="rounded-full bg-rose-600 px-4 py-1.5 text-[13px] font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? 'Executing…' : 'Execute'}
        </button>
      </div>
      {disabled && (
        <p className="text-[11.5px] text-slate-400">Recommend mode — execution disabled. Guardrails (20% pause cap, ±20% budget clamp, no learning ads) apply in every mode.</p>
      )}
      {result && <p className="text-[12.5px] text-slate-600">{result}</p>}
    </div>
  );
}

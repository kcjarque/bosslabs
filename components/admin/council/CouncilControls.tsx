'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Mode } from '@/lib/council/types';
import { saveCouncilSettingsAction, runCouncilNowAction } from '@/app/admin/ads/council-actions';

const MODE_INFO: { key: Mode; label: string; blurb: string }[] = [
  { key: 'recommend', label: 'Recommend', blurb: 'Council advises; you act in Ads Manager.' },
  { key: 'one_click', label: 'One-click', blurb: 'Execute buttons enabled; you confirm each action.' },
  { key: 'autopilot', label: 'Autopilot', blurb: 'Pipeline executes verdicts within guardrails.' },
];

export function CouncilControls({
  mode: initialMode,
  targetCppCentavos,
}: {
  mode: Mode;
  targetCppCentavos: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [targetPesos, setTargetPesos] = useState(String(Math.round(targetCppCentavos / 100)));
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [running, startRun] = useTransition();

  function save() {
    setMsg(null);
    startSave(async () => {
      const r = await saveCouncilSettingsAction(mode, Math.round(Number(targetPesos) * 100));
      setMsg(r.ok ? 'Saved.' : r.error ?? 'Save failed');
      if (r.ok) router.refresh();
    });
  }

  function runNow() {
    if (!window.confirm('Runs a real LLM council session (~₱30 of API tokens). Continue?')) return;
    setMsg(null);
    startRun(async () => {
      const r = await runCouncilNowAction();
      setMsg(r.ok ? 'Analysis complete — see below.' : r.error ?? 'Analysis failed');
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">🤴 Prince — Run Analysis</h2>
        <button
          type="button"
          onClick={runNow}
          disabled={running}
          className="rounded-full bg-slate-900 px-4 py-1.5 text-[13px] font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {running ? 'Analyzing…' : 'Run Analysis now'}
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {MODE_INFO.map((m) => (
          <label
            key={m.key}
            className={`cursor-pointer rounded-lg border p-3 text-[13px] transition ${
              mode === m.key ? 'border-cyan-500 bg-cyan-50/60' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <span className="flex items-center gap-2 font-semibold text-slate-800">
              <input
                type="radio"
                name="council-mode"
                checked={mode === m.key}
                onChange={() => setMode(m.key)}
                className="h-3.5 w-3.5 text-cyan-600"
              />
              {m.label}
            </span>
            <span className="mt-1 block text-[12px] text-slate-500">{m.blurb}</span>
            {m.key === 'autopilot' && (
              <span className="mt-1 block text-[11px] text-amber-700">
                Requires an ads_management token — actions log as failed until upgraded.
              </span>
            )}
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[13px] text-slate-600">
          Target CPP (₱)
          <input
            value={targetPesos}
            onChange={(e) => setTargetPesos(e.target.value)}
            inputMode="numeric"
            className="input mt-1 w-32"
          />
        </label>
        <button type="button" onClick={save} disabled={saving} className="btn btn-secondary">
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {msg && <span className="text-[12px] text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}

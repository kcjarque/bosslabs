'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resolvePredictionAction } from '@/app/admin/ads/council-actions';

export type LedgerRow = {
  id: string;
  date: string;
  expert: string;
  predictionText: string;
  metric: string;
  threshold: number | null;
  deadline: string;
  weight: number;
  outcome: 'hit' | 'miss' | 'push' | null;
  needsManual: boolean;
};

function outcomeBadge(o: LedgerRow['outcome']) {
  if (o === 'hit') return <span className="pill pill-green">HIT</span>;
  if (o === 'miss') return <span className="pill pill-red">MISS</span>;
  if (o === 'push') return <span className="pill">PUSH</span>;
  return <span className="pill pill-cyan">open</span>;
}

export function LedgerTable({ rows }: { rows: LedgerRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function resolve(id: string, outcome: 'hit' | 'miss' | 'push') {
    start(async () => {
      await resolvePredictionAction(id, outcome);
      router.refresh();
    });
  }

  if (rows.length === 0) return <p className="text-[13px] text-slate-400">No predictions yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
            <th className="py-2 pr-3">Expert</th>
            <th className="py-2 pr-3">Prediction</th>
            <th className="py-2 pr-3">Metric</th>
            <th className="py-2 pr-3">Deadline</th>
            <th className="py-2 pr-3">Outcome</th>
            <th className="py-2">Resolve</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-2 pr-3 font-medium text-slate-700">{r.expert}</td>
              <td className="max-w-md py-2 pr-3 text-slate-600">{r.predictionText}</td>
              <td className="py-2 pr-3 text-slate-500">
                {r.metric || '—'}
                {r.threshold != null && (
                  <span className="text-slate-400">
                    {' '}
                    @ {r.metric === 'spend_share_7d' ? r.threshold : `₱${Math.round(r.threshold / 100).toLocaleString()}`}
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 text-slate-500">{r.deadline}</td>
              <td className="py-2 pr-3">{outcomeBadge(r.outcome)}</td>
              <td className="py-2">
                {r.outcome == null && r.needsManual ? (
                  <span className="flex gap-1">
                    {(['hit', 'miss', 'push'] as const).map((o) => (
                      <button
                        key={o}
                        type="button"
                        disabled={pending}
                        onClick={() => resolve(r.id, o)}
                        className="rounded border border-slate-200 px-1.5 py-0.5 text-[10.5px] font-medium uppercase text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {o}
                      </button>
                    ))}
                  </span>
                ) : r.outcome == null ? (
                  <span className="text-[11px] text-slate-300">auto</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

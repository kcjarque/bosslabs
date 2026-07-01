/**
 * Compact pipeline funnel for a CRM board — one bar per stage (width ∝ card
 * count) with the count + deal sum, and the total deal value in the pipeline up
 * top. Pre-computed rows so it's reusable across the Retreat + DFY boards.
 *
 * Optional MRR + Closed Projects summary: passing `pipelineMrrCentavos`
 * splits the header total into one-time + recurring, and passing
 * `closedProjects` renders a footer block with the won-deal totals.
 * Both are opt-in — the Retreat board keeps its old shape.
 */
export function PipelineFunnel({
  rows,
  totalCentavos,
  pipelineMrrCentavos,
  closedProjects,
}: {
  rows: {
    label: string;
    bar: string;
    count: number;
    dealCentavos: number;
    mrrCentavos?: number;
  }[];
  totalCentavos: number;
  pipelineMrrCentavos?: number;
  closedProjects?: {
    count: number;
    dealCentavos: number;
    mrrCentavos: number;
  };
}) {
  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  const peso = (c: number) => '₱' + Math.round(c / 100).toLocaleString();
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Pipeline value
        </span>
        <div className="text-right">
          <div className="tnum text-lg font-semibold tracking-tight text-slate-900">
            {peso(totalCentavos)}
          </div>
          {pipelineMrrCentavos != null && pipelineMrrCentavos > 0 && (
            <div className="tnum text-[11px] font-medium text-slate-500">
              + {peso(pipelineMrrCentavos)}<span className="text-slate-400">/mo MRR</span>
            </div>
          )}
        </div>
      </div>
      <div className="mt-2.5 space-y-2">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-600">{r.label}</span>
              <span className="tnum text-slate-500">
                {r.count} · {peso(r.dealCentavos)}
                {r.mrrCentavos != null && r.mrrCentavos > 0 && (
                  <span className="text-slate-400"> · {peso(r.mrrCentavos)}/mo</span>
                )}
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${r.bar} transition-all`}
                style={{ width: `${Math.max(r.count > 0 ? 6 : 0, Math.round((r.count / maxCount) * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {closedProjects && (
        <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
              Closed Projects
            </span>
            <span className="text-[10.5px] text-emerald-700/70">{closedProjects.count} won</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Closed Deal</div>
              <div className="tnum mt-0.5 text-[14px] font-semibold text-slate-900">
                {peso(closedProjects.dealCentavos)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">MRR</div>
              <div className="tnum mt-0.5 text-[14px] font-semibold text-slate-900">
                {peso(closedProjects.mrrCentavos)}<span className="text-[11px] font-normal text-slate-500">/mo</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

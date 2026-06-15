/**
 * Compact pipeline funnel for a CRM board — one bar per stage (width ∝ card
 * count) with the count + deal sum, and the total deal value in the pipeline up
 * top. Pre-computed rows so it's reusable across the Retreat + DFY boards.
 */
export function PipelineFunnel({
  rows,
  totalCentavos,
}: {
  rows: { label: string; bar: string; count: number; dealCentavos: number }[];
  totalCentavos: number;
}) {
  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  const peso = (c: number) => '₱' + Math.round(c / 100).toLocaleString();
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Pipeline value
        </span>
        <span className="tnum text-lg font-semibold tracking-tight text-slate-900">
          {peso(totalCentavos)}
        </span>
      </div>
      <div className="mt-2.5 space-y-2">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-600">{r.label}</span>
              <span className="tnum text-slate-500">
                {r.count} · {peso(r.dealCentavos)}
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
    </div>
  );
}

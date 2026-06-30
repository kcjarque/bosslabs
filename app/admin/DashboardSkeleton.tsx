/** Loading skeleton shown while the dashboard's main data fetches resolve.
 *  Mirrors the actual KPI grid shape so the layout doesn't shift when
 *  content streams in. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* KPI row 1 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="h-3 w-20 rounded bg-slate-200" />
            <div className="mt-3 h-8 w-32 rounded bg-slate-200" />
            <div className="mt-2 h-2.5 w-24 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      {/* KPI row 2 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="h-3 w-20 rounded bg-slate-200" />
            <div className="mt-3 h-8 w-32 rounded bg-slate-200" />
            <div className="mt-2 h-2.5 w-24 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      {/* Income card */}
      <div className="h-56 rounded-2xl border border-slate-200 bg-white p-5" />
      {/* Ad spend card */}
      <div className="h-72 rounded-2xl border border-slate-200 bg-white p-5" />
    </div>
  );
}

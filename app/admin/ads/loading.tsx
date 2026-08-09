export default function AdsLoading() {
  return (
    <div className="space-y-6" aria-label="Loading ads data" aria-busy="true">
      <div>
        <div className="h-9 w-24 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-full max-w-xl animate-pulse rounded bg-slate-100" />
      </div>
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        {[96, 132, 112, 80].map((width) => (
          <div key={width} className="h-8 animate-pulse rounded bg-slate-100" style={{ width }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      <span className="sr-only">Loading current Meta ads performance</span>
    </div>
  );
}

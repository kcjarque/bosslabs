/** Shimmer placeholder shown while a kanban board's data loads — nicer than a
 *  "Loading…" string and reserves layout so there's no jump. Mobile-friendly. */
export function BoardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading board">
      <div className="skel h-28 w-full" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="skel h-7 w-full" />
            <div className="skel h-24 w-full" />
            <div className="skel h-24 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

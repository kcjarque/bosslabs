/**
 * Single-line, truncated pill for showing an event name in a table cell.
 * Full name appears in the native tooltip on hover.
 *
 * Bypasses the global `.pill` class because that one uses `inline-flex`,
 * which doesn't truncate cleanly. This uses inline-block + max-width +
 * ellipsis so a long event name like "AI Coding 101 — The BOSSLABS AI
 * Webinar" doesn't blow up the row.
 */
export function EventPill({ name }: { name: string }) {
  return (
    <span
      title={name}
      className="inline-block max-w-[160px] truncate rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 align-middle text-[11px] font-medium text-violet-700"
    >
      {name}
    </span>
  );
}

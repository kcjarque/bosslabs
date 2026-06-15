'use client';

/** Opens the ⌘K command palette. `sidebar` = full-width search bar (desktop
 *  sidebar); `icon` = compact button (mobile header). */
export function CommandTrigger({ variant = 'sidebar' }: { variant?: 'sidebar' | 'icon' }) {
  const open = () => window.dispatchEvent(new Event('open-command-palette'));

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={open}
        aria-label="Search (⌘K)"
        className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-400 transition hover:bg-slate-100 hover:text-slate-500"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      Search…
      <span className="ml-auto rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
        ⌘K
      </span>
    </button>
  );
}

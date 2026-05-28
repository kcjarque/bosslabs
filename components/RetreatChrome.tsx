import Link from 'next/link';
import { Logo } from './Logo';
import { Mark } from './Mark';

export function RetreatHeaderLight() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-900/[0.06] bg-white/80 backdrop-blur-md">
      <div className="container-tight flex h-16 items-center justify-between">
        <Link href="/vibecode-retreat" className="inline-flex items-center gap-3 text-slate-900">
          <Mark size={26} onLight />
          <Logo size="md" />
        </Link>
        <span className="hidden text-[11px] uppercase tracking-[0.22em] text-cyan-700 sm:inline">
          VibeCode Retreat
        </span>
      </div>
    </header>
  );
}

const STEP_LABELS = ['Your details', 'Payment', 'Confirmed'];

export function Steps({ active }: { active: 1 | 2 | 3 }) {
  return (
    <ol className="mx-auto flex max-w-md items-center justify-between gap-2">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const done = n < active;
        const current = n === active;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-semibold ${
                done
                  ? 'bg-cyan-500 text-white'
                  : current
                    ? 'bg-cyan-50 text-cyan-700 ring-2 ring-cyan-500/40'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              {done ? '✓' : n}
            </span>
            <span
              className={`hidden text-xs sm:inline ${
                current ? 'font-semibold text-slate-800' : 'text-slate-400'
              }`}
            >
              {label}
            </span>
            {n < 3 && <span className="h-px flex-1 bg-slate-200" />}
          </li>
        );
      })}
    </ol>
  );
}

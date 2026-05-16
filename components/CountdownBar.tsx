'use client';

import { useEffect, useState } from 'react';

type Props = {
  /** ISO date the webinar starts. Falls back to +14 days from page load. */
  startsAtIso?: string;
  message?: string;
};

function getTarget(iso?: string): Date {
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

function useCountdown(target: Date) {
  // Start at 0 to match the server render exactly — avoids hydration mismatch.
  // The first useEffect tick on the client populates the real value.
  const [remaining, setRemaining] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const tick = () => setRemaining(target.getTime() - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  const total = Math.max(0, Math.floor(remaining / 1000));
  return {
    mounted,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    mins: Math.floor((total % 3600) / 60),
    secs: total % 60,
  };
}

/** Thin red sticky bar at the top of every page — global urgency signal. */
export function CountdownBar({
  startsAtIso,
  message = 'Seats close soon — do not get left behind',
}: Props) {
  const [target] = useState(() => getTarget(startsAtIso));
  const { mounted, days, hours, mins, secs } = useCountdown(target);

  return (
    <div className="border-b border-danger-700/60 bg-gradient-to-r from-danger-700/30 via-danger-600/20 to-danger-700/30">
      <div className="container-tight flex flex-col items-center justify-between gap-2 py-2.5 text-center sm:flex-row sm:text-left">
        <div className="flex items-center gap-2.5 text-[11px] uppercase tracking-[0.22em] text-danger-200">
          <span className="pulse-dot" />
          <span>WARNING · {message}</span>
        </div>
        <div
          suppressHydrationWarning
          className="flex items-center gap-2 font-serif text-sm tracking-tight text-white sm:text-base"
        >
          <Cell n={mounted ? days : 0} label="D" />
          <Sep />
          <Cell n={mounted ? hours : 0} label="H" />
          <Sep />
          <Cell n={mounted ? mins : 0} label="M" />
          <Sep />
          <Cell n={mounted ? secs : 0} label="S" />
        </div>
      </div>
    </div>
  );
}

/** Larger standalone display used inside the page (Final Urgency Block). */
export function CountdownDisplay({ startsAtIso }: { startsAtIso?: string }) {
  const [target] = useState(() => getTarget(startsAtIso));
  const { mounted, days, hours, mins, secs } = useCountdown(target);
  return (
    <div
      suppressHydrationWarning
      className="inline-flex items-baseline gap-3 sm:gap-5"
    >
      <BigCell n={mounted ? days : 0} label="Days" />
      <BigSep />
      <BigCell n={mounted ? hours : 0} label="Hours" />
      <BigSep />
      <BigCell n={mounted ? mins : 0} label="Minutes" />
      <BigSep />
      <BigCell n={mounted ? secs : 0} label="Seconds" />
    </div>
  );
}

function Cell({ n, label }: { n: number; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 tabular-nums">
      <span className="font-serif text-base text-white sm:text-lg">{pad(n)}</span>
      <span className="text-[10px] uppercase tracking-[0.22em] text-danger-200">{label}</span>
    </span>
  );
}

function Sep() {
  return <span className="text-danger-300/60">·</span>;
}

function BigCell({ n, label }: { n: number; label: string }) {
  return (
    <span className="inline-flex flex-col items-center">
      <span className="font-serif text-4xl tabular-nums leading-none text-white sm:text-6xl">
        {pad(n)}
      </span>
      <span className="mt-2 text-[10px] uppercase tracking-[0.22em] text-danger-200 sm:text-[11px]">
        {label}
      </span>
    </span>
  );
}

function BigSep() {
  return (
    <span className="font-serif text-3xl leading-none text-danger-300/70 sm:text-5xl">
      :
    </span>
  );
}

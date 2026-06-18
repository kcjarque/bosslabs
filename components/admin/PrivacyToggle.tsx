'use client';

import { useEffect, useState } from 'react';

/**
 * Banking-style "hide values" toggle. Flips a `privacy-on` class on <html>,
 * which blurs every element tagged `.bl-private` (KPI values, money cells,
 * metrics). Sticky per-browser via localStorage — stays on across page loads
 * and navigations until toggled back off. A no-flash inline script in the admin
 * layout applies the class before paint; this component keeps the icon in sync
 * and broadcasts changes so the mobile + desktop instances (and other tabs) match.
 */
const KEY = 'bl-privacy';
const EVT = 'bl-privacy-change';

function isOn(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function PrivacyToggle({ variant = 'full' }: { variant?: 'full' | 'icon' }) {
  const [on, setOn] = useState(false);

  // Sync from storage on mount + whenever any instance/tab changes it.
  useEffect(() => {
    const sync = () => setOn(isOn());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  function toggle() {
    const next = !isOn();
    try {
      localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      /* private mode — class still applies for this session */
    }
    document.documentElement.classList.toggle('privacy-on', next);
    window.dispatchEvent(new Event(EVT));
    setOn(next);
  }

  const label = on ? 'Show values' : 'Hide values';

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        title={label}
        aria-label={label}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
      >
        <EyeIcon off={on} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      title={label}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-slate-100 ${
        on ? 'text-cyan-700' : 'text-slate-500 hover:text-slate-900'
      }`}
    >
      <EyeIcon off={on} />
      <span>{label}</span>
      {on && (
        <span className="ml-auto rounded-full bg-cyan-50 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700">
          Hidden
        </span>
      )}
    </button>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {off ? (
        <>
          <path d="M9.9 5.1A9.9 9.9 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.7 3.7M6.3 6.3C3.7 7.8 2 10.4 1.5 12c1 2.5 5 7 10.5 7 1.7 0 3.2-.4 4.5-1" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          <path d="m2 2 20 20" />
        </>
      ) : (
        <>
          <path d="M1.5 12C2.5 9.5 6.5 5 12 5s9.5 4.5 10.5 7c-1 2.5-5 7-10.5 7S2.5 14.5 1.5 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

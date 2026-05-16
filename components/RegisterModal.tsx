'use client';

import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function RegisterModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock body scroll while modal open + close on Escape
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const payload = {
      firstName: String(fd.get('firstName') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
    };

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      window.location.href = '/registered';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Register for the BOSSLABS AI webinar"
    >
      <div
        className="relative w-full max-w-md rounded-3xl border border-cyan-500/30 bg-[#06070A] p-6 shadow-glow sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-ink-200 transition hover:border-white/30 hover:text-white"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="eyebrow">Save your seat — free</div>
        <h2 className="mt-3 font-serif text-2xl leading-tight text-white sm:text-3xl">
          You are one step from <span className="accent-italic">becoming a builder.</span>
        </h2>
        <p className="mt-2 font-sans text-[13px] leading-relaxed text-ink-200 sm:text-[14px]">
          Drop your details. We send the Zoom link + your Free Gift the moment you join.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="firstName">First name</label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              required
              autoFocus
              autoComplete="given-name"
              className="input"
              placeholder="Juan"
            />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="input"
              placeholder="you@business.com"
            />
          </div>
          <div>
            <label className="label" htmlFor="phone">Mobile (PH)</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              inputMode="tel"
              autoComplete="tel"
              className="input"
              placeholder="+63 917 000 0000"
            />
            <p className="mt-1.5 text-[10px] uppercase tracking-[0.18em] text-ink-300 sm:text-[11px]">
              We send Zoom + Messenger reminders
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full !py-4 text-base"
          >
            {loading ? 'Saving your seat…' : 'Save My Seat — Free'}
          </button>

          <p className="text-center text-[10px] uppercase tracking-[0.18em] text-ink-300 sm:text-[11px]">
            No spam. Just the link + the gift.
          </p>
        </form>
      </div>
    </div>
  );
}

export function CtaButton({
  onClick,
  children = 'Save My Seat — Free',
  className = '',
}: {
  onClick: () => void;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn-primary !py-4 !px-9 text-base ${className}`}
    >
      {children}
    </button>
  );
}

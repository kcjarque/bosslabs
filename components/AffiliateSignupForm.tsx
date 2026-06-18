'use client';

import { useState } from 'react';
import { CopyLink } from '@/components/CopyLink';

type Success = {
  existing?: boolean;
  link: string;
  dashboardUrl: string;
};

export function AffiliateSignupForm({ percent }: { percent: number }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [promo, setPromo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Success | null>(null);

  async function submit() {
    setError(null);
    if (!name.trim() || !email.includes('@')) {
      setError('Please enter your name and a valid email.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/affiliate/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), promo: promo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign-up failed');
      setDone({ existing: data.existing, link: data.link, dashboardUrl: data.dashboardUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/10 shadow-glow-sm">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#00B8E6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="h-sub mt-5">{done.existing ? "Welcome back." : "You're in."}</h2>
        <p className="lead mx-auto mt-3 max-w-md text-[15px]">
          {done.existing
            ? 'You already have an affiliate account — here&rsquo;s your link.'
            : `Share this link and earn ${percent}% on every sale it brings in.`}
        </p>

        <div className="mt-6 text-left">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">Your share link</div>
          <div className="mt-2">
            <CopyLink url={done.link} />
          </div>
        </div>

        <a href={done.dashboardUrl} className="btn-primary mt-6 inline-flex w-full justify-center !py-4 text-base">
          Open my dashboard →
        </a>
        <p className="mt-3 text-[12px] text-ink-300">
          Your dashboard has your stats, earnings, and the ready-made promo kit. Bookmark it.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="space-y-3">
        <Field label="Full name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Juan Dela Cruz"
            autoComplete="name"
            disabled={loading}
            className={inputCls}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            autoComplete="email"
            inputMode="email"
            disabled={loading}
            className={inputCls}
          />
        </Field>
        <Field label="How will you promote it?" hint="(optional)">
          <textarea
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            placeholder="e.g. my Facebook group of PH business owners, my email list, TikTok…"
            rows={2}
            disabled={loading}
            className={`${inputCls} resize-none`}
          />
        </Field>
      </div>

      <button onClick={submit} disabled={loading} className="btn-primary mt-5 w-full !py-4 text-base">
        {loading ? 'Creating your link…' : 'Get my affiliate link →'}
      </button>
      {error && (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}
      <p className="mt-3 text-center text-[11px] text-ink-300">
        Free to join · Get your link instantly · No quotas
      </p>
    </div>
  );
}

const inputCls =
  'w-full rounded-2xl border border-white/15 bg-[#06070A]/60 px-5 py-3 text-[14px] text-white outline-none transition placeholder:text-ink-400 focus:border-cyan-400 disabled:opacity-60';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] uppercase tracking-[0.22em] text-cyan-400">
        {label} {hint && <span className="text-ink-300">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

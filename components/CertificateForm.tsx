'use client';

import { useState } from 'react';

export function CertificateForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      setResult(
        data.ok
          ? { ok: true, msg: `Your certificate is on its way to ${data.sentTo}. Check your inbox — and spam — in a minute.` }
          : { ok: false, msg: data.error || 'Something went wrong. Please try again.' },
      );
    } catch {
      setResult({ ok: false, msg: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] px-6 py-9 text-center">
        <div className="text-4xl">🎓</div>
        <p className="mt-4 text-[15px] leading-relaxed text-emerald-100">{result.msg}</p>
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setEmail('');
          }}
          className="mt-6 text-[11px] uppercase tracking-[0.22em] text-ink-300 underline-offset-4 transition hover:text-white hover:underline"
        >
          Request another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-7">
      <label htmlFor="cert-email" className="block text-[11px] uppercase tracking-[0.22em] text-cyan-400">
        Email you registered with
      </label>
      <input
        id="cert-email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        disabled={loading}
        className="mt-2.5 w-full rounded-full border border-cyan-500/30 bg-[#06070A]/60 px-5 py-3.5 text-[15px] text-white outline-none transition placeholder:text-ink-400 focus:border-cyan-400 disabled:opacity-60"
      />

      {result && !result.ok && (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/[0.08] px-4 py-3 text-[13px] leading-relaxed text-rose-200">
          {result.msg}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !email.trim()}
        className="btn-primary mt-5 w-full !py-4 text-center text-base disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Generating your certificate…' : 'Email my certificate →'}
      </button>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-300">
        Only paid attendees can generate a certificate. Use the exact email you registered with — it&rsquo;s
        emailed straight to that address.
      </p>
    </form>
  );
}

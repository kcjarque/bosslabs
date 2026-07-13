'use client';

import { useState } from 'react';

const INDUSTRIES: Array<{ v: string; label: string }> = [
  { v: 'food_retail', label: 'Food / Retail' },
  { v: 'services', label: 'Services' },
  { v: 'logistics_ops', label: 'Logistics / Operations' },
  { v: 'agency_freelance', label: 'Agency / Freelance' },
  { v: 'manufacturing', label: 'Manufacturing' },
  { v: 'other', label: 'Iba pa' },
];
const PAINS: Array<{ v: string; label: string }> = [
  { v: 'orders_tracking', label: 'Orders / tracking' },
  { v: 'manual_reports', label: 'Manual reports' },
  { v: 'followups', label: 'Follow-ups' },
  { v: 'team_visibility', label: 'Team visibility' },
  { v: 'other', label: 'Iba pa' },
];
const INTENTS: Array<{ v: string; label: string }> = [
  { v: 'diy', label: 'Gusto kong MATUTONG gumawa' },
  { v: 'dfy', label: 'Gusto ko MAY GUMAWA para sa akin' },
];

function Radio({
  name,
  value,
  current,
  onChange,
  children,
}: {
  name: string;
  value: string;
  current: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  const sel = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`w-full rounded-xl border px-4 py-3 text-left text-[14px] transition ${
        sel
          ? 'border-cyan-400 bg-cyan-500/15 text-white'
          : 'border-white/10 bg-white/[0.02] text-white/80 hover:border-white/25'
      }`}
    >
      <span className={`mr-2 inline-block h-3.5 w-3.5 rounded-full border align-middle ${sel ? 'border-cyan-400 bg-cyan-400' : 'border-white/30'}`} />
      {children}
    </button>
  );
}

export function SurveyForm({ token }: { token: string }) {
  const [q1, setQ1] = useState('');
  const [q2, setQ2] = useState('');
  const [q2free, setQ2free] = useState('');
  const [q3, setQ3] = useState('');
  const [q4, setQ4] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (busy) return;
    if (!q1 || !q2 || !q4) {
      setErr('Sagutan lang ang 3 mabilis na tanong 🙏');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          c: token,
          q1_industry: q1,
          q2_pain: q2,
          q2_freetext: q2 === 'other' ? q2free : undefined,
          q3_freetext: q3 || undefined,
          q4_intent: q4,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (json.ok) setDone(true);
      else setErr(json.error || 'Could not save — subukan ulit.');
    } catch {
      setErr('Network error — subukan ulit.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/[0.06] p-8 text-center">
        <div className="text-4xl">🎯</div>
        <h1 className="mt-3 text-xl font-semibold">Salamat!</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-white/70">
          Sa webinar, ipapakita namin ang sample system na pinaka-malapit sa business mo. See you there! 🚀
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-7">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-400">30 seconds lang</div>
      <h1 className="mt-1 text-[22px] font-semibold leading-tight">
        Para ma-tailor namin ang webinar sa business mo.
      </h1>

      <div className="mt-6 space-y-6">
        <div>
          <div className="mb-2 text-[13.5px] font-medium">1. Anong industry ang business mo?</div>
          <div className="space-y-2">
            {INDUSTRIES.map((o) => (
              <Radio key={o.v} name="q1" value={o.v} current={q1} onChange={setQ1}>{o.label}</Radio>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[13.5px] font-medium">2. Ano ang #1 headache sa operations mo ngayon?</div>
          <div className="space-y-2">
            {PAINS.map((o) => (
              <Radio key={o.v} name="q2" value={o.v} current={q2} onChange={setQ2}>{o.label}</Radio>
            ))}
          </div>
          {q2 === 'other' && (
            <input
              value={q2free}
              onChange={(e) => setQ2free(e.target.value)}
              placeholder="Anong headache? (optional)"
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[14px] text-white placeholder-white/35 focus:border-cyan-400 focus:outline-none"
            />
          )}
        </div>

        <div>
          <div className="mb-2 text-[13.5px] font-medium">
            3. Kung may custom system ka bukas, ano ang unang ipapagawa mo? <span className="text-white/40">(optional)</span>
          </div>
          <textarea
            value={q3}
            onChange={(e) => setQ3(e.target.value)}
            rows={3}
            placeholder="Isulat mo lang dito…"
            className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[14px] text-white placeholder-white/35 focus:border-cyan-400 focus:outline-none"
          />
        </div>

        <div>
          <div className="mb-2 text-[13.5px] font-medium">4. Alin ang mas ikaw?</div>
          <div className="space-y-2">
            {INTENTS.map((o) => (
              <Radio key={o.v} name="q4" value={o.v} current={q4} onChange={setQ4}>{o.label}</Radio>
            ))}
          </div>
        </div>
      </div>

      {err && <div className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-[13px] text-rose-300">{err}</div>}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-6 w-full rounded-full bg-cyan-500 px-6 py-3.5 text-[15px] font-semibold text-black transition hover:bg-cyan-400 disabled:opacity-60"
      >
        {busy ? 'Sending…' : 'Send → i-tailor ang webinar'}
      </button>
    </div>
  );
}

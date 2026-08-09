'use client';

import { useState } from 'react';

const INDUSTRIES: Array<{ v: string; label: string }> = [
  { v: 'food_retail', label: 'Food / Retail' },
  { v: 'services', label: 'Services' },
  { v: 'construction', label: 'Construction / Engineering' },
  { v: 'healthcare', label: 'Clinic / Healthcare' },
  { v: 'education', label: 'Education / Training' },
  { v: 'professional_services', label: 'Accounting / Professional Services' },
  { v: 'real_estate', label: 'Real Estate / Rental' },
  { v: 'logistics_ops', label: 'Logistics / Operations' },
  { v: 'agency_freelance', label: 'Agency / Freelance' },
  { v: 'manufacturing', label: 'Manufacturing' },
  { v: 'other', label: 'Other' },
];
const PAINS: Array<{ v: string; label: string }> = [
  { v: 'orders_tracking', label: 'Orders / tracking' },
  { v: 'manual_reports', label: 'Manual reports' },
  { v: 'inventory', label: 'Inventory / stocks' },
  { v: 'payments_collections', label: 'Payments / collections' },
  { v: 'followups', label: 'Follow-ups' },
  { v: 'team_visibility', label: 'Team visibility' },
  { v: 'other', label: 'Other' },
];
const TEAM_SIZES: Array<{ v: string; label: string }> = [
  { v: 'solo', label: 'Just me' },
  { v: 'micro', label: '2–5' },
  { v: 'small', label: '6–20' },
  { v: 'mid', label: '21+' },
];
const TRIED: Array<{ v: string; label: string }> = [
  { v: 'never', label: "Not yet — this is the first time I'm looking into it" },
  { v: 'abandoned', label: 'I started building something but never finished it' },
  { v: 'manual_system', label: "We have a system, but it's still manual / Excel-based" },
  { v: 'has_software', label: 'We already use software, I just want to upgrade it' },
];
const INTENTS: Array<{ v: string; label: string }> = [
  { v: 'diy', label: 'I want to build it myself — I want to learn' },
  { v: 'diy_open', label: "I'd like to learn, but I'm open to having it built if it gets heavy" },
  { v: 'dfy', label: "I don't have time — I want someone to build it for me" },
];

function Radio({
  value,
  current,
  onChange,
  children,
}: {
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
      className={`flex w-full items-start gap-2.5 rounded-xl border px-4 py-3 text-left text-[14px] leading-snug transition ${
        sel
          ? 'border-cyan-400 bg-cyan-500/15 text-white'
          : 'border-white/10 bg-white/[0.02] text-white/80 hover:border-white/25'
      }`}
    >
      <span className={`mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-full border ${sel ? 'border-cyan-400 bg-cyan-400' : 'border-white/30'}`} />
      <span>{children}</span>
    </button>
  );
}

function Field({ n, label, hint, children }: { n: number; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[13.5px] font-medium">
        {n}. {label}
      </div>
      {hint && <div className="mb-2 -mt-1 text-[12.5px] text-white/45">{hint}</div>}
      {children}
    </div>
  );
}

export function SurveyForm({ token }: { token: string }) {
  const [q1, setQ1] = useState('');
  const [q1free, setQ1free] = useState('');
  const [q2, setQ2] = useState('');
  const [q2free, setQ2free] = useState('');
  const [q3, setQ3] = useState(''); // team size
  const [q4, setQ4] = useState(''); // tried before
  const [q5, setQ5] = useState(''); // first process (free text)
  const [q6, setQ6] = useState(''); // build intent
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (busy) return;
    if (!q1 || !q2 || !q3 || !q4 || !q6) {
      setErr('Please answer all the required questions 🙏');
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
          q1_freetext: q1 === 'other' ? q1free : undefined,
          q2_pain: q2,
          q2_freetext: q2 === 'other' ? q2free : undefined,
          q3_team: q3,
          q4_tried: q4,
          q5_freetext: q5 || undefined,
          q6_intent: q6,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (json.ok) setDone(true);
      else setErr(json.error || 'Could not save — please try again.');
    } catch {
      setErr('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/[0.06] p-8 text-center">
        <div className="text-4xl">🎯</div>
        <h1 className="mt-3 text-xl font-semibold">Thanks!</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-white/70">
          At the webinar we&rsquo;ll show you the sample system closest to your business. See you there! 🚀
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-7">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-400">Takes 1 minute</div>
      <h1 className="mt-1 text-[21px] font-semibold leading-tight">
        So we can tailor the webinar to your business — and show you a sample system that actually matches what you do.
      </h1>

      <div className="mt-6 space-y-6">
        <Field n={1} label="What industry is your business in?">
          <div className="space-y-2">
            {INDUSTRIES.map((o) => (
              <Radio key={o.v} value={o.v} current={q1} onChange={setQ1}>{o.label}</Radio>
            ))}
          </div>
          {q1 === 'other' && (
            <input
              value={q1free}
              onChange={(e) => setQ1free(e.target.value)}
              placeholder="What industry? (optional)"
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[14px] text-white placeholder-white/35 focus:border-cyan-400 focus:outline-none"
            />
          )}
        </Field>

        <Field n={2} label="What's your #1 operations headache right now?">
          <div className="space-y-2">
            {PAINS.map((o) => (
              <Radio key={o.v} value={o.v} current={q2} onChange={setQ2}>{o.label}</Radio>
            ))}
          </div>
          {q2 === 'other' && (
            <input
              value={q2free}
              onChange={(e) => setQ2free(e.target.value)}
              placeholder="What's the headache? (optional)"
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[14px] text-white placeholder-white/35 focus:border-cyan-400 focus:outline-none"
            />
          )}
        </Field>

        <Field n={3} label="How big is your team?">
          <div className="grid grid-cols-2 gap-2">
            {TEAM_SIZES.map((o) => (
              <Radio key={o.v} value={o.v} current={q3} onChange={setQ3}>{o.label}</Radio>
            ))}
          </div>
        </Field>

        <Field n={4} label="Have you tried fixing this before?">
          <div className="space-y-2">
            {TRIED.map((o) => (
              <Radio key={o.v} value={o.v} current={q4} onChange={setQ4}>{o.label}</Radio>
            ))}
          </div>
        </Field>

        <Field
          n={5}
          label="What's the first process you'd want to automate? (optional)"
          hint="Describe how it works today — step by step if you can. Messy is fine."
        >
          <textarea
            value={q5}
            onChange={(e) => setQ5(e.target.value)}
            rows={4}
            placeholder="Example: We have 30 stores that order from our warehouse through Viber. Inventory deduction is still manual, and we wait for confirmation before anything ships…"
            className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[14px] leading-relaxed text-white placeholder-white/35 focus:border-cyan-400 focus:outline-none"
          />
          <div className="mt-1.5 text-[12px] text-white/40">
            The more detail you give, the closer the sample system we show will be to your actual business.
          </div>
        </Field>

        <Field n={6} label="How do you want this built?">
          <div className="space-y-2">
            {INTENTS.map((o) => (
              <Radio key={o.v} value={o.v} current={q6} onChange={setQ6}>{o.label}</Radio>
            ))}
          </div>
        </Field>
      </div>

      {err && <div className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-[13px] text-rose-300">{err}</div>}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-6 w-full rounded-full bg-cyan-500 px-6 py-3.5 text-[15px] font-semibold text-black transition hover:bg-cyan-400 disabled:opacity-60"
      >
        {busy ? 'Sending…' : 'Send → tailor my webinar'}
      </button>
    </div>
  );
}

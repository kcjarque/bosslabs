'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

type Method = 'UnionBank' | 'BPI' | 'Credit Card';
type Plan = 'full' | 'reservation' | 'installment';

const METHODS: Method[] = ['UnionBank', 'BPI', 'Credit Card'];
const PLANS: { id: Plan; label: string; blurb: string }[] = [
  { id: 'full', label: 'Full payment', blurb: 'Pay once, save the most' },
  { id: 'reservation', label: 'Reservation ₱10k', blurb: 'Lock your slot with a deposit' },
  { id: 'installment', label: 'Installment', blurb: '3-month split' },
];
const SHIRTS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

// Dark, glassy input — matches the retreat page. py-3 keeps it ≥44px tall;
// text-base avoids iOS focus-zoom; cyan focus glow.
const inputCls =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-base text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-400/70 focus:bg-white/[0.06] focus:ring-2 focus:ring-cyan-500/25';

// Selectable card / pill — clear cyan selected state with a soft glow.
function selCls(active: boolean) {
  return active
    ? 'border-cyan-400/70 bg-cyan-500/[0.12] ring-1 ring-cyan-400/40 shadow-[0_0_24px_-8px_rgba(34,211,238,0.65)]'
    : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]';
}

export function ReserveButton({
  className = '',
  label = 'Reserve your slot →',
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState<Method | ''>('');
  const [plan, setPlan] = useState<Plan | ''>('');
  const [overnight, setOvernight] = useState<'yes' | 'no' | ''>('');
  const [diet, setDiet] = useState('');
  const [business, setBusiness] = useState('');
  const [buildIdea, setBuildIdea] = useState('');
  const [hasPlusOne, setHasPlusOne] = useState(false);
  const [extraPersonName, setExtraPersonName] = useState('');
  const [tshirt, setTshirt] = useState('');
  const [heardFrom, setHeardFrom] = useState('');

  // Lock background scroll + allow Escape to close while the modal is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, submitting]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || !phone.trim()) {
      setError('Please fill in your name, email, and number.');
      return;
    }
    if (!plan) {
      setError('Please choose a payment plan.');
      return;
    }
    if (!method) {
      setError('Please choose a payment method.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/retreat/reserve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          paymentMethod: method,
          paymentPlan: plan,
          overnight: overnight === '' ? undefined : overnight === 'yes',
          diet: diet.trim(),
          business: business.trim(),
          buildIdea: buildIdea.trim(),
          extraPersonName: hasPlusOne ? extraPersonName.trim() : '',
          tshirtSize: tshirt,
          heardFrom: heardFrom.trim(),
        }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error || 'Something went wrong.');
      router.push(`/vibecode-retreat/reserve/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-9 py-4 font-sans text-base font-medium text-white shadow-[0_14px_34px_-12px_rgba(0,150,200,0.65)] transition hover:from-cyan-400 hover:to-indigo-400 active:translate-y-[1px] ${className}`}
      >
        {label}
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] overflow-y-auto bg-black/75 backdrop-blur-sm"
            onClick={() => !submitting && setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Reserve your seat"
          >
            <style dangerouslySetInnerHTML={{ __html: MODAL_CSS }} />
            <div className="flex min-h-full items-start justify-center p-3 sm:items-center sm:p-4">
              <div
                className="vc-modal-in my-6 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-cyan-500/20 bg-[#0A0E1A]/95 shadow-[0_40px_120px_-24px_rgba(0,0,0,0.85)] backdrop-blur-xl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="relative flex items-start justify-between gap-4 border-b border-white/[0.06] px-6 pb-5 pt-6">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-cyan-500/15 blur-3xl"
                  />
                  <div className="relative">
                    <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                      Invite-only · 10 seats
                    </div>
                    <h2 className="mt-2 font-serif text-[26px] tracking-tight text-white">
                      Reserve your seat
                    </h2>
                    <p className="mt-1 text-sm text-ink-300">
                      A few quick details and we&apos;ll show you how to pay.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="relative -mr-1 -mt-1 rounded-full p-2 text-ink-300 transition hover:bg-white/10 hover:text-white"
                    aria-label="Close"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
                  {/* Scrollable body */}
                  <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
                    {/* About you */}
                    <Group label="Full name *">
                      <input
                        className={inputCls}
                        placeholder="Juan Dela Cruz"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </Group>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Group label="Email *">
                        <input
                          className={inputCls}
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          placeholder="you@email.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </Group>
                      <Group label="Mobile number *">
                        <input
                          className={inputCls}
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="09XX XXX XXXX"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      </Group>
                    </div>

                    {/* Plan */}
                    <Group label="Payment plan *">
                      <div className="grid gap-2 sm:grid-cols-3">
                        {PLANS.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            aria-pressed={plan === p.id}
                            onClick={() => setPlan(p.id)}
                            className={`rounded-xl border px-3 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${selCls(plan === p.id)}`}
                          >
                            <div className="text-sm font-semibold text-white">{p.label}</div>
                            <div className="mt-0.5 text-[11px] leading-tight text-ink-400">{p.blurb}</div>
                          </button>
                        ))}
                      </div>
                    </Group>

                    {/* Method */}
                    <Group label="Payment method *">
                      <div className="grid grid-cols-3 gap-2">
                        {METHODS.map((m) => (
                          <button
                            key={m}
                            type="button"
                            aria-pressed={method === m}
                            onClick={() => setMethod(m)}
                            className={`rounded-xl border px-2 py-3 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
                              method === m ? `text-cyan-100 ${selCls(true)}` : `text-ink-200 ${selCls(false)}`
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </Group>

                    {/* Logistics */}
                    <Group label="Okay to stay overnight with us?">
                      <div className="flex gap-2">
                        {(['yes', 'no'] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            aria-pressed={overnight === v}
                            onClick={() => setOvernight(v)}
                            className={`flex-1 rounded-xl border px-3 py-3 text-sm font-medium capitalize transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
                              overnight === v ? `text-cyan-100 ${selCls(true)}` : `text-ink-200 ${selCls(false)}`
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </Group>

                    <Group label="What do you want to build that weekend?">
                      <textarea
                        className={`${inputCls} min-h-[80px] resize-y`}
                        placeholder="A booking system, a CRM, an online store… a sentence is fine."
                        value={buildIdea}
                        onChange={(e) => setBuildIdea(e.target.value)}
                      />
                    </Group>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Group label="Dietary restrictions">
                        <input
                          className={inputCls}
                          placeholder="Vegetarian, allergies…"
                          value={diet}
                          onChange={(e) => setDiet(e.target.value)}
                        />
                      </Group>
                      <Group label="T-shirt size">
                        <select
                          className={`${inputCls} appearance-none`}
                          value={tshirt}
                          onChange={(e) => setTshirt(e.target.value)}
                        >
                          <option value="" className="bg-[#0A0E1A]">Select…</option>
                          {SHIRTS.map((s) => (
                            <option key={s} value={s} className="bg-[#0A0E1A]">{s}</option>
                          ))}
                        </select>
                      </Group>
                    </div>

                    <Group label="Your business (optional)">
                      <input
                        className={inputCls}
                        placeholder="What do you do?"
                        value={business}
                        onChange={(e) => setBusiness(e.target.value)}
                      />
                    </Group>

                    <Group label="Bringing someone? (+₱15,000)">
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-ink-200 transition hover:border-white/20">
                        <input
                          type="checkbox"
                          checked={hasPlusOne}
                          onChange={(e) => setHasPlusOne(e.target.checked)}
                          className="h-4 w-4 accent-cyan-500"
                        />
                        Yes, I&apos;m bringing a plus one
                      </label>
                      {hasPlusOne && (
                        <input
                          className={`${inputCls} mt-2`}
                          placeholder="Their full name"
                          autoComplete="name"
                          value={extraPersonName}
                          onChange={(e) => setExtraPersonName(e.target.value)}
                        />
                      )}
                    </Group>

                    <Group label="How did you hear about us? (optional)">
                      <input
                        className={inputCls}
                        placeholder="Instagram, a friend, our webinar…"
                        value={heardFrom}
                        onChange={(e) => setHeardFrom(e.target.value)}
                      />
                    </Group>

                    {error && (
                      <p
                        role="alert"
                        aria-live="polite"
                        className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300"
                      >
                        {error}
                      </p>
                    )}
                  </div>

                  {/* Sticky footer CTA */}
                  <div className="border-t border-white/[0.07] bg-[#0A0E1A]/85 px-6 py-4 backdrop-blur-md">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex w-full items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-6 py-3.5 font-sans text-base font-medium text-white shadow-[0_14px_34px_-12px_rgba(0,150,200,0.7)] transition hover:from-cyan-400 hover:to-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? 'Reserving…' : 'Continue to payment →'}
                    </button>
                    <p className="mt-2.5 text-center text-[11px] text-ink-400">
                      We&apos;ll never share your details · Seats confirmed once payment is received.
                    </p>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300/70">
        {label}
      </div>
      {children}
    </div>
  );
}

const MODAL_CSS = `
@keyframes vcModalIn { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
.vc-modal-in { animation: vcModalIn .22s cubic-bezier(.2,.8,.2,1); }
@media (prefers-reduced-motion: reduce) { .vc-modal-in { animation: none; } }
`;

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

const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15';

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
            className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/40 backdrop-blur-sm"
            onClick={() => !submitting && setOpen(false)}
          >
            <div className="flex min-h-full items-start justify-center p-4 sm:items-center">
              <div
                className="my-8 w-full max-w-lg rounded-3xl border border-white/80 bg-white p-6 shadow-2xl sm:p-8"
                onClick={(e) => e.stopPropagation()}
              >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-serif text-2xl tracking-tight text-slate-900">
                  Reserve your seat
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  10 builders only. A few quick details and we&apos;ll show you
                  how to pay.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mr-1 -mt-1 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <form onSubmit={submit} className="mt-6 space-y-5">
              {/* About you */}
              <div className="space-y-3">
                <input
                  className={inputCls}
                  placeholder="Full name *"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className={inputCls}
                  type="email"
                  placeholder="Email *"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  className={inputCls}
                  type="tel"
                  placeholder="Mobile number *"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              {/* Plan */}
              <Group label="Payment plan *">
                <div className="grid gap-2 sm:grid-cols-3">
                  {PLANS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPlan(p.id)}
                      className={`rounded-xl border px-3 py-2.5 text-left transition ${
                        plan === p.id
                          ? 'border-cyan-500 bg-cyan-50 ring-2 ring-cyan-500/15'
                          : 'border-slate-300 bg-white hover:border-slate-400'
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-900">
                        {p.label}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-tight text-slate-500">
                        {p.blurb}
                      </div>
                    </button>
                  ))}
                </div>
              </Group>

              {/* Method */}
              <Group label="Payment method *">
                <div className="flex gap-2">
                  {METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                        method === m
                          ? 'border-cyan-500 bg-cyan-50 text-cyan-700 ring-2 ring-cyan-500/15'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
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
                      onClick={() => setOvernight(v)}
                      className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium capitalize transition ${
                        overnight === v
                          ? 'border-cyan-500 bg-cyan-50 text-cyan-700 ring-2 ring-cyan-500/15'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </Group>

              <Group label="Dietary restrictions">
                <input
                  className={inputCls}
                  placeholder="e.g. vegetarian, no pork, allergies… (or leave blank)"
                  value={diet}
                  onChange={(e) => setDiet(e.target.value)}
                />
              </Group>

              {/* Better-idea extras */}
              <Group label="What do you want to build that weekend?">
                <textarea
                  className={`${inputCls} min-h-[72px] resize-y`}
                  placeholder="A booking system, a CRM, an online store… a sentence is fine."
                  value={buildIdea}
                  onChange={(e) => setBuildIdea(e.target.value)}
                />
              </Group>

              <div className="grid gap-3 sm:grid-cols-2">
                <Group label="Your business (optional)">
                  <input
                    className={inputCls}
                    placeholder="What do you do?"
                    value={business}
                    onChange={(e) => setBusiness(e.target.value)}
                  />
                </Group>
                <Group label="T-shirt size (optional)">
                  <select
                    className={inputCls}
                    value={tshirt}
                    onChange={(e) => setTshirt(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {SHIRTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Group>
              </div>

              <Group label="Bringing someone? (+₱15,000)">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={hasPlusOne}
                    onChange={(e) => setHasPlusOne(e.target.checked)}
                  />
                  Yes, I&apos;m bringing a plus one
                </label>
                {hasPlusOne && (
                  <input
                    className={`${inputCls} mt-2`}
                    placeholder="Their full name"
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
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-6 py-3.5 font-sans text-base font-medium text-white shadow-[0_14px_34px_-12px_rgba(0,150,200,0.65)] transition hover:from-cyan-400 hover:to-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Reserving…' : 'Continue to payment →'}
              </button>
              <p className="text-center text-[11px] text-slate-400">
                We&apos;ll never share your details. Seats are confirmed once
                payment is received.
              </p>
            </form>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      {children}
    </div>
  );
}

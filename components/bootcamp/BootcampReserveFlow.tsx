'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BootcampTier, BootcampTierDef } from '@/lib/bootcamp';

const inputCls =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-base text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-400/70 focus:bg-white/[0.06] focus:ring-2 focus:ring-cyan-500/25';

const labelCls =
  'mb-1.5 block text-[12.5px] font-medium uppercase tracking-[0.08em] text-ink-200';

function formatPHP(centavos: number) {
  return `₱${(centavos / 100).toLocaleString('en-PH')}`;
}

type GroupMember = { name: string; email: string; phone: string };

export function BootcampReserveFlow({
  tiers,
  presetTier,
  seatsLeft,
}: {
  tiers: BootcampTierDef[];
  presetTier: string;
  seatsLeft: number;
}) {
  const router = useRouter();

  // Default to the preset tier if present + available, else the first that fits.
  const initialTier =
    (tiers.find((t) => t.id === presetTier && t.seats <= seatsLeft)?.id ??
      tiers.find((t) => t.seats <= seatsLeft)?.id ??
      tiers[0].id) as BootcampTier;

  const [tier, setTier] = useState<BootcampTier>(initialTier);
  const selected = useMemo(() => tiers.find((t) => t.id === tier)!, [tier, tiers]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [buildIdea, setBuildIdea] = useState('');
  const [heardFrom, setHeardFrom] = useState('');
  const [members, setMembers] = useState<GroupMember[]>([]);

  // Adjust members array when tier changes (need seats - 1 additional members)
  useEffect(() => {
    const needed = Math.max(0, selected.seats - 1);
    setMembers((prev) => {
      const next = [...prev];
      while (next.length < needed) next.push({ name: '', email: '', phone: '' });
      next.length = needed;
      return next;
    });
  }, [selected.seats]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim() || !phone.trim()) {
      setError('Please fill in your name, email, and number.');
      return;
    }
    if (selected.seats > seatsLeft) {
      setError(`Only ${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left — pick a smaller tier.`);
      return;
    }
    if (selected.seats > 1) {
      const filledNames = members.filter((m) => m.name.trim()).length;
      if (filledNames < selected.seats - 1) {
        setError(`Add at least ${selected.seats - 1} additional member name${selected.seats - 1 === 1 ? '' : 's'}.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/bootcamp/reserve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          company: company.trim(),
          tier,
          buildIdea: buildIdea.trim(),
          heardFrom: heardFrom.trim(),
          groupMembers: members.filter((m) => m.name.trim()),
        }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error || 'Something went wrong.');
      router.push(`/founders-bootcamp/reserve/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-10">
      {/* Tier picker */}
      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-2xl text-white">Pick your tier</h2>
          <span className="text-[12px] text-ink-400">{seatsLeft} seats remaining</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {tiers.map((t) => {
            const disabled = t.seats > seatsLeft;
            const active = t.id === tier;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => !disabled && setTier(t.id)}
                disabled={disabled}
                className={`relative rounded-2xl border p-4 text-left transition ${
                  disabled
                    ? 'cursor-not-allowed border-white/[0.04] bg-white/[0.01] opacity-40'
                    : active
                      ? 'border-cyan-400/70 bg-cyan-500/[0.08] shadow-[0_18px_44px_-22px_rgba(0,184,230,0.7)]'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]'
                }`}
              >
                {t.badge && (
                  <div
                    className={`absolute -top-2.5 right-4 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                      active
                        ? 'border-cyan-400/60 bg-cyan-500/[0.18] text-cyan-100'
                        : 'border-white/15 bg-white/[0.04] text-ink-200'
                    }`}
                  >
                    {t.badge}
                  </div>
                )}
                <div className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink-300">
                  {t.label}
                </div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <div className="font-serif text-3xl text-white tabular-nums">
                    {formatPHP(t.perSeatCentavos)}
                  </div>
                  <div className="text-[11px] text-ink-400">/ seat</div>
                </div>
                {t.seats > 1 && (
                  <div className="mt-1 text-[12px] text-ink-300">
                    {t.seats} seats · total {formatPHP(t.totalCentavos)}
                  </div>
                )}
                <p className="mt-3 text-[12.5px] leading-[1.5] text-ink-200">{t.tagline}</p>
                <div className="mt-3 border-t border-white/[0.06] pt-3 text-[12px] text-ink-300">
                  Downpayment <span className="font-semibold text-white">{formatPHP(t.downpaymentCentavos)}</span>
                  <span className="ml-1 text-amber-300/80">· non-refundable</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Group members if group tier */}
      {selected.seats > 1 && (
        <section>
          <h2 className="mb-3 font-serif text-2xl text-white">Your team</h2>
          <p className="mb-4 text-[13.5px] text-ink-300">
            You're the primary contact. Add the {selected.seats - 1} other founder
            {selected.seats - 1 === 1 ? '' : 's'} who'll be in the room.
          </p>
          <div className="space-y-3">
            {members.map((m, i) => (
              <div key={i} className="grid gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:grid-cols-[1fr,1fr,1fr]">
                <input
                  type="text"
                  placeholder={`Member ${i + 2} name`}
                  value={m.name}
                  onChange={(e) =>
                    setMembers((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                  }
                  className={inputCls}
                />
                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={m.email}
                  onChange={(e) =>
                    setMembers((prev) => prev.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))
                  }
                  className={inputCls}
                />
                <input
                  type="tel"
                  placeholder="Mobile (optional)"
                  value={m.phone}
                  onChange={(e) =>
                    setMembers((prev) => prev.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))
                  }
                  className={inputCls}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Primary contact */}
      <section>
        <h2 className="mb-3 font-serif text-2xl text-white">Your details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="bc-name">Full name *</label>
            <input id="bc-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Juan Dela Cruz" autoComplete="name" />
          </div>
          <div>
            <label className={labelCls} htmlFor="bc-email">Email *</label>
            <input id="bc-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="juan@yourbusiness.ph" autoComplete="email" />
          </div>
          <div>
            <label className={labelCls} htmlFor="bc-phone">Mobile *</label>
            <input id="bc-phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="09xx xxx xxxx" autoComplete="tel" />
          </div>
          <div>
            <label className={labelCls} htmlFor="bc-company">Company / brand</label>
            <input id="bc-company" type="text" value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} placeholder="(optional)" autoComplete="organization" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="bc-idea">One specific problem you want to solve</label>
            <textarea id="bc-idea" rows={3} value={buildIdea} onChange={(e) => setBuildIdea(e.target.value)} className={`${inputCls} font-sans`} placeholder="e.g., A booking system for our 3-branch dental clinic that syncs with our staff calendar." />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="bc-heard">How did you hear about us?</label>
            <input id="bc-heard" type="text" value={heardFrom} onChange={(e) => setHeardFrom(e.target.value)} className={inputCls} placeholder="Webinar / Facebook ad / friend" />
          </div>
        </div>
      </section>

      {/* Summary + submit */}
      <section className="sticky bottom-3 z-10">
        <div className="rounded-2xl border border-white/10 bg-[#06070A]/95 p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Downpayment due</div>
              <div className="mt-1 font-serif text-3xl text-white tabular-nums">
                {formatPHP(selected.downpaymentCentavos)}
                <span className="ml-2 align-middle text-[10.5px] font-semibold uppercase tracking-[0.16em] text-amber-300">
                  Non-refundable
                </span>
              </div>
              <div className="text-[12px] text-ink-400">
                Total {formatPHP(selected.totalCentavos)} · balance {formatPHP(selected.totalCentavos - selected.downpaymentCentavos)} due before bootcamp
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-7 py-3.5 text-sm font-semibold text-white shadow-[0_14px_34px_-12px_rgba(0,150,200,0.65)] transition hover:from-cyan-400 hover:to-indigo-400 active:translate-y-[1px] disabled:opacity-60"
            >
              {submitting ? 'Reserving…' : 'Continue to payment →'}
            </button>
          </div>
          {error && (
            <div role="alert" className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/[0.07] px-3 py-2 text-[13px] text-rose-200">
              {error}
            </div>
          )}
        </div>
      </section>
    </form>
  );
}

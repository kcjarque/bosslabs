'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BootcampTier, BootcampTierDef } from '@/lib/bootcamp';

const inputCls =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-base text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-400/70 focus:bg-white/[0.06] focus:ring-2 focus:ring-cyan-500/25';

const labelCls =
  'mb-1.5 block text-[12.5px] font-medium uppercase tracking-[0.08em] text-ink-200';

function fmtPHP(c: number) {
  return `₱${(c / 100).toLocaleString('en-PH')}`;
}

type Member = { name: string; email: string; phone: string };

type Props = {
  tiers: BootcampTierDef[];
  presetTier?: BootcampTier;
  seatsLeft: number;
  open: boolean;
  onClose: () => void;
};

export function BootcampReserveModal({
  tiers,
  presetTier,
  seatsLeft,
  open,
  onClose,
}: Props) {
  const [tier, setTier] = useState<BootcampTier>(
    () =>
      (tiers.find((t) => t.id === presetTier && t.seats <= seatsLeft)?.id ??
        tiers.find((t) => t.seats <= seatsLeft)?.id ??
        tiers[0].id) as BootcampTier,
  );
  const selected = useMemo(() => tiers.find((t) => t.id === tier)!, [tier, tiers]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [buildIdea, setBuildIdea] = useState('');
  const [heardFrom, setHeardFrom] = useState('');
  const [members, setMembers] = useState<Member[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string } | null>(null);

  useEffect(() => {
    const needed = Math.max(0, selected.seats - 1);
    setMembers((prev) => {
      const next = [...prev];
      while (next.length < needed) next.push({ name: '', email: '', phone: '' });
      next.length = needed;
      return next;
    });
  }, [selected.seats]);

  // Lock background scroll + Escape closes the modal while idle.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, submitting, onClose]);

  // When the modal opens, sync the preset tier (so the same modal can be
  // opened by different tier-card CTAs).
  useEffect(() => {
    if (!open || !presetTier) return;
    const valid = tiers.find((t) => t.id === presetTier && t.seats <= seatsLeft);
    if (valid) setTier(valid.id);
  }, [open, presetTier, seatsLeft, tiers]);

  function reset() {
    setName('');
    setEmail('');
    setPhone('');
    setCompany('');
    setBuildIdea('');
    setHeardFrom('');
    setMembers([]);
    setError(null);
    setDone(null);
  }

  function closeAndReset() {
    onClose();
    // Defer the reset so the closing animation doesn't flash the empty state.
    setTimeout(reset, 250);
  }

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
        setError(
          `Add at least ${selected.seats - 1} additional member name${selected.seats - 1 === 1 ? '' : 's'}.`,
        );
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
      setDone({ id: json.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-black/80 backdrop-blur-sm"
      onClick={() => !submitting && closeAndReset()}
      role="dialog"
      aria-modal="true"
      aria-label="Reserve your bootcamp seat"
    >
      <style dangerouslySetInnerHTML={{ __html: MODAL_CSS }} />
      <div className="flex min-h-full items-start justify-center p-3 sm:items-center sm:p-6">
        <div
          className="bc-modal-in relative w-full max-w-2xl overflow-hidden rounded-3xl border border-cyan-500/20 bg-[#0A0E1A]/95 shadow-[0_40px_120px_-24px_rgba(0,0,0,0.85)] backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close */}
          <button
            type="button"
            onClick={closeAndReset}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-ink-200 transition hover:border-white/30 hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6l-6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>

          {done ? (
            /* ---------- Success state ---------- */
            <div className="px-6 py-10 text-center sm:px-10 sm:py-14">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/60 bg-emerald-500/[0.12] shadow-[0_0_60px_-10px_rgba(34,197,94,0.6)]">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-emerald-300">
                  <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="mt-6 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
                Reservation received
              </div>
              <h2 className="mt-3 font-serif text-3xl tracking-tight text-white sm:text-4xl">
                You're on the list.
              </h2>
              <p className="mt-4 text-[14.5px] leading-[1.6] text-ink-200">
                We've emailed payment options to <span className="font-semibold text-white">{email}</span>.
                Lock your seat with a <span className="font-semibold text-white">{fmtPHP(selected.downpaymentCentavos)}</span> downpayment
                whenever you're ready — your spot waits until then (subject to the 80-seat cap).
              </p>
              <p className="mt-3 text-[11.5px] uppercase tracking-[0.18em] text-amber-300/80">
                Downpayment is non-refundable
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <a
                  href={`/founders-bootcamp/reserve/${done.id}`}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-7 py-3.5 text-sm font-semibold text-white shadow-[0_14px_34px_-12px_rgba(0,150,200,0.65)] transition hover:from-cyan-400 hover:to-indigo-400"
                >
                  Pay downpayment now →
                </a>
                <button
                  type="button"
                  onClick={closeAndReset}
                  className="rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-ink-200 transition hover:border-white/30 hover:text-white"
                >
                  I'll pay from my email
                </button>
              </div>
            </div>
          ) : (
            /* ---------- Form state ---------- */
            <form onSubmit={submit}>
              {/* Header */}
              <div className="relative border-b border-white/[0.06] px-6 pb-5 pt-7 sm:px-8">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-cyan-500/15 blur-3xl"
                />
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
                  Reserve a seat
                </div>
                <h2 className="mt-2 font-serif text-2xl tracking-tight text-white sm:text-3xl">
                  Lock your seat. Pay later.
                </h2>
                <p className="mt-2 text-[13px] leading-[1.55] text-ink-300">
                  Register now — we'll email payment options. Settle the {fmtPHP(selected.downpaymentCentavos)} downpayment when you're ready.
                </p>
              </div>

              <div className="max-h-[70vh] space-y-6 overflow-y-auto px-6 py-6 sm:px-8">
                {/* Tier picker */}
                <section>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <label className={labelCls}>Pick your tier</label>
                    <span className="text-[11px] text-ink-400">{seatsLeft} seats left</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {tiers.map((t) => {
                      const disabled = t.seats > seatsLeft;
                      const active = t.id === tier;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => !disabled && setTier(t.id)}
                          disabled={disabled}
                          className={`rounded-xl border p-3 text-left transition ${
                            disabled
                              ? 'cursor-not-allowed border-white/[0.04] bg-white/[0.01] opacity-40'
                              : active
                                ? 'border-cyan-400/70 bg-cyan-500/[0.08] shadow-[0_14px_30px_-18px_rgba(0,184,230,0.7)]'
                                : 'border-white/[0.08] bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]'
                          }`}
                        >
                          <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-300">
                            {t.label}
                          </div>
                          <div className="mt-1.5 font-serif text-xl text-white tabular-nums">
                            {fmtPHP(t.perSeatCentavos)}
                            <span className="ml-1 text-[10px] text-ink-400">/ seat</span>
                          </div>
                          {t.seats > 1 && (
                            <div className="text-[11px] text-ink-400">
                              {t.seats} · total {fmtPHP(t.totalCentavos)}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Group members */}
                {selected.seats > 1 && (
                  <section>
                    <div className={labelCls}>Your team ({selected.seats - 1} more)</div>
                    <div className="space-y-2">
                      {members.map((m, i) => (
                        <div key={i} className="grid gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 sm:grid-cols-[1fr,1fr,1fr]">
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

                {/* Details */}
                <section>
                  <h3 className="mb-3 font-serif text-lg text-white">Your details</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelCls} htmlFor="bcm-name">Full name *</label>
                      <input id="bcm-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Juan Dela Cruz" autoComplete="name" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="bcm-email">Email *</label>
                      <input id="bcm-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="juan@yourbusiness.ph" autoComplete="email" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="bcm-phone">Mobile *</label>
                      <input id="bcm-phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="09xx xxx xxxx" autoComplete="tel" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="bcm-company">Company / brand</label>
                      <input id="bcm-company" type="text" value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} placeholder="(optional)" autoComplete="organization" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls} htmlFor="bcm-idea">One specific problem you want to solve</label>
                      <textarea id="bcm-idea" rows={2} value={buildIdea} onChange={(e) => setBuildIdea(e.target.value)} className={`${inputCls} font-sans`} placeholder="e.g., A booking system for our 3-branch dental clinic that syncs with our staff calendar." />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls} htmlFor="bcm-heard">How did you hear about us?</label>
                      <input id="bcm-heard" type="text" value={heardFrom} onChange={(e) => setHeardFrom(e.target.value)} className={inputCls} placeholder="Webinar / Facebook ad / friend" />
                    </div>
                  </div>
                </section>
              </div>

              {/* Footer (sticky-feel) */}
              <div className="border-t border-white/[0.06] bg-[#06070A]/80 px-6 py-5 sm:px-8">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <div className="text-[10.5px] uppercase tracking-[0.18em] text-ink-400">Downpayment when you're ready</div>
                    <div className="mt-1 font-serif text-2xl text-white tabular-nums">
                      {fmtPHP(selected.downpaymentCentavos)}
                      <span className="ml-2 align-middle text-[9.5px] font-semibold uppercase tracking-[0.16em] text-amber-300">
                        Non-refundable
                      </span>
                    </div>
                    <div className="text-[11.5px] text-ink-400">
                      Total {fmtPHP(selected.totalCentavos)} — pay after we send your options
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_14px_34px_-12px_rgba(0,150,200,0.65)] transition hover:from-cyan-400 hover:to-indigo-400 active:translate-y-[1px] disabled:opacity-60"
                  >
                    {submitting ? 'Reserving…' : 'Register my seat →'}
                  </button>
                </div>
                {error && (
                  <div role="alert" className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/[0.07] px-3 py-2 text-[13px] text-rose-200">
                    {error}
                  </div>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const MODAL_CSS = `
@keyframes bc-modal-in {
  from { opacity: 0; transform: translateY(8px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.bc-modal-in { animation: bc-modal-in 0.22s ease-out both; }
`;

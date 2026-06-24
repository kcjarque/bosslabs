'use client';

import { useState } from 'react';

const BANKS = [
  { method: 'UnionBank', name: 'UnionBank', holder: 'Manago, Michael Batiquin', img: '/qr-unionbank.jpeg' },
  { method: 'BPI', name: 'BPI', holder: 'BossLabs · MI•••L B MA•••O', img: '/qr-bpi.jpeg' },
];

export function BootcampPayPanel({
  reservationId,
  transferNote,
}: {
  reservationId: string;
  transferNote?: string;
}) {
  return (
    <div className="rounded-3xl border border-cyan-500/25 bg-[#0A0E1A] p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] sm:p-8">
      {/* Credit / debit card */}
      <div className="rounded-2xl border border-cyan-400/60 bg-cyan-500/[0.08] p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500/[0.18] text-cyan-200">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
              <path d="M3 10h18" stroke="currentColor" strokeWidth="2" />
              <rect x="7" y="14" width="3" height="2" fill="currentColor" />
            </svg>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
              Instant — recommended
            </div>
            <h3 className="font-sans text-xl font-bold text-white">Credit / Debit Card</h3>
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-300">
          Visa, Mastercard, JCB via secure Xendit checkout — your seat confirms the moment payment clears.
        </p>
        <BootcampCardButton reservationId={reservationId} />
      </div>

      {/* Bank transfer QRs */}
      <div className="mt-6">
        <div className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
          Or pay by bank transfer · InstaPay
        </div>
        <p className="mt-1 text-center text-sm text-ink-300">
          Scan with your banking app{transferNote ? `, and use "${transferNote}" as the note` : ''}.
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {BANKS.map((b) => (
            <div
              key={b.name}
              className="flex flex-col items-center rounded-2xl border border-white/10 bg-white p-5"
            >
              <div className="text-sm font-bold uppercase tracking-[0.18em] text-slate-900">{b.name}</div>
              <div className="mt-1 text-[12px] text-slate-500">{b.holder}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={b.img}
                alt={`${b.name} InstaPay QR — ${b.holder}`}
                className="mt-4 w-full max-w-[240px] rounded-lg"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BootcampCardButton({ reservationId }: { reservationId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function pay() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/bootcamp/pay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: reservationId }),
      });
      const json = (await res.json().catch(() => ({}))) as { redirectUrl?: string; error?: string };
      if (!res.ok || !json.redirectUrl) {
        throw new Error(json.error || 'Could not start the card payment. Please try again.');
      }
      window.location.assign(json.redirectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setLoading(false);
    }
  }
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={pay}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-7 py-3.5 text-base font-semibold text-white shadow-[0_14px_34px_-12px_rgba(0,150,200,0.65)] transition hover:from-cyan-400 hover:to-indigo-400 disabled:opacity-60"
      >
        {loading ? 'Opening secure checkout…' : 'Pay via Credit Card →'}
      </button>
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    </div>
  );
}

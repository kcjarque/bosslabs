'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const peso = (c: number) =>
  `₱${(c / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Commission = {
  id: string;
  name: string;
  saleCentavos: number;
  percent: number;
  amountCentavos: number;
  createdAt: string;
};

export function PayoutHistoryRow({
  payout,
}: {
  payout: {
    id: string;
    closerName: string;
    closerUsername: string;
    amountCentavos: number;
    commissionCount: number;
    slipUrl: string | null;
    slipFilename: string | null;
    note: string | null;
    status: 'paid' | 'voided';
    createdBy: string | null;
    paidAt: string;
    voidedAt: string | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [commissions, setCommissions] = useState<Commission[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [voiding, setVoiding] = useState(false);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!commissions && !loading) {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/closer-payouts/${payout.id}`);
        const json = (await res.json().catch(() => ({}))) as { commissions?: Commission[] };
        setCommissions(json.commissions ?? []);
      } catch (err) {
        console.error('[payout-history] load failed', err);
      } finally {
        setLoading(false);
      }
    }
  }

  async function voidPayout() {
    if (!window.confirm(`Void this ${peso(payout.amountCentavos)} payout? The commissions go back to pending.`)) {
      return;
    }
    setVoiding(true);
    try {
      const res = await fetch(`/api/admin/closer-payouts/${payout.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      console.error('[payout-history] void failed', err);
      window.alert('Void failed.');
    } finally {
      setVoiding(false);
    }
  }

  const voided = payout.status === 'voided';

  return (
    <div className={`card transition ${voided ? 'opacity-60' : ''}`}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">{payout.closerName}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
              @{payout.closerUsername}
            </span>
            {voided && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                voided
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11.5px] text-slate-500">
            {new Date(payout.paidAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
            {payout.createdBy ? ` · by ${payout.createdBy}` : ''}
            {' · '}
            {payout.commissionCount} commission{payout.commissionCount === 1 ? '' : 's'}
          </div>
          {payout.note && <div className="mt-1 text-[12px] text-slate-700">{payout.note}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className={`text-[15px] font-semibold ${voided ? 'text-slate-500 line-through' : 'text-emerald-700'}`}>
            {peso(payout.amountCentavos)}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`}
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {/* Slip + actions row */}
          <div className="mb-3 flex flex-wrap items-center gap-3 text-[12px]">
            {payout.slipUrl ? (
              <a
                href={payout.slipUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1 font-medium text-cyan-700 hover:bg-cyan-100"
              >
                📎 {payout.slipFilename ?? 'View slip'}
              </a>
            ) : (
              <span className="text-slate-400">No slip on file</span>
            )}
            {!voided && (
              <button
                type="button"
                onClick={voidPayout}
                disabled={voiding}
                className="ml-auto rounded-full border border-rose-200 bg-white px-3 py-1 font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
              >
                {voiding ? 'Voiding…' : 'Void payout'}
              </button>
            )}
          </div>

          {loading && <p className="text-[12px] text-slate-500">Loading commissions…</p>}
          {!loading && commissions && commissions.length === 0 && (
            <p className="text-[12px] text-slate-500">No commissions found.</p>
          )}
          {commissions && commissions.length > 0 && (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wide text-slate-400">
                  <th className="pb-1.5">Customer</th>
                  <th className="pb-1.5">Sale</th>
                  <th className="pb-1.5">Rate</th>
                  <th className="pb-1.5 text-right">Commission</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="py-1.5 font-medium text-slate-800">{c.name}</td>
                    <td className="py-1.5 text-slate-600">{peso(c.saleCentavos)}</td>
                    <td className="py-1.5 text-slate-500">{c.percent}%</td>
                    <td className="py-1.5 text-right font-semibold text-emerald-700">{peso(c.amountCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

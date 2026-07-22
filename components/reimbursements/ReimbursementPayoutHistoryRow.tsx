'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const peso = (c: number) =>
  `₱${(c / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CATEGORY_LABEL: Record<string, string> = {
  transport: 'Transport',
  meals: 'Meals',
  supplies: 'Supplies',
  other: 'Other',
};

type ReimbursementRequest = {
  id: string;
  description: string;
  category: string;
  amountCentavos: number;
  spentOn: string;
};

export function ReimbursementPayoutHistoryRow({
  payout,
}: {
  payout: {
    id: string;
    staffName: string;
    amountCentavos: number;
    requestCount: number;
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
  const [requests, setRequests] = useState<ReimbursementRequest[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [voiding, setVoiding] = useState(false);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!requests && !loading) {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/reimbursement-payouts/${payout.id}`);
        const json = (await res.json().catch(() => ({}))) as { requests?: ReimbursementRequest[] };
        setRequests(json.requests ?? []);
      } catch (err) {
        console.error('[reimbursement-payout-history] load failed', err);
      } finally {
        setLoading(false);
      }
    }
  }

  async function voidPayout() {
    if (!window.confirm(`Void this ${peso(payout.amountCentavos)} payout? The claims go back to pending.`)) {
      return;
    }
    setVoiding(true);
    try {
      const res = await fetch(`/api/admin/reimbursement-payouts/${payout.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      console.error('[reimbursement-payout-history] void failed', err);
      window.alert('Void failed.');
    } finally {
      setVoiding(false);
    }
  }

  const voided = payout.status === 'voided';

  return (
    <div className={`card transition ${voided ? 'opacity-60' : ''}`}>
      <button type="button" onClick={toggle} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">{payout.staffName}</span>
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
            {payout.requestCount} claim{payout.requestCount === 1 ? '' : 's'}
          </div>
          {payout.note && <div className="mt-1 text-[12px] text-slate-700">{payout.note}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className={`text-[15px] font-semibold ${voided ? 'text-slate-500 line-through' : 'text-emerald-700'}`}>
            {peso(payout.amountCentavos)}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="mt-3 border-t border-slate-100 pt-3">
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

          {loading && <p className="text-[12px] text-slate-500">Loading claims…</p>}
          {!loading && requests && requests.length === 0 && (
            <p className="text-[12px] text-slate-500">No claims found.</p>
          )}
          {requests && requests.length > 0 && (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wide text-slate-400">
                  <th className="pb-1.5">Description</th>
                  <th className="pb-1.5">Category</th>
                  <th className="pb-1.5">Date</th>
                  <th className="pb-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-1.5 font-medium text-slate-800">{r.description}</td>
                    <td className="py-1.5 text-slate-600">{CATEGORY_LABEL[r.category] ?? r.category}</td>
                    <td className="py-1.5 text-slate-500">
                      {new Date(r.spentOn).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}
                    </td>
                    <td className="py-1.5 text-right font-semibold text-emerald-700">{peso(r.amountCentavos)}</td>
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

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BootcampCode } from '@/lib/bootcamp';

function fmtPHP(centavos: number) {
  return `₱${(centavos / 100).toLocaleString('en-PH')}`;
}

function dtLocal(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function BootcampCodeManager({
  latest,
  all,
}: {
  latest: BootcampCode | null;
  all: BootcampCode[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [perSeat, setPerSeat] = useState('25000');
  // Default: 24h from now in local time
  const defaultExpiry = (() => {
    const d = new Date();
    d.setHours(d.getHours() + 24);
    // Format YYYY-MM-DDTHH:mm for <input type=datetime-local>
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();
  const [expiresLocal, setExpiresLocal] = useState(defaultExpiry);
  const [note, setNote] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!code.trim()) return setError('Code is required.');
    const pesos = Number(perSeat);
    if (!Number.isFinite(pesos) || pesos <= 0) return setError('Per-seat price (₱) must be > 0.');
    if (!expiresLocal) return setError('Pick an expiry.');
    const expiresAt = new Date(expiresLocal).toISOString();
    start(async () => {
      const res = await fetch('/api/admin/bootcamp/code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create', code: code.trim().toUpperCase(), perSeatCentavos: Math.round(pesos * 100), expiresAt, note: note.trim() }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || 'Failed to save code.');
        return;
      }
      setCode('');
      setNote('');
      router.refresh();
    });
  }

  async function disableCode(id: string) {
    start(async () => {
      await fetch('/api/admin/bootcamp/code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'disable', id }),
      });
      router.refresh();
    });
  }

  const now = new Date().toISOString();
  const active = latest && latest.isActive && latest.expiresAt > now ? latest : null;

  return (
    <div className="space-y-5">
      {/* Active code badge */}
      <div className={`rounded-xl border p-4 ${active ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
        {active ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Active code</div>
                <div className="mt-1 font-mono text-lg font-bold tracking-[0.18em] text-emerald-900">{active.code}</div>
              </div>
              <button
                type="button"
                onClick={() => disableCode(active.id)}
                disabled={pending}
                className="rounded-md border border-emerald-700/30 bg-white px-3 py-1.5 text-[12px] font-medium text-emerald-800 hover:bg-emerald-100"
              >
                Disable now
              </button>
            </div>
            <div className="mt-2 text-[13px] text-emerald-800">
              Unlocks seats at <strong>{fmtPHP(active.perSeatCentavos)}</strong> · expires{' '}
              <strong>{dtLocal(active.expiresAt)}</strong>
            </div>
          </>
        ) : (
          <div className="text-[13px] text-amber-800">
            No active code right now. The ₱25,000 promo tier will reject reservations until you set one below.
          </div>
        )}
      </div>

      {/* Create form */}
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Code</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="BOOTCAMP25K"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-mono tracking-[0.16em] outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Per-seat ₱</label>
          <input
            type="number"
            inputMode="decimal"
            value={perSeat}
            onChange={(e) => setPerSeat(e.target.value)}
            min={1}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base tabular-nums outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Expires</label>
          <input
            type="datetime-local"
            value={expiresLocal}
            onChange={(e) => setExpiresLocal(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"
          />
        </div>
        <div className="lg:col-span-1">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="June webinar"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Create code (disables any active code)'}
          </button>
        </div>
        {error && <div className="sm:col-span-2 lg:col-span-4 rounded-md bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</div>}
      </form>

      {/* History */}
      {all.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium text-slate-600">
            Code history ({all.length})
          </summary>
          <div className="border-t border-slate-200">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Price/seat</th>
                  <th className="px-4 py-2">Expires</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {all.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono">{c.code}</td>
                    <td className="px-4 py-2 tabular-nums">{fmtPHP(c.perSeatCentavos)}</td>
                    <td className="px-4 py-2 text-slate-600">{dtLocal(c.expiresAt)}</td>
                    <td className="px-4 py-2">
                      {!c.isActive ? (
                        <span className="text-slate-400">Disabled</span>
                      ) : c.expiresAt < new Date().toISOString() ? (
                        <span className="text-amber-600">Expired</span>
                      ) : (
                        <span className="font-semibold text-emerald-700">Active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

'use client';

/**
 * PromoCodesEditor — admin CRUD UI for promo codes.
 *
 * Top: create-new form (code, discount type+value, max uses, expiry, note).
 * Below: table of existing codes with inline toggle-active, edit, and delete.
 *
 * All writes go through /api/admin/promo-codes (POST upsert, DELETE remove).
 */

import { useState } from 'react';
import type { PromoCode, PromoDiscountType } from '@/lib/db';

function discountLabel(p: Pick<PromoCode, 'discountType' | 'discountValue'>): string {
  switch (p.discountType) {
    case 'free':
      return '100% off (free seat)';
    case 'percent':
      return `${p.discountValue}% off`;
    case 'fixed':
      return `₱${(p.discountValue / 100).toFixed(2)} off`;
  }
}

export function PromoCodesEditor({ initial }: { initial: PromoCode[] }) {
  const [codes, setCodes] = useState<PromoCode[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create-form state — kept inline because the form is single-purpose and
  // a separate modal would just be more code for the same result.
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<PromoDiscountType>('free');
  const [percentValue, setPercentValue] = useState(20);
  const [fixedValuePeso, setFixedValuePeso] = useState(200);
  const [maxUses, setMaxUses] = useState<number | ''>('');
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');

  async function saveNew() {
    setBusy(true);
    setError(null);
    const discountValue =
      discountType === 'percent'
        ? percentValue
        : discountType === 'fixed'
          ? Math.round(fixedValuePeso * 100) // peso → centavos
          : 0;
    try {
      const res = await fetch('/api/admin/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          discountType,
          discountValue,
          maxUses: maxUses === '' ? null : Number(maxUses),
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          active: true,
          note: note.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // Upsert into local state — replace by code if exists, else prepend.
      setCodes((prev) => {
        const next = prev.filter((c) => c.code !== data.promo.code);
        return [data.promo as PromoCode, ...next];
      });
      // Reset form fields ready for the next code.
      setCode('');
      setNote('');
      setMaxUses('');
      setExpiresAt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save promo');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(p: PromoCode) {
    const next = { ...p, active: !p.active };
    setCodes((prev) => prev.map((c) => (c.code === p.code ? next : c)));
    try {
      await fetch('/api/admin/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...next }),
      });
    } catch {
      // Best-effort — local state already optimistic; the table will
      // resync on the next page load.
    }
  }

  async function remove(p: PromoCode) {
    if (!window.confirm(`Delete promo "${p.code}"? Past redemptions stay on the buyers' rows.`)) return;
    setCodes((prev) => prev.filter((c) => c.code !== p.code));
    try {
      await fetch(`/api/admin/promo-codes?code=${encodeURIComponent(p.code)}`, {
        method: 'DELETE',
      });
    } catch {
      // Reload to resync if delete fails — easier than trying to restore state.
      window.location.reload();
    }
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="text-base font-semibold text-slate-900">Create a new code</h2>
        <p className="mt-1 text-sm text-slate-500">
          Codes are case-insensitive on input but stored uppercase. 100%-off
          codes skip Xendit entirely and route the buyer to /accepted.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="new-code">Code</label>
            <input
              id="new-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="VIP2026"
              className="input font-mono uppercase tracking-wider"
              autoCapitalize="characters"
            />
          </div>
          <div>
            <label className="label" htmlFor="new-type">Discount type</label>
            <select
              id="new-type"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as PromoDiscountType)}
              className="input"
            >
              <option value="free">Free (100% off)</option>
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed amount off</option>
            </select>
          </div>

          {discountType === 'percent' && (
            <div>
              <label className="label" htmlFor="new-pct">Percent</label>
              <input
                id="new-pct"
                type="number"
                min={1}
                max={100}
                value={percentValue}
                onChange={(e) => setPercentValue(Number(e.target.value))}
                className="input"
              />
            </div>
          )}

          {discountType === 'fixed' && (
            <div>
              <label className="label" htmlFor="new-fixed">Amount off (₱)</label>
              <input
                id="new-fixed"
                type="number"
                min={1}
                step={1}
                value={fixedValuePeso}
                onChange={(e) => setFixedValuePeso(Number(e.target.value))}
                className="input"
              />
            </div>
          )}

          <div>
            <label className="label" htmlFor="new-max">Max uses (blank = unlimited)</label>
            <input
              id="new-max"
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="e.g. 50"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="new-exp">Expires at (optional)</label>
            <input
              id="new-exp"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="input"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="new-note">Note (admin-only)</label>
            <input
              id="new-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Influencer give-away batch 1"
              className="input"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={saveNew}
            disabled={busy || !code.trim()}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {busy ? 'Saving…' : 'Create promo'}
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-slate-900">Existing codes</h2>
        {codes.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No codes yet. Create one above.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">Discount</th>
                  <th className="px-4 py-3 text-left">Uses</th>
                  <th className="px-4 py-3 text-left">Expires</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {codes.map((p) => {
                  const expired = p.expiresAt && new Date(p.expiresAt).getTime() <= Date.now();
                  const exhausted = p.maxUses != null && p.usesCount >= p.maxUses;
                  return (
                    <tr key={p.code} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <div className="font-mono text-[13px] font-semibold text-slate-900">{p.code}</div>
                        {p.note && (
                          <div className="mt-0.5 max-w-[260px] truncate text-[11px] text-slate-500" title={p.note}>
                            {p.note}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{discountLabel(p)}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {p.usesCount}{p.maxUses != null ? ` / ${p.maxUses}` : ''}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {p.expiresAt ? new Date(p.expiresAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {!p.active ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-600">Disabled</span>
                        ) : expired ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-800">Expired</span>
                        ) : exhausted ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-800">Used up</span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-800">Active</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => toggleActive(p)}
                            className="rounded-full border border-slate-300 px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {p.active ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(p)}
                            className="rounded-full border border-red-200 px-3 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

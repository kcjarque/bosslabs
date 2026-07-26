'use client';

import { useMemo, useRef, useState } from 'react';
import { OFFER } from '@/lib/config';

/**
 * "Mark paid" — opens a small form to record a manual payment (bank transfer /
 * GCash). The operator picks WHAT the customer paid for; the amount is
 * computed from TODAY's prices and stays editable, because the amount frozen
 * on the signup row can be a stale price from an older offer.
 *
 * Confirming fires the full paid flow: email + SMS, Telegram, commissions,
 * and — when the Vault is in the order — BossLabs Hub provisioning.
 */

type Products = { main: boolean; vault: boolean; session: boolean };

const LINE_ITEMS: { key: keyof Products; name: string; centavos: number }[] = [
  { key: 'main', name: OFFER.main.name, centavos: OFFER.main.priceCentavos },
  { key: 'vault', name: OFFER.oto.name, centavos: OFFER.oto.priceCentavos },
  { key: 'session', name: OFFER.oto2.name, centavos: OFFER.oto2.priceCentavos },
];

const peso = (centavos: number) => `₱${(centavos / 100).toLocaleString('en-PH')}`;

export function MarkPaidButton({
  signupId,
  endpoint,
  onDone,
  className,
}: {
  signupId: string;
  endpoint: string;
  onDone?: () => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [err, setErr] = useState('');
  const [products, setProducts] = useState<Products>({ main: true, vault: false, session: false });
  const [amount, setAmount] = useState('');
  const [touchedAmount, setTouchedAmount] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const total = useMemo(
    () => LINE_ITEMS.reduce((sum, li) => sum + (products[li.key] ? li.centavos : 0), 0),
    [products],
  );
  // The amount box follows the picker until the operator types their own value.
  const amountValue = touchedAmount ? amount : String(total / 100);
  const nothingPicked = total === 0 && !touchedAmount;

  function toggle(key: keyof Products) {
    setProducts((p) => ({ ...p, [key]: !p[key] }));
  }

  function reset() {
    setState('idle');
    setErr('');
    setProducts({ main: true, vault: false, session: false });
    setAmount('');
    setTouchedAmount(false);
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function submit() {
    const paid = Number(amountValue);
    if (!Number.isFinite(paid) || paid < 0) {
      setErr('Enter a valid amount.');
      setState('error');
      return;
    }
    setState('saving');
    setErr('');
    const fd = new FormData();
    fd.append('signupId', signupId);
    fd.append('productMain', String(products.main));
    fd.append('productVault', String(products.vault));
    fd.append('productSession', String(products.session));
    fd.append('amountPhp', String(paid));
    if (file) fd.append('file', file);
    try {
      const r = await fetch(endpoint, { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) {
        setState('done');
        setTimeout(() => (onDone ? onDone() : window.location.reload()), 700);
      } else {
        setErr(d.error || 'Failed');
        setState('error');
      }
    } catch {
      setErr('Network error');
      setState('error');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className={
          className ??
          'w-full rounded-md bg-emerald-600 px-2 py-1.5 text-center text-xs font-semibold text-white transition hover:bg-emerald-500'
        }
      >
        💵 Mark paid
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Record manual payment"
          onClick={(e) => {
            if (e.target === e.currentTarget && state !== 'saving') setOpen(false);
          }}
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Record manual payment</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Pick what they actually paid for — prices are today&rsquo;s.
                </p>
              </div>
              <button
                type="button"
                onClick={() => state !== 'saving' && setOpen(false)}
                className="text-slate-300 transition hover:text-slate-500"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Product picker */}
            <div className="mt-4 space-y-1.5">
              {LINE_ITEMS.map((li) => (
                <label
                  key={li.key}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 transition ${
                    products[li.key]
                      ? 'border-emerald-300 bg-emerald-50/60'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={products[li.key]}
                    onChange={() => toggle(li.key)}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <span className="min-w-0 flex-1 text-[12.5px] font-medium text-slate-800">
                    {li.name}
                  </span>
                  <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-slate-600">
                    {peso(li.centavos)}
                  </span>
                </label>
              ))}
            </div>

            {/* Amount — prefilled from the picker, editable for odd transfers */}
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <label htmlFor={`amt-${signupId}`} className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Amount received
                </label>
                {touchedAmount && total > 0 && Number(amountValue) !== total / 100 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTouchedAmount(false);
                      setAmount('');
                    }}
                    className="text-[11px] text-cyan-600 hover:underline"
                  >
                    reset to {peso(total)}
                  </button>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 focus-within:border-cyan-500">
                <span className="text-sm text-slate-400">₱</span>
                <input
                  id={`amt-${signupId}`}
                  inputMode="decimal"
                  value={amountValue}
                  onChange={(e) => {
                    setTouchedAmount(true);
                    setAmount(e.target.value.replace(/[^0-9.]/g, ''));
                  }}
                  className="w-full bg-transparent text-sm font-semibold tabular-nums text-slate-900 outline-none"
                />
              </div>
            </div>

            {/* Optional proof */}
            <div className="mt-3">
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[12px] text-slate-500 transition hover:border-cyan-400 hover:text-cyan-700"
              >
                {file ? `📎 ${file.name}` : '📎 Attach payment screenshot (optional)'}
              </button>
            </div>

            {state === 'error' && (
              <p className="mt-3 rounded-md bg-rose-50 px-2.5 py-1.5 text-[12px] text-rose-700">{err}</p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={state === 'saving' || state === 'done' || nothingPicked}
              className="mt-4 w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {state === 'saving'
                ? 'Confirming…'
                : state === 'done'
                  ? 'Paid ✓'
                  : nothingPicked
                    ? 'Pick a product'
                    : `Confirm ₱${Number(amountValue || 0).toLocaleString('en-PH')} paid`}
            </button>
            <p className="mt-2 text-center text-[10.5px] leading-snug text-slate-400">
              Sends their paid email + SMS and marks the order paid.
              {products.vault && ' Vault access + login are emailed too.'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

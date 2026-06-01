'use client';

import { useRef, useState } from 'react';

/**
 * "Mark paid" — opens a file picker, uploads a payment-proof screenshot to
 * the given endpoint, which confirms the abandoned cart as paid (fires the
 * full paid flow: email/SMS/Telegram + commissions). One tap → pick → done.
 */
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
  const [state, setState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [err, setErr] = useState('');

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('Confirm this customer PAID? This sends their paid email/SMS and marks the order paid.')) {
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setState('uploading');
    setErr('');
    const fd = new FormData();
    fd.append('signupId', signupId);
    fd.append('file', file);
    try {
      const r = await fetch(endpoint, { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) {
        setState('done');
        // Default to a full reload when no refresh callback is supplied (e.g.
        // when used from a server-rendered page that can't pass a function).
        setTimeout(() => (onDone ? onDone() : window.location.reload()), 700);
      } else {
        setErr(d.error || 'Failed');
        setState('error');
      }
    } catch {
      setErr('Network error');
      setState('error');
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={onFile} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={state === 'uploading' || state === 'done'}
        title={state === 'error' ? err : 'Upload payment screenshot to mark paid'}
        className={
          className ??
          `w-full rounded-md px-2 py-1.5 text-center text-xs font-semibold transition disabled:opacity-60 ${
            state === 'done'
              ? 'bg-emerald-600 text-white'
              : state === 'error'
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'bg-emerald-600 text-white hover:bg-emerald-500'
          }`
        }
      >
        {state === 'uploading'
          ? 'Uploading…'
          : state === 'done'
            ? 'Paid ✓'
            : state === 'error'
              ? 'Failed — retry'
              : '💵 Mark paid'}
      </button>
    </>
  );
}

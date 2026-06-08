'use client';

import { useState } from 'react';

/**
 * "Pay via Credit Card" — creates a dynamic Xendit invoice for the
 * reservation's amount due, then sends the buyer to Xendit's hosted page.
 */
export function RetreatCardButton({ reservationId }: { reservationId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function pay() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/retreat/pay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: reservationId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        redirectUrl?: string;
        error?: string;
      };
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
        className="btn-cyan inline-flex !px-7 !py-3 text-base disabled:opacity-60"
      >
        {loading ? 'Opening secure checkout…' : 'Pay via Credit Card →'}
      </button>
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    </div>
  );
}

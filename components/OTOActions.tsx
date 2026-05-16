'use client';

import { useState } from 'react';

export function OTOActions({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addBundle() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/oto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upgrade failed');
      window.location.href = data.redirectUrl;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="w-full sm:w-auto">
      <button onClick={addBundle} disabled={loading} className="btn-primary w-full !py-4 !px-8 text-base sm:w-auto">
        {loading ? 'Adding to my order…' : 'Yes — Add it to my order'}
      </button>
      {error && (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}

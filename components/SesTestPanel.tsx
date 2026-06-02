'use client';

import { useState } from 'react';

export function SesTestPanel() {
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);

  async function send() {
    setBusy(true);
    setMsg('');
    const r = await fetch('/api/admin/test-ses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to }),
    });
    const d = await r.json().catch(() => ({}));
    setOk(r.ok);
    setMsg(r.ok ? `Sent ✓ — check that inbox (id ${String(d.id).slice(0, 14)}…)` : d.error || 'Failed');
    setBusy(false);
  }

  return (
    <div className="mt-2 rounded-md border border-slate-100 bg-slate-50/40 p-3">
      <div className="text-xs font-medium text-slate-600">Test Amazon SES</div>
      <p className="mt-0.5 text-[11px] text-slate-400">
        Sends a real email through SES (ignores the provider toggle) so you can confirm it works here
        and lands in the inbox.
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          className="input"
          placeholder="you@email.com"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <button
          onClick={send}
          disabled={busy || !to}
          className="btn btn-secondary whitespace-nowrap text-xs disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send SES test'}
        </button>
      </div>
      {msg && (
        <div className={`mt-2 text-[11px] ${ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg}</div>
      )}
    </div>
  );
}

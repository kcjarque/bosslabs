'use client';

import { useState } from 'react';
import type { Closer } from '@/lib/closers';
import { createCloserAction, updateCloserAction } from '@/app/admin/closers/actions';

export function CloserManager({ closers }: { closers: Closer[] }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pct, setPct] = useState('20');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const res = await createCloserAction({
      name,
      username,
      email,
      password,
      commissionPercent: Number(pct) || 20,
    });
    setBusy(false);
    if (!res.ok) return setErr(res.error || 'Failed');
    setName(''); setUsername(''); setEmail(''); setPassword(''); setPct('20');
    location.reload();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="card grid gap-2 sm:grid-cols-6">
        <div className="sm:col-span-2">
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Benny" />
        </div>
        <div>
          <label className="label">Username</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="benny" autoCapitalize="none" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Email (optional)</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="benny@…" />
        </div>
        <div>
          <label className="label">Commission %</label>
          <input className="input" value={pct} onChange={(e) => setPct(e.target.value)} inputMode="numeric" />
        </div>
        <div className="sm:col-span-3">
          <label className="label">Password</label>
          <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="set a password" />
        </div>
        <div className="flex items-end sm:col-span-3">
          <button type="submit" disabled={busy} className="btn btn-primary">
            {busy ? 'Adding…' : 'Add closer'}
          </button>
        </div>
        {err && <div className="sm:col-span-6 text-sm text-red-600">{err}</div>}
      </form>

      <div className="space-y-2">
        {closers.length === 0 && (
          <div className="card text-sm text-slate-500">No closers yet. Add one above.</div>
        )}
        {closers.map((c) => (
          <CloserRow key={c.id} closer={c} />
        ))}
      </div>
    </div>
  );
}

function CloserRow({ closer }: { closer: Closer }) {
  const [pw, setPw] = useState('');
  const [pct, setPct] = useState(String(closer.commissionPercent));
  const [msg, setMsg] = useState('');

  async function resetPw() {
    if (!pw) return;
    const res = await updateCloserAction(closer.id, { password: pw });
    setMsg(res.ok ? 'Password updated ✓' : res.error || 'Failed');
    setPw('');
    setTimeout(() => setMsg(''), 2500);
  }
  async function savePct() {
    const res = await updateCloserAction(closer.id, { commissionPercent: Number(pct) || 0 });
    setMsg(res.ok ? 'Saved ✓' : res.error || 'Failed');
    setTimeout(() => setMsg(''), 2500);
  }
  async function toggleActive() {
    await updateCloserAction(closer.id, { active: !closer.active });
    location.reload();
  }

  return (
    <div className="card flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{closer.name}</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">@{closer.username}</span>
          {!closer.active && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-600">inactive</span>}
          {!closer.hasPassword && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">no password</span>}
        </div>
        <div className="text-xs text-slate-400">{closer.email || 'no email'}</div>
      </div>
      <div className="flex items-end gap-2">
        <div>
          <label className="label">Commission %</label>
          <input className="input w-20" value={pct} onChange={(e) => setPct(e.target.value)} inputMode="numeric" />
        </div>
        <button onClick={savePct} className="btn btn-secondary text-xs">Save</button>
      </div>
      <div className="flex items-end gap-2">
        <div>
          <label className="label">Reset password</label>
          <input className="input w-40" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="new password" />
        </div>
        <button onClick={resetPw} className="btn btn-secondary text-xs">Set</button>
        <button onClick={toggleActive} className="btn btn-ghost text-xs">
          {closer.active ? 'Deactivate' : 'Activate'}
        </button>
      </div>
      {msg && <span className="text-xs text-emerald-600">{msg}</span>}
    </div>
  );
}

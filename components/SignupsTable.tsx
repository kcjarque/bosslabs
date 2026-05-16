'use client';

import { useMemo, useState } from 'react';
import type { Signup, SignupSource } from '@/lib/db';

type Filter = 'all' | SignupSource;

export function SignupsTable({ initial }: { initial: Signup[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Signup | null>(null);

  const filtered = useMemo(() => {
    return initial.filter((s) => {
      if (filter !== 'all' && s.source !== filter) return false;
      if (!q) return true;
      const hay = `${s.firstName} ${s.lastName ?? ''} ${s.email} ${s.phone}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [initial, filter, q]);

  return (
    <>
      {/* Filters */}
      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex flex-wrap gap-1">
          {(['all', 'free', 'paid', 'contact'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                filter === f
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, email, phone…"
          className="input sm:max-w-xs sm:flex-1"
        />
      </div>

      {/* Mobile: stacked cards. Desktop: table. */}
      <div className="space-y-3 sm:hidden">
        {filtered.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setOpen(s)}
            className="card block w-full text-left transition hover:border-slate-300"
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">
                  {s.firstName} {s.lastName ?? ''}
                </div>
                <div className="truncate text-xs text-slate-500">{s.email}</div>
                <div className="text-xs text-slate-400">{s.phone}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <SourcePill source={s.source} />
                <span className="text-[10px] text-slate-400">
                  {formatRelative(s.createdAt)}
                </span>
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="card text-center text-sm text-slate-500">
            No signups match this filter.
          </div>
        )}
      </div>

      <div className="card hidden overflow-hidden p-0 sm:block">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Source</th>
                <th>Status</th>
                <th>When</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setOpen(s)}
                  className="cursor-pointer"
                >
                  <td className="font-medium text-slate-900">
                    {s.firstName} {s.lastName ?? ''}
                  </td>
                  <td>{s.email}</td>
                  <td className="text-slate-500">{s.phone}</td>
                  <td>
                    <SourcePill source={s.source} />
                  </td>
                  <td>
                    <StatusPill status={s.status} />
                  </td>
                  <td className="text-slate-500">{formatRelative(s.createdAt)}</td>
                  <td className="text-slate-400">→</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    No signups match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && <SignupDrawer signup={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function SourcePill({ source }: { source: Signup['source'] }) {
  const map: Record<Signup['source'], string> = {
    free: 'pill pill-cyan',
    paid: 'pill pill-green',
    contact: 'pill',
  };
  return <span className={map[source]}>{source}</span>;
}
function StatusPill({ status }: { status: Signup['status'] }) {
  const map: Record<Signup['status'], string> = {
    registered: 'pill pill-cyan',
    paid: 'pill pill-green',
    attended: 'pill pill-green',
    'no-show': 'pill pill-amber',
    refunded: 'pill pill-red',
    unsubscribed: 'pill pill-red',
  };
  return <span className={map[status] || 'pill'}>{status}</span>;
}

function SignupDrawer({ signup, onClose }: { signup: Signup; onClose: () => void }) {
  const [tab, setTab] = useState<'overview' | 'send'>('overview');
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-slate-900/30 backdrop-blur-sm sm:items-start">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute inset-0"
      />
      <div className="relative ml-auto h-[88vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:m-6 sm:h-auto sm:max-h-[90vh] sm:w-[440px] sm:rounded-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <div>
            <div className="font-semibold text-slate-900">
              {signup.firstName} {signup.lastName ?? ''}
            </div>
            <div className="text-xs text-slate-500">
              {signup.email} · {signup.phone}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            ×
          </button>
        </div>

        <div className="flex gap-1 border-b border-slate-100 px-5">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
            Overview
          </TabButton>
          <TabButton active={tab === 'send'} onClick={() => setTab('send')}>
            Send
          </TabButton>
        </div>

        <div className="p-5">
          {tab === 'overview' ? (
            <SignupOverview s={signup} />
          ) : (
            <SignupSend s={signup} onSent={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-3 text-sm font-medium ${
        active ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'
      }`}
    >
      {children}
    </button>
  );
}

function SignupOverview({ s }: { s: Signup }) {
  return (
    <dl className="space-y-3 text-sm">
      <Row label="Source" value={<SourcePill source={s.source} />} />
      <Row label="Status" value={<StatusPill status={s.status} />} />
      <Row label="Created" value={new Date(s.createdAt).toLocaleString()} />
      {s.amountCentavos != null && (
        <Row
          label="Paid"
          value={`₱${(s.amountCentavos / 100).toLocaleString()}${
            s.bumped ? ' (with bundle)' : ''
          }`}
        />
      )}
      {s.message && (
        <Row
          label="Message"
          value={<span className="whitespace-pre-wrap">{s.message}</span>}
        />
      )}
      <Row label="ID" value={<code className="text-xs">{s.id}</code>} />
    </dl>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3">
      <dt className="text-xs uppercase tracking-[0.06em] text-slate-500">{label}</dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  );
}

function SignupSend({ s, onSent }: { s: Signup; onSent: () => void }) {
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [templateId, setTemplateId] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setStatus('sending');
    setError(null);
    try {
      const res = await fetch('/api/admin/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, templateId, signupId: s.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Send failed');
      setStatus('sent');
      setTimeout(onSent, 800);
    } catch (err: unknown) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Send failed');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Channel</label>
        <div className="flex gap-1">
          {(['email', 'sms'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className={`flex-1 rounded-md px-3 py-2 text-sm capitalize transition ${
                channel === c
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Template ID</label>
        <input
          className="input"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          placeholder={channel === 'email' ? 'free_welcome' : 'reminder_24h'}
        />
        <p className="mt-1 text-xs text-slate-500">
          See available IDs on the {channel === 'email' ? 'Email' : 'SMS'} Templates page.
        </p>
      </div>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <button
        type="button"
        disabled={status === 'sending' || !templateId}
        onClick={send}
        className="btn btn-primary w-full"
      >
        {status === 'sending'
          ? 'Sending…'
          : status === 'sent'
            ? 'Sent ✓'
            : `Send ${channel} now`}
      </button>
    </div>
  );
}

function formatRelative(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

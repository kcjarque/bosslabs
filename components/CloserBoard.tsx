'use client';

import { useEffect, useState } from 'react';

type PoolLead = { signupId: string; name: string; amountDueCentavos: number; createdAt: string };
type Lead = {
  leadId: string;
  signupId: string;
  name: string;
  phone: string;
  amountCentavos: number;
  stage: string;
  claimedAt: string;
  closedAt: string | null;
  commissionCentavos: number | null;
};

const peso = (c: number) => `₱${(c / 100).toLocaleString()}`;

async function api(payload: Record<string, unknown>) {
  const r = await fetch('/api/closer/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

export function CloserBoard({ commissionPercent }: { commissionPercent: number }) {
  const [pool, setPool] = useState<PoolLead[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState<{ kind: 'pool' | 'lead'; id: string } | null>(null);
  const [over, setOver] = useState<'pool' | 'mine' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  async function load() {
    const r = await fetch('/api/closer/leads');
    const d = await r.json();
    setPool(d.pool ?? []);
    setLeads(d.leads ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function claim(signupId: string) {
    setBusy(signupId);
    const { status, body } = await api({ action: 'claim', signupId });
    if (status !== 200) setToast(body.error || 'Could not claim');
    await load();
    setBusy(null);
  }
  async function release(leadId: string) {
    setBusy(leadId);
    await api({ action: 'release', leadId });
    await load();
    setBusy(null);
  }

  if (loading) return <div className="card text-sm text-slate-500">Loading your board…</div>;

  const working = leads.filter((l) => l.stage !== 'closed');
  const closed = leads.filter((l) => l.stage === 'closed');
  const totalCommission = closed.reduce((s, l) => s + (l.commissionCentavos ?? 0), 0);

  return (
    <div className="space-y-4">
      {toast && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {toast}{' '}
          <button onClick={() => setToast('')} className="ml-1 underline">dismiss</button>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {/* Unassigned pool */}
        <Column
          title="Unassigned · abandoned carts"
          dot="bg-slate-400"
          count={pool.length}
          highlight={over === 'pool'}
          onDragOver={(e) => {
            e.preventDefault();
            setOver('pool');
          }}
          onDragLeave={() => setOver(null)}
          onDrop={() => {
            if (drag?.kind === 'lead') release(drag.id);
            setDrag(null);
            setOver(null);
          }}
        >
          {pool.map((p) => (
            <div
              key={p.signupId}
              draggable
              onDragStart={() => setDrag({ kind: 'pool', id: p.signupId })}
              onDragEnd={() => setDrag(null)}
              className="cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm"
            >
              <div className="text-sm font-medium text-slate-900">{p.name}</div>
              <div className="text-[11px] text-slate-400">🔒 Phone hidden — claim to reveal</div>
              <div className="mt-1 text-[11px] font-medium text-slate-600">Cart: {peso(p.amountDueCentavos)}</div>
              <button
                onClick={() => claim(p.signupId)}
                disabled={busy === p.signupId}
                className="mt-2 block w-full rounded-md bg-slate-800 px-2 py-1.5 text-center text-xs font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
              >
                {busy === p.signupId ? '…' : 'Claim →'}
              </button>
            </div>
          ))}
          {pool.length === 0 && <Empty>No unclaimed abandoned carts.</Empty>}
        </Column>

        {/* My leads */}
        <Column
          title="My leads · calling"
          dot="bg-cyan-500"
          count={working.length}
          highlight={over === 'mine'}
          onDragOver={(e) => {
            e.preventDefault();
            setOver('mine');
          }}
          onDragLeave={() => setOver(null)}
          onDrop={() => {
            if (drag?.kind === 'pool') claim(drag.id);
            setDrag(null);
            setOver(null);
          }}
        >
          {working.map((l) => (
            <div
              key={l.leadId}
              draggable
              onDragStart={() => setDrag({ kind: 'lead', id: l.leadId })}
              onDragEnd={() => setDrag(null)}
              className="cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{l.name}</div>
                  <div className="text-[11px] font-medium text-cyan-700">{l.phone || 'no number'}</div>
                </div>
                <button
                  onClick={() => release(l.leadId)}
                  disabled={busy === l.leadId}
                  title="Release back to pool"
                  className="text-slate-300 transition hover:text-rose-500"
                >
                  ×
                </button>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Cart: {peso(l.amountCentavos)}</div>
              {l.phone && (
                <div className="mt-2 flex gap-1.5">
                  <a href={`tel:${l.phone}`} className="flex-1 rounded-md bg-cyan-600 px-2 py-1.5 text-center text-xs font-medium text-white hover:bg-cyan-500">📞 Call</a>
                  <a href={`sms:${l.phone}`} className="flex-1 rounded-md border border-cyan-200 px-2 py-1.5 text-center text-xs font-medium text-cyan-700 hover:bg-cyan-50">💬 Text</a>
                </div>
              )}
            </div>
          ))}
          {working.length === 0 && <Empty>Claim a lead from the left to start calling.</Empty>}
        </Column>

        {/* Closed */}
        <Column title="Closed — Won" dot="bg-emerald-500" count={closed.length}>
          {closed.map((l) => (
            <div key={l.leadId} className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5 shadow-sm">
              <div className="text-sm font-medium text-slate-900">{l.name}</div>
              <div className="text-[11px] text-slate-500">Paid {peso(l.amountCentavos)}</div>
              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                +{peso(l.commissionCentavos ?? 0)} commission
              </div>
            </div>
          ))}
          {closed.length > 0 && (
            <div className="mt-1 rounded-md bg-emerald-600 px-2 py-1.5 text-center text-xs font-semibold text-white">
              Total: {peso(totalCommission)}
            </div>
          )}
          {closed.length === 0 && <Empty>Closed deals land here automatically when the customer pays.</Empty>}
        </Column>
      </div>

      <p className="text-center text-[11px] text-slate-400">
        You earn <strong>{commissionPercent}%</strong> of everything you close. Drag a card between
        columns, or use the buttons.
      </p>
    </div>
  );
}

function Column({
  title,
  dot,
  count,
  highlight,
  children,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  title: string;
  dot: string;
  count: number;
  highlight?: boolean;
  children: React.ReactNode;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex min-h-[140px] flex-col rounded-xl border transition ${
        highlight ? 'border-cyan-400 bg-cyan-50/40' : 'border-slate-200 bg-slate-50/40'
      }`}
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        <span className="ml-auto text-[11px] text-slate-400">{count}</span>
      </div>
      <div className="flex-1 space-y-2 p-2">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-1 py-3 text-center text-[11px] text-slate-300">{children}</div>;
}

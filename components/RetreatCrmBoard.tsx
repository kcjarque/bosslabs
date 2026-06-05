'use client';

import { useEffect, useState } from 'react';
import {
  RETREAT_CRM_STAGES,
  RETREAT_CRM_STAGE_META,
  type RetreatCrmStage,
  type RetreatCrmCard,
} from '@/lib/retreat-crm-stages';
import { toE164Ph } from '@/lib/phone';

async function api(payload: Record<string, unknown>) {
  const r = await fetch('/api/admin/retreat-crm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.json();
}

function smsHref(phone: string, template: string, name: string): string {
  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  const body = template.replace(/\{\{\s*name\s*\}\}/gi, first);
  return `sms:${toE164Ph(phone)}?&body=${encodeURIComponent(body)}`;
}

type Candidate = { id: string; name: string; email: string; phone: string };

export function RetreatCrmBoard() {
  const [cards, setCards] = useState<RetreatCrmCard[]>([]);
  const [customers, setCustomers] = useState<Candidate[]>([]);
  const [template, setTemplate] = useState('');
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<RetreatCrmStage | null>(null);
  const [pickQuery, setPickQuery] = useState('');
  const [savedTpl, setSavedTpl] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  async function load() {
    const r = await fetch('/api/admin/retreat-crm');
    const d = await r.json();
    setCards(d.cards ?? []);
    setTemplate(d.template ?? '');
    setCustomers(d.customers ?? []);
  }
  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, []);

  async function promote(c: Candidate) {
    const res = await api({
      action: 'add',
      card: { name: c.name.trim(), email: c.email.trim(), phone: c.phone.trim() },
    });
    if (res.card) setCards((cs) => [...cs, res.card]);
    setPickQuery('');
  }

  function moveCard(id: string, stage: RetreatCrmStage) {
    const card = cards.find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stage } : c)));
    void api({ action: 'update', id, patch: { stage } });
  }

  async function removeCard(id: string) {
    setCards((cs) => cs.filter((c) => c.id !== id));
    void api({ action: 'delete', id });
  }

  async function saveNote(card: RetreatCrmCard, note: string) {
    setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, note } : c)));
    await api({ action: 'update', id: card.id, patch: { note } });
  }

  async function saveTemplate() {
    await api({ action: 'template', template });
    setSavedTpl(true);
    setTimeout(() => setSavedTpl(false), 1600);
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await load(); // GET syncs new reservations + auto-advances paid
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) return <div className="card text-sm text-slate-500">Loading board…</div>;

  const q = query.trim().toLowerCase();
  const visible = q
    ? cards.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q),
      )
    : cards;

  // Already-on-board lookup so a customer can't be added twice (match on email
  // or normalized phone — the same person across two reservations/contacts).
  const onBoardEmails = new Set(
    cards.map((c) => c.email.trim().toLowerCase()).filter(Boolean),
  );
  const onBoardPhones = new Set(
    cards.map((c) => (c.phone ? toE164Ph(c.phone) : '')).filter(Boolean),
  );
  const isOnBoard = (c: Candidate) =>
    (!!c.email && onBoardEmails.has(c.email.trim().toLowerCase())) ||
    (!!c.phone && onBoardPhones.has(toE164Ph(c.phone)));

  const pq = pickQuery.trim().toLowerCase();
  const matches = pq
    ? customers
        .filter(
          (c) =>
            c.name.toLowerCase().includes(pq) ||
            c.email.toLowerCase().includes(pq) ||
            c.phone.toLowerCase().includes(pq),
        )
        .slice(0, 12)
    : [];

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div>
          <label className="label">Message template</label>
          <p className="mb-1.5 text-[11px] text-slate-500">
            Tapping <strong>Text</strong> on a card opens your phone&rsquo;s Messages app with this,
            and <code className="rounded bg-slate-100 px-1">{'{{name}}'}</code> swapped for their first name.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <textarea
              className="input min-h-[60px] flex-1 text-sm"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
            <button onClick={saveTemplate} className="btn btn-primary self-start text-xs">
              {savedTpl ? 'Saved ✓' : 'Save template'}
            </button>
          </div>
        </div>
        <div className="border-t border-slate-100 pt-3">
          <label className="label">Promote someone interested</label>
          <p className="mb-1.5 text-[11px] text-slate-500">
            Search your existing customers and add them straight to <strong>Interested</strong>.
          </p>
          <div className="relative">
            <input
              className="input"
              placeholder="Search customers by name, email, or number…"
              value={pickQuery}
              onChange={(e) => setPickQuery(e.target.value)}
            />
            {pickQuery && (
              <button
                onClick={() => setPickQuery('')}
                aria-label="Clear"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            )}
            {pq && (
              <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {matches.length === 0 ? (
                  <div className="px-3 py-2.5 text-xs text-slate-400">
                    No matching customers. They&rsquo;ll appear here once they exist in Customers.
                  </div>
                ) : (
                  matches.map((m) => {
                    const already = isOnBoard(m);
                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm text-slate-800">{m.name}</div>
                          <div className="truncate text-[11px] text-slate-400">
                            {m.email}
                            {m.phone ? ` · ${toE164Ph(m.phone)}` : ''}
                          </div>
                        </div>
                        {already ? (
                          <span className="whitespace-nowrap text-[11px] text-slate-400">On board ✓</span>
                        ) : (
                          <button
                            onClick={() => promote(m)}
                            className="btn btn-secondary whitespace-nowrap text-xs"
                          >
                            Add
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search + Refresh */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="input"
            style={{ paddingLeft: '2.25rem' }}
            placeholder="Search name, email, number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">×</button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {q && <span className="text-xs text-slate-500">{visible.length} match{visible.length === 1 ? '' : 'es'}</span>}
          <button onClick={refresh} disabled={refreshing} className="btn btn-secondary whitespace-nowrap text-xs">
            {refreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="grid gap-3 md:grid-cols-5">
        {RETREAT_CRM_STAGES.map((stage) => {
          const meta = RETREAT_CRM_STAGE_META[stage];
          const col = visible.filter((c) => c.stage === stage);
          const isOver = dragOver === stage;
          return (
            <div
              key={stage}
              onDragOver={(e) => { e.preventDefault(); setDragOver(stage); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => { if (dragId) moveCard(dragId, stage); setDragId(null); setDragOver(null); }}
              className={`flex min-h-[120px] flex-col rounded-xl border transition ${
                isOver ? 'border-cyan-400 bg-cyan-50/40' : 'border-slate-200 bg-slate-50/40'
              }`}
            >
              <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
                <span className={`h-2 w-2 rounded-full ${meta.bar}`} />
                <span className="text-xs font-semibold text-slate-700">{meta.label}</span>
                <span className="ml-auto text-[11px] text-slate-400">{col.length}</span>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {col.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => setDragId(null)}
                    className={`cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm ${dragId === c.id ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">{c.name}</div>
                        {c.email && <div className="truncate text-[11px] text-slate-400">{c.email}</div>}
                        {c.phone && <div className="text-[11px] text-slate-400">{toE164Ph(c.phone)}</div>}
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              c.paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {c.paid ? '✓ Paid' : 'Interested · unpaid'}
                          </span>
                          {c.amountCentavos != null && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                              ₱{(c.amountCentavos / 100).toLocaleString()}
                            </span>
                          )}
                          {c.method && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{c.method}</span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => removeCard(c.id)} aria-label="Remove" className="text-slate-300 transition hover:text-rose-500">×</button>
                    </div>

                    <CardNote card={c} onSave={(text) => saveNote(c, text)} />

                    {c.phone ? (
                      <a href={smsHref(c.phone, template, c.name)} className="mt-2 block rounded-md bg-cyan-600 px-2 py-1.5 text-center text-xs font-medium text-white transition hover:bg-cyan-500">
                        💬 Text
                      </a>
                    ) : (
                      <span className="mt-2 block rounded-md bg-slate-100 px-2 py-1.5 text-center text-xs text-slate-400">No phone</span>
                    )}
                    {c.reservationId && (
                      <a href={`/vibecode-retreat/reserve/${c.reservationId}`} target="_blank" rel="noopener noreferrer" className="mt-1.5 block text-center text-[11px] text-slate-400 transition hover:text-cyan-600">
                        Open reservation ↗
                      </a>
                    )}
                  </div>
                ))}
                {col.length === 0 && <div className="px-1 py-3 text-center text-[11px] text-slate-300">Drop here</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardNote({ card, onSave }: { card: RetreatCrmCard; onSave: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.note);
  useEffect(() => {
    if (!editing) setDraft(card.note);
  }, [card.note, editing]);

  if (editing) {
    return (
      <div className="mt-2" onPointerDown={(e) => e.stopPropagation()}>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note…"
          className="input min-h-[52px] w-full text-xs"
          draggable={false}
        />
        <div className="mt-1 flex gap-1.5">
          <button onClick={() => { onSave(draft.trim()); setEditing(false); }} className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-700">Save</button>
          <button onClick={() => { setDraft(card.note); setEditing(false); }} className="rounded-md px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <button onClick={() => setEditing(true)} className="mt-2 block w-full rounded-md border border-dashed border-slate-200 px-2 py-1 text-left text-[11px] transition hover:border-amber-300 hover:bg-amber-50/40">
      {card.note ? <span className="text-slate-600">📝 {card.note}</span> : <span className="text-slate-400">📝 Add note…</span>}
    </button>
  );
}

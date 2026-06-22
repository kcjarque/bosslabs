'use client';

import { useEffect, useState } from 'react';
import { DFY_STAGES, DFY_STAGE_META, type DfyStage, type DfyCard } from '@/lib/dfy-stages';
import { toE164Ph } from '@/lib/phone';
import { BoardSkeleton } from '@/components/admin/BoardSkeleton';
import { PipelineFunnel } from '@/components/admin/PipelineFunnel';

const DEFAULT_TPL = "Hi {{name}}! Following up on your DFY project — do you have a few minutes today? 😊";

async function api(payload: Record<string, unknown>) {
  const r = await fetch('/api/admin/dfy-crm', {
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

export function DfyBoard() {
  const [cards, setCards] = useState<DfyCard[]>([]);
  const [customers, setCustomers] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<DfyStage | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [query, setQuery] = useState('');
  const [pickQuery, setPickQuery] = useState('');

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/admin/dfy-crm');
      const d = await r.json();
      setCards(d.cards ?? []);
      setCustomers(d.customers ?? []);
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

  async function addCard(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const amt = amount.trim() ? Math.round(parseFloat(amount) * 100) : null;
    const res = await api({
      action: 'add',
      card: { name: name.trim(), phone: phone.trim(), amountCentavos: Number.isFinite(amt as number) ? amt : null },
    });
    if (res.card) setCards((c) => [...c, res.card]);
    setName('');
    setPhone('');
    setAmount('');
  }

  function moveCard(id: string, stage: DfyStage) {
    const card = cards.find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stage } : c)));
    void api({ action: 'update', id, patch: { stage } });
  }

  async function removeCard(id: string) {
    setCards((cs) => cs.filter((c) => c.id !== id));
    void api({ action: 'delete', id });
  }

  function saveNote(card: DfyCard, note: string) {
    setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, note } : c)));
    void api({ action: 'update', id: card.id, patch: { note } });
  }

  async function refresh() {
    const r = await fetch('/api/admin/dfy-crm');
    const d = await r.json();
    setCards(d.cards ?? []);
  }

  // Deal/payment actions — reload after each so collected/paid recompute.
  async function setPrice(card: DfyCard, centavos: number) {
    await api({ action: 'deal-amount', id: card.id, centavos });
    await refresh();
  }
  async function logPayment(card: DfyCard, centavos: number) {
    await api({ action: 'log-payment', id: card.id, centavos });
    await refresh();
  }
  async function markPaidFull(card: DfyCard) {
    await api({ action: 'mark-paid-full', id: card.id });
    await refresh();
  }

  if (loading) return <BoardSkeleton />;

  const q = query.trim().toLowerCase();
  const visible = q
    ? cards.filter((c) => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q))
    : cards;

  // Dedup so a customer can't be added twice (match on email or normalized phone).
  const onBoardEmails = new Set(cards.map((c) => c.email.trim().toLowerCase()).filter(Boolean));
  const onBoardPhones = new Set(cards.map((c) => (c.phone ? toE164Ph(c.phone) : '')).filter(Boolean));
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

  // Lost leads are dead pipeline — keep them off the funnel + the pipeline value.
  const funnelRows = DFY_STAGES.filter((s) => s !== 'lost').map((s) => {
    const inStage = cards.filter((c) => c.stage === s);
    return {
      label: DFY_STAGE_META[s].label,
      bar: DFY_STAGE_META[s].bar,
      count: inStage.length,
      dealCentavos: inStage.reduce((sum, c) => sum + (c.amountCentavos || 0), 0),
    };
  });
  const pipelineTotalCentavos = cards
    .filter((c) => c.stage !== 'lost')
    .reduce((sum, c) => sum + (c.amountCentavos || 0), 0);

  return (
    <div className="space-y-4">
      {/* Add a prospect / existing customer (left) + pipeline funnel (right) */}
      <div className="card space-y-3">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
        <form onSubmit={addCard} className="flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <label className="label">Add a new prospect</label>
            <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <input
            className="input sm:w-40"
            placeholder="09xx… (for SMS)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <input
            className="input sm:w-32"
            inputMode="decimal"
            placeholder="Deal ₱ (opt.)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary">
            Add card
          </button>
        </form>

        {/* Or pull in an existing customer (from signups) */}
        <div className="border-t border-slate-100 pt-3">
          <label className="label">Or add an existing customer</label>
          <p className="mb-1.5 text-[11px] text-slate-500">
            Search your customers and add them straight to <strong>Discovery Call</strong>.
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
                    No matching customers. They&rsquo;ll appear once they exist in Customers.
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
                          <button onClick={() => promote(m)} className="btn btn-secondary whitespace-nowrap text-xs">
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
          <div className="lg:border-l lg:border-slate-100 lg:pl-5">
            <PipelineFunnel rows={funnelRows} totalCentavos={pipelineTotalCentavos} />
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className="input"
          style={{ paddingLeft: '2.25rem' }}
          placeholder="Search name or number…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            ×
          </button>
        )}
      </div>

      {/* Board */}
      <div className="grid gap-3 md:grid-cols-6">
        {DFY_STAGES.map((stage) => {
          const meta = DFY_STAGE_META[stage];
          const col = visible.filter((c) => c.stage === stage);
          const isOver = dragOver === stage;
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(stage);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => {
                if (dragId) moveCard(dragId, stage);
                setDragId(null);
                setDragOver(null);
              }}
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
                    className={`cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm ${
                      dragId === c.id ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">{c.name}</div>
                        {c.phone && <div className="text-[11px] text-slate-400">{toE164Ph(c.phone)}</div>}
                      </div>
                      <button
                        onClick={() => removeCard(c.id)}
                        aria-label="Remove"
                        className="text-slate-300 transition hover:text-rose-500"
                      >
                        ×
                      </button>
                    </div>
                    <CardNote card={c} onSave={(text) => saveNote(c, text)} />
                    <DfyDeal
                      card={c}
                      onSetPrice={(v) => setPrice(c, v)}
                      onLogPayment={(v) => logPayment(c, v)}
                      onMarkPaid={() => markPaidFull(c)}
                    />
                    {c.phone ? (
                      <a
                        href={smsHref(c.phone, DEFAULT_TPL, c.name)}
                        className="mt-2 block rounded-md bg-cyan-600 px-2 py-1.5 text-center text-xs font-medium text-white transition hover:bg-cyan-500"
                      >
                        💬 Text
                      </a>
                    ) : (
                      <span className="mt-2 block rounded-md bg-slate-100 px-2 py-1.5 text-center text-xs text-slate-400">
                        No phone
                      </span>
                    )}
                  </div>
                ))}
                {col.length === 0 && (
                  <div className="px-1 py-3 text-center text-[11px] text-slate-300">Drop here</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button onClick={refresh} className="btn btn-secondary text-xs">
          ↻ Refresh
        </button>
      </div>
    </div>
  );
}

/** Inline note editor on a card (stored on the card itself). */
/** Contract-price + payment tracker on a DFY card. Set a contract price, then
 *  Mark paid (full) / Partial. Payments feed "DFY income" on the dashboard. */
function DfyDeal({
  card,
  onSetPrice,
  onLogPayment,
  onMarkPaid,
}: {
  card: DfyCard;
  onSetPrice: (centavos: number) => void;
  onLogPayment: (centavos: number) => void;
  onMarkPaid: () => void;
}) {
  const [editPrice, setEditPrice] = useState(false);
  const [priceDraft, setPriceDraft] = useState(card.amountCentavos ? String(card.amountCentavos / 100) : '');
  const [openPay, setOpenPay] = useState(false);
  const [payAmt, setPayAmt] = useState('');

  const deal = card.amountCentavos ?? 0;
  const collected = card.collectedCentavos;
  const remaining = Math.max(0, deal - collected);
  const peso = (c: number) => '₱' + (c / 100).toLocaleString();

  if (deal <= 0 && !editPrice) {
    return (
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          setPriceDraft('');
          setEditPrice(true);
        }}
        className="mt-2 block w-full rounded-md border border-dashed border-violet-200 px-2 py-1.5 text-center text-[11px] text-violet-600 transition hover:bg-violet-50/50"
      >
        + Set contract price
      </button>
    );
  }
  if (editPrice) {
    return (
      <div className="mt-2 flex gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
        <input
          className="input h-8 flex-1 text-[12px]"
          inputMode="decimal"
          autoFocus
          placeholder="Contract ₱"
          value={priceDraft}
          onChange={(e) => setPriceDraft(e.target.value)}
        />
        <button
          onClick={() => {
            const v = Math.round(parseFloat(priceDraft || '0') * 100);
            if (v > 0) onSetPrice(v);
            setEditPrice(false);
          }}
          className="rounded-md bg-violet-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-violet-500"
        >
          Save
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-violet-100 bg-violet-50/40 p-2" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-500">Contract</span>
        <button
          onClick={() => {
            setPriceDraft(String(deal / 100));
            setEditPrice(true);
          }}
          className="font-semibold text-slate-700 hover:text-violet-700"
        >
          {peso(deal)} ✎
        </button>
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[11px]">
        <span className="text-slate-500">Collected</span>
        <span className={card.paidInFull ? 'font-semibold text-emerald-700' : 'text-slate-700'}>
          {peso(collected)}
          {card.paidInFull ? ' · paid ✓' : remaining > 0 ? ` · ${peso(remaining)} left` : ''}
        </span>
      </div>
      {!card.paidInFull && (
        <div className="mt-1.5 flex gap-1.5">
          <button
            onClick={onMarkPaid}
            className="flex-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-500"
          >
            Mark paid
          </button>
          <button
            onClick={() => setOpenPay((v) => !v)}
            className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
          >
            Partial
          </button>
        </div>
      )}
      {openPay && !card.paidInFull && (
        <div className="mt-1.5 flex gap-1.5">
          <input
            className="input h-7 flex-1 text-[11px]"
            inputMode="decimal"
            placeholder="₱ received"
            value={payAmt}
            onChange={(e) => setPayAmt(e.target.value)}
          />
          <button
            onClick={() => {
              const v = Math.round(parseFloat(payAmt || '0') * 100);
              if (v > 0) onLogPayment(v);
              setPayAmt('');
              setOpenPay(false);
            }}
            className="rounded-md bg-violet-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-violet-500"
          >
            Log
          </button>
        </div>
      )}
      {card.payments.length > 0 && (
        <div className="mt-1 text-[10px] text-slate-400">
          {card.payments.length} payment{card.payments.length > 1 ? 's' : ''} · last{' '}
          {new Date(card.payments[card.payments.length - 1].at).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

function CardNote({ card, onSave }: { card: DfyCard; onSave: (text: string) => void }) {
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
          <button
            onClick={() => {
              onSave(draft.trim());
              setEditing(false);
            }}
            className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-700"
          >
            Save
          </button>
          <button
            onClick={() => {
              setDraft(card.note);
              setEditing(false);
            }}
            className="rounded-md px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="mt-2 block w-full rounded-md border border-dashed border-slate-200 px-2 py-1 text-left text-[11px] transition hover:border-amber-300 hover:bg-amber-50/40"
    >
      {card.note ? (
        <span className="text-slate-600">📝 {card.note}</span>
      ) : (
        <span className="text-slate-400">📝 Add note…</span>
      )}
    </button>
  );
}

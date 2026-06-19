'use client';

import { useEffect, useState } from 'react';
import { toE164Ph } from '@/lib/phone';
import { BoardSkeleton } from '@/components/admin/BoardSkeleton';
import { VIP_TAG_SUGGESTIONS, type VipCard } from '@/lib/vip-crm-types';

async function api(payload: Record<string, unknown>) {
  const r = await fetch('/api/admin/vip-crm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.json();
}

type Candidate = { id: string; name: string; email: string; phone: string };

export function VipBoard() {
  const [cards, setCards] = useState<VipCard[]>([]);
  const [customers, setCustomers] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');

  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [pickQuery, setPickQuery] = useState('');

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/admin/vip-crm');
      const d = await r.json();
      setCards(d.cards ?? []);
      setCustomers(d.customers ?? []);
      setLoading(false);
    })();
  }, []);

  async function addCard(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await api({
      action: 'add',
      card: {
        name: name.trim(),
        tag: tag.trim(),
        phone: phone.trim(),
        email: email.trim(),
        note: note.trim(),
      },
    });
    if (res.card) setCards((c) => [res.card, ...c]);
    setName('');
    setTag('');
    setPhone('');
    setEmail('');
    setNote('');
  }

  async function promote(c: Candidate) {
    const res = await api({
      action: 'add',
      card: { name: c.name.trim(), email: c.email.trim(), phone: c.phone.trim() },
    });
    if (res.card) setCards((cs) => [res.card, ...cs]);
    setPickQuery('');
  }

  function saveCard(id: string, patch: Partial<VipCard>) {
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    void api({ action: 'update', id, patch });
  }

  function removeCard(c: VipCard) {
    if (!confirm(`Remove ${c.name} from the VIP list?`)) return;
    setCards((cs) => cs.filter((x) => x.id !== c.id));
    void api({ action: 'delete', id: c.id });
  }

  if (loading) return <BoardSkeleton />;

  const tags = Array.from(new Set(cards.map((c) => c.tag.trim()).filter(Boolean))).sort();
  const q = query.trim().toLowerCase();
  const visible = cards.filter((c) => {
    if (tagFilter && c.tag.trim() !== tagFilter) return false;
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.tag.toLowerCase().includes(q) ||
      c.note.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q)
    );
  });

  // Dedup the "add existing customer" picker against who's already on the list.
  const onListEmails = new Set(cards.map((c) => c.email.trim().toLowerCase()).filter(Boolean));
  const onListPhones = new Set(cards.map((c) => (c.phone ? toE164Ph(c.phone) : '')).filter(Boolean));
  const isOnList = (c: Candidate) =>
    (!!c.email && onListEmails.has(c.email.trim().toLowerCase())) ||
    (!!c.phone && onListPhones.has(toE164Ph(c.phone)));
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
      {/* Add a VIP (manually or from an existing customer) */}
      <div className="card space-y-3">
        <form onSubmit={addCard} className="space-y-2">
          <label className="label">Add a VIP to track</label>
          <div className="flex flex-wrap items-end gap-2">
            <input
              className="input flex-1"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="input sm:w-44"
              list="vip-tags"
              placeholder="Tag (e.g. Future project)"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
            <datalist id="vip-tags">
              {VIP_TAG_SUGGESTIONS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <input
              className="input sm:w-40"
              placeholder="09xx… (opt.)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input
              className="input sm:w-52"
              type="email"
              placeholder="Email (opt.)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <input
              className="input flex-1"
              placeholder="Why are we tracking them? (note)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button type="submit" className="btn btn-secondary">
              Add VIP
            </button>
          </div>
        </form>

        {/* Or pull in an existing customer (from signups) */}
        <div className="border-t border-slate-100 pt-3">
          <label className="label">Or add an existing customer</label>
          <div className="relative mt-1">
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
                  <div className="px-3 py-2.5 text-xs text-slate-400">No matching customers.</div>
                ) : (
                  matches.map((m) => {
                    const already = isOnList(m);
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
                          <span className="whitespace-nowrap text-[11px] text-slate-400">On list ✓</span>
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

      {/* Search + tag filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
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
            placeholder="Search name, tag, note…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="text-xs text-slate-400">
          {visible.length} of {cards.length}
        </span>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label="All" active={!tagFilter} onClick={() => setTagFilter('')} />
          {tags.map((t) => (
            <FilterChip key={t} label={t} active={tagFilter === t} onClick={() => setTagFilter(t)} />
          ))}
        </div>
      )}

      {/* The list */}
      {visible.length === 0 ? (
        <div className="card text-center text-sm text-slate-400">
          {cards.length === 0
            ? 'No VIPs yet. Add someone above to start your watchlist for future projects.'
            : 'No VIPs match your search.'}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((c) => (
            <VipCardItem key={c.id} card={c} onSave={(patch) => saveCard(c.id, patch)} onRemove={() => removeCard(c)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

function VipCardItem({
  card,
  onSave,
  onRemove,
}: {
  card: VipCard;
  onSave: (patch: Partial<VipCard>) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(card.name);
  const [tag, setTag] = useState(card.tag);
  const [phone, setPhone] = useState(card.phone);
  const [email, setEmail] = useState(card.email);
  const [note, setNote] = useState(card.note);

  function startEdit() {
    setName(card.name);
    setTag(card.tag);
    setPhone(card.phone);
    setEmail(card.email);
    setNote(card.note);
    setEditing(true);
  }
  function save() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), tag: tag.trim(), phone: phone.trim(), email: email.trim(), note });
    setEditing(false);
  }

  const tel = card.phone ? toE164Ph(card.phone) : '';

  if (editing) {
    return (
      <div className="rounded-xl border border-cyan-300 bg-white p-3 shadow-sm">
        <input className="input mb-2" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          className="input mb-2"
          list="vip-tags"
          placeholder="Tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
        <input className="input mb-2" placeholder="09xx…" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input
          className="input mb-2"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <textarea
          className="input mb-2 min-h-[60px] text-sm"
          placeholder="Note — why we're tracking them…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex gap-1.5">
          <button onClick={save} className="btn btn-secondary text-xs">
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded-md px-2 py-1 text-xs text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{card.name}</div>
          {card.tag && (
            <span className="mt-1 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
              {card.tag}
            </span>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button onClick={startEdit} aria-label="Edit" className="text-slate-300 transition hover:text-cyan-600">
            ✎
          </button>
          <button onClick={onRemove} aria-label="Remove" className="text-slate-300 transition hover:text-rose-500">
            ×
          </button>
        </div>
      </div>

      {card.note && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{card.note}</p>}

      {(card.phone || card.email) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {card.phone && (
            <a
              href={`tel:${tel}`}
              className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 transition hover:bg-slate-50"
            >
              📞 Call
            </a>
          )}
          {card.phone && (
            <a
              href={`sms:${tel}`}
              className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 transition hover:bg-slate-50"
            >
              💬 Text
            </a>
          )}
          {card.email && (
            <a
              href={`mailto:${card.email}`}
              className="truncate rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 transition hover:bg-slate-50"
            >
              ✉️ Email
            </a>
          )}
        </div>
      )}

      <div className="mt-2 text-[10px] text-slate-300">
        Added {new Date(card.createdAt).toLocaleDateString()}
      </div>
    </div>
  );
}

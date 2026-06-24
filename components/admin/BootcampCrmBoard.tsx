'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  BOOTCAMP_STAGES,
  BOOTCAMP_STAGE_META,
  type BootcampCard,
  type BootcampStage,
} from '@/lib/bootcamp-stages';

function fmtPHP(centavos: number | null | undefined) {
  if (centavos == null) return '—';
  return `₱${(centavos / 100).toLocaleString('en-PH')}`;
}

export function BootcampCrmBoard({ initialCards }: { initialCards: BootcampCard[] }) {
  const router = useRouter();
  const [cards, setCards] = useState<BootcampCard[]>(initialCards);
  const [pending, start] = useTransition();
  const [dragOver, setDragOver] = useState<BootcampStage | null>(null);

  const byStage = useMemo(() => {
    const m: Record<string, BootcampCard[]> = {};
    for (const s of BOOTCAMP_STAGES) m[s] = [];
    for (const c of cards) (m[c.stage] ??= []).push(c);
    return m;
  }, [cards]);

  async function api(body: Record<string, unknown>): Promise<{ ok?: boolean; error?: string }> {
    const r = await fetch('/api/admin/bootcamp-crm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  function moveCard(card: BootcampCard, target: BootcampStage) {
    if (card.stage === target) return;
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, stage: target } : c)));
    start(async () => {
      const r = await api({ action: 'update', id: card.id, stage: target });
      if (!r.ok) router.refresh();
    });
  }

  function changePeople(card: BootcampCard, delta: number) {
    const next = Math.max(1, Math.min(5, (card.people ?? 1) + delta));
    if (next === card.people) return;
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, people: next } : c)));
    start(async () => {
      await api({ action: 'update', id: card.id, people: next });
    });
  }

  async function deleteCard(card: BootcampCard) {
    if (!confirm(`Delete ${card.name}'s card${card.reservationId ? ' (this also deletes the reservation)' : ''}?`)) return;
    setCards((prev) => prev.filter((c) => c.id !== card.id));
    start(async () => {
      await api({ action: 'delete', id: card.id });
      router.refresh();
    });
  }

  async function addManualCard() {
    const name = prompt('Name?');
    if (!name) return;
    start(async () => {
      const r = await api({ action: 'add', name });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div>
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Pipeline</h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500">Drag cards across stages · click a card for actions</p>
        </div>
        <button
          type="button"
          onClick={addManualCard}
          className="rounded-full border border-slate-300 px-4 py-1.5 text-[13px] font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white"
        >
          + Add manually
        </button>
      </header>

      <div className="grid gap-3 md:grid-cols-5">
        {BOOTCAMP_STAGES.map((stage) => {
          const meta = BOOTCAMP_STAGE_META[stage];
          const col = byStage[stage] ?? [];
          const isOver = dragOver === stage;
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(stage);
              }}
              onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const cardId = e.dataTransfer.getData('text/plain');
                const card = cards.find((c) => c.id === cardId);
                if (card) moveCard(card, stage);
              }}
              className={`rounded-2xl border ${isOver ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 ' + meta.tint} p-3 transition`}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-800">
                  <span className={`h-2 w-2 rounded-full ${meta.bar}`} />
                  {meta.label}
                </div>
                <div className="text-[11px] text-slate-500 tabular-nums">
                  {col.length} · 👥 {col.reduce((s, c) => s + (c.people ?? 1), 0)}
                </div>
              </div>
              <div className="space-y-2 min-h-[60px]">
                {col.length === 0 && <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-[12px] text-slate-400">Drop here</div>}
                {col.map((card) => (
                  <CardTile
                    key={card.id}
                    card={card}
                    onPeople={(delta) => changePeople(card, delta)}
                    onDelete={() => deleteCard(card)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {pending && <div className="mt-2 text-right text-[11px] text-slate-400">Saving…</div>}
    </div>
  );
}

function CardTile({
  card,
  onPeople,
  onDelete,
}: {
  card: BootcampCard;
  onPeople: (delta: number) => void;
  onDelete: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', card.id)}
      className="cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-cyan-300 hover:shadow active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold text-slate-900">{card.name || '(unnamed)'}</div>
          {card.company && <div className="truncate text-[12px] text-slate-500">{card.company}</div>}
        </div>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete card"
          className="rounded p-0.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-500"
        >
          ✕
        </button>
      </div>
      <div className="mt-1 truncate text-[11.5px] text-slate-500">{card.email || card.phone || '—'}</div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        {card.tier && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{card.tier.replace('_', ' ')}</span>
        )}
        {card.totalCentavos != null && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">{fmtPHP(card.totalCentavos)}</span>
        )}
        {card.amountDueCentavos != null && (
          <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-cyan-700">DP {fmtPHP(card.amountDueCentavos)}</span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
        <div className="flex items-center gap-1 text-slate-500">
          <button onClick={() => onPeople(-1)} aria-label="Fewer people" className="rounded px-1.5 leading-none hover:bg-slate-100">−</button>
          <span>👥 {card.people ?? 1}</span>
          <button onClick={() => onPeople(1)} aria-label="More people" className="rounded px-1.5 leading-none hover:bg-slate-100">+</button>
        </div>
        {card.paid && <span className="font-semibold text-emerald-600">PAID</span>}
        {!card.paid && card.status === 'proof_submitted' && <span className="text-amber-600">Proof in</span>}
      </div>
    </div>
  );
}

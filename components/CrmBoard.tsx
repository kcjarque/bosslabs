'use client';

import { useEffect, useState } from 'react';
import { CRM_STAGES, CRM_STAGE_META, type CrmStage, type CrmCard } from '@/lib/crm-stages';

async function api(payload: Record<string, unknown>) {
  const r = await fetch('/api/admin/crm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.json();
}

/** Build the sms: link that opens the phone's Messages app with the template
 *  + the person's first name filled in. */
function smsHref(phone: string, template: string, name: string): string {
  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  const body = template.replace(/\{\{\s*name\s*\}\}/gi, first);
  return `sms:${phone}?&body=${encodeURIComponent(body)}`;
}

export function CrmBoard() {
  const [cards, setCards] = useState<CrmCard[]>([]);
  const [template, setTemplate] = useState('');
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<CrmStage | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [savedTpl, setSavedTpl] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/admin/crm');
      const d = await r.json();
      setCards(d.cards ?? []);
      setTemplate(d.template ?? '');
      setLoading(false);
    })();
  }, []);

  async function addCard(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await api({ action: 'add', card: { name: name.trim(), phone: phone.trim() } });
    if (res.card) setCards((c) => [...c, res.card]);
    setName('');
    setPhone('');
  }

  function moveCard(id: string, stage: CrmStage) {
    const card = cards.find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stage } : c)));
    void api({ action: 'update', id, patch: { stage } });
  }

  async function removeCard(id: string) {
    setCards((cs) => cs.filter((c) => c.id !== id));
    void api({ action: 'delete', id });
  }

  async function saveTemplate() {
    await api({ action: 'template', template });
    setSavedTpl(true);
    setTimeout(() => setSavedTpl(false), 1600);
  }

  async function importCustomers() {
    setImporting(true);
    const res = await api({ action: 'import' });
    if (typeof res.added === 'number') {
      const r = await fetch('/api/admin/crm');
      const d = await r.json();
      setCards(d.cards ?? []);
    }
    setImporting(false);
  }

  if (loading) return <div className="card text-sm text-slate-500">Loading board…</div>;

  return (
    <div className="space-y-4">
      {/* SMS template + add + import */}
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
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-end sm:justify-between">
          <form onSubmit={addCard} className="flex flex-1 flex-wrap items-end gap-2">
            <div className="flex-1">
              <label className="label">Add person</label>
              <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <input className="input sm:w-44" placeholder="09xx… (for SMS)" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <button type="submit" className="btn btn-secondary">Add card</button>
          </form>
          <button onClick={importCustomers} disabled={importing} className="btn btn-secondary text-xs">
            {importing ? 'Importing…' : 'Import paid customers'}
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="grid gap-3 md:grid-cols-5">
        {CRM_STAGES.map((stage) => {
          const meta = CRM_STAGE_META[stage];
          const col = cards.filter((c) => c.stage === stage);
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
                        {c.phone && <div className="text-[11px] text-slate-400">{c.phone}</div>}
                      </div>
                      <button
                        onClick={() => removeCard(c.id)}
                        aria-label="Remove"
                        className="text-slate-300 transition hover:text-rose-500"
                      >
                        ×
                      </button>
                    </div>
                    {c.phone ? (
                      <a
                        href={smsHref(c.phone, template, c.name)}
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
    </div>
  );
}

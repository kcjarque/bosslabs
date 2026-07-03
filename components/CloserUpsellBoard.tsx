'use client';

import { useEffect, useState } from 'react';
import { toE164Ph } from '@/lib/phone';

type PoolLead = { signupId: string; name: string; paidCentavos: number; paidAt: string; priority: boolean };
type Send = {
  id: string;
  product: 'retreat' | 'vault' | 'build_session';
  promoCode: string;
  discountLabel: string;
  baseCentavos: number;
  discountCentavos: number;
  finalCentavos: number;
  link: string;
  emailStatus: string;
  emailSentAt: string | null;
  smsStatus: string;
  smsSentAt: string | null;
  createdAt: string;
};
type Lead = {
  leadId: string;
  signupId: string;
  name: string;
  email: string;
  phone: string;
  paidCentavos: number;
  paidAt: string;
  stage: string;
  claimedAt: string;
  sends: Send[];
};

const PRODUCTS: { key: Send['product']; label: string; price: number }[] = [
  { key: 'retreat', label: 'VibeCode Retreat', price: 7_500_000 },
  { key: 'vault', label: 'AI Secrets Builder Vault', price: 99_900 },
  { key: 'build_session', label: '1:1 Build Session', price: 399_700 },
];
const STAGES: { key: string; label: string; dot: string }[] = [
  { key: 'new', label: 'New', dot: 'bg-slate-400' },
  { key: 'contacted', label: 'Contacted', dot: 'bg-amber-500' },
  { key: 'sent', label: 'Offer sent', dot: 'bg-cyan-500' },
  { key: 'won', label: 'Won', dot: 'bg-emerald-500' },
  { key: 'lost', label: 'Lost', dot: 'bg-rose-400' },
];

const peso = (c: number) => `₱${(c / 100).toLocaleString('en-PH')}`;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' });

async function api(payload: Record<string, unknown>) {
  const r = await fetch('/api/closer/upsell', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

export function CloserUpsellBoard() {
  const [pool, setPool] = useState<PoolLead[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [offerFor, setOfferFor] = useState<string | null>(null);
  const [poolHidden, setPoolHidden] = useState(true);
  const [priorityHidden, setPriorityHidden] = useState(true);

  async function load() {
    const r = await fetch('/api/closer/upsell');
    const d = await r.json();
    setPool(d.pool ?? []);
    setLeads(d.leads ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

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
  async function setStage(leadId: string, stage: string) {
    setLeads((ls) => ls.map((l) => (l.leadId === leadId ? { ...l, stage } : l)));
    await api({ action: 'stage', leadId, stage });
  }

  if (loading) return <div className="card text-sm text-slate-500">Loading your customers…</div>;

  return (
    <div className="space-y-4">
      {toast && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {toast} <button onClick={() => setToast('')} className="ml-1 underline">dismiss</button>
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">{leads.length} claimed · {pool.length} in pool</div>
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs">
          <button onClick={() => setView('kanban')} className={`px-3 py-1.5 font-medium ${view === 'kanban' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}>Kanban</button>
          <button onClick={() => setView('list')} className={`px-3 py-1.5 font-medium ${view === 'list' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}>List</button>
        </div>
      </div>

      {/* Claimed — kanban or list. Pinned on top: this is the closer's board. */}
      {view === 'kanban' ? (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {STAGES.map((st) => {
            const items = leads.filter((l) => l.stage === st.key);
            return (
              <div key={st.key} className="flex min-h-[120px] flex-col rounded-xl border border-slate-200 bg-slate-50/40">
                <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
                  <span className={`h-2 w-2 rounded-full ${st.dot}`} />
                  <span className="text-xs font-semibold text-slate-700">{st.label}</span>
                  <span className="ml-auto text-[11px] text-slate-400">{items.length}</span>
                </div>
                <div className="flex-1 space-y-2 p-2">
                  {items.map((l) => (
                    <LeadCard key={l.leadId} lead={l} compact busy={busy} onRelease={release} onStage={setStage}
                      openOffer={offerFor === l.leadId} onToggleOffer={() => setOfferFor(offerFor === l.leadId ? null : l.leadId)}
                      onSent={() => { setOfferFor(null); load(); }} onToast={setToast} />
                  ))}
                  {items.length === 0 && <div className="px-1 py-2 text-center text-[11px] text-slate-300">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {leads.length === 0 && <div className="card text-sm text-slate-400">Claim a customer below to start.</div>}
          {leads.map((l) => (
            <LeadCard key={l.leadId} lead={l} busy={busy} onRelease={release} onStage={setStage}
              openOffer={offerFor === l.leadId} onToggleOffer={() => setOfferFor(offerFor === l.leadId ? null : l.leadId)}
              onSent={() => { setOfferFor(null); load(); }} onToast={setToast} />
          ))}
        </div>
      )}

      {/* Priority — hot retreat leads. Collapsible; hidden by default. */}
      {pool.some((p) => p.priority) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/50">
          <div className="flex items-center gap-2 border-b border-amber-200 px-3 py-2">
            <span className="text-sm">⭐</span>
            <span className="text-xs font-semibold text-amber-800">Priority · retreat leads</span>
            <span className="text-[11px] text-amber-600">{pool.filter((p) => p.priority).length}</span>
            <button
              onClick={() => setPriorityHidden((v) => !v)}
              className="ml-auto rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-700 transition hover:bg-amber-100"
            >
              {priorityHidden ? 'Show list' : 'Hide list'}
            </button>
          </div>
          {!priorityHidden && (
            <div className="grid gap-2 p-2 sm:grid-cols-2 lg:grid-cols-3">
              {pool.filter((p) => p.priority).map((p) => (
                <PoolCard key={p.signupId} p={p} busy={busy} onClaim={claim} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* The rest of the pool — collapsible so 300+ cards don't overload */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/40">
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-slate-400" />
          <span className="text-xs font-semibold text-slate-700">Customers to work · paid</span>
          <span className="text-[11px] text-slate-400">{pool.filter((p) => !p.priority).length}</span>
          <button
            onClick={() => setPoolHidden((v) => !v)}
            className="ml-auto rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100"
          >
            {poolHidden ? 'Show list' : 'Hide list'}
          </button>
        </div>
        {!poolHidden && (
          <div className="grid gap-2 p-2 sm:grid-cols-2 lg:grid-cols-3">
            {pool.filter((p) => !p.priority).length === 0 && <div className="px-1 py-3 text-center text-[11px] text-slate-300">No unclaimed customers.</div>}
            {pool.filter((p) => !p.priority).map((p) => (
              <PoolCard key={p.signupId} p={p} busy={busy} onClaim={claim} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PoolCard({ p, busy, onClaim }: { p: PoolLead; busy: string | null; onClaim: (id: string) => void }) {
  return (
    <div className={`rounded-lg border p-2.5 shadow-sm ${p.priority ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {p.priority && <span className="rounded-full bg-amber-400/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">★ Priority</span>}
        <span className="text-sm font-medium text-slate-900">{p.name}</span>
      </div>
      <div className="text-[11px] text-slate-400">🔒 Contact hidden — claim to reveal</div>
      <div className="mt-1 text-[11px] font-medium text-slate-600">
        {p.paidCentavos > 0 ? `Paid ${peso(p.paidCentavos)} · ${shortDate(p.paidAt)}` : p.priority ? 'Retreat lead · Jul 2 webinar' : shortDate(p.paidAt)}
      </div>
      <button
        onClick={() => onClaim(p.signupId)}
        disabled={busy === p.signupId}
        className="mt-2 block w-full rounded-md bg-slate-800 px-2 py-1.5 text-center text-xs font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
      >
        {busy === p.signupId ? '…' : 'Claim →'}
      </button>
    </div>
  );
}

function StatusPill({ label, status }: { label: string; status: string }) {
  const tone = status === 'sent' ? 'bg-emerald-50 text-emerald-700' : status === 'failed' ? 'bg-rose-50 text-rose-600' : status === 'skipped' ? 'bg-slate-100 text-slate-400' : 'bg-amber-50 text-amber-700';
  const mark = status === 'sent' ? '✓' : status === 'failed' ? '✕' : status === 'skipped' ? '–' : '…';
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>{label} {mark}</span>;
}

function LeadCard({
  lead, compact, busy, onRelease, onStage, openOffer, onToggleOffer, onSent, onToast,
}: {
  lead: Lead; compact?: boolean; busy: string | null;
  onRelease: (id: string) => void; onStage: (id: string, s: string) => void;
  openOffer: boolean; onToggleOffer: () => void; onSent: () => void; onToast: (t: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-900">{lead.name}</div>
          <div className="text-[11px] text-slate-500">Paid {peso(lead.paidCentavos)}</div>
        </div>
        <button onClick={() => onRelease(lead.leadId)} disabled={busy === lead.leadId} title="Release" className="text-slate-300 transition hover:text-rose-500">×</button>
      </div>
      {lead.phone && (
        <div className="mt-1 text-[11px] font-medium text-cyan-700">{toE164Ph(lead.phone)}</div>
      )}
      {lead.email && <div className="truncate text-[11px] text-slate-400">{lead.email}</div>}

      {/* Already offered — pinned on top, with a copyable link so the closer can
          resend manually if the customer asks. */}
      {lead.sends.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Already offered</div>
          {lead.sends.map((s) => (
            <div key={s.id} className="rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-slate-700">{PRODUCTS.find((p) => p.key === s.product)?.label ?? s.product}</span>
                <span className="font-mono text-[10px] text-slate-500">{s.promoCode}</span>
              </div>
              <div className="mt-0.5 text-[10.5px] text-slate-500">{s.discountLabel} → {peso(s.finalCentavos)} <span className="text-slate-300">(was {peso(s.baseCentavos)})</span></div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <StatusPill label="Email" status={s.emailStatus} />
                <StatusPill label="SMS" status={s.smsStatus} />
                {s.link && <CopyLinkButton link={s.link} />}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {lead.phone && <a href={`tel:${toE164Ph(lead.phone)}`} className="rounded-md bg-cyan-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-cyan-500">📞 Call</a>}
        <button onClick={onToggleOffer} className="rounded-md border border-cyan-200 px-2 py-1 text-[11px] font-medium text-cyan-700 hover:bg-cyan-50">🏷️ {openOffer ? 'Close' : 'Create offer'}</button>
      </div>

      {/* Stage buttons (compact kanban hides these; list shows them) */}
      {!compact && (
        <div className="mt-2 flex flex-wrap gap-1">
          {STAGES.map((st) => (
            <button key={st.key} onClick={() => onStage(lead.leadId, st.key)}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${lead.stage === st.key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {st.label}
            </button>
          ))}
        </div>
      )}

      {openOffer && (
        <OfferForm
          leadId={lead.leadId}
          hasEmail={!!lead.email}
          hasPhone={!!lead.phone}
          offeredProducts={new Set(lead.sends.map((s) => s.product))}
          onSent={onSent}
          onToast={onToast}
        />
      )}
    </div>
  );
}

function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
      }}
      className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:border-cyan-300 hover:text-cyan-700"
      title={link}
    >
      {copied ? '✓ Copied' : '🔗 Copy link'}
    </button>
  );
}

function OfferForm({ leadId, hasEmail, hasPhone, offeredProducts, onSent, onToast }: { leadId: string; hasEmail: boolean; hasPhone: boolean; offeredProducts: Set<Send['product']>; onSent: () => void; onToast: (t: string) => void }) {
  const MAX_PCT = 15;
  // Only products not already offered to this customer — no duplicate offers.
  const available = PRODUCTS.filter((p) => !offeredProducts.has(p.key));
  // Default to NO product picked — not every customer needs a promo.
  const [product, setProduct] = useState<Send['product'] | ''>('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('15');
  const [email, setEmail] = useState(hasEmail);
  const [sms, setSms] = useState(hasPhone);
  const [sending, setSending] = useState(false);

  const base = product ? PRODUCTS.find((p) => p.key === product)!.price : 0;
  const v = Math.max(0, Number(value) || 0);
  const discountC = discountType === 'percent' ? Math.round((base * Math.min(100, v)) / 100) : Math.min(base, v * 100);
  const final = Math.max(0, base - discountC);
  const maxDiscountC = Math.round((base * MAX_PCT) / 100);
  const overCap = discountC > maxDiscountC;

  async function send() {
    if (!email && !sms) { onToast('Pick at least one channel (email or SMS).'); return; }
    setSending(true);
    const { status, body } = await api({ action: 'promoSend', leadId, product, discountType, discountValue: v, email, sms });
    setSending(false);
    if (status !== 200 || !body.ok) { onToast(body.error || 'Send failed'); return; }
    onSent();
  }

  if (available.length === 0) {
    return (
      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-500" onPointerDown={(e) => e.stopPropagation()}>
        All 3 products have already been offered to this customer.
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-cyan-200 bg-cyan-50/40 p-2.5" onPointerDown={(e) => e.stopPropagation()}>
      <select value={product} onChange={(e) => setProduct(e.target.value as Send['product'] | '')} className="input w-full text-xs">
        <option value="">Choose a product…</option>
        {available.map((p) => <option key={p.key} value={p.key}>{p.label} · {peso(p.price)}</option>)}
      </select>
      <div className="flex gap-1.5">
        <select value={discountType} onChange={(e) => setDiscountType(e.target.value as 'percent' | 'fixed')} className="input text-xs">
          <option value="percent">% off</option>
          <option value="fixed">₱ off</option>
        </select>
        <input type="number" value={value} onChange={(e) => setValue(e.target.value)} min={1}
          max={discountType === 'percent' ? MAX_PCT : undefined}
          className="input w-full text-xs" placeholder={discountType === 'percent' ? '15' : '100'} />
      </div>
      <div className={`rounded-md px-2 py-1.5 text-[11px] ${overCap ? 'bg-rose-50 text-rose-600' : 'bg-white text-slate-600'}`}>
        {!product ? (
          <span className="text-slate-400">Pick a product above to price the offer.</span>
        ) : overCap ? (
          <>Over the {MAX_PCT}% cap — max {peso(maxDiscountC)} off {PRODUCTS.find((p) => p.key === product)!.label}.</>
        ) : (
          <>Customer pays <strong className="text-slate-900">{peso(final)}</strong> <span className="text-slate-400">(was {peso(base)}, save {peso(discountC)})</span></>
        )}
      </div>
      <div className="flex gap-3 text-[11px]">
        <label className="flex items-center gap-1"><input type="checkbox" checked={email} disabled={!hasEmail} onChange={(e) => setEmail(e.target.checked)} /> Email{!hasEmail && ' (none)'}</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={sms} disabled={!hasPhone} onChange={(e) => setSms(e.target.checked)} /> SMS{!hasPhone && ' (none)'}</label>
      </div>
      <button onClick={send} disabled={sending || discountC <= 0 || overCap}
        className="block w-full rounded-md bg-cyan-600 px-2 py-1.5 text-center text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">
        {sending ? 'Sending…' : `Generate code + send →`}
      </button>
    </div>
  );
}

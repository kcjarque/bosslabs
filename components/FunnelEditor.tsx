'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type {
  FunnelModel,
  EventFunnelConfig,
  ValueStackItem,
  FunnelStat,
  FunnelAlternative,
} from '@/lib/db';

/** Pesos ↔ centavos helpers so the form works in whole pesos. */
function toPeso(centavos?: number | null): string {
  return centavos == null ? '' : String(centavos / 100);
}
function toCentavos(peso: string): number | null {
  const n = parseFloat(peso.replace(/,/g, ''));
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

export function FunnelEditor({
  funnel,
  onSave,
}: {
  funnel: FunnelModel;
  onSave: (
    id: string,
    patch: {
      name?: string;
      active?: boolean;
      config?: EventFunnelConfig & Record<string, unknown>;
    },
  ) => Promise<void>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const c = funnel.config;

  const [name, setName] = useState(funnel.name);
  const [active, setActive] = useState(funnel.active);
  const [publicUrl, setPublicUrl] = useState(c.publicUrl ?? '');
  const [tagline, setTagline] = useState(c.tagline ?? '');
  const [subtitle, setSubtitle] = useState(c.subtitle ?? '');
  const [location, setLocation] = useState(c.location ?? '');
  const [capacity, setCapacity] = useState(c.capacity != null ? String(c.capacity) : '');
  const [standard, setStandard] = useState(toPeso(c.standardPriceCentavos));
  const [payInFull, setPayInFull] = useState(toPeso(c.payInFullPriceCentavos));
  const [deposit, setDeposit] = useState(toPeso(c.depositCentavos));
  const [balanceDue, setBalanceDue] = useState(c.balanceDueDate ?? '');
  const [extraPerson, setExtraPerson] = useState(toPeso(c.extraPersonCentavos));
  const [paymentMethods, setPaymentMethods] = useState((c.paymentMethods ?? []).join(', '));
  const [guarantee, setGuarantee] = useState(c.guarantee ?? '');
  const [valueStack, setValueStack] = useState<ValueStackItem[]>(c.valueStack ?? []);
  const [numbers, setNumbers] = useState<FunnelStat[]>(c.byTheNumbers ?? []);
  const [alts, setAlts] = useState<FunnelAlternative[]>(c.alternatives ?? []);
  const [saved, setSaved] = useState(false);

  const stackTotal = valueStack.reduce((s, i) => s + (i.valueCentavos ?? 0), 0);

  function save() {
    const config: EventFunnelConfig & Record<string, unknown> = {
      ...funnel.config,
      publicUrl: publicUrl.trim() || undefined,
      tagline: tagline || undefined,
      subtitle: subtitle || undefined,
      location: location || undefined,
      capacity: capacity ? parseInt(capacity, 10) : undefined,
      standardPriceCentavos: toCentavos(standard) ?? undefined,
      payInFullPriceCentavos: toCentavos(payInFull) ?? undefined,
      depositCentavos: toCentavos(deposit) ?? undefined,
      balanceDueDate: balanceDue || undefined,
      extraPersonCentavos: toCentavos(extraPerson) ?? undefined,
      totalValueCentavos: stackTotal || undefined,
      paymentMethods: paymentMethods
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      guarantee: guarantee || undefined,
      valueStack,
      byTheNumbers: numbers,
      alternatives: alts,
    };
    startTransition(async () => {
      await onSave(funnel.id, { name, active, config });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Core */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Offer</h2>
          {publicUrl.trim() ? (
            <a
              href={publicUrl.trim()}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
            >
              View funnel ↗
            </a>
          ) : (
            <span
              className="btn btn-secondary cursor-not-allowed opacity-40"
              title="Add a Funnel URL below, then save, to enable this"
            >
              View funnel ↗
            </span>
          )}
        </div>
        <Field
          label="Funnel URL"
          hint="Paste the public link to this funnel's page, then Save. The 'View funnel' button above opens it in a new tab."
        >
          <input
            className="input"
            value={publicUrl}
            onChange={(e) => setPublicUrl(e.target.value)}
            placeholder="https://bosslabs.ai/retreat"
          />
        </Field>
        <Field label="Funnel name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Tagline">
          <input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Subtitle">
            <input className="input" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          </Field>
          <Field label="Location">
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          <Field label="Capacity (seats)">
            <input
              type="number"
              className="input"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </Field>
          <Field label="Payment methods (comma-separated)">
            <input
              className="input"
              value={paymentMethods}
              onChange={(e) => setPaymentMethods(e.target.value)}
              placeholder="Bank transfer, Maya"
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Funnel active
        </label>
      </section>

      {/* Pricing */}
      <section className="card space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Pricing (₱)</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Standard price" hint="All-in, per builder.">
            <input className="input" value={standard} onChange={(e) => setStandard(e.target.value)} />
          </Field>
          <Field label="Pay-in-full today" hint="Discounted if paid in full now.">
            <input className="input" value={payInFull} onChange={(e) => setPayInFull(e.target.value)} />
          </Field>
          <Field label="Deposit to secure slot">
            <input className="input" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          </Field>
          <Field label="Balance due date" hint="e.g. July 24">
            <input className="input" value={balanceDue} onChange={(e) => setBalanceDue(e.target.value)} />
          </Field>
          <Field label="Extra person add-on">
            <input className="input" value={extraPerson} onChange={(e) => setExtraPerson(e.target.value)} />
          </Field>
        </div>
      </section>

      {/* Value stack */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Value stack ·{' '}
            <span className="text-slate-500">₱{(stackTotal / 100).toLocaleString()} total</span>
          </h2>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              setValueStack([...valueStack, { label: '', description: '', valueCentavos: 0 }])
            }
          >
            + Item
          </button>
        </div>
        {valueStack.map((item, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <input
                className="input"
                value={item.label}
                placeholder="Item name"
                onChange={(e) => {
                  const next = [...valueStack];
                  next[i] = { ...item, label: e.target.value };
                  setValueStack(next);
                }}
              />
              <input
                className="input"
                value={item.description}
                placeholder="Short description"
                onChange={(e) => {
                  const next = [...valueStack];
                  next[i] = { ...item, description: e.target.value };
                  setValueStack(next);
                }}
              />
            </div>
            <div className="flex items-start gap-2">
              <input
                className="input w-28"
                value={item.valueCentavos == null ? '' : String(item.valueCentavos / 100)}
                placeholder="₱ (blank = Priceless)"
                onChange={(e) => {
                  const next = [...valueStack];
                  next[i] = { ...item, valueCentavos: toCentavos(e.target.value) };
                  setValueStack(next);
                }}
              />
              <button
                type="button"
                className="btn btn-ghost text-red-600"
                onClick={() => setValueStack(valueStack.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* By the numbers */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">By the numbers</h2>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setNumbers([...numbers, { stat: '', label: '' }])}
          >
            + Stat
          </button>
        </div>
        {numbers.map((n, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="input w-24"
              value={n.stat}
              placeholder="10"
              onChange={(e) => {
                const next = [...numbers];
                next[i] = { ...n, stat: e.target.value };
                setNumbers(next);
              }}
            />
            <input
              className="input flex-1"
              value={n.label}
              placeholder="Builders only"
              onChange={(e) => {
                const next = [...numbers];
                next[i] = { ...n, label: e.target.value };
                setNumbers(next);
              }}
            />
            <button
              type="button"
              className="btn btn-ghost text-red-600"
              onClick={() => setNumbers(numbers.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        ))}
      </section>

      {/* Alternatives */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Cost alternatives (the comparison cards)
          </h2>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              setAlts([...alts, { label: '', headline: '', timeframe: '', detail: '' }])
            }
          >
            + Card
          </button>
        </div>
        {alts.map((a, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                className="input"
                value={a.label}
                placeholder="Dev Agency"
                onChange={(e) => {
                  const next = [...alts];
                  next[i] = { ...a, label: e.target.value };
                  setAlts(next);
                }}
              />
              <input
                className="input"
                value={a.headline}
                placeholder="₱250k–₱500k+"
                onChange={(e) => {
                  const next = [...alts];
                  next[i] = { ...a, headline: e.target.value };
                  setAlts(next);
                }}
              />
              <input
                className="input"
                value={a.timeframe}
                placeholder="2–4 months"
                onChange={(e) => {
                  const next = [...alts];
                  next[i] = { ...a, timeframe: e.target.value };
                  setAlts(next);
                }}
              />
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={a.detail}
                placeholder="Why it's a worse deal…"
                onChange={(e) => {
                  const next = [...alts];
                  next[i] = { ...a, detail: e.target.value };
                  setAlts(next);
                }}
              />
              <button
                type="button"
                className="btn btn-ghost text-red-600"
                onClick={() => setAlts(alts.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* Guarantee */}
      <section className="card space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Guarantee copy</h2>
        <textarea
          className="input min-h-[120px]"
          value={guarantee}
          onChange={(e) => setGuarantee(e.target.value)}
        />
      </section>

      <div className="sticky bottom-4 flex items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={isPending}>
          {isPending ? 'Saving…' : saved ? 'Saved ✓' : 'Save funnel'}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

'use client';

/**
 * Homepage split-test control (GHL-style) — shown on the webinar funnel's
 * admin page. CONTROL = the live homepage; VARIATION B = the HeroB angle.
 * The % of traffic that sees the variation is saved to the funnel config
 * (homeVariantPct). 0% = variation off (nobody sees it organically).
 */
import { useState, useTransition } from 'react';
import type { EventFunnelConfig } from '@/lib/db';

type FunnelLite = {
  id: string;
  config: EventFunnelConfig & Record<string, unknown>;
};

export function HomeSplitCard({
  funnel,
  onSave,
}: {
  funnel: FunnelLite;
  onSave: (
    id: string,
    patch: { config?: EventFunnelConfig & Record<string, unknown> },
  ) => Promise<void>;
}) {
  const initial = Math.min(100, Math.max(0, Number(funnel.config.homeVariantPct) || 0));
  const [pct, setPct] = useState(String(initial));
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const n = Math.min(100, Math.max(0, Math.round(Number(pct) || 0)));
  const live = n > 0;

  function save() {
    startTransition(async () => {
      await onSave(funnel.id, { config: { ...funnel.config, homeVariantPct: n } });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    });
  }

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Homepage split test</h2>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
            live
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-slate-100 text-slate-500'
          }`}
        >
          {live ? `Running · ${n}% to variation` : 'Off · 100% control'}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            🏁 Control
          </div>
          <div className="mt-1 text-sm text-slate-700">Current homepage (₱100K/month outcome hero)</div>
          <div className="mt-2 flex items-baseline justify-between">
            <a href="/?preview=control" target="_blank" className="text-xs text-cyan-600 hover:underline">
              Preview ↗
            </a>
            <span className="text-lg font-semibold text-slate-900">{100 - n}%</span>
          </div>
        </div>
        <div className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700">
            🧪 Variation B
          </div>
          <div className="mt-1 text-sm text-slate-700">
            Conversion-first redesign — new type system, bento proof grids, self-typing
            terminal, FAQ + qualifier, sticky CTA
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <a href="/?preview=b" target="_blank" className="text-xs text-cyan-600 hover:underline">
              Preview ↗
            </a>
            <span className="text-lg font-semibold text-slate-900">{n}%</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Variation traffic %</label>
          <input
            className="input w-28"
            inputMode="numeric"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
          />
        </div>
        <button onClick={save} disabled={pending} className="btn btn-primary text-xs">
          {pending ? 'Saving…' : saved ? 'Saved ✓' : 'Save split'}
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-400">
        Visitors are bucketed once (sticky cookie) — raising the % adds new people to the
        variation without reshuffling anyone. Set 50 for a classic A/B, back to 0 to pause.
        Variation views are logged as <code className="rounded bg-slate-100 px-1">/__ab/home-b</code>{' '}
        page-views so you can compare traffic.
      </p>
    </section>
  );
}

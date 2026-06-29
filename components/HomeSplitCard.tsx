'use client';

/**
 * Homepage split-test control (GHL-style) — shown on the webinar funnel's
 * admin page. THREE variants:
 *   - CONTROL: the live homepage (legacy "₱100K/month outcome" hero)
 *   - VARIATION B: conversion-first redesign (bento grids, terminal, sticky CTA)
 *   - VARIATION C: competition-killer informed by the aibuilderssummit.live
 *     audit (outcome-first hero, itemized bonus stack, sharpened apps moat)
 *
 * Two traffic dials, saved to funnel config:
 *   homeVariantPct  → Variation B
 *   homeVariantCPct → Variation C
 *
 * Bucketing is additive (raising C doesn't reshuffle anyone already in B).
 * Combined cap of 100; warn if the admin sets B + C > 100.
 */
import { useState, useTransition } from 'react';
import type { EventFunnelConfig } from '@/lib/db';

type FunnelLite = {
  id: string;
  config: EventFunnelConfig & Record<string, unknown>;
};

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n) || 0));
}

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
  const initialB = clampPct(Number(funnel.config.homeVariantPct) || 0);
  const initialC = clampPct(Number(funnel.config.homeVariantCPct) || 0);
  const [pctB, setPctB] = useState(String(initialB));
  const [pctC, setPctC] = useState(String(initialC));
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const nB = clampPct(Number(pctB));
  const nC = clampPct(Number(pctC));
  const sum = nB + nC;
  const overCap = sum > 100;
  const nControl = Math.max(0, 100 - Math.min(100, sum));
  const live = nB > 0 || nC > 0;

  function save() {
    startTransition(async () => {
      await onSave(funnel.id, {
        config: { ...funnel.config, homeVariantPct: nB, homeVariantCPct: nC },
      });
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
          {live ? `Running · B ${nB}% · C ${nC}% · Control ${nControl}%` : 'Off · 100% control'}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            🏁 Control
          </div>
          <div className="mt-1 text-sm text-slate-700">
            Current homepage (₱100K/month outcome hero)
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <a
              href="/?preview=control"
              target="_blank"
              className="text-xs text-cyan-600 hover:underline"
            >
              Preview ↗
            </a>
            <span className="text-lg font-semibold text-slate-900">{nControl}%</span>
          </div>
        </div>
        <div className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700">
            🧪 Variation B
          </div>
          <div className="mt-1 text-sm text-slate-700">
            Conversion-first redesign — bento proof grids, self-typing terminal, sticky CTA, FAQ
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <a
              href="/?preview=b"
              target="_blank"
              className="text-xs text-cyan-600 hover:underline"
            >
              Preview ↗
            </a>
            <span className="text-lg font-semibold text-slate-900">{nB}%</span>
          </div>
        </div>
        <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50/40 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-700">
            🎯 Variation C
          </div>
          <div className="mt-1 text-sm text-slate-700">
            Competition-killer (vs aibuilderssummit.live) — outcome-first hero, itemized bonus
            stack, sharpened apps moat
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <a
              href="/?preview=c"
              target="_blank"
              className="text-xs text-fuchsia-600 hover:underline"
            >
              Preview ↗
            </a>
            <span className="text-lg font-semibold text-slate-900">{nC}%</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="label">Variation B traffic %</label>
          <input
            className="input w-28"
            inputMode="numeric"
            value={pctB}
            onChange={(e) => setPctB(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Variation C traffic %</label>
          <input
            className="input w-28"
            inputMode="numeric"
            value={pctC}
            onChange={(e) => setPctC(e.target.value)}
          />
        </div>
        <button
          onClick={save}
          disabled={pending || overCap}
          className="btn btn-primary text-xs disabled:opacity-50"
        >
          {pending ? 'Saving…' : saved ? 'Saved ✓' : 'Save split'}
        </button>
        {overCap && (
          <span className="text-[11px] font-medium text-rose-600">
            B + C = {sum}% &gt; 100. Lower one before saving.
          </span>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-slate-400">
        Visitors are bucketed once (sticky cookie) — raising a % adds new people to that variation
        without reshuffling anyone. Set both to 0 to pause and serve 100% control. Variation views
        log as <code className="rounded bg-slate-100 px-1">/__ab/home-b</code> and{' '}
        <code className="rounded bg-slate-100 px-1">/__ab/home-c</code> page-views so you can
        compare traffic.
      </p>
    </section>
  );
}

'use client';

/**
 * Homepage A/B test — full management card on the webinar funnel page.
 *
 * Run two designs against each other at any traffic ratio, watch the results
 * fill in, then stop the test by declaring a winner (which is then served to
 * everyone). Past tests keep their numbers in the history list below.
 *
 * The public URL never changes — https://www.bosslabs.live serves both arms —
 * so the ad link is unaffected by anything on this card.
 */
import { useState, useTransition } from 'react';
import { VARIANT_CATALOG, type AbTestConfig, type AbHistoryEntry, type VariantKey } from '@/lib/ab';
import type { AbResults } from '@/lib/ab-stats';

const peso = (c: number) => `₱${Math.round(c / 100).toLocaleString('en-PH')}`;
const rate = (n: number) => `${n.toFixed(2)}%`;
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const KEYS = Object.keys(VARIANT_CATALOG) as VariantKey[];

export function HomeSplitCard({
  funnelId,
  test,
  history,
  results,
  onUpdateSplit,
  onStartTest,
  onStopTest,
}: {
  funnelId: string;
  test: AbTestConfig;
  history: AbHistoryEntry[];
  results: AbResults;
  onUpdateSplit: (id: string, pct: number) => Promise<void>;
  onStartTest: (id: string, a: VariantKey, b: VariantKey, pct: number) => Promise<void>;
  onStopTest: (id: string, winner: 'a' | 'b') => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [split, setSplit] = useState(String(test.splitAPct));
  const [newA, setNewA] = useState<VariantKey>(test.variantA);
  const [newB, setNewB] = useState<VariantKey>(test.variantB);
  const [confirmStop, setConfirmStop] = useState(false);
  const [showSwap, setShowSwap] = useState(false);

  const running = test.status === 'running';
  const nSplit = Math.min(100, Math.max(0, Math.round(Number(split)) || 0));
  const splitDirty = nSplit !== test.splitAPct;
  const sameVariant = newA === newB;

  const arms = [
    { arm: 'a' as const, key: test.variantA, pct: test.splitAPct, st: results.a },
    { arm: 'b' as const, key: test.variantB, pct: 100 - test.splitAPct, st: results.b },
  ];

  return (
    <section className="card space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Homepage A/B test</h2>
          <p className="mt-0.5 text-[12px] text-slate-500">
            {running ? (
              <>
                Started {dateTime(test.startedAt)} · running {results.days}{' '}
                {results.days === 1 ? 'day' : 'days'}
              </>
            ) : (
              <>
                Ended {dateTime(test.endedAt ?? test.startedAt)} · serving{' '}
                {VARIANT_CATALOG[test.winner === 'a' ? test.variantA : test.variantB].label} to
                everyone
              </>
            )}
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
            running
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'border-slate-300 bg-slate-100 text-slate-600'
          }`}
        >
          {running ? `● Running · ${test.splitAPct}/${100 - test.splitAPct}` : '■ Stopped'}
        </span>
      </div>

      <p className="text-[12px] leading-relaxed text-slate-500">
        Every visitor to <strong className="text-slate-700">bosslabs.live</strong> is randomly shown
        one design and stays on it (sticky cookie). The ad link is unchanged — the split is
        server-side.
      </p>

      {/* ── The two arms + their live numbers ──────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2">
        {arms.map(({ arm, key, pct, st }) => {
          const isLeader = results.leader === arm;
          const isWinner = !running && test.winner === arm;
          return (
            <div
              key={arm}
              className={`rounded-xl border p-4 ${
                isWinner
                  ? 'border-emerald-400 bg-emerald-50/60'
                  : arm === 'b'
                    ? 'border-cyan-300 bg-cyan-50/50'
                    : 'border-slate-300 bg-slate-50/70'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div
                  className={`text-[11px] font-semibold uppercase tracking-wider ${
                    arm === 'b' ? 'text-cyan-700' : 'text-slate-700'
                  }`}
                >
                  Variant {arm.toUpperCase()} — {VARIANT_CATALOG[key].label}
                </div>
                {isWinner && (
                  <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Winner
                  </span>
                )}
                {!isWinner && isLeader && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    Leading
                  </span>
                )}
              </div>
              <div className="mt-1 text-[12px] text-slate-600">{VARIANT_CATALOG[key].blurb}</div>

              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums text-slate-900">
                  {rate(st.convPct)}
                </span>
                <span className="text-[11px] uppercase tracking-wide text-slate-500">
                  conversion · {pct}% traffic
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-black/5 pt-3">
                <Metric label="Revenue" value={peso(st.revenueCentavos)} />
                <Metric label="Customers" value={String(st.customers)} />
                <Metric label="Visits" value={st.visits.toLocaleString()} />
                <Metric label="Ave. cart" value={peso(st.aovCentavos)} />
              </dl>

              <a
                href={VARIANT_CATALOG[key].preview}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-[11px] text-cyan-600 hover:underline"
              >
                Preview ↗
              </a>
            </div>
          );
        })}
      </div>

      {/* ── Overall result summary ─────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-600">
            Test results · both arms
          </h3>
          <span className="text-[11px] text-slate-500">
            {shortDate(results.windowStartIso)} → {running ? 'now' : shortDate(results.windowEndIso)}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Big label="Revenue" value={peso(results.total.revenueCentavos)} />
          <Big label="Customers" value={String(results.total.customers)} />
          <Big label="Conversion" value={rate(results.total.convPct)} />
          <Big label="Ave. cart" value={peso(results.total.aovCentavos)} />
          <Big
            label="B vs A lift"
            value={
              results.liftPct == null
                ? '—'
                : `${results.liftPct > 0 ? '+' : ''}${results.liftPct.toFixed(1)}%`
            }
            tone={results.liftPct == null ? undefined : results.liftPct > 0 ? 'good' : 'bad'}
          />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          {results.sampleSize < 10 ? (
            <>
              ⚠️ Only {results.sampleSize} sale{results.sampleSize === 1 ? '' : 's'} so far — too
              early to call. Let it run until each arm has a few dozen.
            </>
          ) : results.leader ? (
            <>
              Variant {results.leader.toUpperCase()} is ahead on conversion across{' '}
              {results.sampleSize} sales. Stop the test to lock it in for everyone.
            </>
          ) : (
            <>Both arms are performing within noise of each other across {results.sampleSize} sales.</>
          )}
        </p>
      </div>

      {/* ── Controls ───────────────────────────────────────────────────── */}
      {running ? (
        <div className="space-y-3">
          {/* Traffic split */}
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="ab-split" className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Traffic to Variant A ({VARIANT_CATALOG[test.variantA].label})
              </label>
              <div className="mt-1.5 flex items-center gap-3">
                <input
                  id="ab-split"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={nSplit}
                  onChange={(e) => setSplit(e.target.value)}
                  className="h-1.5 flex-1 accent-cyan-600"
                />
                <div className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1">
                  <input
                    inputMode="numeric"
                    value={split}
                    onChange={(e) => setSplit(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-10 bg-transparent text-right text-sm font-semibold tabular-nums outline-none"
                  />
                  <span className="text-xs text-slate-400">%</span>
                </div>
                <span className="text-[11px] text-slate-500">
                  A {nSplit}% / B {100 - nSplit}%
                </span>
              </div>
            </div>
            <button
              onClick={() =>
                startTransition(async () => {
                  await onUpdateSplit(funnelId, nSplit);
                })
              }
              disabled={pending || !splitDirty}
              className="btn btn-primary text-xs disabled:opacity-40"
            >
              {pending ? 'Saving…' : 'Save split'}
            </button>
          </div>

          {/* Swap variants + stop */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowSwap((v) => !v)}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {showSwap ? 'Cancel' : '⇄ Change variants (starts a new test)'}
            </button>
            {!confirmStop ? (
              <button
                onClick={() => setConfirmStop(true)}
                className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
              >
                ■ End test
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-rose-200 bg-rose-50/60 p-2">
                <span className="text-[11.5px] font-medium text-rose-800">
                  Pick the winner — it goes to 100% of traffic:
                </span>
                {arms.map(({ arm, key }) => (
                  <button
                    key={arm}
                    onClick={() =>
                      startTransition(async () => {
                        await onStopTest(funnelId, arm);
                        setConfirmStop(false);
                      })
                    }
                    disabled={pending}
                    className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {arm.toUpperCase()} · {VARIANT_CATALOG[key].label}
                  </button>
                ))}
                <button
                  onClick={() => setConfirmStop(false)}
                  className="text-[11.5px] text-slate-500 hover:underline"
                >
                  cancel
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowSwap(true)}
          className="btn btn-primary w-full text-xs sm:w-auto"
        >
          ▶ Start a new test
        </button>
      )}

      {/* Variant picker (max 2) */}
      {showSwap && (
        <div className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
          <h3 className="text-[12px] font-semibold text-slate-800">
            Pick the two designs to run against each other
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Starting a new test archives the current one to the history below (its numbers are kept).
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <VariantPicker label="Variant A" value={newA} onChange={setNewA} />
            <VariantPicker label="Variant B" value={newB} onChange={setNewB} />
          </div>
          {sameVariant && (
            <p className="mt-2 text-[11.5px] font-medium text-rose-600">
              Pick two different designs — a test needs something to compare.
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() =>
                startTransition(async () => {
                  await onStartTest(funnelId, newA, newB, nSplit || 50);
                  setShowSwap(false);
                })
              }
              disabled={pending || sameVariant}
              className="btn btn-primary text-xs disabled:opacity-40"
            >
              {pending ? 'Starting…' : `▶ Start test · ${nSplit || 50}/${100 - (nSplit || 50)}`}
            </button>
            <button
              onClick={() => setShowSwap(false)}
              className="text-[11.5px] text-slate-500 hover:underline"
            >
              cancel
            </button>
          </div>
        </div>
      )}

      {/* ── History ────────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-600">
          Past tests
        </h3>
        {history.length === 0 ? (
          <p className="mt-2 text-[12px] text-slate-400">
            No previous tests yet — this is the first one.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {history.map((h, i) => (
              <li key={`${h.startedAt}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                <span className="text-[12px] font-medium text-slate-800">
                  {VARIANT_CATALOG[h.variantA]?.label ?? h.variantA} vs{' '}
                  {VARIANT_CATALOG[h.variantB]?.label ?? h.variantB}
                </span>
                <span className="text-[11px] text-slate-400">
                  {shortDate(h.startedAt)} → {h.endedAt ? shortDate(h.endedAt) : '—'}
                </span>
                <span className="text-[11px] text-slate-500">
                  {h.splitAPct}/{100 - h.splitAPct}
                </span>
                {h.result && (
                  <span className="text-[11px] tabular-nums text-slate-500">
                    A {h.result.aPaid} · {peso(h.result.aRevenueCentavos)} — B {h.result.bPaid} ·{' '}
                    {peso(h.result.bRevenueCentavos)}
                  </span>
                )}
                {h.winner && (
                  <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                    Won: {h.winner.toUpperCase()}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-slate-400">
        Each sale is tagged with the design the buyer came through, so revenue can&rsquo;t be
        credited to the wrong funnel. Full per-day numbers live on the{' '}
        <a href="/admin" className="text-cyan-600 hover:underline">
          dashboard
        </a>
        .
      </p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="text-sm font-semibold tabular-nums text-slate-900">{value}</dd>
      <dt className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</dt>
    </div>
  );
}

function Big({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div>
      <div
        className={`text-lg font-semibold tabular-nums ${
          tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-rose-600' : 'text-slate-900'
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
    </div>
  );
}

function VariantPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: VariantKey;
  onChange: (v: VariantKey) => void;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1.5 space-y-1.5">
        {KEYS.map((k) => (
          <label
            key={k}
            className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 transition ${
              value === k ? 'border-cyan-400 bg-white' : 'border-slate-200 bg-white/60 hover:bg-white'
            }`}
          >
            <input
              type="radio"
              name={`variant-${label}`}
              checked={value === k}
              onChange={() => onChange(k)}
              className="mt-0.5 accent-cyan-600"
            />
            <span className="min-w-0">
              <span className="block text-[12px] font-medium text-slate-800">
                {VARIANT_CATALOG[k].label}
              </span>
              <span className="block text-[10.5px] leading-snug text-slate-500">
                {VARIANT_CATALOG[k].blurb}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

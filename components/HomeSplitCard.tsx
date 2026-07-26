/**
 * Homepage A/B test status — shown on the webinar funnel's admin page.
 *
 * Since 2026-07-26 the homepage runs a LIVE 50/50 split between the ORIGINAL
 * design (A) and the CURRENT ₱500K-reframe design (B), driven by the sticky
 * `bl_ab_roll` cookie in app/page.tsx (see lib/ab.ts). The public URL is
 * unchanged — https://www.bosslabs.live serves both arms, so the ad link keeps
 * working untouched.
 *
 * This card is deliberately READ-ONLY: the split is a code-level constant
 * (AB_SPLIT_A_PCT), not a stored dial. The old homeVariantPct / homeVariantCPct
 * config dials are retired — the router no longer reads them, so showing
 * editable inputs here would be a lie. Per-variant revenue + conversion live on
 * the dashboard.
 */
import Link from 'next/link';
import { AB_SPLIT_A_PCT } from '@/lib/ab';

const ARMS = [
  {
    key: 'A',
    emoji: '🏁',
    name: 'Original design',
    desc: 'The previous homepage — ₱100K/month outcome hero.',
    href: '/?preview=control',
    pct: AB_SPLIT_A_PCT,
    tint: 'border-slate-300 bg-slate-50/70',
    accent: 'text-slate-700',
  },
  {
    key: 'B',
    emoji: '🔨',
    name: 'Current design',
    desc: '₱500K-quote reframe — build-it-yourself hero, clickable sample app.',
    href: '/?preview=d',
    pct: 100 - AB_SPLIT_A_PCT,
    tint: 'border-cyan-300 bg-cyan-50/60',
    accent: 'text-cyan-700',
  },
];

export function HomeSplitCard() {
  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Homepage A/B test</h2>
        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
          ● Running · {AB_SPLIT_A_PCT}/{100 - AB_SPLIT_A_PCT} split
        </span>
      </div>

      <p className="text-[12px] leading-relaxed text-slate-500">
        Every visitor to <strong className="text-slate-700">bosslabs.live</strong> is randomly shown
        one of the two designs and stays on it (sticky cookie). The ad link is unchanged — the split
        happens server-side.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {ARMS.map((a) => (
          <div key={a.key} className={`rounded-xl border p-4 ${a.tint}`}>
            <div className={`text-[11px] font-semibold uppercase tracking-wider ${a.accent}`}>
              {a.emoji} Variant {a.key} — {a.name}
            </div>
            <div className="mt-1 text-sm text-slate-700">{a.desc}</div>
            <div className="mt-3 flex items-baseline justify-between">
              <a
                href={a.href}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-cyan-600 hover:underline"
              >
                Preview ↗
              </a>
              <span className="text-lg font-semibold tabular-nums text-slate-900">{a.pct}%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        <div className="text-[12px] font-medium text-slate-700">
          📊 Revenue, paid count &amp; conversion per design
        </div>
        <p className="mt-0.5 text-[11.5px] text-slate-500">
          Live on the dashboard — see the <em>A/B Test — funnel design</em> card, filterable by date
          range.
        </p>
        <Link
          href="/admin"
          className="mt-2 inline-block rounded-md bg-slate-800 px-2.5 py-1.5 text-[11.5px] font-medium text-white transition hover:bg-slate-700"
        >
          Open dashboard →
        </Link>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-400">
        Attribution starts when a buyer checks out — each sale is tagged with the design they came
        through, so revenue can&rsquo;t be credited to the wrong funnel. To change the ratio or end
        the test, edit <code className="rounded bg-slate-100 px-1">AB_SPLIT_A_PCT</code> in{' '}
        <code className="rounded bg-slate-100 px-1">lib/ab.ts</code>. Variations B and C are retired
        legacy experiments, reachable only via{' '}
        <code className="rounded bg-slate-100 px-1">?preview=b</code> /{' '}
        <code className="rounded bg-slate-100 px-1">?preview=c</code>.
      </p>
    </section>
  );
}

/**
 * OurAppsShowcase — 5 real production apps the founders shipped using Claude
 * Code. Distinct visual treatment from AppsStack so the page doesn't repeat:
 * each card uses its own brand color + a browser-chrome top strip, no fanned
 * 3D tilt. Designed to read as "real software you can poke at."
 */

import { OUR_APPS, type AppShowcase } from '@/lib/config';

export function OurAppsShowcase() {
  return (
    <section className="border-t border-white/[0.05] py-20 sm:py-28">
      <div className="container-tight">
        <div className="mx-auto max-w-2xl text-center">
          <div className="eyebrow justify-center">Proof, not promises</div>
          <h2 className="h-section mt-5">
            Five production apps.{' '}
            <span className="accent-italic">Zero developers hired.</span>
          </h2>
          <p className="lead mt-5">
            Every tool below runs an actual Filipino business. Each one was built
            by Michael or Kyle using nothing but Claude Code. This is the same
            playbook we hand you on the call.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:mt-14 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {OUR_APPS.map((app) => (
            <AppCard key={app.slug} app={app} />
          ))}
          {/* Fifth card on third row, left-anchored on lg → keeps the grid tight */}
        </div>

        <p className="mt-10 text-center font-sans text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
          Live across Manila, Cebu, Davao · Built between client work — none of these
          required a developer hire
        </p>
      </div>
    </section>
  );
}

function AppCard({ app }: { app: AppShowcase }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.025] to-white/[0.005] shadow-card transition hover:border-cyan-500/30">
      {/* Browser-chrome strip */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.025] px-4 py-2">
        <span className="h-2 w-2 rounded-full bg-red-400/70" />
        <span className="h-2 w-2 rounded-full bg-yellow-400/70" />
        <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
        <div className="ml-2 truncate rounded-md bg-white/[0.04] px-2 py-1 text-[10px] text-ink-300 sm:text-[11px]">
          {app.hint}
        </div>
      </div>

      {/* Brand-colored hero strip */}
      <div
        className={`flex items-center justify-between border-b border-white/[0.05] px-5 py-3 ${app.primary}`}
      >
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/80 sm:text-[11px]">
            {app.business}
          </div>
          <h3 className="mt-0.5 font-serif text-lg leading-tight text-white sm:text-xl">
            {app.name}
          </h3>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-emerald-300 sm:text-[10px]">
          live
        </span>
      </div>

      {/* Body */}
      <div className="space-y-4 p-5 sm:p-6">
        <p className="font-sans text-[13px] leading-relaxed text-ink-100 sm:text-[14px]">
          {app.tagline}
        </p>

        {/* Two-up stat row */}
        <div className="grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-4">
          <div>
            <div
              className="font-serif text-xl tracking-tight sm:text-2xl"
              style={{ color: app.accent }}
            >
              {app.metric.value}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-ink-300 sm:text-[11px]">
              {app.metric.label}
            </div>
          </div>
          <div>
            <div className="font-serif text-xl tracking-tight text-white sm:text-2xl">
              {app.detail.value}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-ink-300 sm:text-[11px]">
              {app.detail.label}
            </div>
          </div>
        </div>

        {/* Build-time stamp */}
        <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: app.accent }}
            />
            {app.built}
          </span>
          <span>100% AI Coded</span>
        </div>
      </div>
    </article>
  );
}

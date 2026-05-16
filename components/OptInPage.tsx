import Link from 'next/link';
import { CountdownDisplay } from './CountdownBar';
import { HeroBackground } from './HeroBackground';
import {
  CategoryAgencyIcon,
  CategoryBpoIcon,
  CategoryEcomIcon,
  CategoryRetailIcon,
  CategorySaasIcon,
  CategoryStudioIcon,
  PillarMathIcon,
  PillarMultiplierIcon,
  PillarReplacementIcon,
  WorkflowBuildIcon,
  WorkflowCompoundIcon,
  WorkflowIterateIcon,
  WorkflowSetupIcon,
  WorkflowShipIcon,
  WorkflowSpecIcon,
} from './Illustrations';
import { Logo } from './Logo';
import { Mark } from './Mark';
import { AppsStack, StarterPackMockup, TerminalMockup } from './Mockups';
import { OurAppsShowcase } from './OurAppsShowcase';
import { StickyMobileCta } from './StickyMobileCta';
import {
  AUTHORITY,
  FOUNDERS,
  FREE_GIFT,
  HEADLINE,
  HOST,
  LAYERS,
  OFFER,
  PILLARS,
  SUBHEADLINE,
  WEBINAR,
  WHAT_IS,
  WINS,
} from '@/lib/config';

export function OptInPage() {
  return (
    <>
      <MinimalHeader />
      <main className="relative">
        <Hero />
        <AuthorityBar />
        <WhatIsSection />
        <OurAppsShowcase />
        <Pillars />
        <ManifestoBlock />
        <FoundersDetail />
        <WorkflowDiagram />
        <ClaudeCodeExplainer />
        <YourTicketIncludes />
        <Wins />
        <FinalUrgency />
      </main>
      <MinimalFooter />
      <StickyMobileCta />
    </>
  );
}

/* --------------------------------------------------------------------- */
/* HEADER — logo only, no nav, no exit                                   */
/* --------------------------------------------------------------------- */
function MinimalHeader() {
  return (
    <header className="border-b border-white/[0.05] bg-[#06070A]/80 backdrop-blur-md">
      <div className="container-tight flex h-16 items-center justify-center">
        <div className="inline-flex items-center gap-3">
          <Mark size={26} />
          <Logo size="md" />
        </div>
      </div>
    </header>
  );
}

/* --------------------------------------------------------------------- */
/* FOOTER — minimal, legal-only                                          */
/* --------------------------------------------------------------------- */
function MinimalFooter() {
  return (
    <footer className="border-t border-white/[0.05] bg-[#06070A]/70 py-10 pb-20 sm:pb-10">
      <div className="container-tight space-y-4 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-ink-200 sm:text-[11px]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 [box-shadow:0_0_6px_2px_rgba(0,184,230,0.45)]" />
          Built in Manila · By two Filipino founders
        </div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
          © {new Date().getFullYear()} BOSSLABS AI · All rights reserved.
        </div>
        <p className="mx-auto max-w-3xl text-[10px] leading-relaxed text-ink-300 sm:text-[11px]">
          The results, case studies, and stories on this page are not typical and do not
          guarantee that you will achieve the same. Your results depend on your business,
          your effort, and your market. This event is not affiliated with, endorsed by, or
          sponsored by Meta, Zoom, Anthropic, or any third-party platform.
        </p>
      </div>
    </footer>
  );
}

/* --------------------------------------------------------------------- */
/* PRIMARY CTA — links to /checkout (paid funnel)                        */
/* --------------------------------------------------------------------- */
function PaidCta({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/checkout"
      className={`btn-primary !py-4 !px-9 text-base ${className}`}
    >
      Reserve a Seat — {OFFER.main.label}
    </Link>
  );
}

/* --------------------------------------------------------------------- */
/* 1 — HERO                                                              */
/* --------------------------------------------------------------------- */
function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <HeroBackground />
      <div className="container-tight relative z-10 pt-12 pb-14 sm:pt-20 sm:pb-20">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.22em] text-cyan-300 sm:text-[11px]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400" />
            Live on Zoom · {WEBINAR.date} · {WEBINAR.time} {WEBINAR.timezone}
          </div>

          <h1 className="mt-7 font-serif text-[32px] leading-[1.06] tracking-[-0.01em] text-white sm:text-[52px] md:text-[64px] lg:text-[72px]">
            {HEADLINE.prefix}{' '}
            <span className="accent-italic">{HEADLINE.outcome}</span>{' '}
            {HEADLINE.outcomeTail}
            <br className="hidden sm:block" />{' '}
            {HEADLINE.mechanismPrefix}{' '}
            <span className="accent-italic">{HEADLINE.mechanism}</span>{' '}
            {HEADLINE.objectionPrefix}{' '}
            <span className="accent-italic">{HEADLINE.objection}.</span>
          </h1>

          <p className="mx-auto mt-7 max-w-2xl font-sans text-[15px] leading-relaxed text-ink-100 sm:text-[18px]">
            {SUBHEADLINE}
          </p>

          <div className="mt-9 inline-flex flex-col items-center gap-3">
            <PaidCta className="w-full sm:w-auto" />
            <p className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
              Bonuses included · Limited seats per session · 7-day guarantee
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* AUTHORITY BAR                                                         */
/* --------------------------------------------------------------------- */
function AuthorityBar() {
  return (
    <section className="border-y border-white/[0.05] bg-white/[0.015]">
      <div className="container-tight py-8 sm:py-10">
        <div className="grid grid-cols-3 gap-4 text-center sm:gap-10">
          {AUTHORITY.map((a) => (
            <div key={a.label}>
              <div className="font-serif text-2xl tracking-tight text-white sm:text-4xl">
                {a.num}
              </div>
              <div className="mt-2 font-sans text-[10px] uppercase tracking-[0.22em] text-ink-200 sm:text-[11px]">
                {a.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* WHAT IS BOSSLABS AI — restored                                        */
/* --------------------------------------------------------------------- */
function WhatIsSection() {
  return (
    <section className="border-t border-white/[0.05] py-20 sm:py-28">
      <div className="container-tight">
        <div className="grid items-start gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div>
            <div className="eyebrow">{WHAT_IS.eyebrow}</div>
            <h2 className="h-section mt-5">
              We turn existing Filipino businesses into{' '}
              <span className="accent-italic">tech-enabled command centers.</span>
            </h2>
            <div className="mt-8 space-y-5 sm:mt-10 sm:space-y-6">
              {WHAT_IS.body.map((p) => (
                <p key={p} className="lead">
                  {p}
                </p>
              ))}
            </div>
            <blockquote className="mt-10 border-l-2 border-cyan-500/60 pl-5 font-serif text-xl italic leading-snug text-white sm:mt-12 sm:pl-6 sm:text-2xl md:text-3xl">
              {WHAT_IS.pullquote}
            </blockquote>
          </div>

          {/* Right — AppsStack visual */}
          <div className="relative">
            <AppsStack />
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* 2 — TRAINING PILLARS                                                  */
/* --------------------------------------------------------------------- */
function Pillars() {
  return (
    <section className="border-t border-white/[0.05] py-20 sm:py-28">
      <div className="container-tight">
        <div className="mx-auto max-w-2xl text-center">
          <div className="eyebrow justify-center">In 90 minutes, you will learn</div>
          <h2 className="h-section mt-5">
            The three moves that turn your business into a{' '}
            <span className="accent-italic">tech-enabled machine.</span>
          </h2>
        </div>

        <div className="mt-12 grid gap-6 sm:mt-14 md:grid-cols-3">
          {PILLARS.map((p, i) => {
            const Icon = [PillarReplacementIcon, PillarMathIcon, PillarMultiplierIcon][i];
            return (
              <article
                key={p.n}
                className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6 shadow-card backdrop-blur-sm transition hover:border-cyan-500/30 sm:p-8"
              >
                {/* Top icon + number */}
                <div className="flex items-center justify-between">
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/[0.06] sm:h-20 sm:w-20">
                    {Icon ? <Icon size={48} className="sm:hidden" /> : null}
                    {Icon ? <Icon size={56} className="hidden sm:block" /> : null}
                  </div>
                  <div className="font-serif text-3xl italic text-cyan-400/60 sm:text-4xl">
                    {p.n}
                  </div>
                </div>

                <h3 className="mt-6 font-serif text-xl leading-snug text-white sm:text-2xl">
                  {p.brand}
                </h3>
                <p className="mt-2 font-sans text-[13px] leading-snug text-cyan-300/90 sm:text-[14px]">
                  {p.promise}
                </p>
                <p className="mt-4 font-sans text-[14px] leading-relaxed text-ink-100 sm:text-[15px]">
                  {p.body}
                </p>

                {/* Bottom-right corner accent */}
                <div className="pointer-events-none absolute -bottom-12 -right-12 h-32 w-32 rounded-full bg-cyan-500/[0.06] blur-3xl" />
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* THE MANIFESTO — restored                                              */
/* --------------------------------------------------------------------- */
function ManifestoBlock() {
  return (
    <section className="border-t border-white/[0.05] py-20 sm:py-28">
      <div className="container-narrow">
        <div className="eyebrow">The manifesto</div>
        <p className="manifesto mt-7 sm:mt-8">
          We believe every Filipino business owner deserves the same superpowers as a
          Silicon Valley founder.
        </p>
        <p className="manifesto mt-5 text-ink-100 sm:mt-6">
          You should not need a <span className="accent-italic">₱500K</span> dev team to
          add a feature. You should not wait 6 months to fix your CRM. You should not
          depend on foreign agencies to build tools made for our market.
        </p>
        <p className="manifesto mt-5 text-ink-100 sm:mt-6">
          You need <span className="accent-italic">Claude Code</span> — and one night to
          learn how to use it.
        </p>
        <p className="manifesto mt-5 text-ink-200 sm:mt-6">
          That is exactly what this webinar is for. Do not miss it.
        </p>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* FOUNDERS DETAIL — HUD-style portrait cards                            */
/* --------------------------------------------------------------------- */
type Founder = (typeof FOUNDERS)[number];

function FounderCard({ founder }: { founder: Founder }) {
  const initials = founder.name
    .split(' ')
    .map((n) => n[0])
    .join('');

  return (
    <article className="group relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-ink-800/95 to-ink-900 p-5 shadow-card transition hover:border-cyan-500/40 sm:p-7">
      {/* Corner brackets — HUD frame */}
      <Bracket className="absolute left-3 top-3" />
      <Bracket className="absolute right-3 top-3 rotate-90" />
      <Bracket className="absolute left-3 bottom-3 -rotate-90" />
      <Bracket className="absolute right-3 bottom-3 rotate-180" />

      <div className="grid items-center gap-5 sm:grid-cols-[140px_1fr] sm:gap-6">
        {/* Stylized portrait — initials in cyan ring with status dot */}
        <div className="relative mx-auto h-32 w-32 sm:mx-0 sm:h-[140px] sm:w-[140px]">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border border-cyan-500/30" />
          {/* Inner ring with gradient fill */}
          <div className="absolute inset-2 rounded-full border border-cyan-500/50 bg-gradient-to-br from-cyan-500/[0.18] to-ink-900" />
          {/* Initials */}
          <div className="absolute inset-0 flex items-center justify-center font-serif text-4xl italic text-white sm:text-5xl">
            {initials}
          </div>
          {/* Pulsing online dot */}
          <div className="absolute bottom-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 ring-2 ring-[#06070A]">
            <span className="absolute inline-block h-4 w-4 animate-ping rounded-full bg-emerald-400 opacity-60" />
          </div>
          {/* Tiny callout arc */}
          <svg className="absolute -right-2 top-1 text-cyan-400/60" width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path d="M28 4 L24 4 L24 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        {/* Identity */}
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-400 sm:text-[11px]">
            Operator profile
          </div>
          <h3 className="mt-2 font-serif text-2xl leading-tight text-white sm:text-3xl">
            {founder.name}
          </h3>
          <p className="mt-1 font-sans text-[11px] uppercase tracking-[0.18em] text-ink-200 sm:text-[12px]">
            {founder.role}
          </p>
          <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-emerald-300 sm:text-[11px]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Currently shipping
          </div>
        </div>
      </div>

      {/* Bio */}
      <p className="mt-5 font-sans text-[14px] leading-relaxed text-ink-100 sm:mt-6 sm:text-[15px]">
        {founder.bio}
      </p>

      {/* Shipped chips */}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.06] pt-5">
        <div className="w-full text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
          Shipped recently
        </div>
        {founder.shipped.map((s) => (
          <span
            key={s}
            className="rounded-full border border-cyan-500/25 bg-cyan-500/[0.05] px-2.5 py-1 font-sans text-[10px] uppercase tracking-[0.16em] text-cyan-200 sm:text-[11px]"
          >
            {s}
          </span>
        ))}
      </div>

      {/* Expertise bars */}
      <div className="mt-5 space-y-2.5">
        <div className="text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
          Stack expertise
        </div>
        {founder.expertise.map((e) => (
          <div key={e.label} className="grid grid-cols-[120px_1fr_36px] items-center gap-3 sm:grid-cols-[140px_1fr_44px]">
            <div className="font-sans text-[11px] text-ink-100 sm:text-[12px]">{e.label}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500/60 to-cyan-300"
                style={{ width: `${e.value}%` }}
              />
            </div>
            <div className="text-right font-mono text-[10px] text-cyan-300 sm:text-[11px]">
              {e.value}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function Bracket({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={`text-cyan-400/70 ${className}`} aria-hidden>
      <path d="M1 5 V1 H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function FoundersDetail() {
  return (
    <section className="border-t border-white/[0.05] py-20 sm:py-24">
      <div className="container-tight">
        <div className="mx-auto max-w-2xl text-center">
          <div className="eyebrow justify-center">Meet your hosts</div>
          <h2 className="h-section mt-5">
            Two Filipino operators. <span className="accent-italic">No gurus.</span>
          </h2>
          <p className="lead mt-5">
            We do not sell what we have not run. Every framework on the call is a system
            we use ourselves — every day, in our own companies.
          </p>
        </div>
        <div className="mt-12 grid gap-8 sm:mt-14 sm:grid-cols-2 sm:gap-10">
          {FOUNDERS.map((f) => (
            <FounderCard key={f.name} founder={f} />
          ))}
        </div>

        {/* CTA #2 — placed right after Meet Your Host per spec */}
        <div className="mt-14 flex flex-col items-center gap-3">
          <PaidCta className="w-full sm:w-auto" />
          <p className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
            Live on Zoom · {WEBINAR.date} · {WEBINAR.time} {WEBINAR.timezone}
          </p>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* WORKFLOW DIAGRAM — restored                                           */
/* --------------------------------------------------------------------- */
function WorkflowDiagram() {
  return (
    <section className="border-t border-white/[0.05] py-20 sm:py-28">
      <div className="container-tight">
        <div className="max-w-2xl">
          <div className="eyebrow">The workflow</div>
          <h2 className="h-section mt-5">
            From <span className="accent-italic">idea</span> to shipped app — in 6 steps.
          </h2>
          <p className="lead mt-5 sm:mt-6">
            Same loop we use every week. By the end of the webinar, you will have your
            own AI Coding workflow — and your first deployed app.
          </p>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-white/[0.08] sm:mt-14 sm:rounded-3xl">
          {LAYERS.map((l, i) => {
            const Icon = [
              WorkflowSetupIcon,
              WorkflowSpecIcon,
              WorkflowBuildIcon,
              WorkflowShipIcon,
              WorkflowIterateIcon,
              WorkflowCompoundIcon,
            ][i];
            return (
              <div
                key={l.n}
                className="border-b border-white/[0.06] bg-gradient-to-r from-white/[0.015] to-transparent px-5 py-6 transition hover:from-cyan-500/[0.06] last:border-b-0 sm:px-10 sm:py-8"
              >
                <div className="sm:grid sm:grid-cols-[64px_140px_180px_1fr] sm:items-center sm:gap-6">
                  {/* Icon tile */}
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] sm:h-14 sm:w-14">
                    {Icon ? <Icon size={32} /> : null}
                  </div>

                  {/* Mobile: number + name inline; desktop: separate columns */}
                  <div className="mt-3 flex items-baseline gap-4 sm:mt-0 sm:block">
                    <div className="font-serif text-3xl italic leading-none text-cyan-400/80 sm:text-4xl">
                      {l.n}
                    </div>
                    <h3 className="font-serif text-xl text-white sm:hidden">{l.name}</h3>
                  </div>
                  <h3 className="hidden font-serif text-2xl text-white sm:block sm:text-3xl">
                    {l.name}
                  </h3>
                  <p className="mt-3 font-sans text-[14px] leading-relaxed text-ink-100 sm:mt-0 sm:text-[15px]">
                    {l.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-center font-sans text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
          One night · One install · You ship before you sleep
        </p>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* WHAT IS CLAUDE CODE — restored                                        */
/* --------------------------------------------------------------------- */
function ClaudeCodeExplainer() {
  return (
    <section className="border-t border-white/[0.05] py-20 sm:py-28">
      <div className="container-tight">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          {/* Left — copy */}
          <div>
            <div className="eyebrow">What is Claude Code</div>
            <h2 className="h-section mt-5">
              The shortcut to becoming{' '}
              <span className="accent-italic">tech-enabled.</span>
            </h2>
            <p className="lead mt-6 sm:mt-7">
              Claude Code is a terminal-based AI coding assistant. You describe the tool
              you want — CRM, dashboard, AI chatbot, internal app — and it builds it. You
              just review, test, and deploy.
            </p>
            <p className="lead mt-4 text-ink-200 sm:mt-5">
              It is not a magic button that runs your business for you. It is a{' '}
              <span className="text-white">multiplier</span> for the operator who is
              willing to learn the right prompts and workflow.
            </p>

            {/* Mini stat row */}
            <div className="mt-8 grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-6 sm:mt-10 sm:gap-6">
              <MiniStat num="~$20" label="Per month" />
              <MiniStat num="0" label="Lines of code" />
              <MiniStat num="∞" label="Tools you can ship" />
            </div>
          </div>

          {/* Right — Terminal mockup */}
          <div className="relative">
            <TerminalMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniStat({ num, label }: { num: string; label: string }) {
  return (
    <div>
      <div className="font-serif text-2xl tracking-tight text-white sm:text-3xl">{num}</div>
      <div className="mt-1 font-sans text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
        {label}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* YOUR TICKET INCLUDES — reframed Free Gift for paid context            */
/* --------------------------------------------------------------------- */
function YourTicketIncludes() {
  return (
    <section className="border-t border-white/[0.05] py-20 sm:py-28">
      <div className="container-tight">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.06] to-transparent p-6 shadow-glow sm:p-10">
            <div className="grid items-center gap-10 sm:gap-12 md:grid-cols-[1fr_1.2fr]">
              <div className="order-2 md:order-1">
                <StarterPackMockup />
              </div>

              <div className="order-1 md:order-2">
                <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">
                  Bonuses included · {FREE_GIFT.worth}
                </div>
                <h2 className="mt-3 font-serif text-2xl leading-snug text-white sm:text-3xl md:text-4xl">
                  Your ticket includes <span className="accent-italic">{FREE_GIFT.name}.</span>
                </h2>
                <ul className="mt-5 space-y-3 sm:mt-6">
                  {FREE_GIFT.bullets.map((b) => (
                    <li
                      key={b}
                      className="flex items-start gap-3 font-sans text-[14px] leading-relaxed text-ink-100 sm:text-[15px]"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-[3px] flex-none text-cyan-400">
                        <path
                          d="M5 12.5l4.5 4.5L19 7.5"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>{b}</span>
                    </li>
                  ))}
                  <li className="flex items-start gap-3 font-sans text-[14px] leading-relaxed text-ink-100 sm:text-[15px]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-[3px] flex-none text-cyan-400">
                      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Founder Workflow Audit Checklist</span>
                  </li>
                  <li className="flex items-start gap-3 font-sans text-[14px] leading-relaxed text-ink-100 sm:text-[15px]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-[3px] flex-none text-cyan-400">
                      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>48-hour Zoom replay access</span>
                  </li>
                </ul>
                <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/5 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-cyan-300 sm:text-[11px]">
                  Delivered the moment you reserve · Sent to your inbox
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* STUDENT WINS                                                          */
/* --------------------------------------------------------------------- */
type Win = (typeof WINS)[number];

function WinCard({ win }: { win: Win }) {
  const CategoryIcon = {
    agency: CategoryAgencyIcon,
    ecom: CategoryEcomIcon,
    saas: CategorySaasIcon,
    studio: CategoryStudioIcon,
    retail: CategoryRetailIcon,
    bpo: CategoryBpoIcon,
  }[win.category];

  return (
    <figure className="group relative rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.005] p-6 shadow-card backdrop-blur-sm transition hover:border-cyan-500/30 sm:p-7">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/25 bg-cyan-500/[0.06]">
          <CategoryIcon size={18} />
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/[0.08] px-3 py-1 font-sans text-[10px] uppercase tracking-[0.18em] text-cyan-300 sm:text-[11px]">
          <span className="inline-block h-1 w-1 rounded-full bg-cyan-300" />
          {win.result}
        </div>
      </div>

      <blockquote className="mt-5 font-serif text-base leading-snug text-white sm:text-lg">
        "{win.quote}"
      </blockquote>

      <figcaption className="mt-6 border-t border-white/[0.06] pt-4">
        <div className="font-sans text-[12px] tracking-tight text-white sm:text-[13px]">
          {win.name}
        </div>
        <div className="mt-1 font-sans text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
          {win.detail}
        </div>
      </figcaption>
    </figure>
  );
}

function Wins() {
  return (
    <section className="border-t border-white/[0.05] py-20 sm:py-28">
      <div className="container-tight">
        <div className="mx-auto max-w-2xl text-center">
          <div className="eyebrow justify-center">Filipino operators who joined</div>
          <h2 className="h-section mt-5">
            <span className="accent-italic">Real wins</span> from real businesses.
          </h2>
          <p className="lead mt-5">
            Six of three thousand. Industries, cities, and timeframes vary — the move is
            the same.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:mt-14 md:grid-cols-2 lg:grid-cols-3">
          {WINS.map((w, i) => (
            <WinCard key={i} win={w} />
          ))}
        </div>

        <p className="mt-10 text-center font-sans text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
          Names changed at student request · Real screenshots and video case studies inside the Messenger group
        </p>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* 6 — FINAL URGENCY BLOCK                                               */
/* --------------------------------------------------------------------- */
function FinalUrgency() {
  return (
    <section className="border-t border-danger-700/40 bg-gradient-to-b from-danger-900/20 via-transparent to-transparent py-20 sm:py-28">
      <div className="container-tight">
        <div className="mx-auto max-w-3xl text-center">
          <div className="eyebrow-danger justify-center">
            <span className="pulse-dot" />
            Last call · Seats fill before the live date
          </div>

          {/* Seats remaining counter */}
          <div className="mx-auto mt-6 inline-flex items-center gap-3 rounded-full border border-danger-500/40 bg-danger-900/30 px-4 py-2 sm:gap-4">
            <span className="pulse-dot" />
            <span className="font-sans text-[11px] uppercase tracking-[0.22em] text-danger-200 sm:text-[12px]">
              Only <span className="font-serif text-base text-white sm:text-lg">23</span>{' '}
              of <span className="text-ink-100">200</span> seats left this session
            </span>
          </div>

          <div className="mt-8 inline-block rounded-3xl border border-danger-700/40 bg-[#06070A] px-6 py-8 sm:mt-10 sm:px-10 sm:py-10">
            <CountdownDisplay startsAtIso={WEBINAR.startsAtIso} />
            <p className="mt-6 font-sans text-[10px] uppercase tracking-[0.22em] text-danger-200 sm:text-[11px]">
              Until your session goes live
            </p>
          </div>

          <h2 className="h-section mt-12">
            One night. One build. One business that{' '}
            <span className="accent-italic">stops waiting on developers.</span>
          </h2>
          <p className="lead mt-5">
            You will learn how to ship your first AI-powered app in 24 hours — without
            writing a single line of code, and without a developer team.
          </p>

          {/* Price anchor */}
          <div className="mx-auto mt-10 inline-flex items-baseline gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 py-4 sm:gap-6 sm:px-8 sm:py-5">
            <div className="text-left">
              <div className="text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
                Regular ticket
              </div>
              <div className="mt-1 font-serif text-2xl text-ink-300 line-through sm:text-3xl">
                {OFFER.main.crossed}
              </div>
            </div>
            <div className="font-serif text-3xl text-ink-300/50">→</div>
            <div className="text-left">
              <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-400 sm:text-[11px]">
                Today only
              </div>
              <div className="mt-1 font-serif text-3xl tracking-tight text-white sm:text-5xl">
                {OFFER.main.label}
              </div>
            </div>
          </div>

          <div className="mt-8 inline-flex w-full flex-col items-center gap-3 sm:w-auto">
            <PaidCta className="w-full sm:w-auto" />
            <p className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
              7-day refund · Cards · GCash · Maya · GrabPay
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

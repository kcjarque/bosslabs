/**
 * OptInPageB — VARIATION B of the homepage split test. A full conversion-first
 * rebuild ($100k-agency direction): same locked brand palette, new type system
 * (Space Grotesk display / Inter body / JetBrains Mono accents), bento proof
 * grids, count-up stats, self-typing terminal, sticky CTA, FAQ + qualifier
 * sections, animated price anchor. One goal: Reserve a Seat → /checkout.
 *
 * CONTROL (components/OptInPage.tsx) is untouched. Traffic split is decided in
 * app/page.tsx via the webinar funnel's homeVariantPct (0% until released).
 * Design system documented in DESIGN.md.
 */
import Image from 'next/image';
import { CountdownMini } from '../CountdownBar';
import { Logo } from '../Logo';
import { Mark } from '../Mark';
import { MinimalFooter } from '../OptInPage';
import { monoFont } from './fonts';
import {
  CTAButton,
  CountUp,
  Faq,
  PriceAnchor,
  Reveal,
  ScrollMilestones,
  SnapRow,
  StickyCtaB,
} from './kit';
import { TerminalLive } from './TerminalLive';
import { HeroAmbient, ScrollProgress, SectionAmbient, SmoothScroll } from './AmbientB';
import {
  AUTHORITY,
  FOUNDERS,
  FREE_GIFT,
  HEADLINE,
  LAYERS,
  OFFER,
  OUR_APPS,
  PILLARS,
  STUDENT_BUILDS,
  SUBHEADLINE,
  WHAT_IS,
  WINS,
} from '@/lib/config';
import type { WebinarInfo } from '@/lib/webinar';

/* Grain — the texture detail that separates premium from flat. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

// Display = Instrument Serif (the control's display face, already loaded
// globally as font-serif). Single 400 weight — never faux-bolded.
const display = `font-serif font-normal`;
const mono = `font-[family-name:var(--font-vb-mono)]`;

export function OptInPageB({ webinar }: { webinar: WebinarInfo }) {
  return (
    <div className={`${monoFont.variable} relative bg-[#06070A]`}>
      {/* grain overlay across the whole dark canvas */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] opacity-[0.035] mix-blend-overlay"
        style={{ backgroundImage: GRAIN }}
      />
      <div className="relative z-[2]">
        <ScrollMilestones />
        <ScrollProgress />
        <SmoothScroll />
        <HeaderB />
        <main>
          <HeroB2 webinar={webinar} />
          <StatBar />
          <Manifesto />
          <AppsBento />
          <Secrets />
          <Hosts />
          <VisionLoop />
          <TerminalSection />
          <SkillsPack />
          <Testimonials />
          <FaqSection />
          <WhoFor />
          <FinalClose webinar={webinar} />
        </main>
        <MinimalFooter />
        <StickyCtaB price={OFFER.main.label} />
      </div>
    </div>
  );
}

/* ─── header — logo + CTA only, nothing pulls away ────────────────────── */

function HeaderB() {
  return (
    <header className="border-b border-white/[0.05] bg-[#06070A]/80 backdrop-blur-md">
      <div className="container-tight flex h-16 items-center justify-between">
        <div className="inline-flex items-center gap-3">
          <Mark size={26} />
          <Logo size="md" />
        </div>
        <a
          href="/checkout"
          className={`${mono} hidden rounded-lg border border-cyan-500/40 px-4 py-2 text-[13px] text-cyan-300 transition hover:bg-cyan-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 sm:block`}
        >
          Reserve · {OFFER.main.label}
        </a>
      </div>
    </header>
  );
}

/* ─── hero — the 5-second test ────────────────────────────────────────── */

function HeroB2({ webinar }: { webinar: WebinarInfo }) {
  const facts = [
    { k: 'WHEN', v: webinar.date, s: `${webinar.time} ${webinar.timezone}` },
    { k: 'WHERE', v: 'Live on Zoom', s: 'Not a recorded session' },
    { k: 'LENGTH', v: '2-Hour Workshop', s: 'Live & hands-on' },
    { k: 'FORMAT', v: 'Live Demo', s: 'Launch real apps' },
  ];
  return (
    <section className="relative isolate overflow-hidden">
      {/* living background — grid pan, twinkle particles, parallax orbs, beam */}
      <HeroAmbient />
      <div className="container-tight relative z-10 pb-14 pt-10 sm:pb-20 sm:pt-16">
        <div className="mx-auto max-w-4xl text-center">
          <div className={`${mono} inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/[0.07] px-4 py-1.5 text-[10px] uppercase tracking-[0.18em] text-cyan-300 sm:text-[11px]`}>
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
            Live on Zoom · {webinar.date} · {webinar.time} {webinar.timezone}
          </div>

          <h1 className={`${display} mt-7 text-[36px] leading-[1.06] tracking-[-0.01em] text-white sm:text-[56px] md:text-[66px]`}>
            {HEADLINE.prefix}{' '}
            <span className="accent-italic">{HEADLINE.outcome}</span>{' '}
            {HEADLINE.mechanismPrefix} {HEADLINE.mechanism} —{' '}
            <span className="accent-italic">
              {HEADLINE.objectionPrefix} {HEADLINE.objection}
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-ink-100 sm:text-[17px]">
            {SUBHEADLINE}
          </p>

          <div className="mt-8">
            <CTAButton
              placement="hero"
              sub={
                <span className={mono}>
                  GCash · Maya · Cards &nbsp;·&nbsp; 7-day money-back guarantee
                </span>
              }
            >
              Reserve a Seat — {OFFER.main.label}
            </CTAButton>
          </div>

          {/* credible urgency — real session countdown + honest seat note */}
          <div className="mt-6 flex flex-col items-center gap-2">
            <CountdownMini startsAtIso={webinar.startsAtIso} />
            <p className={`${mono} text-[10px] uppercase tracking-[0.2em] text-ink-300`}>
              Until this session goes live · Only{' '}
              <span className="text-white">23 of 200 seats</span> remain
            </p>
          </div>

          {/* session bento — scannable in one glance on a phone */}
          <div className="mt-10 grid grid-cols-2 gap-3 text-left lg:grid-cols-4">
            {facts.map((card, i) => (
              <Reveal key={card.k} delay={i * 70}>
                <div className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 transition-colors hover:border-cyan-500/40 sm:p-5">
                  <div className={`${mono} text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300`}>
                    {card.k}
                  </div>
                  <div className="mt-2 text-[15px] font-semibold text-white sm:text-[17px]">
                    {card.v}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-300 sm:text-[13px]">{card.s}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── stat bar — numbers earn themselves ──────────────────────────────── */

function StatBar() {
  return (
    <section className="border-y border-white/[0.06] bg-white/[0.015]">
      <div className="container-tight grid grid-cols-3 divide-x divide-white/[0.06] py-8 sm:py-10">
        {AUTHORITY.map((a) => {
          const m = a.num.match(/^(₱?)(\d+)(.*)$/);
          return (
            <div key={a.label} className="px-3 text-center sm:px-6">
              <div className={`${mono} text-2xl font-semibold text-white sm:text-4xl`}>
                {m ? (
                  <CountUp to={Number(m[2])} prefix={m[1]} suffix={m[3]} />
                ) : (
                  a.num
                )}
              </div>
              <div className="mt-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-300 sm:text-[11px]">
                {a.label}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─── manifesto — editorial voice ─────────────────────────────────────── */

function Manifesto() {
  return (
    <section className="container-tight py-16 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <div className={`${mono} text-[11px] uppercase tracking-[0.24em] text-cyan-400`}>
            {WHAT_IS.eyebrow}
          </div>
          <h2 className={`${display} mt-4 text-[30px] leading-[1.1] tracking-[-0.01em] text-white sm:text-[42px]`}>
            Bawal ang <span className="text-cyan-400">hao shao.</span>
          </h2>
        </Reveal>
        <div className="mt-7 space-y-5">
          {WHAT_IS.body.map((p, i) => (
            <Reveal key={i} delay={i * 90}>
              <p className="text-[15px] leading-[1.75] text-ink-100 sm:text-[17px]">{p}</p>
            </Reveal>
          ))}
        </div>
        <Reveal delay={150}>
          <blockquote className="mt-9 border-l-2 border-cyan-500 pl-5 sm:pl-6">
            <p className={`${display} text-[22px] leading-snug text-white sm:text-[28px]`}>
              {WHAT_IS.pullquote}
            </p>
          </blockquote>
        </Reveal>
      </div>

      {/* the receipts — the pull-quote's promise, delivered immediately:
          real student systems built in past sessions, still live right now */}
      <div className="mx-auto mt-10 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {STUDENT_BUILDS.map((b, i) => (
          <Reveal key={b.name} delay={i * 100}>
            <a
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] transition-all hover:-translate-y-1 hover:border-cyan-500/40 hover:[box-shadow:0_18px_50px_-18px_rgba(0,184,230,0.35)]"
            >
              {/* browser chrome frame */}
              <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
                <span className="h-2 w-2 rounded-full bg-red-400/60" />
                <span className="h-2 w-2 rounded-full bg-yellow-400/60" />
                <span className="h-2 w-2 rounded-full bg-emerald-400/60" />
                <span className={`${mono} ml-2 truncate text-[10px] text-ink-400`}>
                  {b.url.replace('https://', '')}
                </span>
                <span className={`${mono} ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-emerald-300`}>
                  <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" /> Live
                </span>
              </div>
              <div className="relative aspect-[16/9] overflow-hidden">
                <Image
                  src={b.img}
                  alt={`${b.name} — ${b.tag}`}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
                />
              </div>
              <div className="flex items-center justify-between px-5 py-4">
                <div>
                  <div className="text-[16px] font-semibold text-white">{b.name}</div>
                  <div className="text-[12px] text-ink-300">{b.tag}</div>
                </div>
                <span className={`${mono} text-[12px] text-cyan-300 transition group-hover:translate-x-0.5`}>
                  See it live ↗
                </span>
              </div>
            </a>
          </Reveal>
        ))}
      </div>
      <Reveal delay={120}>
        <p className={`${mono} mt-5 text-center text-[11px] uppercase tracking-[0.18em] text-ink-300`}>
          Built live with students in past sessions · still running right now — tap to open
        </p>
      </Reveal>
    </section>
  );
}

/* ─── apps bento — the strongest proof, made the centerpiece ──────────── */

function AppsBento() {
  return (
    <section className="relative overflow-hidden border-y border-white/[0.06] bg-white/[0.012] py-16 sm:py-24">
      <SectionAmbient className="left-[6%] top-[10%]" />
      <SectionAmbient className="right-[4%] bottom-[8%]" />
      <div className="container-tight">
        <Reveal>
          <SectionHead
            eyebrow="Our production apps"
            title={
              <>
                5 real businesses. 5 real systems. <span className="text-cyan-400">100% AI-coded.</span>
              </>
            }
            sub="Not mockups — these run real operations today. Every one built with Claude Code by the founders."
          />
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {OUR_APPS.map((app, i) => {
            const big = i === 0;
            return (
              <Reveal
                key={app.slug}
                delay={i * 70}
                className={big ? 'sm:col-span-2 lg:col-span-2 lg:row-span-1' : ''}
              >
                <div className="group h-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0A0C12] transition-all hover:-translate-y-1 hover:border-cyan-500/40 hover:[box-shadow:0_18px_50px_-18px_rgba(0,184,230,0.3)]">
                  <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
                    <span className={`${mono} truncate text-[10px] text-ink-400`}>{app.hint}</span>
                    <span
                      className={`${mono} ml-auto flex-none rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-ink-200`}
                    >
                      {app.built} · 100% AI Coded
                    </span>
                  </div>
                  {app.screenshot && (
                    <div className={`relative overflow-hidden ${big ? 'aspect-[21/9]' : 'aspect-[16/9]'}`}>
                      <Image
                        src={app.screenshot}
                        alt={`${app.name} — ${app.tagline}`}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
                      />
                    </div>
                  )}
                  <div className="px-5 py-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-[16px] font-semibold text-white">{app.name}</div>
                      <div className={`${mono} text-[13px] font-semibold`} style={{ color: app.accent }}>
                        {app.metric.value}
                      </div>
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-2">
                      <div className="text-[12px] text-ink-300">{app.business}</div>
                      <div className="text-[10px] text-ink-400">{app.metric.label}</div>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
        <Reveal delay={120}>
          <div className="mt-10">
            <CTAButton
              placement="apps-bento"
              sub={
                <span>
                  Lahat ng ito, built without hiring a single developer.{' '}
                  <span className="text-ink-100">Ikaw naman.</span>
                </span>
              }
            >
              Reserve a Seat — {OFFER.main.label}
            </CTAButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── the 3 secrets — distinct visual beats ───────────────────────────── */

function Secrets() {
  return (
    <section className="container-tight py-16 sm:py-24">
      <Reveal>
        <SectionHead eyebrow="The 3 secrets" title={<>What we actually teach inside.</>} />
      </Reveal>
      <div className="mt-10 space-y-5">
        {PILLARS.map((p, i) => (
          <Reveal key={p.n} delay={i * 90}>
            <div className="group grid gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 transition-colors hover:border-cyan-500/30 sm:grid-cols-[auto_1fr] sm:gap-8 sm:p-8">
              <div className={`${mono} text-4xl font-semibold text-cyan-500/40 transition-colors group-hover:text-cyan-400 sm:text-6xl`}>
                {p.n}
              </div>
              <div>
                <h3 className="text-[20px] font-bold leading-tight text-white sm:text-[26px]">
                  {p.brand}
                </h3>
                <p className={`${mono} mt-2 text-[12px] uppercase tracking-[0.14em] text-cyan-300 sm:text-[13px]`}>
                  {p.promise}
                </p>
                <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-ink-200 sm:text-[15px]">
                  {p.body}
                </p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ─── hosts — credibility design ──────────────────────────────────────── */

function Hosts() {
  return (
    <section className="relative overflow-hidden border-y border-white/[0.06] bg-white/[0.012] py-16 sm:py-24">
      <SectionAmbient className="left-[10%] top-[14%]" />
      <div className="container-tight">
        <Reveal>
          <SectionHead
            eyebrow="Your hosts"
            title={
              <>
                Two operators. <span className="text-cyan-400">Zero hao shao.</span>
              </>
            }
          />
        </Reveal>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {FOUNDERS.map((f, i) => (
            <Reveal key={f.name} delay={i * 100}>
              <div className="h-full rounded-2xl border border-white/[0.08] bg-[#0A0C12] p-6 sm:p-7">
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-white/10">
                    <Image src={f.photo} alt={f.name} fill sizes="64px" className="object-cover" />
                  </div>
                  <div>
                    <div className="text-[18px] font-bold text-white">{f.name}</div>
                    <div className={`${mono} text-[11px] uppercase tracking-[0.14em] text-cyan-300`}>
                      {f.role}
                    </div>
                  </div>
                  <span className={`${mono} ml-auto hidden items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-emerald-300 sm:inline-flex`}>
                    <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
                    Currently shipping
                  </span>
                </div>
                <p className="mt-4 text-[13px] leading-relaxed text-ink-200 sm:text-[14px]">{f.bio}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {f.shipped.map((s) => (
                    <span
                      key={s}
                      className={`${mono} rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-ink-200`}
                    >
                      {s}
                    </span>
                  ))}
                </div>
                <div className="mt-5 space-y-2.5">
                  {f.expertise.map((e) => (
                    <SkillBar key={e.label} label={e.label} value={e.value} />
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function SkillBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-ink-300">{label}</span>
        <span className={`${mono} text-[11px] text-cyan-300`}>{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <Reveal className="h-full">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-[width] duration-1000 ease-out"
            style={{ width: `${value}%` }}
          />
        </Reveal>
      </div>
    </div>
  );
}

/* ─── vision-to-reality — a loop, not a list ──────────────────────────── */

function VisionLoop() {
  return (
    <section className="container-tight py-16 sm:py-24">
      <Reveal>
        <SectionHead
          eyebrow="The Vision-to-Reality framework"
          title={
            <>
              From idea to shipped app — <span className="text-cyan-400">in 5 steps, on a loop.</span>
            </>
          }
        />
      </Reveal>
      <div className="relative mt-12">
        {/* connective line */}
        <div aria-hidden className="absolute left-[19px] top-2 hidden h-[calc(100%-1rem)] w-px bg-gradient-to-b from-cyan-500/50 via-cyan-500/20 to-cyan-500/50 sm:block" />
        <div className="space-y-4 sm:space-y-6">
          {LAYERS.map((l, i) => (
            <Reveal key={l.n} delay={i * 80}>
              <div className="relative flex gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 transition-colors hover:border-cyan-500/30 sm:ml-0 sm:gap-6 sm:p-6">
                <div className={`${mono} flex h-10 w-10 flex-none items-center justify-center rounded-full border border-cyan-500/40 bg-[#06070A] text-[13px] font-semibold text-cyan-300`}>
                  {l.n}
                </div>
                <div>
                  <h3 className="text-[17px] font-bold text-white sm:text-[19px]">{l.name}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-300 sm:text-[14px]">{l.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={420}>
          <div className={`${mono} mt-5 flex items-center gap-2 pl-1 text-[11px] uppercase tracking-[0.16em] text-cyan-400 sm:pl-[3.4rem]`}>
            <span aria-hidden>↺</span> Then loop — refine and repeat until it&rsquo;s exactly right
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── claude code + the live terminal — the wow moment ────────────────── */

function TerminalSection() {
  return (
    <section className="relative overflow-hidden border-y border-white/[0.06] bg-white/[0.012] py-16 sm:py-24">
      <SectionAmbient className="right-[10%] top-[16%]" />
      <div className="container-tight grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <Reveal>
          <div>
            <div className={`${mono} text-[11px] uppercase tracking-[0.24em] text-cyan-400`}>
              What is Claude Code
            </div>
            <h2 className={`${display} mt-4 text-[30px] leading-[1.1] tracking-[-0.01em] text-white sm:text-[40px]`}>
              The World&rsquo;s Best Developer — <span className="text-cyan-400">sitting in your terminal.</span>
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-100 sm:text-[16px]">
              You describe what your business needs in plain language. Claude Code architects it,
              writes every line, wires the database, and deploys it live — while you watch. This is
              the exact tool we use to ship production systems in under 24 hours.
            </p>
            <div className={`${mono} mt-5 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-ink-200`}>
              <span className="text-cyan-300">▸</span> The CRM on the right? Built in 19 min.
            </div>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <TerminalLive />
        </Reveal>
      </div>
    </section>
  );
}

/* ─── skills pack — value stack building to the price ─────────────────── */

function SkillsPack() {
  return (
    <section className="container-tight py-16 sm:py-24">
      <div className="mx-auto max-w-2xl">
        <Reveal>
          <SectionHead
            eyebrow="Included with your seat"
            title={
              <>
                {FREE_GIFT.name} — <span className="text-cyan-400">{FREE_GIFT.worth}.</span>
              </>
            }
            center
          />
        </Reveal>
        <Reveal delay={100}>
          <div className="mt-9 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
            {[...FREE_GIFT.bullets, ...OFFER.bonus.items.filter((b) => b.includes('replay') || b.includes('Audit'))].map(
              (b, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 border-b border-white/[0.05] px-5 py-3.5 last:border-0 sm:px-6"
                >
                  <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-cyan-500/15 text-[10px] text-cyan-300">
                    ✓
                  </span>
                  <span className="text-[14px] text-ink-100">{b}</span>
                </div>
              ),
            )}
            <div className="flex items-center justify-between bg-cyan-500/[0.06] px-5 py-4 sm:px-6">
              <span className={`${mono} text-[11px] uppercase tracking-[0.16em] text-ink-200`}>
                Total bonus value
              </span>
              <span className={`${mono} text-[19px] font-semibold text-cyan-300`}>₱4,997</span>
            </div>
          </div>
        </Reveal>
        <Reveal delay={160}>
          <p className="mt-4 text-center text-[12px] text-ink-300">{FREE_GIFT.unlockNote}</p>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── testimonials — result first, swipeable on mobile ────────────────── */

function Testimonials() {
  return (
    <section className="relative overflow-hidden border-y border-white/[0.06] bg-white/[0.012] py-16 sm:py-24">
      <SectionAmbient className="right-[8%] top-[12%]" />
      <div className="container-tight">
        <Reveal>
          <SectionHead
            eyebrow="Student wins"
            title={
              <>
                Real operators. <span className="text-cyan-400">Real numbers.</span>
              </>
            }
          />
        </Reveal>
        <div className="mt-10">
          <SnapRow>
            {WINS.map((w) => (
              <div
                key={w.name}
                className="w-[85%] flex-none snap-center rounded-2xl border border-white/[0.08] bg-[#0A0C12] p-6 md:w-auto"
              >
                <span className={`${mono} inline-block rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-300`}>
                  {w.result}
                </span>
                <p className="mt-4 text-[14px] leading-relaxed text-ink-100">&ldquo;{w.quote}&rdquo;</p>
                <div className="mt-5 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500/15 text-[12px] font-bold text-cyan-300">
                    {w.name.split(' ').map((n) => n[0]).join('')}
                  </span>
                  <div>
                    <div className="text-[13px] font-medium text-white">{w.name}</div>
                    <div className="text-[11px] text-ink-400">{w.detail}</div>
                  </div>
                </div>
              </div>
            ))}
          </SnapRow>
          <p className="mt-5 text-center text-[11px] text-ink-400">
            Names changed at student request · Real screenshots and video case studies inside the
            Messenger group
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─── FAQ — objection handling, operator voice ────────────────────────── */

function FaqSection() {
  const faqs = [
    {
      q: 'Hindi ako marunong mag-code — kakayanin ko ba?',
      a: 'Oo — designed for non-coders ito. Mismong sa workshop, makikita mo kung paano nagiging developer mo si Claude Code: ikaw ang nag-uutos in plain language, siya ang nagsusulat ng code. Karamihan ng students namin, zero coding background talaga.',
    },
    {
      q: 'Recorded ba ’to o live?',
      a: 'LIVE on Zoom — hindi recorded, hindi loop. May live build kami sa mismong session, sasagutin ang tanong mo real-time. Bawal ang hao shao: kung hindi namin kayang i-build live, hindi namin ibebenta.',
    },
    {
      q: 'Paano kung hindi ako maka-attend sa mismong oras?',
      a: 'Kasama sa ticket mo ang 7-day replay access — mapapanood mo ang buong session anytime sa loob ng isang linggo. Pero best experience pa rin ang live, para makapag-tanong ka.',
    },
    {
      q: 'Magkano talaga lahat-lahat?',
      a: (
        <>
          ₱999. Yun lang. Kasama na ang 2-hour live workshop, ang Claude Code Skills Pack (₱4,997
          value), at 7-day replay. Walang nakatagong charges — may optional 1:1 session pagkatapos
          kung gusto mo, pero hindi required.
        </>
      ),
    },
    {
      q: 'Legit ba ’to o hao shao?',
      a: 'Fair question — kaya nga live ang build. Makikita mo ang totoong sistema, ginagawa sa harap mo, hindi screenshots. Plus 7-day money-back guarantee: kung sa tingin mo walang kwenta, refund. Walang tanong-tanong.',
    },
    {
      q: 'Anong kailangan ko bago mag-join?',
      a: 'Laptop o desktop (para makasunod ka), Zoom, at isang business problem na gusto mong ma-solve. Wala kang kailangang i-install bago ang session — ituturo namin lahat from scratch.',
    },
  ];
  return (
    <section className="container-tight py-16 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <SectionHead
            eyebrow="Mga tanong mo, sagot namin"
            title={
              <>
                Bago ka mag-reserve — <span className="text-cyan-400">linawin natin.</span>
              </>
            }
            center
          />
        </Reveal>
        <Reveal delay={100}>
          <div className="mt-9">
            <Faq items={faqs} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── who this is for / not for — intent qualifier ────────────────────── */

function WhoFor() {
  const yes = [
    'Business owners na gustong gumawa ng sariling systems — built by the boss, hindi binili sa agency',
    'Operators na pagod na sa ₱300K–₱500K dev quotes at 6-month timelines',
    'Non-techies na seryosong matuto — kahit zero coding background',
    'May totoong business problem kang gusto ma-solve ngayon',
  ];
  const no = [
    'Naghahanap ng "get rich quick" — walang ganyan dito',
    'Gusto lang manood pero ayaw gumawa',
    'Naghahanap ng puro AI marketing tricks at prompts — hindi ito yun',
    'Ayaw maglaan ng 2 oras para matuto ng skill na panghabambuhay',
  ];
  return (
    <section className="border-y border-white/[0.06] bg-white/[0.012] py-16 sm:py-24">
      <div className="container-tight">
        <Reveal>
          <SectionHead
            eyebrow="Walang sayang na upuan"
            title={
              <>
                Para kanino &rsquo;to — <span className="text-cyan-400">at para kanino hindi.</span>
              </>
            }
            center
          />
        </Reveal>
        <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-2xl border border-cyan-500/25 bg-cyan-500/[0.04] p-6 sm:p-7">
              <div className={`${mono} text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300`}>
                ✓ Para sa&rsquo;yo ito kung…
              </div>
              <ul className="mt-4 space-y-3">
                {yes.map((t) => (
                  <li key={t} className="flex gap-3 text-[14px] leading-relaxed text-ink-100">
                    <span className="mt-0.5 text-cyan-400">✓</span> {t}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-7">
              <div className={`${mono} text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-300`}>
                ✕ Hindi ito para sa&rsquo;yo kung…
              </div>
              <ul className="mt-4 space-y-3">
                {no.map((t) => (
                  <li key={t} className="flex gap-3 text-[14px] leading-relaxed text-ink-300">
                    <span className="mt-0.5 text-ink-400">✕</span> {t}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ─── final close — anchor, guarantee, one CTA ────────────────────────── */

function FinalClose({ webinar }: { webinar: WebinarInfo }) {
  return (
    <section className="relative isolate overflow-hidden py-20 sm:py-28">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(50% 42% at 50% 100%, rgba(0,184,230,0.12), transparent 65%)',
        }}
      />
      <SectionAmbient className="left-1/2 top-[10%] -translate-x-1/2" />
      <div className="container-tight">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <div className={`${mono} text-[11px] uppercase tracking-[0.24em] text-cyan-400`}>
              {webinar.date} · {webinar.time} {webinar.timezone} · Live on Zoom
            </div>
            <h2 className={`${display} mt-5 text-[32px] leading-[1.08] tracking-[-0.01em] text-white sm:text-[46px]`}>
              One seat. One evening.
              <br />
              <span className="text-cyan-400">A skill na hindi na nila mababawi sa&rsquo;yo.</span>
            </h2>
          </Reveal>

          <Reveal delay={120}>
            <div className="mt-9">
              <PriceAnchor crossed={OFFER.main.crossed} price={OFFER.main.label} />
              <p className={`${mono} mt-2 text-[11px] uppercase tracking-[0.18em] text-ink-300`}>
                + {FREE_GIFT.worth} in bonuses, included
              </p>
            </div>
          </Reveal>

          {/* risk reversal — loud, confident, legible */}
          <Reveal delay={180}>
            <div className="mx-auto mt-9 max-w-lg rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-6 text-left sm:p-7">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-emerald-500/15 text-lg text-emerald-300">
                  🛡
                </span>
                <div className="text-[17px] font-bold text-white">
                  You risk nothing — 7-day money-back guarantee
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-200">
                Attend the workshop. Watch the live build. Kung sa tingin mo hindi sulit ang ₱999,
                email us within 7 days and we refund it in full. Walang tanong-tanong, walang
                drama. The risk is on us — as it should be.
              </p>
            </div>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-9">
              <CTAButton
                placement="final"
                sub={
                  <span className={mono}>
                    7-day refund · Cards · GCash · Maya &nbsp;·&nbsp; Only 23 of 200 seats left
                  </span>
                }
              >
                Reserve a Seat — {OFFER.main.label}
              </CTAButton>
            </div>
            <div className="mt-6 flex justify-center">
              <CountdownMini startsAtIso={webinar.startsAtIso} />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ─── shared section head ─────────────────────────────────────────────── */

function SectionHead({
  eyebrow,
  title,
  sub,
  center = false,
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub?: string;
  center?: boolean;
}) {
  return (
    <div className={center ? 'text-center' : ''}>
      <div className={`${mono} text-[11px] uppercase tracking-[0.24em] text-cyan-400`}>{eyebrow}</div>
      <h2 className={`${display} mt-4 max-w-3xl text-[28px] leading-[1.12] tracking-[-0.01em] text-white sm:text-[38px] ${center ? 'mx-auto' : ''}`}>
        {title}
      </h2>
      {sub && (
        <p className={`mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-300 sm:text-[15px] ${center ? 'mx-auto' : ''}`}>
          {sub}
        </p>
      )}
    </div>
  );
}

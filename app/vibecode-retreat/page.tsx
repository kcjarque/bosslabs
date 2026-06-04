import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { Mark } from '@/components/Mark';
import { getFunnels } from '@/lib/db';
import type { EventFunnelConfig } from '@/lib/db';
import { formatPHP } from '@/lib/config';
import { ReserveButton } from '@/components/ReserveButton';

// Force-dynamic so the page always reflects the latest funnel config edited
// in /admin/funnels (price/active). It's a single cached query — stays fast.
export const dynamic = 'force-dynamic';

const SLUG = 'vibecode-retreat';
const CARD_CHECKOUT_URL = 'https://checkout.xendit.co/od/bosslabs-vibecoderetreat';

export const metadata: Metadata = {
  title: 'VibeCode Retreat — Walk in with an idea. Walk out with an app.',
  description:
    'An invite-only, build-or-refund founder retreat. June 26–27, Antipolo City. 10 founders. 24 hours. Walk out with a real, custom app that raises your valuation.',
};

async function getRetreat() {
  const funnels = await getFunnels();
  return funnels.find((f) => f.slug === SLUG) ?? null;
}

export default async function VibeCodeRetreatPage() {
  const funnel = await getRetreat();
  if (!funnel || !funnel.active) notFound();
  const c = funnel.config as EventFunnelConfig;
  const priceCentavos = c.payInFullPriceCentavos ?? null;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#06070A] text-ink-200">
      <CinematicBackground />
      <RetreatHeader />
      <main className="relative z-10">
        <Hero priceCentavos={priceCentavos} />
        <WhatYouGet />
        <Bonuses />
        <FoundersNetwork />
        <BillionaireSession />
        <Payment priceCentavos={priceCentavos} />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Background — deep navy with cinematic cyan glow + faint grid          */
/* --------------------------------------------------------------------- */
function CinematicBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#06070A]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A1020] via-[#06070A] to-[#06070A]" />
      <div className="absolute -left-40 top-[-10%] h-[620px] w-[620px] rounded-full bg-cyan-500/[0.10] blur-[140px]" />
      <div className="absolute -right-40 top-[30%] h-[560px] w-[560px] rounded-full bg-indigo-500/[0.08] blur-[150px]" />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 75%)',
        }}
      />
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Shared building blocks                                                */
/* --------------------------------------------------------------------- */
function Eyebrow({ num, children }: { num: string; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.28em] sm:text-xs">
      <span className="text-cyan-400">{num}</span>
      <span className="h-px w-6 bg-cyan-400/50" />
      <span className="text-cyan-300/90">{children}</span>
    </div>
  );
}

function Display({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  // Heavy condensed uppercase — the slide headline voice.
  return (
    <h2
      className={`font-sans font-extrabold uppercase leading-[0.95] tracking-[-0.01em] text-white ${className}`}
    >
      {children}
    </h2>
  );
}

function GlowCard({
  icon,
  title,
  children,
  index,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  index?: string;
}) {
  return (
    <div className="group relative flex flex-col rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-5 transition hover:border-cyan-400/50 hover:from-cyan-500/[0.08] sm:p-6">
      {index && (
        <div className="mb-3 text-[11px] font-bold tracking-[0.2em] text-cyan-400/70">{index}</div>
      )}
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
        {icon}
      </div>
      <h3 className="mt-4 font-sans text-base font-bold uppercase leading-tight tracking-wide text-white">
        {title}
      </h3>
      <p className="mt-2 font-sans text-[13px] leading-relaxed text-ink-300 sm:text-sm">{children}</p>
    </div>
  );
}

function SpecBar({ items }: { items: { icon: React.ReactNode; top: string; bottom: string }[] }) {
  return (
    <div className="mt-10 rounded-2xl border border-cyan-500/20 bg-white/[0.02] px-5 py-4 sm:mt-12 sm:px-7 sm:py-5">
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 sm:justify-between">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
              {it.icon}
            </span>
            <div className="leading-tight">
              <div className="font-sans text-sm font-bold uppercase tracking-wide text-white">{it.top}</div>
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-400/80">{it.bottom}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Inline icons (single stroke, cyan)                                    */
/* --------------------------------------------------------------------- */
function I({ d, fill = false }: { d: string; fill?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'}>
      <path
        d={d}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
const IC = {
  code: <I d="M9 8l-4 4 4 4M15 8l4 4-4 4" />,
  workflow: <I d="M12 4v4M12 16v4M4 12h4M16 12h4M9 9h6v6H9z" />,
  people: <I d="M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3 3 0 100-6 3 3 0 000 6M21 19v-1a4 4 0 00-3-3.87M16 4.13A4 4 0 0116 11.87" />,
  chart: <I d="M4 19h16M7 16v-4M12 16V8M17 16v-7M5 11l5-5 4 3 5-6" />,
  person: <I d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8" />,
  network: <I d="M12 9a3 3 0 100-6 3 3 0 000 6M5 21a3 3 0 100-6 3 3 0 000 6M19 21a3 3 0 100-6 3 3 0 000 6M10.6 8.2l-3.2 5.6M13.4 8.2l3.2 5.6" />,
  handshake: <I d="M8 12l3 3 2-2 4 4M3 11l4-4 4 2 3-2 4 3v4l-4 4-3-2" />,
  rocket: <I d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M9 11a8 8 0 016-6c3 0 4 1 4 4a8 8 0 01-6 6l-2 .5L8.5 13z M14 8.5a1 1 0 100-2 1 1 0 000 2" />,
  chat: <I d="M21 11.5a8.38 8.38 0 01-9 8.34 8.5 8.5 0 01-3.8-.9L3 20l1.06-3.5A8.38 8.38 0 013 11.5 8.5 8.5 0 0112 3a8.38 8.38 0 019 8.5z" />,
  stars: <I d="M12 3l1.9 4 4.1.5-3 2.9.8 4.1L12 12.6 8.2 14.5l.8-4.1-3-2.9 4.1-.5z" />,
  crown: <I d="M3 7l4 4 5-6 5 6 4-4v11H3z" />,
  knight: <I d="M9 21h7M7 21c0-4 1-6 4-8 2-1.3 1-3 0-4l-2 1-1-2 4-3c3 0 5 2.5 5 6 0 5-3 7-3 10" />,
  target: <I d="M12 21a9 9 0 100-18 9 9 0 000 18M12 16a4 4 0 100-8 4 4 0 000 8M12 13a1 1 0 100-2 1 1 0 000 2" />,
  diamond: <I d="M6 3h12l3 5-9 13L3 8z M3 8h18M9 3l-3 5 6 13M15 3l3 5-6 13" />,
  calendar: <I d="M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1z" />,
  bed: <I d="M3 18v-6a2 2 0 012-2h10a4 4 0 014 4v4M3 14h18M3 18v2M21 18v2M7 10V8a1 1 0 011-1h3a1 1 0 011 1v2" />,
  pin: <I d="M12 21s7-5.2 7-11a7 7 0 10-14 0c0 5.8 7 11 7 11z M12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5" />,
  clock: <I d="M12 21a9 9 0 100-18 9 9 0 000 18M12 7v5l3 2" />,
  bolt: <I d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  refund: <I d="M3 12a9 9 0 109-9 9 9 0 00-6.5 2.8M3 4v4h4" />,
};

/* --------------------------------------------------------------------- */
/* Header                                                                */
/* --------------------------------------------------------------------- */
function RetreatHeader() {
  return (
    <header className="relative z-20 border-b border-white/[0.06] bg-[#06070A]/70 backdrop-blur-md">
      <div className="container-tight flex h-16 items-center justify-between">
        <div className="inline-flex items-center gap-3">
          <Mark size={26} />
          <Logo size="md" />
        </div>
        <span className="hidden text-[11px] uppercase tracking-[0.24em] text-cyan-400 sm:inline">
          VibeCode Retreat
        </span>
      </div>
    </header>
  );
}

/* --------------------------------------------------------------------- */
/* Hero                                                                  */
/* --------------------------------------------------------------------- */
function Hero({ priceCentavos }: { priceCentavos: number | null }) {
  const cards = [
    { icon: IC.calendar, k: 'WHEN', v: 'June 26–27, 10:00 AM', s: 'Friday to Saturday' },
    { icon: IC.people, k: 'WHO', v: 'Only 10 founders', s: 'Invite-only cohort' },
    { icon: IC.pin, k: 'WHERE', v: 'Antipolo City, Rizal', s: 'The best private villa' },
    { icon: IC.rocket, k: 'FORMAT', v: '24 straight hours', s: 'Build · Pitch · Ship' },
  ];
  return (
    <section className="relative">
      <div className="container-tight py-14 sm:py-20">
        <Eyebrow num="02">The Invitation</Eyebrow>
        <h1 className="mt-7 font-sans text-[40px] font-extrabold uppercase leading-[0.92] tracking-[-0.01em] text-white sm:text-[68px] md:text-[80px]">
          Walk in with an idea.
          <br />
          Walk out with an <span className="text-cyan-400">app</span> that{' '}
          <span className="text-cyan-400">raises your valuation.</span>
        </h1>
        <p className="mt-6 max-w-2xl font-sans text-lg text-ink-200 sm:text-xl">
          An invite-only, <span className="text-cyan-400">build-or-refund</span> founder retreat.
          {priceCentavos != null && (
            <>
              {' '}
              Your seat: <span className="font-semibold text-white">{formatPHP(priceCentavos)}</span>.
            </>
          )}
        </p>

        {/* WHEN / WHO / WHERE / FORMAT */}
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
          {cards.map((card) => (
            <div
              key={card.k}
              className="rounded-2xl border border-cyan-500/25 bg-white/[0.03] p-5"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                  {card.icon}
                </span>
                <span className="font-sans text-sm font-bold uppercase tracking-[0.18em] text-cyan-300">
                  {card.k}
                </span>
              </div>
              <div className="mt-4 font-sans text-[17px] font-semibold text-white">{card.v}</div>
              <div className="mt-1 text-[13px] text-ink-300">{card.s}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <a href="#secure-seat" className="btn-cyan !px-8 !py-3.5 text-base">
            Secure your seat →
          </a>
          <ReserveButton
            className="!border-cyan-500/40 !bg-transparent !text-cyan-200 hover:!bg-cyan-500/10"
            label="Apply for a slot"
          />
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* What you get                                                          */
/* --------------------------------------------------------------------- */
function WhatYouGet() {
  const items = [
    { icon: IC.code, t: 'Custom AI App', d: 'Built & deployed in 24 hours.', i: '01' },
    { icon: IC.workflow, t: 'Full AI Workflow', d: 'Integration to automate & scale your operations.', i: '02' },
    { icon: IC.people, t: 'Strategy Session', d: 'Shark-tank style strategy & pitch stress-test.', i: '03' },
    { icon: IC.chart, t: 'Valuation Positioning', d: 'Justify a higher asking price with confidence.', i: '04' },
    { icon: IC.person, t: '1-on-1 Consultation', d: 'A roadmap built around YOUR business.', i: '05' },
  ];
  return (
    <section className="container-tight py-14 sm:py-20">
      <Eyebrow num="03">What You Get</Eyebrow>
      <Display className="mt-5 text-[30px] sm:text-[46px]">
        The five things that actually move your
        <br className="hidden sm:block" /> business forward — <span className="text-cyan-400">in one weekend.</span>
      </Display>
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((it) => (
          <GlowCard key={it.t} icon={it.icon} title={it.t} index={it.i}>
            {it.d}
          </GlowCard>
        ))}
      </div>
      <SpecBar
        items={[
          { icon: IC.code, top: 'No Coding Required', bottom: 'Zero developers hired' },
          { icon: IC.clock, top: '24 Hours', bottom: 'Deep-dive session' },
          { icon: IC.people, top: '10 Founders', bottom: 'Invite-only' },
          { icon: IC.bolt, top: '10× Value', bottom: 'Guaranteed' },
        ]}
      />
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* Bonuses                                                               */
/* --------------------------------------------------------------------- */
function Bonuses() {
  const items = [
    { tag: 'Bonus 1', t: 'The Founder Network', d: 'Plug into a circle of serious builders — your next partner, client, or co-founder could be in that villa.' },
    { tag: 'Bonus 2', t: '2 Days in the Best Villa', d: 'Disappear from the noise and focus 100% on building, with nothing competing for your attention.' },
    { tag: 'Bonus 3', t: 'Unlimited Food & Alcohol', d: 'Fully catered for the full 24 hours — fuel the sprint and celebrate the win without ever leaving.' },
  ];
  return (
    <section className="container-tight py-14 sm:py-20">
      <Eyebrow num="04">But wait… here&rsquo;s more!</Eyebrow>
      <Display className="mt-5 text-[30px] sm:text-[46px]">
        Every seat also includes these — <span className="text-cyan-400">at zero extra cost.</span>
      </Display>
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {items.map((b) => (
          <div
            key={b.t}
            className="rounded-2xl border border-cyan-500/25 bg-gradient-to-b from-cyan-500/[0.06] to-white/[0.01] p-6"
          >
            <span className="inline-block rounded-md bg-cyan-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">
              {b.tag}
            </span>
            <h3 className="mt-4 font-sans text-xl font-bold uppercase tracking-wide text-white">{b.t}</h3>
            <p className="mt-3 font-sans text-sm leading-relaxed text-ink-300">{b.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* Founders network                                                      */
/* --------------------------------------------------------------------- */
function FoundersNetwork() {
  const items = [
    { icon: IC.people, t: 'Quality over Quantity', d: 'Handpicked founders building serious, high-potential businesses.' },
    { icon: IC.handshake, t: 'Trust & Confidentiality', d: 'Everything shared stays within the room. Always.' },
    { icon: IC.rocket, t: 'Collaborate. Referral. Grow.', d: 'Find co-founders, referrals, partners, and new opportunities.' },
    { icon: IC.chat, t: 'Real Conversations. Real Support.', d: 'No fluff. No ego. Just honest conversations and practical help.' },
    { icon: IC.stars, t: 'Lifelong Connections', d: 'Build relationships that last far beyond the retreat.' },
  ];
  return (
    <section className="container-tight py-14 sm:py-20">
      <Eyebrow num="04.1">Founders Network</Eyebrow>
      <Display className="mt-5 text-[34px] sm:text-[54px]">
        You don&rsquo;t have to <span className="text-cyan-400">build alone.</span>
      </Display>
      <p className="mt-5 max-w-xl text-lg text-ink-200">
        Surround yourself with ambitious founders, operators, and builders{' '}
        <span className="text-cyan-400">who get it.</span>
      </p>
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((it) => (
          <GlowCard key={it.t} icon={it.icon} title={it.t}>
            {it.d}
          </GlowCard>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* Billionaire strategy session                                          */
/* --------------------------------------------------------------------- */
function BillionaireSession() {
  const items = [
    { icon: IC.crown, t: 'Learn from the Best', d: 'Direct access to billionaires and industry leaders.' },
    { icon: IC.knight, t: 'Strategies that Create Empires', d: 'Battle-tested frameworks from those who&rsquo;ve built and scaled massively.' },
    { icon: IC.network, t: 'High-Value Networking', d: 'Connect with elite founders, investors, and decision makers.' },
    { icon: IC.target, t: 'Solve Big Problems Together', d: 'Get unfiltered advice and fresh perspectives on your biggest challenges.' },
    { icon: IC.diamond, t: "Opportunities You Won't Find Online", d: 'Private deals, partnerships, and access that open new doors.' },
  ];
  return (
    <section className="container-tight py-14 sm:py-20">
      <Eyebrow num="04.2">Billionaire Strategy Session</Eyebrow>
      <Display className="mt-5 text-[34px] sm:text-[54px]">
        Big thinkers. Bigger moves.
        <br />
        <span className="text-cyan-400">Billionaire level.</span>
      </Display>
      <p className="mt-5 max-w-xl text-lg text-ink-200">
        An exclusive strategy session with billionaires, top investors, and operators. Real
        insights. Real networks. <span className="text-cyan-400">Real leverage.</span>
      </p>
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((it) => (
          <GlowCard key={it.t} icon={it.icon} title={it.t}>
            <span dangerouslySetInnerHTML={{ __html: it.d }} />
          </GlowCard>
        ))}
      </div>
      <SpecBar
        items={[
          { icon: IC.calendar, top: 'June 26–27', bottom: '10 AM' },
          { icon: IC.bed, top: '2 Day · 1 Night', bottom: 'Live-in build' },
          { icon: IC.pin, top: 'Antipolo City', bottom: 'Rizal' },
        ]}
      />
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* Payment — bank QR (InstaPay) + credit card + reserve                  */
/* --------------------------------------------------------------------- */
function Payment({ priceCentavos }: { priceCentavos: number | null }) {
  const banks = [
    { name: 'UnionBank', holder: 'Manago, Michael Batiquin', img: '/qr-unionbank.jpeg' },
    { name: 'BPI', holder: 'BossLabs · MI•••L B MA•••O', img: '/qr-bpi.jpeg' },
  ];
  return (
    <section id="secure-seat" className="container-tight py-16 sm:py-24">
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <Eyebrow num="05">Secure Your Seat</Eyebrow>
          <Display className="mt-5 text-[32px] sm:text-[48px]">
            Lock in your <span className="text-cyan-400">slot.</span>
          </Display>
          {priceCentavos != null && (
            <div className="mt-5 inline-flex items-baseline gap-3">
              <span className="font-sans text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
                {formatPHP(priceCentavos)}
              </span>
              <span className="text-sm uppercase tracking-[0.2em] text-cyan-400">per seat</span>
            </div>
          )}
          <p className="mx-auto mt-4 max-w-lg text-sm text-ink-300">
            Only 10 seats. Pay by card or scan a bank QR (InstaPay) below, then apply so we can
            confirm your slot.
          </p>
        </div>

        {/* Credit card */}
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.08] to-white/[0.01] p-6 sm:p-8">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
              Pay by card
            </div>
            <h3 className="mt-2 font-sans text-2xl font-bold text-white">Credit / Debit Card</h3>
            <p className="mt-2 text-sm text-ink-300">
              Visa, Mastercard & more via secure Xendit checkout. Instant confirmation.
            </p>
            <a
              href={CARD_CHECKOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-cyan mt-6 inline-flex !px-7 !py-3.5 text-base"
            >
              Pay via Credit Card →
            </a>
          </div>

          {/* Apply / reserve */}
          <div className="rounded-2xl border border-cyan-500/20 bg-white/[0.03] p-6 sm:p-8">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
              Apply for a slot
            </div>
            <h3 className="mt-2 font-sans text-2xl font-bold text-white">Reserve &amp; we confirm</h3>
            <p className="mt-2 text-sm text-ink-300">
              Tell us about your business and lock your slot. Invite-only — we review every
              application.
            </p>
            <ReserveButton className="mt-6" label="Reserve your slot →" />
          </div>
        </div>

        {/* Bank QR */}
        <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-white/[0.03] p-6 sm:p-8">
          <div className="text-center">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
              Pay by bank transfer · InstaPay
            </div>
            <p className="mt-2 text-sm text-ink-300">
              Scan with your banking app, then send your receipt to confirm.
            </p>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {banks.map((b) => (
              <div
                key={b.name}
                className="flex flex-col items-center rounded-2xl border border-white/10 bg-white p-5"
              >
                <div className="text-sm font-bold uppercase tracking-[0.18em] text-slate-900">
                  {b.name}
                </div>
                <div className="mt-1 text-[12px] text-slate-500">{b.holder}</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.img}
                  alt={`${b.name} InstaPay QR — ${b.holder}`}
                  className="mt-4 w-full max-w-[260px] rounded-lg"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* Final CTA                                                             */
/* --------------------------------------------------------------------- */
function FinalCta() {
  return (
    <section className="container-tight py-16 sm:py-24">
      <div className="mx-auto max-w-2xl rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.08] to-transparent p-8 text-center shadow-glow sm:p-12">
        <Eyebrow num="06">Your turn</Eyebrow>
        <Display className="mt-5 text-[30px] sm:text-[44px]">
          One weekend. One build. <span className="text-cyan-400">Yours.</span>
        </Display>
        <p className="mx-auto mt-5 max-w-md text-base text-ink-200">
          10 founders. 24 hours. Walk out with a real, working app — not notes, an asset.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href="#secure-seat" className="btn-cyan !px-8 !py-4 text-base">
            Secure your seat →
          </a>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] uppercase tracking-[0.18em] text-ink-300">
          <span className="inline-flex items-center gap-2 text-cyan-300">{IC.refund} Build-or-refund</span>
          <span>Antipolo City, Rizal</span>
          <span>June 26–27</span>
        </div>
      </div>
    </section>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { BOOTCAMP_TIERS, bootcampSeatsRemaining, BOOTCAMP_TOTAL_SEATS } from '@/lib/bootcamp';
import { formatPHP } from '@/lib/config';
import { ScarcityBar } from '@/components/bootcamp/ScarcityBar';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "AI Founder's Bootcamp — Launch Your App in 24 Hours",
  description:
    "Walk in with an idea. Walk out with a *launched app*. The 24-hour build-or-refund bootcamp for non-coders who think like founders. 80 seats only.",
};

const TIMELINE = [
  { n: 1, title: 'Vision', body: "We pull the one problem worth solving out of your head and make it crystal clear. Reduce, remove, replace — one problem, maximum impact." },
  { n: 2, title: 'The Anatomy of Software', body: "Finally understand what an app *actually is* underneath — so you stop being intimidated by it and start directing it." },
  { n: 3, title: 'Workflow Design', body: 'What it will do (the engine), and how you will use it (the experience). Map your app before you build it.' },
  { n: 4, title: 'Prompting — Live Workshop', body: 'The real skill of the AI era: telling the machine exactly what to build. Hands-on, with us beside you.' },
  { n: 5, title: 'Your MVP — Live Workshop', body: 'You build the first working version of YOUR app. This is where the magic happens.' },
  { n: 6, title: 'Rapid Iteration', body: 'Don’t chase perfect. Chase useful. Test, break, fix, improve in real time until it works.' },
  { n: 7, title: 'Launch', body: 'You deploy. Live URL. Real app. In your hands. This is the moment it becomes real.' },
];

const WALK_OUT_WITH = [
  'A working, deployed app solving one real problem in your business',
  'The complete Blueprint → Build → Launch methodology you can run again and again',
  'The confidence — and proof — that you can build software yourself',
  'A new identity: not just a founder anymore. A founder who *ships*.',
];

const IS_FOR_YOU = [
  "You're a business owner or aspiring founder with an idea, blocked by cost, timeline, or the belief that “hindi ako techie.”",
  'You’re tired of paying agencies and freelancers for things you suspect you could build yourself.',
  'You have one specific problem in your business and you want it solved *this week*, not next quarter.',
  'You don’t know how to code. Good. That’s the point. This bootcamp is built for non-coders who think like founders.',
];

export default async function FoundersBootcampPage() {
  const seatsLeft = await bootcampSeatsRemaining();
  const seatsTaken = BOOTCAMP_TOTAL_SEATS - seatsLeft;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#06070A] text-ink-200">
      <CinematicBackground />
      <Header />
      <ScarcityBar seatsLeft={seatsLeft} totalSeats={BOOTCAMP_TOTAL_SEATS} />
      <main className="relative z-10 pt-16">
        <Hero seatsLeft={seatsLeft} seatsTaken={seatsTaken} />
        <ForYou />
        <Methodology />
        <WalkOutWith />
        <Pricing />
        <TheTruth />
        <FinalCta seatsLeft={seatsLeft} />
      </main>
      <Footer />
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Background — deep navy with cinematic cyan glow + grid                */
/* --------------------------------------------------------------------- */
function CinematicBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Deep base */}
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(0,184,230,0.18),transparent_75%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(40%_30%_at_80%_100%,rgba(99,102,241,0.16),transparent_70%)]" />
      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,184,230,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,184,230,0.4) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage:
            'radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 80%)',
        }}
      />
      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_100%,#06070A_60%,transparent_100%)]" />
    </div>
  );
}

function Header() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="opacity-90 transition hover:opacity-100">
          <Logo />
        </Link>
        <Link
          href="/founders-bootcamp/reserve"
          className="hidden rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/85 transition hover:border-cyan-400/50 hover:bg-cyan-500/[0.08] hover:text-white sm:inline-flex"
        >
          Reserve a seat
        </Link>
      </div>
    </header>
  );
}

/* --------------------------------------------------------------------- */
/* Hero                                                                  */
/* --------------------------------------------------------------------- */
function Hero({ seatsLeft, seatsTaken }: { seatsLeft: number; seatsTaken: number }) {
  return (
    <section className="relative">
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-12 sm:pt-20 lg:pt-28">
        <div className="grid items-start gap-12 lg:grid-cols-12">
          {/* Left — copy */}
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/[0.07] px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(0,184,230,0.9)]" />
              AI Founder's Bootcamp · Invite-only cohort
            </div>
            <h1 className="mt-6 font-serif text-[44px] leading-[1.04] tracking-tight text-white sm:text-[60px] lg:text-[72px]">
              Launch your app in
              <br />
              <span className="bg-gradient-to-r from-cyan-300 via-cyan-200 to-white bg-clip-text text-transparent">
                24&nbsp;hours.
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-[1.6] text-ink-200 sm:text-xl">
              You walked in with an idea. You'll walk out with a{' '}
              <em className="not-italic text-white">launched app.</em>
            </p>
            <p className="mt-4 max-w-xl text-[15px] leading-[1.65] text-ink-300">
              Not a wireframe. Not a "someday" plan. A real, working, deployed application
              that solves a real problem in your business — built by you, shipped in 24 hours.
            </p>

            {/* Primary CTA */}
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/founders-bootcamp/reserve"
                className="group inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-7 py-4 text-base font-semibold text-white shadow-[0_18px_44px_-12px_rgba(0,150,200,0.7)] transition hover:from-cyan-400 hover:to-indigo-400 active:translate-y-[1px]"
              >
                Reserve a seat — ₱10,000 DP
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="transition group-hover:translate-x-1">
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <a
                href="#tiers"
                className="text-sm font-medium text-cyan-300/90 underline-offset-4 transition hover:text-cyan-200 hover:underline"
              >
                See ticket tiers ↓
              </a>
            </div>

            {/* Investment chip */}
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-300">
              <div>
                Investment{' '}
                <span className="font-semibold text-white">{formatPHP(35_000_00)}</span>{' '}
                <span className="text-ink-400">/ {formatPHP(25_000_00)} for webinar grads</span>
              </div>
              <div className="text-ink-400">Corporate trio {formatPHP(22_000_00)} · squad of 5 {formatPHP(20_000_00)}</div>
            </div>
          </div>

          {/* Right — scarcity / seats card */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-28">
              <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-7 backdrop-blur-md shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
                  Seats remaining
                </div>
                <div className="mt-3 flex items-baseline gap-3">
                  <div className="font-serif text-[68px] leading-none tracking-tight text-white tabular-nums">
                    {seatsLeft}
                  </div>
                  <div className="font-sans text-base text-ink-300">/ {BOOTCAMP_TOTAL_SEATS}</div>
                </div>
                <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400 transition-all duration-700"
                    style={{ width: `${(seatsTaken / BOOTCAMP_TOTAL_SEATS) * 100}%` }}
                  />
                </div>
                <div className="mt-3 text-[12.5px] text-ink-400">
                  {seatsTaken === 0
                    ? '80 ticket cohort opening now.'
                    : `${seatsTaken} of 80 seats already taken.`}
                </div>

                <div className="mt-7 space-y-3 border-t border-white/[0.06] pt-5 text-sm">
                  <div className="flex items-start gap-3">
                    <Check />
                    <span className="text-ink-200">
                      <span className="font-semibold text-white">24 hours</span> to launched
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check />
                    <span className="text-ink-200">
                      <span className="font-semibold text-white">No code</span> required
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check />
                    <span className="text-ink-200">
                      <span className="font-semibold text-white">Real app</span> at the end, not a deck
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check />
                    <span className="text-ink-200">
                      Live URL <span className="font-semibold text-white">you own</span>
                    </span>
                  </div>
                </div>

                <Link
                  href="/founders-bootcamp/reserve"
                  className="mt-7 flex items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/[0.08] px-5 py-3 text-sm font-semibold text-cyan-200 transition hover:border-cyan-400/70 hover:bg-cyan-500/[0.14]"
                >
                  Reserve a seat →
                </Link>
              </div>

              <p className="mt-4 px-2 text-center text-[12px] leading-relaxed text-ink-400">
                Lock your seat with a ₱10,000 downpayment. Balance settles before bootcamp day.
                <br />
                <span className="font-medium text-amber-300/90">Downpayment is non-refundable.</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-[3px] flex-none text-cyan-400">
      <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* --------------------------------------------------------------------- */
/* "This is for you if"                                                   */
/* --------------------------------------------------------------------- */
function ForYou() {
  return (
    <section className="relative border-t border-white/[0.04] py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 max-w-2xl">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
            Reality check
          </div>
          <h2 className="mt-3 font-serif text-4xl tracking-tight text-white sm:text-5xl">
            This is for you if&hellip;
          </h2>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {IS_FOR_YOU.map((line, i) => (
            <li
              key={i}
              className="group rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6 transition hover:border-cyan-400/40 hover:bg-white/[0.04]"
            >
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 flex-none rounded-full bg-cyan-400 transition group-hover:shadow-[0_0_12px_rgba(0,184,230,0.85)]" />
                <p className="text-[15.5px] leading-[1.6] text-ink-100">{line}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* Methodology — 7-step timeline                                          */
/* --------------------------------------------------------------------- */
function Methodology() {
  return (
    <section className="relative border-t border-white/[0.04] py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-14 max-w-3xl">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
            What you'll actually do
          </div>
          <h2 className="mt-3 font-serif text-4xl tracking-tight text-white sm:text-5xl">
            Not just learn. Survive a build.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-[1.65] text-ink-300">
            This isn't a lecture you sit through. It's the exact methodology used to ship
            production apps for real Philippine SMEs — moved through together, in 24 hours.
          </p>
        </div>

        <ol className="relative space-y-5">
          <div
            aria-hidden
            className="absolute bottom-4 left-[35px] top-4 hidden w-px bg-gradient-to-b from-cyan-400/40 via-white/[0.08] to-transparent sm:block"
          />
          {TIMELINE.map((step) => (
            <li
              key={step.n}
              className="relative grid gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition hover:border-cyan-400/30 hover:bg-white/[0.04] sm:grid-cols-[72px,1fr] sm:gap-7 sm:pl-7"
            >
              <div className="relative">
                <div className="relative z-[1] flex h-[52px] w-[52px] items-center justify-center rounded-full border border-cyan-400/40 bg-[#0B0D12] font-serif text-2xl text-cyan-200 shadow-[0_0_30px_-6px_rgba(0,184,230,0.55)]">
                  {step.n}
                </div>
              </div>
              <div>
                <h3 className="font-serif text-2xl tracking-tight text-white">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-[1.65] text-ink-200">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* Walk out with                                                         */
/* --------------------------------------------------------------------- */
function WalkOutWith() {
  return (
    <section className="relative border-t border-white/[0.04] py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 max-w-2xl">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
            The deliverables
          </div>
          <h2 className="mt-3 font-serif text-4xl tracking-tight text-white sm:text-5xl">
            What you walk out with.
          </h2>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {WALK_OUT_WITH.map((line, i) => (
            <li
              key={i}
              className="flex items-start gap-4 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.04] p-6 transition hover:border-emerald-400/30 hover:bg-emerald-500/[0.06]"
            >
              <div className="mt-1 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-[15.5px] leading-[1.6] text-ink-100">{line}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* Pricing — 4 tiers                                                     */
/* --------------------------------------------------------------------- */
function Pricing() {
  return (
    <section id="tiers" className="relative scroll-mt-24 border-t border-white/[0.04] py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 max-w-2xl">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
            Investment
          </div>
          <h2 className="mt-3 font-serif text-4xl tracking-tight text-white sm:text-5xl">
            Pick how you'll show up.
          </h2>
          <p className="mt-4 text-[15px] leading-[1.65] text-ink-300">
            Solo investment is ₱35,000. The webinar code unlocks ₱25,000 for 24 hours only.
            Bring your team and the per-seat drops even further.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BOOTCAMP_TIERS.map((tier) => {
            const featured = tier.id === 'single_promo';
            return (
              <Link
                key={tier.id}
                href={`/founders-bootcamp/reserve?tier=${tier.id}`}
                className={`group relative flex flex-col rounded-3xl border p-6 transition ${
                  featured
                    ? 'border-cyan-400/40 bg-gradient-to-b from-cyan-500/[0.08] to-transparent shadow-[0_28px_80px_-30px_rgba(0,184,230,0.45)] hover:border-cyan-300/70'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                }`}
              >
                {tier.badge && (
                  <div
                    className={`absolute -top-2.5 right-5 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                      featured
                        ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-100'
                        : 'border-amber-400/40 bg-amber-500/[0.08] text-amber-200'
                    }`}
                  >
                    {tier.badge}
                  </div>
                )}
                <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-300">
                  {tier.label}
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <div className="font-serif text-[44px] leading-none text-white tabular-nums">
                    {formatPHP(tier.perSeatCentavos)}
                  </div>
                  <div className="text-[12px] text-ink-400">/ seat</div>
                </div>
                {tier.seats > 1 && (
                  <div className="mt-2 text-[12.5px] text-ink-400">
                    {tier.seats} seats · total {formatPHP(tier.totalCentavos)}
                  </div>
                )}
                <p className="mt-4 text-[14px] leading-[1.55] text-ink-200">{tier.tagline}</p>

                <div className="mt-auto pt-6">
                  <div className="text-[11px] text-ink-400">Reserve with</div>
                  <div className="mt-1 text-base font-semibold text-white tabular-nums">
                    {formatPHP(tier.downpaymentCentavos)} downpayment
                  </div>
                  <div className="mt-0.5 text-[10.5px] uppercase tracking-[0.16em] text-amber-300/80">
                    Non-refundable
                  </div>
                </div>

                <div
                  className={`mt-5 flex items-center justify-between rounded-full px-4 py-2.5 text-[13px] font-semibold transition ${
                    featured
                      ? 'bg-gradient-to-r from-cyan-500 to-indigo-500 text-white'
                      : 'bg-white/[0.05] text-white group-hover:bg-white/[0.1]'
                  }`}
                >
                  <span>Reserve this tier</span>
                  <span>→</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* The truth — closing                                                   */
/* --------------------------------------------------------------------- */
function TheTruth() {
  return (
    <section className="relative border-t border-white/[0.04] py-24">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
          The truth most people won't tell you
        </div>
        <p className="mt-5 font-serif text-[28px] leading-[1.35] text-white sm:text-[34px]">
          The hardest part of building an app was never the code.
          <br />
          <span className="text-ink-300">
            It was the courage to start, the clarity to know what to build,
          </span>
          <br />
          <span className="bg-gradient-to-r from-cyan-300 via-cyan-200 to-white bg-clip-text text-transparent">
            and someone in the room to keep you moving when you get stuck.
          </span>
        </p>
        <p className="mt-7 text-[15.5px] leading-[1.65] text-ink-200">
          That's what these 24 hours give you. By tomorrow, the idea you've been sitting on for months will be{' '}
          <em className="not-italic text-white">live.</em>
        </p>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* Final CTA                                                             */
/* --------------------------------------------------------------------- */
function FinalCta({ seatsLeft }: { seatsLeft: number }) {
  const soldOut = seatsLeft === 0;
  return (
    <section className="relative border-t border-white/[0.04] py-24">
      <div className="mx-auto max-w-4xl px-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-500/[0.08] via-white/[0.02] to-indigo-500/[0.08] p-10 text-center shadow-[0_40px_120px_-30px_rgba(0,184,230,0.4)] sm:p-14">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
            {soldOut ? 'Cohort filled' : `${seatsLeft} seats left of 80`}
          </div>
          <h2 className="mt-4 font-serif text-4xl tracking-tight text-white sm:text-5xl">
            {soldOut
              ? "We're full — but watch the next cohort drop."
              : 'The only question is whether you’re in the room.'}
          </h2>
          {!soldOut && (
            <>
              <p className="mx-auto mt-5 max-w-xl text-[15px] leading-[1.65] text-ink-200">
                Lock your seat with a ₱10,000 downpayment. Card or bank — your call. Balance settles before event day.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/founders-bootcamp/reserve"
                  className="inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-8 py-4 text-base font-semibold text-white shadow-[0_18px_44px_-12px_rgba(0,150,200,0.7)] transition hover:from-cyan-400 hover:to-indigo-400 active:translate-y-[1px]"
                >
                  Reserve your seat →
                </Link>
                <a
                  href="#tiers"
                  className="text-sm font-medium text-cyan-300/90 underline-offset-4 transition hover:text-cyan-200 hover:underline"
                >
                  See tiers again
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

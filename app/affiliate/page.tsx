import type { Metadata } from 'next';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { Mark } from '@/components/Mark';
import { AffiliateSignupForm } from '@/components/AffiliateSignupForm';
import { AFFILIATE_DEFAULT_PERCENT, TIER_LADDER } from '@/lib/affiliates';

export const metadata: Metadata = {
  title: 'Affiliate Program · BOSSLABS AI',
  description:
    'We run ads to your testimonial — and every peso it earns, you earn. Start at 5%, climb to 10%.',
};

const BASE = AFFILIATE_DEFAULT_PERCENT;
const TOP = TIER_LADDER[TIER_LADDER.length - 1].percent;

export default function AffiliatePage() {
  return (
    <>
      <header className="border-b border-white/[0.05] bg-[#06070A]/80 backdrop-blur-md">
        <div className="container-tight flex h-16 items-center justify-between">
          <div className="inline-flex items-center gap-3">
            <Mark size={26} />
            <Logo size="md" />
          </div>
          <span className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">Partner Program</span>
        </div>
      </header>

      <main className="container-tight py-12 sm:py-20">
        {/* Hero — lead with the win-win, not the ask */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="eyebrow justify-center">Partner Program · Win-Win</div>
          <h1 className="h-display mt-5">
            We put real ad budget behind <span className="accent-italic">your testimonial.</span>
          </h1>
          <p className="lead mx-auto mt-6 max-w-2xl">
            Most programs ask for a free testimonial and call it a day. We don&rsquo;t believe in that.
            Send us yours — <span className="text-white">we run the ads, we spend the money</span> — and
            every peso it earns, <span className="text-white">you earn your cut</span>. Start at {BASE}%,
            climb to {TOP}%.
          </p>
          <a href="#join" className="btn-primary mt-8 inline-flex !py-4 !px-9 text-base">
            Get my link + backend →
          </a>
        </div>

        {/* The win-win, spelled out */}
        <div className="mx-auto mt-16 max-w-3xl rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.06] to-transparent p-6 shadow-glow sm:p-10">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">Not a favor — a partnership</div>
          <h2 className="h-sub mt-3">Your testimonial shouldn&rsquo;t be a freebie.</h2>
          <p className="mt-4 font-sans text-[15px] leading-relaxed text-ink-100">
            Hand over a testimonial for nothing? That&rsquo;s the old way. Here, your testimonial becomes an
            ad <span className="text-white">we fund and scale</span>. It sells while you sleep — and every
            sale it brings in pays <span className="text-white">you</span>. Your words, our spend, your
            payday. The harder it works, the more you both win.
          </p>
        </div>

        {/* Commission ladder */}
        <div className="mx-auto mt-16 max-w-4xl">
          <div className="text-center">
            <div className="eyebrow justify-center">Your rate grows with you</div>
            <h2 className="h-sub mt-3">The more you sell, the bigger your cut.</h2>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-3 sm:gap-4">
            {TIER_LADDER.map((t, i) => (
              <div
                key={t.percent}
                className={`relative rounded-2xl border p-6 text-center ${
                  i === TIER_LADDER.length - 1
                    ? 'border-cyan-500/40 bg-cyan-500/[0.06] shadow-glow-sm'
                    : 'border-white/[0.08] bg-white/[0.02]'
                }`}
              >
                <div className="font-serif text-4xl tracking-tight text-white sm:text-5xl">{t.percent}%</div>
                <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-cyan-400">{t.label}</div>
                <div className="mt-2 font-sans text-[13px] text-ink-100">
                  {t.atSales === 0 ? 'The moment you join' : `After ${t.atSales} referred sales`}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* How it works — sign up → backend → upload → ads → earn */}
        <div className="mx-auto mt-16 max-w-3xl">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">How it works</div>
          <ol className="mt-5 space-y-5">
            {[
              ['Sign up free', 'Drop your name + email and get your unique link — plus your own backend — instantly.'],
              ['Upload your testimonial', 'Inside your backend you can upload your videos. Tell people what BOSSLABS AI did for you.'],
              ['We turn it into an ad', 'We put real budget behind your testimonial and run it to a cold audience — on our peso.'],
              [`You earn ${BASE}–${TOP}%`, 'Every sale your testimonial + link drive lands in your dashboard, ready to be paid out.'],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-4">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/[0.06] font-serif text-cyan-300">
                  {i + 1}
                </span>
                <div>
                  <div className="font-serif text-[16px] text-white">{t}</div>
                  <p className="mt-0.5 font-sans text-[14px] leading-relaxed text-ink-100">{b}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Signup */}
        <div id="join" className="mx-auto mt-16 max-w-md scroll-mt-8">
          <div className="rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.06] to-transparent p-6 shadow-glow sm:p-8">
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">Join free</div>
            <h2 className="h-sub mt-2">Get your link + backend</h2>
            <p className="mt-2 font-sans text-[13px] leading-relaxed text-ink-200">
              Takes 20 seconds. Start at {BASE}%, climb to {TOP}%. Your link, dashboard, and video uploads
              are ready immediately.
            </p>
            <div className="mt-6">
              <AffiliateSignupForm percent={BASE} topPercent={TOP} />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

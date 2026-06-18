import type { Metadata } from 'next';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { Mark } from '@/components/Mark';
import { AffiliateSignupForm } from '@/components/AffiliateSignupForm';
import { AFFILIATE_DEFAULT_PERCENT } from '@/lib/affiliates';

export const metadata: Metadata = {
  title: 'Become an Affiliate · BOSSLABS AI',
  description: `Earn ${AFFILIATE_DEFAULT_PERCENT}% promoting the AI webinar every PH business owner needs.`,
};

const PCT = AFFILIATE_DEFAULT_PERCENT;

const PERKS = [
  {
    title: `${PCT}% per sale`,
    body: `Earn ${PCT}% on every webinar ticket your link sells. Performance-based — the more you share, the more you make.`,
  },
  {
    title: '15-day cookie',
    body: "They don't have to buy right away. If they come back within 15 days, the sale is still credited to you.",
  },
  {
    title: 'Instant link + live dashboard',
    body: 'Get your unique link the second you sign up. Track clicks, sales, and earnings in real time.',
  },
  {
    title: 'Done-for-you promo kit',
    body: 'Swipe copy, captions, and a ready-to-post asset pack — so you can start sharing in minutes.',
  },
];

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
        <div className="mx-auto max-w-3xl text-center">
          <div className="eyebrow justify-center">Affiliate Program</div>
          <h1 className="h-display mt-5">
            Get paid to share <br />
            <span className="accent-italic">what already sells.</span>
          </h1>
          <p className="lead mx-auto mt-6 max-w-xl">
            Promote the AI webinar every PH business owner needs and earn{' '}
            <span className="text-white">{PCT}% on every sale</span>. Free to join, your link is ready
            the moment you sign up.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-8 lg:grid-cols-[1fr_minmax(360px,420px)] lg:items-start">
          {/* Left — why + how */}
          <div>
            <div className="grid gap-3 sm:grid-cols-2">
              {PERKS.map((p) => (
                <div key={p.title} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                  <div className="font-serif text-lg text-white">{p.title}</div>
                  <p className="mt-2 font-sans text-[13px] leading-relaxed text-ink-100">{p.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">How it works</div>
              <ol className="mt-4 space-y-4">
                {[
                  ['Sign up', 'Drop your name + email and get your unique link instantly.'],
                  ['Share it', 'Post your link with our ready-made swipe copy + assets.'],
                  [`Earn ${PCT}%`, 'Every sale your link drives shows up in your dashboard, ready to be paid out.'],
                ].map(([t, b], i) => (
                  <li key={t} className="flex gap-4">
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/[0.06] font-serif text-sm text-cyan-300">
                      {i + 1}
                    </span>
                    <div>
                      <div className="font-serif text-[15px] text-white">{t}</div>
                      <p className="mt-0.5 font-sans text-[13px] leading-relaxed text-ink-100">{b}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Right — signup card */}
          <div className="rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.06] to-transparent p-6 shadow-glow sm:p-8 lg:sticky lg:top-8">
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">Join free</div>
            <h2 className="h-sub mt-2">Get your affiliate link</h2>
            <p className="mt-2 font-sans text-[13px] leading-relaxed text-ink-200">
              Takes 20 seconds. Your link + dashboard are ready immediately.
            </p>
            <div className="mt-6">
              <AffiliateSignupForm percent={PCT} />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

/**
 * HeroB — the VARIATION hero for the homepage split test (control lives in
 * OptInPage.tsx). Single-variable test: only the hero differs; every other
 * section of the page is shared.
 *
 * Angle: identity/story-led — the winning FB-ad hook ("Hindi ako programmer
 * pero nakagawa ako ng app ko in less than 24 hours") verbatim, so ad → page
 * message-match is exact. Control is outcome-led (Save ₱100K/month).
 *
 * Edit THIS file to iterate on the variation — it's the "test home page".
 */
import { CountdownMini } from './CountdownBar';
import { HeroBackground } from './HeroBackground';
import { PaidCta } from './OptInPage';
import type { WebinarInfo } from '@/lib/webinar';

export function HeroB({ webinar }: { webinar: WebinarInfo }) {
  const facts = [
    { k: 'WHEN', v: webinar.date, s: `${webinar.time} ${webinar.timezone}` },
    { k: 'WHERE', v: 'Live on Zoom', s: 'Not a recorded session' },
    { k: 'LENGTH', v: '2-Hour Workshop', s: 'Live & hands-on' },
    { k: 'FORMAT', v: 'Live Demo', s: 'Launch real apps' },
  ];
  return (
    <section className="relative isolate overflow-hidden">
      <HeroBackground />
      <div className="container-tight relative z-10 pt-12 pb-14 sm:pt-20 sm:pb-20">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.22em] text-cyan-300 sm:text-[11px]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400" />
            Live on Zoom · {webinar.date} · {webinar.time} {webinar.timezone}
          </div>

          {/* Story-led headline — the ad hook, verbatim. */}
          <h1 className="mt-7 font-serif text-[34px] leading-[1.08] tracking-[-0.01em] text-white sm:text-[50px] md:text-[60px] lg:text-[68px]">
            <span className="accent-italic">&ldquo;Hindi ako programmer</span> pero nakagawa ako
            ng app ko <span className="accent-italic">in less than 24 hours.&rdquo;</span>
          </h1>

          <p className="mx-auto mt-7 max-w-2xl font-sans text-[15px] leading-relaxed text-ink-100 sm:text-[18px]">
            Sa live workshop na &rsquo;to, ipapakita namin kung paano — step by step, walang
            tinatago. Build an automated business and save at least{' '}
            <span className="font-semibold text-white">₱100K/month</span> using Claude Code.
            500k for a developer? <span className="font-semibold text-white">Sayang pera mo.</span>
          </p>

          <div className="mt-9 inline-flex flex-col items-center gap-3">
            <PaidCta className="w-full sm:w-auto" />
            <p className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
              Bonuses included · Limited seats per session · 7-day guarantee
            </p>

            <div className="mt-2 flex flex-col items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-danger-500/40 bg-danger-900/30 px-3.5 py-1.5">
                <span className="pulse-dot" />
                <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-danger-200 sm:text-[11px]">
                  Only <span className="font-serif text-sm text-white">23</span> of 200 seats left this session
                </span>
              </div>
              <CountdownMini startsAtIso={webinar.startsAtIso} />
              <p className="font-sans text-[9px] uppercase tracking-[0.22em] text-ink-400 sm:text-[10px]">
                Until your session goes live
              </p>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-3 text-left sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
            {facts.map((card) => (
              <div key={card.k} className="rounded-2xl border border-cyan-500/25 bg-white/[0.03] p-5">
                <div className="font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">
                  {card.k}
                </div>
                <div className="mt-2 font-sans text-[16px] font-semibold text-white">{card.v}</div>
                <div className="mt-0.5 text-[13px] text-ink-300">{card.s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

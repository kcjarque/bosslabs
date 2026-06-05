import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { Mark } from '@/components/Mark';
import { OrderBumpActions } from '@/components/OrderBumpActions';
import { OFFER, formatPHP } from '@/lib/config';

export const metadata = {
  title: 'Add the 1on1 MVP Session · BOSSLABS AI',
  description: 'Action Taker Bonus: add your 1on1 MVP Session with the founders.',
};

export default function OrderBumpPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const failed = searchParams.status === 'failed';

  return (
    <>
      <header className="border-b border-white/[0.05] bg-[#06070A]/80 backdrop-blur-md">
        <div className="container-tight flex h-16 items-center justify-between">
          <div className="inline-flex items-center gap-3">
            <Mark size={26} />
            <Logo size="md" />
          </div>
          <span className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">Attendee upgrade</span>
        </div>
      </header>

      <main className="container-tight py-10 sm:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="eyebrow justify-center">For webinar attendees</div>
          <h1 className="h-display mt-5">
            Proceed with your <span className="accent-italic">order bump</span>.
          </h1>
          <p className="lead mt-6 max-w-xl mx-auto">
            Ready to add your{' '}
            <span className="text-white">{OFFER.oto.name}</span>? Enter the email you
            registered with and choose how you&rsquo;d like to pay.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-3xl">
          {failed && (
            <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-200">
              Your payment didn&rsquo;t go through. Nothing was charged — pick a method below and try again.
            </div>
          )}

          <div className="rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.06] to-transparent p-5 shadow-glow sm:p-10">
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">{OFFER.oto.eyebrow}</div>
            <h2 className="h-sub mt-3">{OFFER.oto.name}</h2>
            <p className="mt-4 font-sans text-[14px] leading-relaxed text-ink-100 sm:text-[15px]">
              {OFFER.oto.promise}
            </p>

            <ul className="mt-7 space-y-3">
              {OFFER.oto.inclusions.map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-3 font-sans text-[14px] leading-relaxed text-ink-100 sm:text-[15px]"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-[2px] flex-none text-cyan-400">
                    <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex items-baseline gap-3 border-t border-white/[0.07] pt-7">
              <div className="font-serif text-5xl tracking-tight text-white sm:text-6xl">{OFFER.oto.label}</div>
              <div className="font-serif text-xl text-ink-300 line-through sm:text-2xl">{OFFER.oto.crossed}</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
                One-time · {formatPHP(OFFER.oto.priceCentavos)}
              </div>
            </div>

            <OrderBumpActions />
          </div>

          <p className="mt-6 text-center text-[11px] uppercase tracking-[0.22em] text-ink-300">
            Already added it? It&rsquo;s on your ticket — no need to pay again.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}

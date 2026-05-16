import Link from 'next/link';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { Mark } from '@/components/Mark';
import { OTOActions } from '@/components/OTOActions';
import { OFFER, formatPHP } from '@/lib/config';

export default function OtoPage({
  searchParams,
}: {
  searchParams: { order?: string; bumped?: string };
}) {
  const orderId = searchParams.order ?? '';
  const bumped = searchParams.bumped === '1';

  if (bumped) return <BumpedConfirmation orderId={orderId} />;
  return <LastChance orderId={orderId} />;
}

/* --------------------------------------------------------------------- */
/* BUMPED — user already added the bundle at checkout                    */
/* --------------------------------------------------------------------- */
function BumpedConfirmation({ orderId }: { orderId: string }) {
  return (
    <>
      <OtoHeader label="Bundle added" />
      <main className="container-tight py-12 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/10 shadow-glow-sm">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="#00B8E6"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="eyebrow mt-6 justify-center">You added the bundle</div>
          <h1 className="h-display mt-4">
            Smart move. <span className="accent-italic">Welcome aboard.</span>
          </h1>
          <p className="lead mt-6 max-w-xl mx-auto">
            Your webinar seat plus the Scripts, Prompts &amp; Automation bundle
            are locked in. We will send the Zoom link, the bundle access, and
            the Free Tools stack to your email within minutes.
          </p>
          <div className="mt-10 inline-flex flex-col items-center gap-3 w-full sm:w-auto">
            <Link
              href={`/thank-you${orderId ? `?order=${orderId}&oto=1` : ''}`}
              className="btn-primary !py-4 !px-9 text-base w-full sm:w-auto"
            >
              Continue to webinar details
            </Link>
            <p className="text-[11px] uppercase tracking-[0.22em] text-ink-300">
              You will not see this page again
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

/* --------------------------------------------------------------------- */
/* LAST CHANCE — user didn't bump at checkout                            */
/* --------------------------------------------------------------------- */
function LastChance({ orderId }: { orderId: string }) {
  return (
    <>
      <OtoHeader label="Step 2 of 2" />

      <main className="container-tight py-10 sm:py-16">
        {/* Last Chance ribbon */}
        <div className="mx-auto max-w-3xl">
          <div className="rounded-full border border-danger-500/50 bg-danger-900/40 px-5 py-2 text-center">
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-danger-200 sm:text-[12px] sm:tracking-[0.28em]">
              <span className="pulse-dot" />
              Last chance at this price
            </div>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-3xl text-center">
          <div className="eyebrow justify-center">Payment received · Seat locked</div>
          <h1 className="h-display mt-5">
            One <span className="accent-italic">last upgrade</span>
            <br />
            before your webinar.
          </h1>
          <p className="lead mt-6 max-w-xl mx-auto">
            Operators who attend with the{' '}
            <span className="text-white">Scripts, Prompts &amp; Automation</span>{' '}
            bundle install <span className="text-white">3× faster</span> on average.
            This is the only page where you can add it for{' '}
            <span className="text-white">{OFFER.oto.label}</span>{' '}
            <span className="text-ink-300 line-through">{OFFER.oto.crossed}</span>.
            After this page, the price goes back up.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-3xl">
          <div className="rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.06] to-transparent p-5 shadow-glow sm:p-10">
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">
              The Bundle
            </div>
            <h2 className="h-sub mt-3">{OFFER.oto.name}</h2>
            <p className="mt-4 font-sans text-[14px] leading-relaxed text-ink-100 sm:text-[15px]">
              {OFFER.oto.promise}
            </p>

            <ul className="mt-7 space-y-3">
              {OFFER.oto.inclusions.map((line) => (
                <li key={line} className="flex items-start gap-3 font-sans text-[14px] leading-relaxed text-ink-100 sm:text-[15px]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-[2px] flex-none text-cyan-400">
                    <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col items-start gap-5 border-t border-white/[0.07] pt-7 sm:mt-10 sm:pt-8 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-danger-300 sm:text-[11px]">
                  Last chance · This page only
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <div className="font-serif text-5xl tracking-tight text-white sm:text-6xl">
                    {OFFER.oto.label}
                  </div>
                  <div className="font-serif text-xl text-ink-300 line-through sm:text-2xl">
                    {OFFER.oto.crossed}
                  </div>
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
                  One-time · No subscription · {formatPHP(OFFER.oto.priceCentavos)}
                </div>
              </div>
              <OTOActions orderId={orderId} />
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link
              href={`/thank-you${orderId ? `?order=${orderId}` : ''}`}
              className="text-[11px] uppercase tracking-[0.22em] text-ink-300 underline-offset-4 hover:text-ink-100 hover:underline"
            >
              No thanks — take me to my webinar details
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

/* --------------------------------------------------------------------- */
/* Shared header                                                         */
/* --------------------------------------------------------------------- */
function OtoHeader({ label }: { label: string }) {
  return (
    <header className="border-b border-white/[0.05] bg-[#06070A]/80 backdrop-blur-md">
      <div className="container-tight flex h-16 items-center justify-between">
        <div className="inline-flex items-center gap-3">
          <Mark size={26} />
          <Logo size="md" />
        </div>
        <span className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">
          {label}
        </span>
      </div>
    </header>
  );
}

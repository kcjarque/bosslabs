import Link from 'next/link';
import Image from 'next/image';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { Mark } from '@/components/Mark';
import { OTOActions } from '@/components/OTOActions';
import { PurchasePixel } from '@/components/PurchasePixel';
import { OFFER } from '@/lib/config';
import { resolvePurchaseAmount } from '@/lib/purchase-amount';

// Xendit's successRedirectUrl points here, not /thank-you — so /oto is the
// first page the buyer sees post-payment. Force-dynamic so the signup
// lookup (used for the Pixel Purchase value) hits the live DB.
export const dynamic = 'force-dynamic';

export default async function OtoPage({
  searchParams,
}: {
  searchParams: { order?: string; bumped?: string };
}) {
  const orderId = searchParams.order ?? '';
  const bumped = searchParams.bumped === '1';

  // Resolve the purchase amount from the actual signup row so the Pixel
  // Purchase event reports the real ₱ paid (₱999 base, ₱2,996 if bumped
  // at checkout). The eventID dedupes with the same event re-fired on
  // /thank-you and the CAPI Purchase event from the Xendit webhook —
  // Meta counts them as one Purchase.
  const purchase = await resolvePurchaseAmount(orderId, undefined);

  return (
    <>
      {orderId && (
        <PurchasePixel
          orderId={orderId}
          value={purchase.value}
          bumped={purchase.bumped}
        />
      )}
      {bumped ? <BumpedConfirmation orderId={orderId} /> : <LastChance orderId={orderId} />}
    </>
  );
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
          <div className="eyebrow mt-6 justify-center">{OFFER.oto.eyebrow} added</div>
          <h1 className="h-display mt-4">
            Smart move. <span className="accent-italic">Welcome aboard.</span>
          </h1>
          <p className="lead mt-6 max-w-xl mx-auto">
            Your webinar seat plus your {OFFER.oto.name} are locked in.
            We will send the Zoom link, the session scheduling link, and the Free Tools
            Stack to your email within minutes.
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
            Add the <span className="text-white">{OFFER.oto.name}</span> and walk in with
            every past build recorded end-to-end, the full tutorial library, and the Hub —
            the exact assets our operators use to ship{' '}
            <span className="text-white">3× faster</span>. Only on this page:{' '}
            <span className="text-white">{OFFER.oto.label}</span>{' '}
            <span className="text-ink-300 line-through">{OFFER.oto.totalValue}</span>.
          </p>
        </div>

        {/* Proof gallery — real sessions + the Hub (what's inside the Vault) */}
        <div className="mx-auto mt-10 max-w-4xl">
          <div className="mb-3 text-center text-[11px] uppercase tracking-[0.22em] text-cyan-400">
            Real sessions + the Hub · this is what&rsquo;s inside
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {[
              { src: '/OTO/session-build.png', cap: 'Apps built live, end-to-end' },
              { src: '/OTO/session-group.png', cap: 'Live group build calls' },
              { src: '/OTO/hub.png', cap: 'Inside the BossLabs Hub' },
              { src: '/OTO/session-1on1.png', cap: '1:1 founder sessions' },
            ].map((g) => (
              <figure
                key={g.src}
                className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0A0C12]"
              >
                <div className="relative aspect-[16/9]">
                  <Image
                    src={g.src}
                    alt={g.cap}
                    fill
                    sizes="(max-width: 768px) 50vw, 380px"
                    className="object-cover object-top"
                  />
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/25 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-emerald-200 backdrop-blur">
                    <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
                    Real
                  </span>
                </div>
                <figcaption className="px-3 py-2 text-[11px] text-ink-200 sm:text-[12px]">
                  {g.cap}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-3xl">
          <div className="rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.06] to-transparent p-5 shadow-glow sm:p-10">
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">
              {OFFER.oto.eyebrow}
            </div>
            <h2 className="h-sub mt-3">{OFFER.oto.name}</h2>
            <p className="mt-4 font-sans text-[14px] leading-relaxed text-ink-100 sm:text-[15px]">
              {OFFER.oto.promise}
            </p>

            {/* Value stack — each asset + its value, summing to ₱9,997 */}
            <div className="mt-7 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.015]">
              {OFFER.oto.valueStack.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="flex items-start gap-2.5 font-sans text-[13px] leading-snug text-ink-100 sm:text-[14px]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-[2px] flex-none text-cyan-400">
                      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>{row.label}</span>
                  </span>
                  <span className="flex-none font-serif text-[14px] text-ink-300 sm:text-[15px]">
                    {row.value}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 bg-white/[0.02] px-4 py-3">
                <span className="font-sans text-[12px] uppercase tracking-[0.16em] text-ink-200">
                  Total value
                </span>
                <span className="font-serif text-[16px] text-ink-300 line-through sm:text-[18px]">
                  {OFFER.oto.totalValue}
                </span>
              </div>
            </div>

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
                    {OFFER.oto.totalValue}
                  </div>
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
                  One-time · No subscription · Instant access
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

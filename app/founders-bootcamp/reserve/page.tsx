import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { BootcampReserveFlow } from '@/components/bootcamp/BootcampReserveFlow';
import { BOOTCAMP_TIERS, bootcampSeatsRemaining, BOOTCAMP_TOTAL_SEATS } from '@/lib/bootcamp';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Reserve your seat — AI Founder's Bootcamp",
  description: 'Pick your tier and lock your seat with a ₱10,000 downpayment.',
};

export default async function ReservePage({
  searchParams,
}: {
  searchParams?: { tier?: string };
}) {
  const seatsLeft = await bootcampSeatsRemaining();
  const tiers = BOOTCAMP_TIERS;
  const presetTier = searchParams?.tier ?? '';

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#06070A] text-ink-200">
      {/* Background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(0,184,230,0.18),transparent_75%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(40%_30%_at_80%_100%,rgba(99,102,241,0.16),transparent_70%)]" />
      </div>

      {/* Top bar */}
      <header className="relative z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/founders-bootcamp" className="opacity-90 transition hover:opacity-100">
            <Logo />
          </Link>
          <div className="text-[12px] text-ink-300 sm:text-[13px]">
            {seatsLeft === 0 ? 'Sold out' : `${seatsLeft} / ${BOOTCAMP_TOTAL_SEATS} seats left`}
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto max-w-3xl px-6 pb-24 pt-8 sm:pt-12">
          <div className="mb-10 text-center">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
              Reserve a seat
            </div>
            <h1 className="mt-3 font-serif text-4xl tracking-tight text-white sm:text-5xl">
              Lock your seat. Build your app.
            </h1>
            <p className="mt-4 text-[15px] leading-[1.65] text-ink-300">
              Pick your tier, fill in your details, and pay the ₱10,000-per-seat downpayment.
              Balance settles before bootcamp day — cash, transfer, or card.
            </p>
          </div>

          {seatsLeft === 0 ? (
            <div className="rounded-3xl border border-rose-400/30 bg-rose-500/[0.07] p-8 text-center">
              <h2 className="font-serif text-2xl text-white">Sold out.</h2>
              <p className="mt-2 text-ink-200">
                All 80 seats are taken. Watch the next cohort drop — we'll announce on bosslabs.live.
              </p>
            </div>
          ) : (
            <BootcampReserveFlow tiers={tiers} presetTier={presetTier} seatsLeft={seatsLeft} />
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}

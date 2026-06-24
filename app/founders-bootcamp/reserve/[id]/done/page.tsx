import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { getBootcampReservation, tierById } from '@/lib/bootcamp';
import { formatPHP } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Reservation confirmed — AI Founder's Bootcamp",
};

export default async function DonePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { paid?: string };
}) {
  const r = await getBootcampReservation(params.id);
  if (!r) notFound();
  const cardPaid = searchParams?.paid === 'card' || r.status === 'paid';
  const tierLabel = tierById(r.tier)?.label ?? r.tier;
  const firstName = r.name.split(' ')[0];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#06070A] text-ink-200">
      {/* Background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(34,197,94,0.14),transparent_75%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(40%_30%_at_80%_100%,rgba(0,184,230,0.18),transparent_70%)]" />
      </div>

      <header className="relative z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/founders-bootcamp" className="opacity-90 transition hover:opacity-100">
            <Logo />
          </Link>
        </div>
      </header>

      <main className="relative z-10">
        <div className="mx-auto max-w-2xl px-6 pb-24 pt-12 text-center sm:pt-20">
          <div
            className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full border ${
              cardPaid
                ? 'border-emerald-400/60 bg-emerald-500/[0.12] shadow-[0_0_60px_-10px_rgba(34,197,94,0.6)]'
                : 'border-cyan-400/60 bg-cyan-500/[0.12] shadow-[0_0_60px_-10px_rgba(0,184,230,0.6)]'
            }`}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className={cardPaid ? 'text-emerald-300' : 'text-cyan-300'}>
              <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="mt-7 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
            {cardPaid ? 'Seat confirmed' : 'Reservation received'}
          </div>
          <h1 className="mt-3 font-serif text-4xl tracking-tight text-white sm:text-5xl">
            {cardPaid ? `You're in, ${firstName}.` : `Almost there, ${firstName}.`}
          </h1>
          <p className="mt-5 text-[15.5px] leading-[1.65] text-ink-200">
            {cardPaid
              ? `Your downpayment cleared. ${tierLabel} (${r.seats} seat${r.seats === 1 ? '' : 's'}) is locked in.`
              : `We've got your proof. Once the team verifies the payment, your ${tierLabel} is locked in. Usually under an hour during business hours.`}
          </p>

          <div className="mx-auto mt-9 max-w-md rounded-3xl border border-white/10 bg-white/[0.02] p-6 text-left">
            <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Reservation summary</div>
            <div className="mt-3 space-y-2 text-[14px]">
              <Row label="Tier" value={tierLabel} />
              <Row label="Seats" value={`${r.seats}`} />
              <Row label="Per seat" value={formatPHP(r.perSeatCentavos)} />
              <Row label="Total" value={formatPHP(r.totalCentavos)} bold />
              <Row label="Downpayment" value={formatPHP(r.amountDueCentavos)} />
              {r.balanceDueCentavos > 0 && (
                <Row label="Balance" value={`${formatPHP(r.balanceDueCentavos)} (due before bootcamp)`} />
              )}
            </div>
          </div>

          <div className="mt-10 space-y-3 text-[14px] text-ink-200">
            <p>
              <strong className="text-white">What happens next:</strong>
            </p>
            <p>
              We'll send your bootcamp prep checklist + schedule to{' '}
              <span className="font-semibold text-white">{r.email}</span>{' '}
              a few days before event day.
            </p>
            <p>Need to reach us? Reply to the confirmation email and we'll handle it.</p>
          </div>
          <p className="mt-6 text-[11.5px] uppercase tracking-[0.18em] text-amber-300/80">
            Downpayment is non-refundable
          </p>

          <div className="mt-10">
            <Link
              href="/founders-bootcamp"
              className="text-sm font-medium text-cyan-300/90 underline-offset-4 transition hover:text-cyan-200 hover:underline"
            >
              ← Back to bootcamp page
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.05] pb-2 last:border-b-0 last:pb-0">
      <span className="text-ink-400">{label}</span>
      <span className={bold ? 'text-base font-semibold text-white tabular-nums' : 'text-ink-100 tabular-nums'}>
        {value}
      </span>
    </div>
  );
}

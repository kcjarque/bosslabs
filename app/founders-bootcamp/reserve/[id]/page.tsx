import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { BootcampPayPanel } from '@/components/bootcamp/BootcampPayPanel';
import { ProofUpload } from '@/components/ProofUpload';
import { getBootcampReservation, tierById } from '@/lib/bootcamp';
import { formatPHP } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Complete your AI Founder's Bootcamp reservation",
};

export default async function BootcampPaymentPage({
  params,
}: {
  params: { id: string };
}) {
  const r = await getBootcampReservation(params.id);
  if (!r) notFound();
  if (r.status === 'paid') redirect(`/founders-bootcamp/reserve/${r.id}/done?paid=card`);

  const tierLabel = tierById(r.tier)?.label ?? r.tier;
  const firstName = r.name.split(' ')[0];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#06070A] text-ink-200">
      {/* Background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(0,184,230,0.18),transparent_75%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(40%_30%_at_80%_100%,rgba(99,102,241,0.16),transparent_70%)]" />
      </div>

      <header className="relative z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/founders-bootcamp" className="opacity-90 transition hover:opacity-100">
            <Logo />
          </Link>
          <div className="text-[12px] text-ink-300">Step 2 of 2 · Payment</div>
        </div>
      </header>

      <main className="relative z-10">
        <div className="mx-auto max-w-3xl px-6 pb-24 pt-6 sm:pt-10">
          <div className="text-center">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
              Almost there, {firstName}
            </div>
            <h1 className="mt-3 font-serif text-4xl tracking-tight text-white sm:text-5xl">
              Lock your seat
            </h1>
            <p className="mt-4 text-[15px] leading-[1.65] text-ink-300">
              Pay your downpayment to confirm your seat. Card clears instantly; bank transfer
              confirms once your proof uploads.
            </p>
          </div>

          {/* Amount summary */}
          <div className="mt-8 rounded-3xl border border-cyan-400/30 bg-gradient-to-b from-cyan-500/[0.06] to-transparent p-6 text-center shadow-[0_28px_80px_-30px_rgba(0,184,230,0.45)]">
            <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-300">Downpayment due now</div>
            <div className="mt-2 font-serif text-[56px] leading-none tracking-tight text-white tabular-nums">
              {formatPHP(r.amountDueCentavos)}
            </div>
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/[0.07] px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-amber-200">
              Non-refundable
            </div>
            <div className="mt-3 text-[13.5px] text-ink-300">
              {tierLabel} · {r.seats} seat{r.seats === 1 ? '' : 's'} @ {formatPHP(r.perSeatCentavos)}
            </div>
            {r.balanceDueCentavos > 0 && (
              <div className="mt-3 text-[12.5px] text-ink-400">
                Total {formatPHP(r.totalCentavos)} · balance{' '}
                <span className="font-semibold text-ink-200">{formatPHP(r.balanceDueCentavos)}</span> due
                before bootcamp day
              </div>
            )}
          </div>

          {/* Pay options */}
          <div className="mt-12">
            <h2 className="font-serif text-xl text-white sm:text-2xl">
              <span className="text-cyan-300">1.</span> Pay your downpayment
            </h2>
            <p className="mt-1 text-sm text-ink-300">
              Credit card → instant confirmation. Bank transfer → use{' '}
              <span className="font-semibold text-white">"{r.name}"</span> as the transfer note so we
              match it fast.
            </p>
            <div className="mt-5">
              <BootcampPayPanel
                reservationId={r.id}
                transferNote={r.name}
                downpaymentCentavos={r.amountDueCentavos}
                totalCentavos={r.totalCentavos}
                balanceDueCentavos={r.balanceDueCentavos}
              />
            </div>
          </div>

          {/* Proof upload (bank) */}
          <div className="mt-12">
            <h2 className="font-serif text-xl text-white sm:text-2xl">
              <span className="text-cyan-300">2.</span> Bank transfer? Upload your screenshot.
            </h2>
            <p className="mt-1 text-sm text-ink-300">
              Snap a screenshot of your transfer receipt and upload — we'll confirm your seat once
              it's in. Skip if you paid by card above.
            </p>
            <div className="mx-auto mt-5 max-w-md">
              <ProofUpload id={r.id} mode="bootcamp" />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

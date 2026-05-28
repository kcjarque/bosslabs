import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Footer } from '@/components/Footer';
import { BankCards } from '@/components/BankCards';
import { ProofUpload } from '@/components/ProofUpload';
import { RetreatHeaderLight, Steps } from '@/components/RetreatChrome';
import { getRetreatReservation, getFunnels } from '@/lib/db';
import type { EventFunnelConfig } from '@/lib/db';
import { formatPHP } from '@/lib/config';
import { RETREAT_BANKS, planSummary } from '@/lib/retreat';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Complete your VibeCode Retreat reservation',
};

export default async function ReservePaymentPage({
  params,
}: {
  params: { id: string };
}) {
  const r = await getRetreatReservation(params.id);
  if (!r) notFound();

  const funnels = await getFunnels();
  const config = (funnels.find((f) => f.slug === 'vibecode-retreat')?.config ??
    {}) as EventFunnelConfig;
  const summary = planSummary(r.paymentPlan, config);
  const due = r.amountDueCentavos ?? summary.dueNow;
  const firstName = r.name.split(' ')[0];

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-white via-[#f6faf7] to-[#fbfdf9] text-slate-600">
      <RetreatHeaderLight />
      <main className="container-tight py-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <Steps active={2} />

          <div className="mt-10 text-center">
            <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-700">
              Almost there, {firstName}
            </div>
            <h1 className="mt-3 font-serif text-3xl tracking-tight text-slate-900 sm:text-4xl">
              Send your payment to lock your seat
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-600 sm:text-base">
              {summary.note}
            </p>
          </div>

          {/* Amount due */}
          <div className="mx-auto mt-8 max-w-md rounded-2xl border border-cyan-300/60 bg-gradient-to-b from-cyan-50 to-white p-6 text-center shadow-[0_16px_44px_-28px_rgba(0,140,180,0.5)]">
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-700">
              Amount due now
            </div>
            <div className="mt-1 font-serif text-5xl tracking-tight text-slate-900">
              {formatPHP(due)}
            </div>
            <div className="mt-1 text-sm text-slate-500">{summary.label}</div>
          </div>

          {/* Step 1 — pay */}
          <div className="mt-12">
            <h2 className="font-serif text-xl text-slate-900 sm:text-2xl">
              <span className="text-cyan-600">1.</span> Send it to any account
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Use your name{' '}
              <span className="font-medium text-slate-700">“{r.name}”</span> as
              the transfer note so we can match your payment fast.
            </p>
            <div className="mt-5">
              <BankCards banks={[...RETREAT_BANKS]} highlight={r.paymentMethod} />
            </div>
          </div>

          {/* Step 2 — upload proof */}
          <div className="mt-12">
            <h2 className="font-serif text-xl text-slate-900 sm:text-2xl">
              <span className="text-cyan-600">2.</span> Upload your screenshot
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Snap a screenshot of your transfer receipt and upload it — we&apos;ll
              confirm your seat once it&apos;s in.
            </p>
            <div className="mx-auto mt-5 max-w-md">
              <ProofUpload id={r.id} />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

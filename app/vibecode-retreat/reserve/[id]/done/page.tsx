import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer } from '@/components/Footer';
import { RetreatHeaderLight, Steps } from '@/components/RetreatChrome';
import { getRetreatReservation } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "You're in — VibeCode Retreat",
};

export default async function ReserveDonePage({
  params,
}: {
  params: { id: string };
}) {
  const r = await getRetreatReservation(params.id);
  const firstName = r ? r.name.split(' ')[0] : 'there';
  const email = r?.email;

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-white via-[#f6faf7] to-[#fbfdf9] text-slate-600">
      <RetreatHeaderLight />
      <main className="container-tight py-12 sm:py-20">
        <div className="mx-auto max-w-2xl">
          <Steps active={3} />

          <div className="mt-12 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-indigo-500 shadow-[0_14px_34px_-12px_rgba(0,150,200,0.65)]">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  stroke="white"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h1 className="mt-7 font-serif text-4xl tracking-tight text-slate-900 sm:text-5xl">
              You&apos;re in, {firstName}.
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-slate-600 sm:text-[17px]">
              We&apos;ve received your payment proof. Our team will verify it and
              confirm your seat
              {email ? (
                <>
                  {' '}
                  at <span className="font-medium text-slate-800">{email}</span>
                </>
              ) : null}{' '}
              within 24 hours. Keep an eye on your inbox (and spam folder).
            </p>

            <div className="mx-auto mt-9 max-w-md rounded-2xl border border-slate-200 bg-white/70 p-6 text-left shadow-[0_12px_36px_-26px_rgba(20,50,90,0.4)]">
              <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-700">
                What happens next
              </div>
              <ul className="mt-3 space-y-2.5 text-sm text-slate-600">
                <li className="flex items-start gap-2.5">
                  <Dot /> We verify your payment and lock your slot.
                </li>
                <li className="flex items-start gap-2.5">
                  <Dot /> You get a confirmation + a short prep questionnaire.
                </li>
                <li className="flex items-start gap-2.5">
                  <Dot /> A week before, we send the full itinerary and what to
                  bring.
                </li>
              </ul>
            </div>

            <div className="mt-10">
              <Link
                href="/vibecode-retreat"
                className="text-sm font-medium text-cyan-700 underline-offset-4 hover:underline"
              >
                ← Back to the retreat page
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Dot() {
  return (
    <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-cyan-500" />
  );
}

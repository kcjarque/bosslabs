import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { Mark } from '@/components/Mark';
import { OrderBumpActions } from '@/components/OrderBumpActions';

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
            Pick your upgrade below, enter the email you registered with, and choose how you&rsquo;d
            like to pay.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-3xl">
          {failed && (
            <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-200">
              Your payment didn&rsquo;t go through. Nothing was charged — pick a method below and try again.
            </div>
          )}

          <div className="rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.06] to-transparent p-5 shadow-glow sm:p-10">
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

import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { CheckoutFlow } from '@/components/CheckoutFlow';
import { PILLARS } from '@/lib/config';
import { resolveOtoOffer } from '@/lib/webinar';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const failed = searchParams.status === 'failed';
  const oto = await resolveOtoOffer();
  return (
    <>
      <Nav ctaLabel="Need help?" ctaHref="mailto:bosslabs@conexmedia.ph" />
      <main>
        {failed && (
          <div className="border-y border-red-500/30 bg-red-500/10">
            <div className="container-tight py-3 text-center text-[12px] text-red-200 sm:text-[13px]">
              Your payment didn&rsquo;t go through. Don&rsquo;t worry — your details
              are still here. Pick a method below and try again.
            </div>
          </div>
        )}
        <section className="container-tight py-10 sm:py-16">
          <CheckoutFlow oto={oto} />
        </section>

        {/* What you'll learn — anchors hesitant buyers near the action */}
        <section className="border-t border-white/[0.05] py-16 sm:py-24">
          <div className="container-tight">
            <div className="max-w-2xl">
              <div className="eyebrow">In 90 minutes you will learn</div>
              <h2 className="h-section mt-5">
                What you walk away with.
              </h2>
              <p className="lead mt-5 max-w-xl">
                Same playbook we use every week in our own businesses. Four moves,
                live demo, you leave with a working app.
              </p>
            </div>

            <div className="mt-10 grid gap-8 sm:mt-14 sm:gap-10 md:grid-cols-3">
              {PILLARS.map((item) => (
                <div key={item.n} className="flex gap-5 sm:gap-6">
                  <div className="flex-none pt-1 font-serif text-2xl italic text-cyan-400/80 sm:text-3xl">
                    {item.n}
                  </div>
                  <div>
                    <h3 className="font-serif text-xl text-white sm:text-2xl">{item.brand}</h3>
                    <p className="mt-3 font-sans text-[14px] leading-relaxed text-ink-100 sm:text-[15px]">
                      {item.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

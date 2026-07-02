import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { CheckoutFlow, type CheckoutSession } from '@/components/CheckoutFlow';
import { ExitIntentModal } from '@/components/ExitIntentModal';
import { PILLARS, STUDENT_BUILDS } from '@/lib/config';
import { getWebinarInfo } from '@/lib/webinar';
import { getSettings, getUpcomingCheckoutSessions } from '@/lib/db';

// Render per-request so the order summary shows whichever event is currently
// active (dynamic date).
export const dynamic = 'force-dynamic';

const FB_PAGE = 'https://www.facebook.com/profile.php?id=61589686430234';

const TZ_LABEL: Record<string, string> = { 'Asia/Manila': 'PHT' };

function formatSessionLabels(
  startsAtIso: string,
  timezone: string,
): { dateLabel: string; timeLabel: string } {
  const d = new Date(startsAtIso);
  const dateLabel = d.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: timezone || 'Asia/Manila',
  });
  const time = d.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone || 'Asia/Manila',
  });
  const tz = TZ_LABEL[timezone] || 'PHT';
  return { dateLabel, timeLabel: `${time} ${tz}` };
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const failed = searchParams.status === 'failed';
  const [webinar, settings, upcoming] = await Promise.all([
    getWebinarInfo(),
    getSettings().catch(() => null),
    getUpcomingCheckoutSessions(2),
  ]);
  const limit = settings?.checkoutSessionsVisible ?? 2;
  const sessions: CheckoutSession[] = upcoming.slice(0, Math.max(1, limit)).map((e) => {
    const { dateLabel, timeLabel } = formatSessionLabels(e.startsAtIso, e.timezone);
    // Short name in the radio — full event name is "AI Vibe Coding 101 —
    // July 9"; picker reads cleaner as just "July 9 Session".
    const short = e.name.replace(/^.*?—\s*/, '').trim();
    return {
      id: e.id,
      name: `${short} Session`,
      dateLabel,
      timeLabel,
    };
  });
  return (
    <>
      <Nav ctaLabel="Need help?" ctaHref={FB_PAGE} />
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
          <CheckoutFlow
            webinar={{ date: webinar.date, time: webinar.time, timezone: webinar.timezone }}
            sessions={sessions}
          />
        </section>

        {/* Proof — real builds (bawal hao shao) */}
        <section className="border-t border-white/[0.05] py-14 sm:py-20">
          <div className="container-tight">
            <div className="mx-auto max-w-2xl text-center">
              <div className="eyebrow-danger justify-center">
                <span className="pulse-dot" /> Bawal hao shao
              </div>
              <h2 className="h-section mt-4">
                Real systems we built — <span className="accent-italic">live</span> in past webinars.
              </h2>
              <p className="lead mt-4">
                Hindi &rsquo;to marketing-marketing lang. Click and see them running, live.
              </p>
            </div>
            <div className="mx-auto mt-10 grid max-w-4xl gap-5 sm:grid-cols-2">
              {STUDENT_BUILDS.map((b) => (
                <div
                  key={b.name}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]"
                >
                  <a href={b.url} target="_blank" rel="noopener noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={b.img}
                      alt={`${b.name} — built with BOSSLABS AI`}
                      className="aspect-[16/10] w-full border-b border-white/10 object-cover object-top"
                      loading="lazy"
                    />
                  </a>
                  <div className="p-5">
                    <div className="font-serif text-xl text-white">{b.name}</div>
                    <div className="mt-1 text-[13px] text-ink-300">{b.tag}</div>
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex rounded-full border border-cyan-500/40 bg-cyan-500/10 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200 transition hover:bg-cyan-500/20"
                    >
                      See it live ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What you'll learn — anchors hesitant buyers near the action */}
        <section className="border-t border-white/[0.05] py-16 sm:py-24">
          <div className="container-tight">
            <div className="max-w-2xl">
              <div className="eyebrow">In 2 hours you will learn</div>
              <h2 className="h-section mt-5">
                What you walk away with.
              </h2>
              <p className="lead mt-5 max-w-xl">
                Same playbook we use every week in our own businesses. The 3 secrets,
                a live demo, and you leave with a working app.
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
      <ExitIntentModal
        storageKey="bl_exit_checkout"
        eyebrow="Sandali lang, boss"
        title="Still don’t trust us?"
        titleAccent="Boss, you need to see this."
        sub="Tignan mo — real, working systems na ginawa namin with our students. Bawal ang hao shao."
        ctaLabel="I’m in — reserve my seat"
        ctaHref={null}
      />
    </>
  );
}

import type { Metadata } from 'next';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { Mark } from '@/components/Mark';
import { ReplayOffer } from '@/components/ReplayOffer';
import { ReplayGate } from '@/components/ReplayGate';
import { OtoOfferCard } from '@/components/OtoOfferCard';
import { OUR_APPS } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AI Vibe Coding 101 — Replay',
  description:
    'Watch the full AI Vibe Coding 101 replay and see the app we built live.',
};

// The raw, unfiltered replay. Swap this ID to point the page at a new video.
// Vimeo URL pattern: https://vimeo.com/<id> → embed at player.vimeo.com/video/<id>.
const REPLAY_VIMEO_ID = '1204563355';
const APP_URL = 'https://anaya-ops.vercel.app/';
// Screenshot of the app we built live this session (drop the file in /public).
const APP_SCREENSHOT = '/anaya-ops.png';
const BOOTCAMP_URL = 'https://www.bosslabs.live/founders-bootcamp';
// Real 7-day deadline — the replay genuinely closes at this moment. Replay
// opens tomorrow (the morning after the webinar) and runs 7 days. Change this
// single line to move the close date. Previous webinar: June 24 → +7d = July 1.
const REPLAY_CLOSES_AT = '2026-07-01T23:59:00+08:00';

export default function ReplayPage({
  searchParams,
}: {
  searchParams: { t?: string; closed?: string };
}) {
  // `?t=<seconds>` overrides the 5-min offer delay (for previewing the popup).
  const seconds = Number(searchParams.t);
  const delayMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5 * 60 * 1000;

  const deadline = new Date(REPLAY_CLOSES_AT).getTime();
  // Server-enforced: a reload after the deadline shows the closed state, so
  // the cutoff is genuine. `?closed=1` forces it for previewing.
  const initiallyClosed = searchParams.closed === '1' || Date.now() >= deadline;
  const endLabel = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(deadline);

  return (
    <div className="min-h-screen bg-[#06070A] text-ink-100">
      <header className="border-b border-white/[0.05] bg-[#06070A]/80 backdrop-blur-md">
        <div className="container-tight flex h-16 items-center justify-between">
          <div className="inline-flex items-center gap-3">
            <Mark size={26} />
            <Logo size="md" />
          </div>
          <span className="hidden text-[11px] uppercase tracking-[0.22em] text-cyan-400 sm:inline">
            AI Vibe Coding 101 · Replay
          </span>
        </div>
      </header>

      <main className="container-tight py-12 sm:py-16">
        {/* Hero */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="eyebrow justify-center">
            <span className="pulse-dot" />
            AI Vibe Coding 101 · The Replay
          </div>
          <h1 className="h-display mt-5">
            Welcome back. <span className="accent-italic">Here&apos;s the full replay.</span>
          </h1>
          <p className="lead mx-auto mt-5 max-w-xl">
            The whole session — raw and unfiltered. Rewatch any part, then scroll
            down to see the app we built live.
          </p>
        </div>

        {/* Replay video — gated by a real 7-day countdown */}
        <div className="mt-10">
          <ReplayGate
            vimeoId={REPLAY_VIMEO_ID}
            closesAtIso={REPLAY_CLOSES_AT}
            endLabel={endLabel}
            initiallyClosed={initiallyClosed}
            retreatUrl={BOOTCAMP_URL}
            forceClosed={searchParams.closed === '1'}
          />
        </div>

        {/* App we built */}
        <section className="mx-auto mt-16 max-w-3xl sm:mt-20">
          <div className="text-center">
            <div className="eyebrow justify-center">Built live, in one session</div>
            <h2 className="h-sub mt-4">
              The app we shipped <span className="accent-italic">together.</span>
            </h2>
            <p className="lead mx-auto mt-4 max-w-xl">
              No dev team. No months of waiting. This is what one focused session
              produced — go have a play.
            </p>
          </div>
          <div className="mt-8 overflow-hidden rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.06] to-transparent shadow-glow-sm">
            {/* Live screenshot of the app we built — click to open. */}
            <a
              href={APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={APP_SCREENSHOT}
                alt="Live preview of the app we built during the session"
                className="w-full border-b border-white/[0.06] transition group-hover:opacity-95"
                loading="lazy"
              />
            </a>
            <div className="p-6 text-center sm:p-8">
              <p className="font-serif text-2xl text-white sm:text-3xl">
                See it for yourself.
              </p>
              <div className="mt-6">
                <a
                  href={APP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-cyan !px-8 !py-3.5 text-base"
                >
                  Open the app we built →
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Order-bump checkout — grab the Vault or a 1:1, right here */}
        <section id="upgrade" className="mx-auto mt-16 max-w-2xl scroll-mt-8 sm:mt-24">
          <div className="text-center">
            <div className="eyebrow justify-center">Keep building · This page only</div>
            <h2 className="h-sub mt-4">
              Grab what we use to <span className="accent-italic">ship apps fast.</span>
            </h2>
            <p className="lead mx-auto mt-4 max-w-lg">
              Two ways to go further while it&apos;s fresh: the full <span className="text-white">AI
              Secrets Builder Vault</span> — every recording, tutorial, prompt &amp; blueprint — or a{' '}
              <span className="text-white">1:1 Build Session</span> with Kyle &amp; Mikey. Pick one below.
            </p>
          </div>
          <div className="mt-8">
            <OtoOfferCard orderId="" />
          </div>
        </section>

        {/* Past apps — the back catalog of live builds */}
        <section className="mx-auto mt-16 max-w-5xl sm:mt-24">
          <div className="text-center">
            <div className="eyebrow justify-center">The back catalog</div>
            <h2 className="h-sub mt-4">
              And here&apos;s what we&apos;ve <span className="accent-italic">built before.</span>
            </h2>
            <p className="lead mx-auto mt-4 max-w-xl">
              Every one shipped in a single focused session — real, working software
              running real businesses today.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {OUR_APPS.filter((app) => app.screenshot).map((app) => (
              <div
                key={app.slug}
                className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] transition hover:-translate-y-1 hover:border-cyan-500/40"
              >
                <div className="relative aspect-[16/10] overflow-hidden border-b border-white/[0.06]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={app.screenshot}
                    alt={`${app.name} — ${app.business}`}
                    className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-serif text-lg text-white">{app.name}</span>
                    <span className="shrink-0 rounded-full border border-cyan-500/30 bg-cyan-500/[0.07] px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-cyan-300">
                      {app.built}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-300">{app.tagline}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Inline retreat CTA (also surfaced as the timed popup below) */}
        <section className="mx-auto mt-16 max-w-2xl text-center sm:mt-24">
          <div className="eyebrow justify-center">Your turn</div>
          <h2 className="h-sub mt-4">
            Imagine a whole weekend <span className="accent-italic">building yours.</span>
          </h2>
          <p className="lead mx-auto mt-4 max-w-lg">
            One weekend. One build. 10 founders. You walk out with a real, working
            app for your business — not notes, an asset.
          </p>
          <div className="mt-8">
            <a
              href={BOOTCAMP_URL}
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-9 py-4 text-base font-medium text-white shadow-[0_14px_34px_-12px_rgba(0,150,200,0.65)] transition hover:from-cyan-400 hover:to-indigo-400"
            >
              Register for the AI Founder's Bootcamp →
            </a>
          </div>
        </section>
      </main>

      <ReplayOffer retreatUrl={BOOTCAMP_URL} delayMs={delayMs} />
      <Footer />
    </div>
  );
}

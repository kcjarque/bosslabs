import type { Metadata } from 'next';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { Mark } from '@/components/Mark';
import { ReplayOffer } from '@/components/ReplayOffer';
import { ReplayGate } from '@/components/ReplayGate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AI Vibe Coding 101 — Replay',
  description:
    'Watch the full AI Vibe Coding 101 replay and see the app we built live.',
};

// The raw, unfiltered replay. Swap this ID to point the page at a new video.
const REPLAY_YOUTUBE_ID = 'mlOrJhKZc_Y';
const APP_URL = 'https://REPLACE-WITH-APP-LINK';
const RETREAT_URL = 'https://www.bosslabs.live/vibecode-retreat';
// Real 7-day deadline — the replay genuinely closes at this moment. Replay
// opens tomorrow (the morning after the webinar) and runs 7 days. Change this
// single line to move the close date.
const REPLAY_CLOSES_AT = '2026-06-05T23:59:00+08:00';

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
            youtubeId={REPLAY_YOUTUBE_ID}
            closesAtIso={REPLAY_CLOSES_AT}
            endLabel={endLabel}
            initiallyClosed={initiallyClosed}
            retreatUrl={RETREAT_URL}
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
          <div className="mt-8 rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.06] to-transparent p-6 text-center shadow-glow-sm sm:p-10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-500/40 bg-cyan-500/10">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path
                  d="M8 5l8 7-8 7"
                  stroke="#1FBEEC"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="mt-5 font-serif text-2xl text-white sm:text-3xl">
              See it for yourself.
            </p>
            <div className="mt-6">
              <a href={APP_URL} className="btn-cyan !px-8 !py-3.5 text-base">
                Open the app we built →
              </a>
            </div>
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
              href={RETREAT_URL}
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-9 py-4 text-base font-medium text-white shadow-[0_14px_34px_-12px_rgba(0,150,200,0.65)] transition hover:from-cyan-400 hover:to-indigo-400"
            >
              Register for the VibeCode Retreat →
            </a>
          </div>
        </section>
      </main>

      <ReplayOffer retreatUrl={RETREAT_URL} delayMs={delayMs} />
      <Footer />
    </div>
  );
}

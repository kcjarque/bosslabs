import { Logo } from '@/components/Logo';
import { Mark } from '@/components/Mark';
import { FREE_GIFT, MESSENGER_GROUP_URL, WEBINAR } from '@/lib/config';

export const metadata = { title: "You're In — BOSSLABS AI" };

export default function RegisteredPage() {
  return (
    <>
      <header className="border-b border-white/[0.05] bg-[#06070A]/80 backdrop-blur-md">
        <div className="container-tight flex h-16 items-center justify-center">
          <div className="inline-flex items-center gap-3">
            <Mark size={26} />
            <Logo size="md" />
          </div>
        </div>
      </header>

      <main className="container-tight py-12 sm:py-20">
        <div className="mx-auto max-w-3xl">
          {/* Confirmation */}
          <div className="relative text-center">
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/10 shadow-glow">
              <span className="absolute inset-0 animate-ping rounded-full bg-cyan-400/15" />
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  stroke="#00B8E6"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="eyebrow mt-6 justify-center">Your seat is locked in</div>
            <h1 className="h-display mt-4">
              You are in.{' '}
              <span className="accent-italic">Welcome to BOSSLABS AI.</span>
            </h1>
            <p className="lead mx-auto mt-5 max-w-xl">
              Your Zoom link is on its way to your inbox. Check spam if it doesn't arrive
              within 5 minutes.
            </p>
          </div>

          {/* Messenger lock — the conversion focal point */}
          <div className="mx-auto mt-12 max-w-2xl overflow-hidden rounded-3xl border border-cyan-500/35 bg-gradient-to-b from-cyan-500/[0.08] to-transparent shadow-glow">
            {/* Top strip — Free Gift name + value */}
            <div className="flex items-center justify-between border-b border-cyan-500/20 bg-cyan-500/[0.06] px-6 py-3 sm:px-8">
              <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-cyan-300 sm:text-[11px]">
                <LockIcon /> Free Gift · {FREE_GIFT.worth}
              </div>
              <div className="font-serif text-sm italic text-white sm:text-base">
                {FREE_GIFT.name}
              </div>
            </div>

            <div className="px-6 py-8 sm:px-10 sm:py-10">
              <h2 className="font-serif text-2xl leading-snug text-white sm:text-3xl md:text-4xl">
                One more step. Join the BOSSLABS{' '}
                <span className="accent-italic">Messenger group</span> to unlock your free gift.
              </h2>
              <p className="mt-4 font-sans text-[14px] leading-relaxed text-ink-100 sm:text-[15px]">
                The Claude Code Starter Pack is dropped in the group the moment you join.
                We also use the group for live webinar reminders, replay links, and
                post-event Q&amp;A — no DMs from us, just signal.
              </p>

              <a
                href={MESSENGER_GROUP_URL}
                target="_blank"
                rel="noopener"
                className="mt-7 inline-flex w-full items-center justify-center gap-3 rounded-full bg-[#0084FF] px-7 py-4 font-sans text-base font-medium text-white shadow-[0_10px_30px_-10px_rgba(0,132,255,0.7)] transition hover:bg-[#1a8eff] sm:w-auto"
              >
                <MessengerIcon /> Join the Messenger Group
              </a>

              {/* Member-count style proof line */}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
                <div className="flex -space-x-2">
                  {['MR', 'TL', 'KS', 'BC', 'EC'].map((init, i) => (
                    <span
                      key={i}
                      className="flex h-5 w-5 items-center justify-center rounded-full border border-[#06070A] bg-gradient-to-br from-cyan-500/[0.18] to-ink-900 font-serif text-[8px] italic text-white"
                    >
                      {init}
                    </span>
                  ))}
                </div>
                <span>3,000+ Filipino operators already inside</span>
              </div>
            </div>
          </div>

          {/* Webinar details */}
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-3">
            <DetailCell label="Webinar" value={WEBINAR.name} />
            <DetailCell label="Date" value={WEBINAR.date} />
            <DetailCell label="Time" value={`${WEBINAR.time} ${WEBINAR.timezone}`} />
          </div>

          {/* Next steps */}
          <div className="mt-12 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 sm:p-8">
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">
              What happens next
            </div>
            <ol className="mt-5 space-y-3 font-sans text-[14px] leading-relaxed text-ink-100 sm:text-[15px]">
              <Step n={1} text="Open your email and confirm the Zoom registration link." />
              <Step n={2} text="Join the Messenger group above. We drop the free gift the moment you join." />
              <Step n={3} text="Show up 5 minutes early. Bring one workflow you want to automate." />
            </ol>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/[0.05] bg-[#06070A]/70 py-10">
        <div className="container-tight space-y-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-ink-200 sm:text-[11px]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 [box-shadow:0_0_6px_2px_rgba(0,184,230,0.45)]" />
            Built in Manila · Two Filipino founders
          </div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
            © {new Date().getFullYear()} BOSSLABS AI · All rights reserved.
          </div>
        </div>
      </footer>
    </>
  );
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#06070A] p-6">
      <div className="text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
        {label}
      </div>
      <div className="mt-2 font-serif text-lg text-white sm:text-xl">{value}</div>
    </div>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-[2px] flex h-6 w-6 flex-none items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10 text-[11px] text-cyan-300">
        {n}
      </span>
      <span>{text}</span>
    </li>
  );
}

function MessengerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C6.5 2 2 6.1 2 11.2c0 2.8 1.3 5.3 3.4 7v3.6l3.2-1.8c1 .3 2.2.5 3.4.5 5.5 0 10-4.1 10-9.3S17.5 2 12 2zm1.1 12.4l-2.6-2.7-4.9 2.7 5.4-5.7 2.6 2.7 4.9-2.7-5.4 5.7z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 10V8a5 5 0 0 1 10 0v2m-12 0h14v10H5V10Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

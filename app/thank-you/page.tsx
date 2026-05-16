import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { Mark } from '@/components/Mark';
import { OnboardingForm } from '@/components/OnboardingForm';
import { WEBINAR } from '@/lib/config';

export default function ThankYouPage({
  searchParams,
}: {
  searchParams: { order?: string };
}) {
  return (
    <>
      <header className="border-b border-white/[0.05] bg-[#06070A]/80 backdrop-blur-md">
        <div className="container-tight flex h-16 items-center justify-between">
          <div className="inline-flex items-center gap-3">
            <Mark size={26} />
            <Logo size="md" />
          </div>
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-cyan-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 [box-shadow:0_0_6px_2px_rgba(52,211,153,0.5)]" />
            Confirmed
          </span>
        </div>
      </header>

      <main className="container-tight py-12 sm:py-20">
        <div className="mx-auto max-w-3xl">
          {/* Celebration hero */}
          <div className="relative text-center">
            {/* Confetti-style dots radiating from the badge */}
            <div className="pointer-events-none absolute left-1/2 top-0 h-44 w-72 -translate-x-1/2" aria-hidden>
              <Confetti />
            </div>
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
              You're in.{' '}
              <span className="accent-italic">Welcome to BOSSLABS AI.</span>
            </h1>
            <p className="lead mx-auto mt-5 max-w-xl">
              Your Zoom link, replay access, and the Claude Code Starter Pack are on the
              way to your inbox. Check spam if it doesn't show up in 5 minutes.
            </p>
          </div>

          {/* Webinar details card */}
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-3">
            <DetailCell label="Webinar" value={WEBINAR.name} />
            <DetailCell label="Date" value={WEBINAR.date} />
            <DetailCell label="Format" value="Live on Zoom" />
          </div>

          {/* Onboarding form */}
          <div className="mt-16">
            <div className="eyebrow">Last step</div>
            <h2 className="h-section mt-3">Help us tailor the call to you.</h2>
            <p className="lead mt-3">
              Two minutes. Your answers shape which use-cases we live-build on the
              webinar.
            </p>
            <div className="mt-8">
              <OnboardingForm orderId={searchParams.order ?? ''} />
            </div>
          </div>

          {/* Next steps — illustrated */}
          <div className="mt-16">
            <div className="eyebrow">What happens next</div>
            <h2 className="h-sub mt-3">Three steps before the call.</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-3 sm:gap-5">
              <NextStep
                n="01"
                title="Confirm Zoom"
                body="Open your email and click the registration link. Add to your calendar."
                Icon={EmailIcon}
              />
              <NextStep
                n="02"
                title="Skim the pack"
                body="Open the Claude Code Starter Pack. 50+ prompts + starter repos waiting."
                Icon={PackIcon}
              />
              <NextStep
                n="03"
                title="Show up live"
                body="5 minutes early. Audio + camera on. Bring one workflow to automate."
                Icon={LiveIcon}
              />
            </div>
          </div>
        </div>
      </main>
      <Footer />
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

function NextStep({
  n,
  title,
  body,
  Icon,
}: {
  n: string;
  title: string;
  body: string;
  Icon: React.FC<{ size?: number }>;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/25 bg-cyan-500/[0.06]">
          <Icon size={20} />
        </div>
        <div className="font-serif text-xl italic text-cyan-400/70 sm:text-2xl">{n}</div>
      </div>
      <h3 className="mt-4 font-serif text-lg text-white sm:text-xl">{title}</h3>
      <p className="mt-2 font-sans text-[13px] leading-relaxed text-ink-100 sm:text-[14px]">
        {body}
      </p>
    </div>
  );
}

function EmailIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="#00B8E6" strokeWidth="1.6" />
      <path d="M3 8l9 6 9-6" stroke="#00B8E6" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PackIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="5" width="14" height="14" rx="2" stroke="#00B8E6" strokeWidth="1.6" />
      <rect x="7" y="3" width="14" height="14" rx="2" stroke="#80DBF6" strokeWidth="1.6" opacity="0.7" />
    </svg>
  );
}

function LiveIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="#00B8E6" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3" fill="#00B8E6" />
    </svg>
  );
}

function Confetti() {
  const dots = [
    { x: 10, y: 10, color: '#00B8E6' },
    { x: 85, y: 18, color: '#80DBF6' },
    { x: 20, y: 60, color: '#00B8E6', size: 3 },
    { x: 92, y: 70, color: '#80DBF6' },
    { x: 50, y: 90, color: '#00B8E6', size: 4 },
    { x: 35, y: 25, color: '#00B8E6', size: 3 },
    { x: 65, y: 45, color: '#80DBF6', size: 3 },
    { x: 5, y: 80, color: '#00B8E6' },
  ];
  return (
    <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={(d.size ?? 2.5) * 0.4} fill={d.color} opacity="0.55" />
      ))}
    </svg>
  );
}

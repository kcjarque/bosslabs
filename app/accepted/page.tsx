import { headers } from 'next/headers';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { Mark } from '@/components/Mark';
import { getSignups } from '@/lib/db';
import { getWebinarInfo } from '@/lib/webinar';
import { ShareCard } from '@/components/ShareCard';

/**
 * /accepted — landing page for buyers who claimed a free seat via a 100%-off
 * promo code. Mirrors /thank-you's celebration framing but strips out the
 * upsell (no OTO) and replaces the onboarding survey with an invite-others
 * share block, since the whole point of the free-seat flow is to amplify
 * reach through the people we comp in.
 */

export const dynamic = 'force-dynamic';

export default async function AcceptedPage({
  searchParams,
}: {
  searchParams: { order?: string };
}) {
  const webinar = await getWebinarInfo();

  // Resolve the buyer's first name when we have an order id so the page can
  // greet them by name. Falls back to a generic "you" if the lookup fails.
  let firstName = '';
  if (searchParams.order) {
    try {
      const signups = await getSignups();
      const match = signups.find(
        (s) => (s.metadata as { externalId?: string } | undefined)?.externalId === searchParams.order,
      );
      firstName = match?.firstName ?? '';
    } catch {
      // ignore — name greeting is decorative, not load-bearing.
    }
  }

  // Build the share URL on the server so OG-scrapers and copy-paste both
  // get the canonical site origin (NEXT_PUBLIC_SITE_URL > forwarded host).
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'bosslabs.live';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || `${proto}://${host}`).replace(/\/$/, '');
  const shareUrl = `${origin}/`;
  const shareText = `I just got accepted to the BOSSLABS AI webinar — ${webinar.name}. Free Zoom seat + community access here:`;

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
            Accepted
          </span>
        </div>
      </header>

      <main className="container-tight py-12 sm:py-20">
        <div className="mx-auto max-w-3xl">
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
            <div className="eyebrow mt-6 justify-center">Comped seat confirmed</div>
            <h1 className="h-display mt-4">
              {firstName ? `You're in, ${firstName}.` : "You're in."}{' '}
              <span className="accent-italic">Welcome to BOSSLABS AI.</span>
            </h1>
            <p className="lead mx-auto mt-5 max-w-xl">
              Your Zoom link, 7-day replay access, and Community invite are on the
              way to your inbox. Check spam if it doesn't arrive in 5 minutes.
            </p>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-3">
            <DetailCell label="Webinar" value={webinar.name} />
            <DetailCell label="Date" value={webinar.date} />
            <DetailCell label="Format" value="Live on Zoom" />
          </div>

          {/* Invite others — the whole reason we comped this seat is to amplify
              reach. Big block right under the confirmation so it's the next
              thing the buyer sees, not buried at the bottom. */}
          <div className="mt-16">
            <div className="eyebrow">Pay it forward</div>
            <h2 className="h-section mt-3">Bring one builder with you.</h2>
            <p className="lead mt-3">
              Share this with one person you'd want to build alongside. The room
              is better when smart operators show up together.
            </p>
            <div className="mt-8">
              <ShareCard url={shareUrl} text={shareText} />
            </div>
          </div>

          <div className="mt-16">
            <div className="eyebrow">What happens next</div>
            <h2 className="h-sub mt-3">Two steps before the call.</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 sm:gap-5">
              <NextStep
                n="01"
                title="Confirm Zoom"
                body="Open your email and click the registration link. Add to your calendar."
                Icon={EmailIcon}
              />
              <NextStep
                n="02"
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

function LiveIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="#00B8E6" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3" fill="#00B8E6" />
    </svg>
  );
}

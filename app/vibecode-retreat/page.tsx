import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { Mark } from '@/components/Mark';
import { getFunnels } from '@/lib/db';
import type { EventFunnelConfig } from '@/lib/db';
import { formatPHP } from '@/lib/config';

// Force-dynamic so the page always reflects the latest funnel config edited
// in /admin/funnels. It's a single cached query, so it stays fast (sub-second).
export const dynamic = 'force-dynamic';

const SLUG = 'vibecode-retreat';
const RESERVE_HREF =
  'mailto:hello@bosslabs.ai?subject=VibeCode%20Retreat%20%E2%80%94%20Reserve%20my%20slot';

export const metadata: Metadata = {
  title: 'VibeCode Retreat — One Weekend. One Build. 10 Founders.',
  description:
    'A 2-day in-person exclusive: ship a real, custom app for your business with the founders building beside you. Capped at 10 builders.',
};

async function getRetreat() {
  const funnels = await getFunnels();
  return funnels.find((f) => f.slug === SLUG) ?? null;
}

export default async function VibeCodeRetreatPage() {
  const funnel = await getRetreat();
  if (!funnel || !funnel.active) notFound();
  const c = funnel.config as EventFunnelConfig;

  return (
    <>
      <RetreatHeader location={c.location} />
      <main>
        <Hero c={c} />
        {c.byTheNumbers && c.byTheNumbers.length > 0 && (
          <ByTheNumbers stats={c.byTheNumbers} />
        )}
        {c.valueStack && c.valueStack.length > 0 && (
          <ValueStack c={c} />
        )}
        <Pricing c={c} />
        {c.alternatives && c.alternatives.length > 0 && (
          <Alternatives alternatives={c.alternatives} />
        )}
        {c.guarantee && <Guarantee text={c.guarantee} />}
        <FinalCta c={c} />
      </main>
      <Footer />
    </>
  );
}

/* --------------------------------------------------------------------- */
/* Header                                                                */
/* --------------------------------------------------------------------- */
function RetreatHeader({ location }: { location?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.05] bg-[#06070A]/80 backdrop-blur-md">
      <div className="container-tight flex h-16 items-center justify-between">
        <div className="inline-flex items-center gap-3">
          <Mark size={26} />
          <Logo size="md" />
        </div>
        <span className="hidden text-[11px] uppercase tracking-[0.22em] text-cyan-400 sm:inline">
          VibeCode Retreat{location ? ` · ${location}` : ''}
        </span>
      </div>
    </header>
  );
}

/* --------------------------------------------------------------------- */
/* Hero                                                                  */
/* --------------------------------------------------------------------- */
function Hero({ c }: { c: EventFunnelConfig }) {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-grid-fade" />
      <div className="container-tight relative py-16 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="eyebrow justify-center">
            {c.subtitle ?? 'In-Person Exclusive Event'}
            {c.location ? ` · ${c.location}` : ''}
          </div>
          <h1 className="h-display mt-5">
            {c.tagline ?? (
              <>
                One Weekend. One Build.{' '}
                <span className="accent-italic">10 Founders.</span>
              </>
            )}
          </h1>
          <p className="lead mx-auto mt-6 max-w-xl">
            Ship a real, custom app for your business with the founders building
            beside you — not a course, not a tutorial. You leave with a working
            asset.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3">
            <a
              href={RESERVE_HREF}
              className="btn-primary !px-9 !py-4 text-base"
            >
              Reserve your slot →
            </a>
            {c.capacity != null && (
              <p className="text-[11px] uppercase tracking-[0.22em] text-ink-300">
                Capped at {c.capacity} builders · by application
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* By the numbers                                                        */
/* --------------------------------------------------------------------- */
function ByTheNumbers({ stats }: { stats: { stat: string; label: string }[] }) {
  return (
    <section className="border-y border-white/[0.05] bg-ink-900/40">
      <div className="container-tight py-10 sm:py-12">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={`${s.stat}-${s.label}`} className="text-center">
              <div className="font-serif text-4xl tracking-tight text-white sm:text-5xl">
                {s.stat}
              </div>
              <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-ink-300">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* Value stack                                                           */
/* --------------------------------------------------------------------- */
function ValueStack({ c }: { c: EventFunnelConfig }) {
  const stack = c.valueStack ?? [];
  return (
    <section className="container-tight py-16 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <div className="eyebrow justify-center">Everything you walk away with</div>
          <h2 className="h-sub mt-4">
            Built for you, <span className="accent-italic">before checkout.</span>
          </h2>
        </div>

        <ul className="mt-10 space-y-4">
          {stack.map((item) => (
            <li
              key={item.label}
              className="flex flex-col gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:p-6"
            >
              <div className="flex items-start gap-3">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="mt-[3px] flex-none text-cyan-400"
                >
                  <path
                    d="M5 12.5l4.5 4.5L19 7.5"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div>
                  <div className="font-sans text-[15px] font-medium text-white sm:text-base">
                    {item.label}
                  </div>
                  <p className="mt-1 font-sans text-[13px] leading-relaxed text-ink-200 sm:text-sm">
                    {item.description}
                  </p>
                </div>
              </div>
              <div className="flex-none pl-8 sm:pl-0 sm:text-right">
                <span className="font-serif text-lg text-cyan-300 sm:text-xl">
                  {item.valueCentavos == null
                    ? 'Priceless'
                    : formatPHP(item.valueCentavos)}
                </span>
              </div>
            </li>
          ))}
        </ul>

        {c.totalValueCentavos != null && (
          <div className="mt-8 rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.06] to-transparent p-6 text-center shadow-glow-sm">
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">
              Total real-world value
            </div>
            <div className="mt-2 font-serif text-4xl tracking-tight text-white sm:text-5xl">
              {formatPHP(c.totalValueCentavos)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* Pricing                                                               */
/* --------------------------------------------------------------------- */
function Pricing({ c }: { c: EventFunnelConfig }) {
  return (
    <section className="border-t border-white/[0.05] bg-ink-900/40">
      <div className="container-tight py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <div className="eyebrow justify-center">Your investment</div>
            <h2 className="h-sub mt-4">
              {c.totalValueCentavos != null ? (
                <>
                  Not {formatPHP(c.totalValueCentavos)}.{' '}
                  <span className="accent-italic">Your seat today:</span>
                </>
              ) : (
                <span className="accent-italic">Your seat today</span>
              )}
            </h2>
          </div>

          <div className="mt-10 rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.06] to-transparent p-6 shadow-glow sm:p-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                {c.payInFullPriceCentavos != null && (
                  <>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">
                      Pay in full today
                    </div>
                    <div className="mt-2 flex items-baseline gap-3">
                      <div className="font-serif text-5xl tracking-tight text-white sm:text-6xl">
                        {formatPHP(c.payInFullPriceCentavos)}
                      </div>
                      {c.standardPriceCentavos != null &&
                        c.standardPriceCentavos !== c.payInFullPriceCentavos && (
                          <div className="font-serif text-xl text-ink-300 line-through sm:text-2xl">
                            {formatPHP(c.standardPriceCentavos)}
                          </div>
                        )}
                    </div>
                  </>
                )}
                {c.payInFullPriceCentavos == null &&
                  c.standardPriceCentavos != null && (
                    <>
                      <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">
                        All-in, per builder
                      </div>
                      <div className="mt-2 font-serif text-5xl tracking-tight text-white sm:text-6xl">
                        {formatPHP(c.standardPriceCentavos)}
                      </div>
                    </>
                  )}
              </div>
              <a href={RESERVE_HREF} className="btn-primary !px-9 !py-4 text-base">
                Reserve your slot →
              </a>
            </div>

            <div className="mt-8 grid gap-4 border-t border-white/[0.07] pt-7 sm:grid-cols-2">
              {c.depositCentavos != null && (
                <PriceRow
                  label="Deposit to secure your slot"
                  value={formatPHP(c.depositCentavos)}
                  hint={
                    c.balanceDueDate
                      ? `Balance due ${c.balanceDueDate}`
                      : undefined
                  }
                />
              )}
              {c.extraPersonCentavos != null && (
                <PriceRow
                  label="Bring an extra person"
                  value={`+ ${formatPHP(c.extraPersonCentavos)}`}
                />
              )}
            </div>

            {c.paymentMethods && c.paymentMethods.length > 0 && (
              <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-6">
                <span className="text-[11px] uppercase tracking-[0.18em] text-ink-300">
                  Pay via
                </span>
                {c.paymentMethods.map((m) => (
                  <span
                    key={m}
                    className="rounded-full border border-cyan-500/30 bg-cyan-500/[0.06] px-3 py-1 text-xs text-cyan-200"
                  >
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PriceRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div>
        <div className="font-sans text-sm text-ink-100">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-ink-300">{hint}</div>}
      </div>
      <div className="font-serif text-lg text-white">{value}</div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Alternatives comparison                                               */
/* --------------------------------------------------------------------- */
function Alternatives({
  alternatives,
}: {
  alternatives: {
    label: string;
    headline: string;
    timeframe: string;
    detail: string;
  }[];
}) {
  return (
    <section className="container-tight py-16 sm:py-20">
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <div className="eyebrow justify-center">The alternative</div>
          <h2 className="h-sub mt-4">
            What you&apos;re really{' '}
            <span className="accent-italic">choosing between.</span>
          </h2>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {alternatives.map((a) => (
            <div
              key={a.label}
              className="rounded-2xl border border-danger-500/20 bg-danger-900/10 p-6"
            >
              <div className="text-[11px] uppercase tracking-[0.22em] text-danger-300">
                {a.label}
              </div>
              <div className="mt-3 font-serif text-2xl tracking-tight text-white">
                {a.headline}
              </div>
              <div className="mt-1 text-[12px] uppercase tracking-[0.16em] text-ink-300">
                {a.timeframe}
              </div>
              <p className="mt-4 font-sans text-[13px] leading-relaxed text-ink-200">
                {a.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* Guarantee                                                             */
/* --------------------------------------------------------------------- */
function Guarantee({ text }: { text: string }) {
  return (
    <section className="border-t border-white/[0.05] bg-ink-900/40">
      <div className="container-tight py-16 sm:py-20">
        <div className="mx-auto max-w-3xl rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.06] to-transparent p-7 text-center shadow-glow-sm sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/10 shadow-glow-sm">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2.5l7.5 3v5.5c0 4.5-3.1 7.8-7.5 9-4.4-1.2-7.5-4.5-7.5-9V5.5l7.5-3z"
                stroke="#00B8E6"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M8.5 12l2.4 2.4 4.6-4.8"
                stroke="#00B8E6"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="eyebrow mt-6 justify-center">The guarantee</div>
          <p className="lead mx-auto mt-4 max-w-2xl !text-[17px]">{text}</p>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/* Final CTA                                                             */
/* --------------------------------------------------------------------- */
function FinalCta({ c }: { c: EventFunnelConfig }) {
  return (
    <section className="container-tight py-16 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="h-display">
          {c.capacity != null ? (
            <>
              Only {c.capacity} seats.{' '}
              <span className="accent-italic">Then it&apos;s closed.</span>
            </>
          ) : (
            <span className="accent-italic">Reserve your slot.</span>
          )}
        </h2>
        <p className="lead mx-auto mt-6 max-w-lg">
          The room is small on purpose. When the seats are gone, they&apos;re
          gone. Reserve yours and we&apos;ll send the next steps.
        </p>
        <div className="mt-10">
          <a href={RESERVE_HREF} className="btn-primary !px-9 !py-4 text-base">
            Reserve your slot →
          </a>
        </div>
      </div>
    </section>
  );
}

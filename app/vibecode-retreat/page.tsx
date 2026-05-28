import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { Mark } from '@/components/Mark';
import { getFunnels } from '@/lib/db';
import type { EventFunnelConfig } from '@/lib/db';
import { formatPHP } from '@/lib/config';
import { ReserveButton } from '@/components/ReserveButton';

// Force-dynamic so the page always reflects the latest funnel config edited
// in /admin/funnels. It's a single cached query, so it stays fast (sub-second).
export const dynamic = 'force-dynamic';

const SLUG = 'vibecode-retreat';

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
    <div className="relative min-h-screen bg-[#eef6fa] text-slate-600">
      <ZenBackground />
      <RetreatHeader location={c.location} />
      <main className="relative z-10">
        <Hero c={c} name={funnel.name} />
        {c.byTheNumbers && c.byTheNumbers.length > 0 && (
          <ByTheNumbers stats={c.byTheNumbers} />
        )}
        {c.valueStack && c.valueStack.length > 0 && <ValueStack c={c} />}
        <Pricing c={c} />
        {c.alternatives && c.alternatives.length > 0 && (
          <Alternatives alternatives={c.alternatives} />
        )}
        {c.guarantee && <Guarantee text={c.guarantee} />}
        <FinalCta c={c} />
      </main>
      <Footer />
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Zen background — light, calm, slowly breathing                        */
/* --------------------------------------------------------------------- */
function ZenBackground() {
  // Drifting leaves — staggered so they fall at a calm, irregular cadence.
  const leaves = [
    { left: '10%', size: 20, dur: 23, delay: 0 },
    { left: '32%', size: 15, dur: 29, delay: 7 },
    { left: '55%', size: 22, dur: 25, delay: 3 },
    { left: '74%', size: 16, dur: 31, delay: 12 },
    { left: '88%', size: 18, dur: 27, delay: 9 },
  ];
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* super-light white base, only a whisper of sage */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-[#f7fbf7] to-[#fbfdf9]" />

      {/* soft drifting abstract blobs — barely-there color so it stays white */}
      <div
        className="zen-orb -left-24 top-[3%] h-[460px] w-[460px] bg-emerald-100"
        style={{ animationDelay: '0s' }}
      />
      <div
        className="zen-orb -right-24 top-[9%] h-[520px] w-[520px] bg-sky-100"
        style={{ animationDelay: '4s' }}
      />
      <div
        className="zen-orb left-[34%] bottom-[6%] h-[440px] w-[440px] bg-amber-50"
        style={{ animationDelay: '8s' }}
      />

      {/* swaying botanical branches in opposite corners */}
      <GroveBranch
        className="grove-branch -left-12 -top-8 opacity-80"
        style={{ transformOrigin: 'top left' }}
      />
      <GroveBranch
        className="grove-branch -right-12 -bottom-10 rotate-180 opacity-80"
        style={{ transformOrigin: 'bottom right', animationDelay: '2.5s' }}
      />

      {/* leaves drifting down, slow + chill */}
      {leaves.map((l, i) => (
        <Leaf
          key={i}
          size={l.size}
          className="grove-leaf"
          style={{
            left: l.left,
            animationDuration: `${l.dur}s`,
            animationDelay: `${l.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function Leaf({
  size = 20,
  className = '',
  style,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      style={style}
    >
      <path
        d="M12 2C6.5 6.5 5 13 12 22C19 13 17.5 6.5 12 2Z"
        fill="#bfe0c8"
        opacity="0.7"
      />
      <path d="M12 4.5V20" stroke="#8fc6a2" strokeWidth="0.8" />
    </svg>
  );
}

function GroveBranch({
  className = '',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width="300"
      height="300"
      viewBox="0 0 300 300"
      fill="none"
      aria-hidden
      className={className}
      style={style}
    >
      <path
        d="M0 0 C 70 70, 110 150, 120 250"
        stroke="#9cd0ad"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />
      <g fill="#c4e3cd" opacity="0.55">
        <ellipse cx="48" cy="52" rx="13" ry="5" transform="rotate(35 48 52)" />
        <ellipse cx="70" cy="74" rx="11" ry="4.5" transform="rotate(-25 70 74)" />
        <ellipse cx="80" cy="100" rx="14" ry="5.5" transform="rotate(20 80 100)" />
        <ellipse cx="96" cy="128" rx="12" ry="5" transform="rotate(-18 96 128)" />
        <ellipse
          cx="104"
          cy="155"
          rx="14"
          ry="5.5"
          transform="rotate(8 104 155)"
        />
        <ellipse
          cx="114"
          cy="183"
          rx="11"
          ry="4.5"
          transform="rotate(-30 114 183)"
        />
        <ellipse
          cx="116"
          cy="210"
          rx="13"
          ry="5"
          transform="rotate(-6 116 210)"
        />
      </g>
    </svg>
  );
}

/* --------------------------------------------------------------------- */
/* Section helpers                                                        */
/* --------------------------------------------------------------------- */
function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center justify-center gap-2 font-sans text-[11px] uppercase tracking-[0.28em] text-cyan-700">
      {children}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Header                                                                */
/* --------------------------------------------------------------------- */
function RetreatHeader({ location }: { location?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-900/[0.06] bg-white/70 backdrop-blur-md">
      <div className="container-tight flex h-16 items-center justify-between">
        <div className="inline-flex items-center gap-3 text-slate-900">
          <Mark size={26} onLight />
          <Logo size="md" />
        </div>
        <span className="hidden text-[11px] uppercase tracking-[0.22em] text-cyan-700 sm:inline">
          VibeCode Retreat{location ? ` · ${location}` : ''}
        </span>
      </div>
    </header>
  );
}

/* --------------------------------------------------------------------- */
/* Hero                                                                  */
/* --------------------------------------------------------------------- */
function Hero({ c, name }: { c: EventFunnelConfig; name: string }) {
  return (
    <section className="relative">
      <div className="container-tight relative py-20 sm:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center justify-center gap-2 font-sans text-[11px] uppercase tracking-[0.28em] text-slate-500">
            <span className="pulse-dot" />
            {c.subtitle ?? 'In-Person Exclusive Event'}
            {c.location ? ` · ${c.location}` : ''}
          </div>

          {/* The event name, 3D poster-style word art */}
          <h1 className="word-art mt-7 text-[46px] sm:text-[80px] md:text-[96px]">
            {name}
          </h1>

          {/* Poster-echo strip */}
          <div className="word-strip mt-5 text-[12px] sm:text-sm">
            Learn · Build · Ship
          </div>

          {/* The hook, kept in the elegant serif voice */}
          <p className="mt-8 font-serif text-2xl leading-tight text-slate-800 sm:text-3xl md:text-4xl">
            {c.tagline ?? (
              <>
                One Weekend. One Build.{' '}
                <span className="italic text-cyan-600">10 Founders.</span>
              </>
            )}
          </p>

          {/* Event-detail chips */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
            {c.subtitle && (
              <span className="event-chip">
                <span className="v">2 Days</span> In-Person
              </span>
            )}
            {c.location && (
              <span className="event-chip">
                <span className="v">{c.location}</span>
              </span>
            )}
            {c.capacity != null && (
              <span className="event-chip">
                <span className="v">{c.capacity} Builders</span> Only
              </span>
            )}
            <span className="event-chip">By Application</span>
          </div>

          <p className="mx-auto mt-8 max-w-xl font-sans text-[15px] leading-relaxed text-slate-600 sm:text-[17px]">
            Ship a real, custom app for your business with the founders building
            beside you — not a course, not a tutorial. You leave with a working
            asset.
          </p>

          <div className="mt-9">
            <ReserveButton />
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
    <section className="relative">
      <div className="container-tight pb-4 pt-2 sm:pb-6">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/70 bg-white/55 px-6 py-9 shadow-[0_18px_50px_-28px_rgba(20,50,90,0.35)] backdrop-blur-md">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={`${s.stat}-${s.label}`} className="text-center">
                <div className="font-serif text-4xl tracking-tight text-slate-900 sm:text-5xl">
                  {s.stat}
                </div>
                <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
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
          <SectionEyebrow>Everything you walk away with</SectionEyebrow>
          <h2 className="mt-4 font-serif text-3xl tracking-tight text-slate-900 sm:text-4xl">
            Built for you,{' '}
            <span className="italic text-cyan-600">before checkout.</span>
          </h2>
        </div>

        <ul className="mt-10 space-y-4">
          {stack.map((item) => (
            <li
              key={item.label}
              className="flex flex-col gap-2 rounded-2xl border border-white/70 bg-white/60 p-5 shadow-[0_10px_30px_-22px_rgba(20,50,90,0.4)] backdrop-blur-md sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:p-6"
            >
              <div className="flex items-start gap-3">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="mt-[3px] flex-none text-cyan-600"
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
                  <div className="font-sans text-[15px] font-semibold text-slate-900 sm:text-base">
                    {item.label}
                  </div>
                  <p className="mt-1 font-sans text-[13px] leading-relaxed text-slate-500 sm:text-sm">
                    {item.description}
                  </p>
                </div>
              </div>
              <div className="flex-none pl-8 sm:pl-0 sm:text-right">
                <span className="font-serif text-lg text-cyan-700 sm:text-xl">
                  {item.valueCentavos == null
                    ? 'Priceless'
                    : formatPHP(item.valueCentavos)}
                </span>
              </div>
            </li>
          ))}
        </ul>

        {c.totalValueCentavos != null && (
          <div className="mt-8 rounded-2xl border border-cyan-300/60 bg-gradient-to-b from-cyan-50 to-white/40 p-6 text-center shadow-[0_14px_40px_-26px_rgba(0,140,180,0.5)]">
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-700">
              Total real-world value
            </div>
            <div className="mt-2 font-serif text-4xl tracking-tight text-slate-900 sm:text-5xl">
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
    <section className="relative">
      <div className="container-tight py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <SectionEyebrow>Your investment</SectionEyebrow>
            <h2 className="mt-4 font-serif text-3xl tracking-tight text-slate-900 sm:text-4xl">
              {c.totalValueCentavos != null ? (
                <>
                  Not {formatPHP(c.totalValueCentavos)}.{' '}
                  <span className="italic text-cyan-600">Your seat today:</span>
                </>
              ) : (
                <span className="italic text-cyan-600">Your seat today</span>
              )}
            </h2>
          </div>

          <div className="mt-10 rounded-3xl border border-cyan-300/60 bg-gradient-to-b from-white/80 to-cyan-50/60 p-6 shadow-[0_24px_60px_-30px_rgba(0,140,180,0.45)] backdrop-blur-md sm:p-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                {c.payInFullPriceCentavos != null && (
                  <>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-700">
                      Pay in full today
                    </div>
                    <div className="mt-2 flex items-baseline gap-3">
                      <div className="font-serif text-5xl tracking-tight text-slate-900 sm:text-6xl">
                        {formatPHP(c.payInFullPriceCentavos)}
                      </div>
                      {c.standardPriceCentavos != null &&
                        c.standardPriceCentavos !== c.payInFullPriceCentavos && (
                          <div className="font-serif text-xl text-slate-400 line-through sm:text-2xl">
                            {formatPHP(c.standardPriceCentavos)}
                          </div>
                        )}
                    </div>
                  </>
                )}
                {c.payInFullPriceCentavos == null &&
                  c.standardPriceCentavos != null && (
                    <>
                      <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-700">
                        All-in, per builder
                      </div>
                      <div className="mt-2 font-serif text-5xl tracking-tight text-slate-900 sm:text-6xl">
                        {formatPHP(c.standardPriceCentavos)}
                      </div>
                    </>
                  )}
              </div>
              <ReserveButton />
            </div>

            <div className="mt-8 grid gap-4 border-t border-slate-900/[0.08] pt-7 sm:grid-cols-2">
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
              <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-slate-900/[0.08] pt-6">
                <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Pay via
                </span>
                {c.paymentMethods.map((m) => (
                  <span
                    key={m}
                    className="rounded-full border border-cyan-300/70 bg-white/70 px-3 py-1 text-xs text-cyan-700"
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
        <div className="font-sans text-sm text-slate-700">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
      </div>
      <div className="font-serif text-lg text-slate-900">{value}</div>
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
          <SectionEyebrow>The alternative</SectionEyebrow>
          <h2 className="mt-4 font-serif text-3xl tracking-tight text-slate-900 sm:text-4xl">
            What you&apos;re really{' '}
            <span className="italic text-cyan-600">choosing between.</span>
          </h2>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {alternatives.map((a) => (
            <div
              key={a.label}
              className="rounded-2xl border border-rose-200/70 bg-rose-50/50 p-6 shadow-[0_10px_30px_-24px_rgba(120,40,40,0.4)] backdrop-blur-sm"
            >
              <div className="text-[11px] uppercase tracking-[0.22em] text-rose-500">
                {a.label}
              </div>
              <div className="mt-3 font-serif text-2xl tracking-tight text-slate-900">
                {a.headline}
              </div>
              <div className="mt-1 text-[12px] uppercase tracking-[0.16em] text-slate-400">
                {a.timeframe}
              </div>
              <p className="mt-4 font-sans text-[13px] leading-relaxed text-slate-600">
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
  // Split into sentences and pull out the consecutive "Not …" rejections so
  // we can blow them up as the loud centerpiece.
  const sentences = (text.match(/[^.]+\.?/g) ?? [text])
    .map((s) => s.trim())
    .filter(Boolean);
  const firstNot = sentences.findIndex((s) => /^not\b/i.test(s));
  let lastNot = firstNot;
  if (firstNot >= 0) {
    while (
      lastNot + 1 < sentences.length &&
      /^not\b/i.test(sentences[lastNot + 1])
    ) {
      lastNot++;
    }
  }
  const lead = firstNot > 0 ? sentences.slice(0, firstNot).join(' ') : '';
  const loud = firstNot >= 0 ? sentences.slice(firstNot, lastNot + 1) : [];
  const tail =
    firstNot >= 0 ? sentences.slice(lastNot + 1).join(' ') : sentences.join(' ');

  return (
    <section className="container-tight py-16 sm:py-24">
      <div className="mx-auto max-w-4xl rounded-[2rem] border border-cyan-300/60 bg-gradient-to-b from-white/85 to-cyan-50/60 p-8 text-center shadow-[0_30px_70px_-34px_rgba(0,140,180,0.5)] backdrop-blur-md sm:p-14">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-cyan-400/50 bg-white shadow-[0_10px_28px_-12px_rgba(0,150,200,0.6)]">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2.5l7.5 3v5.5c0 4.5-3.1 7.8-7.5 9-4.4-1.2-7.5-4.5-7.5-9V5.5l7.5-3z"
              stroke="#0093B8"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M8.5 12l2.4 2.4 4.6-4.8"
              stroke="#0093B8"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="mt-6">
          <SectionEyebrow>The guarantee</SectionEyebrow>
        </div>

        {lead && (
          <p className="mx-auto mt-6 max-w-2xl font-serif text-xl leading-snug text-slate-800 sm:text-2xl">
            {lead}
          </p>
        )}

        {loud.length > 0 && (
          <div className="mx-auto mt-8 max-w-3xl space-y-2.5 sm:space-y-3.5">
            {loud.map((line) => (
              <p
                key={line}
                className="flex items-start justify-center gap-3 font-serif text-[28px] font-semibold leading-[1.1] tracking-tight text-slate-900 sm:text-[46px]"
              >
                <span className="mt-1 flex-none text-rose-500 sm:mt-2">
                  <svg
                    width="0.7em"
                    height="0.7em"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span>{line.replace(/\.$/, '')}</span>
              </p>
            ))}
          </div>
        )}

        {tail && (
          <p className="mx-auto mt-9 max-w-2xl font-serif text-xl italic leading-snug text-cyan-700 sm:text-2xl">
            {tail}
          </p>
        )}
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
        <h2 className="font-serif text-4xl leading-tight tracking-tight text-slate-900 sm:text-5xl">
          {c.capacity != null ? (
            <>
              Only {c.capacity} seats.{' '}
              <span className="italic text-cyan-600">Then it&apos;s closed.</span>
            </>
          ) : (
            <span className="italic text-cyan-600">Reserve your slot.</span>
          )}
        </h2>
        <p className="mx-auto mt-6 max-w-lg font-sans text-[15px] leading-relaxed text-slate-600 sm:text-[17px]">
          The room is small on purpose. When the seats are gone, they&apos;re
          gone. Reserve yours and we&apos;ll send the next steps.
        </p>
        <div className="mt-10">
          <ReserveButton />
        </div>
      </div>
    </section>
  );
}

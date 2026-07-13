/**
 * Renders a BossLabs Project Proposal as printable HTML. Pure function of
 * form data — no state, no fetches. Sibling of ContractDocument: it reuses
 * the same letterhead, Lead Empire OPC footer, <Section>/fmtPHP helpers and
 * A4 print model, but the tone is persuasive and plain-English rather than
 * legalese. Where terms need weight, it points to the Web Development &
 * Services Agreement (the contract) instead of restating clauses verbatim.
 *
 * Layout: a dark navy/cyan branded COVER page (its own printed page), then
 * clean white inner pages carrying Sections 1–10.
 */
import type { ProposalFormData } from '@/lib/proposal-defaults';
import { findProposalOption, findShipLog } from '@/lib/proposal-defaults';

// Inline serif stack, matching ContractDocument. Note: the ProposalMaker's
// print/preview CSS forces Arial across the whole page for a clean, universal
// look — so this is the fallback the raw component ships with.
const SERIF = "'Georgia', 'Times New Roman', 'Cambria', serif";

const NAVY = '#06070A';
const CYAN = '#00B8E6';

function fmtPHP(centavos: number): string {
  return `PHP ${(centavos / 100).toLocaleString('en-PH')}`;
}

/** "15 July 2026" — readable long form for the cover + validity. */
function fmtLongDate(iso: string): string {
  try {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

/** "Jul 15, 2026" — compact form for the timeline table. */
function fmtShort(d: Date | null): string {
  if (!d) return 'TBD';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function addDays(iso: string, n: number): Date | null {
  if (!iso) return null;
  const base = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

/** Provisional PROP-YYMMDD-01 shown in the preview before the real number is
 *  assigned server-side on save. Once saved, data.proposalNo wins. */
function displayProposalNo(data: ProposalFormData): string {
  if (data.proposalNo) return data.proposalNo;
  const d = new Date(`${data.proposalDate}T00:00:00`);
  const base = Number.isNaN(d.getTime()) ? new Date() : d;
  const yy = String(base.getFullYear()).slice(2);
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  const dd = String(base.getDate()).padStart(2, '0');
  return `PROP-${yy}${mm}${dd}-01`;
}

export function ProposalDocument({ data }: { data: ProposalFormData }) {
  const option = findProposalOption(data.optionId);
  const company = data.clientCompanyName.trim() || '_____________________';
  const platform = data.platformName.trim() || 'Your Command Center';
  const repName = data.clientRepName.trim() || '__________________________';
  const repPosition = data.clientRepPosition.trim() || 'Owner';
  const proposalNo = displayProposalNo(data);

  // Timeline — every date computes from the kick-off date + editable phase
  // durations. Day numbers are cumulative and 1-based (Day 1 = kick-off day).
  const phaseDefs = [
    { name: 'Onboarding & Discovery', dur: data.onboardingDays, milestone: 'Kick-off, access granted, requirements locked' },
    { name: 'Workflow Building', dur: data.workflowDays, milestone: 'Core workflows mapped and scaffolded' },
    { name: 'MVP Build', dur: data.mvpDays, milestone: 'Working MVP delivered — you click through it' },
    { name: 'Data Migration', dur: data.dataMigrationDays, milestone: 'Your existing data imported and validated' },
    { name: 'Implementation & UAT', dur: data.implementationDays, milestone: 'UAT window, sign-off, and go-live' },
  ];
  let cursor = 1;
  const phases = phaseDefs.map((p) => {
    const startDay = cursor;
    const endDay = cursor + Math.max(1, p.dur) - 1;
    cursor = endDay + 1;
    return {
      ...p,
      startDay,
      endDay,
      startDate: addDays(data.kickoffDate, startDay - 1),
      endDate: addDays(data.kickoffDate, endDay - 1),
    };
  });
  const mvpEndDay = phases[2].endDay;
  const goLiveDay = phases[phases.length - 1].endDay;
  const goLiveDate = phases[phases.length - 1].endDate;

  const modules = data.modules.filter((m) => m.name.trim() || m.features.trim() || m.roles.trim());
  const shipLog = data.shipLog.map(findShipLog).filter((s): s is NonNullable<typeof s> => Boolean(s));

  return (
    <article className="proposal-doc text-[12px] leading-[1.55] text-black" style={{ fontFamily: SERIF }}>
      {/* ─────────────────────────── COVER (page 1) ─────────────────────────── */}
      <section
        className="proposal-cover"
        style={{
          background: `linear-gradient(135deg, ${NAVY} 0%, #0B1220 55%, #0A2A33 100%)`,
          color: '#F8FAFC',
          minHeight: '250mm',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '20mm 18mm',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
          pageBreakAfter: 'always',
          breakAfter: 'page',
        }}
      >
        <div>
          <div className="text-[26px] font-extrabold tracking-tight" style={{ letterSpacing: '0.01em' }}>
            BOSSLABS <span style={{ color: CYAN }}>AI</span>
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.28em]" style={{ color: '#94A3B8' }}>
            Command Centers for Filipino Businesses
          </div>
          <div className="mt-4 h-[3px] w-24 rounded-full" style={{ background: CYAN }} />
        </div>

        <div>
          <div className="text-[12px] uppercase tracking-[0.34em]" style={{ color: CYAN }}>
            Project Proposal
          </div>
          <h1 className="mt-3 text-[40px] font-extrabold leading-[1.05] tracking-tight">{platform}</h1>
          <p className="mt-4 max-w-[150mm] text-[14px] leading-relaxed" style={{ color: '#CBD5E1' }}>
            A hypercustomized web platform built exclusively for {company}, deployed on enterprise-grade
            cloud infrastructure using the most applicable technology stack — with a working MVP in the
            first week and full go-live in roughly {goLiveDay} days.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 text-[11.5px]">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: CYAN }}>
              Prepared for
            </div>
            <div className="mt-1.5 text-[15px] font-bold">{company}</div>
            <div style={{ color: '#CBD5E1' }}>
              {repName}
              {repPosition ? ` · ${repPosition}` : ''}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: CYAN }}>
              Prepared by
            </div>
            <div className="mt-1.5 text-[15px] font-bold">Lead Empire OPC (BOSSLABS AI)</div>
            <div className="leading-[1.5]" style={{ color: '#CBD5E1' }}>
              3rd Flr. J&amp;M Ramos Bldg., Gen. Yengco St.
              <br />
              Brgy. Poblacion IV-A, Imus, Cavite
              <br />
              admin@bosslabsai.com · bosslabs.live
            </div>
          </div>
        </div>

        <div
          className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-1 border-t pt-4 text-[11px]"
          style={{ borderColor: 'rgba(148,163,184,0.3)', color: '#CBD5E1' }}
        >
          <span>
            <span style={{ color: '#94A3B8' }}>Proposal No.</span>{' '}
            <span className="font-semibold" style={{ color: '#F8FAFC' }}>{proposalNo}</span>
          </span>
          <span>
            <span style={{ color: '#94A3B8' }}>Date</span>{' '}
            <span className="font-semibold" style={{ color: '#F8FAFC' }}>{fmtLongDate(data.proposalDate)}</span>
          </span>
          <span>
            <span style={{ color: '#94A3B8' }}>Valid for</span>{' '}
            <span className="font-semibold" style={{ color: '#F8FAFC' }}>{data.validityDays} days</span>
          </span>
        </div>
      </section>

      {/* ─────────────────────── INNER PAGES (letterhead) ─────────────────────── */}
      <header className="proposal-letterhead mb-6">
        <div className="flex items-start justify-between gap-6">
          <div className="leading-tight">
            <div className="text-[22px] font-extrabold tracking-tight text-[#06070A]" style={{ fontFamily: SERIF, letterSpacing: '0.01em' }}>
              BOSSLABS <span className="text-[#00B8E6]">AI</span>
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-gray-500">
              Project Proposal · {platform}
            </div>
          </div>
          <div className="text-right text-[10px] leading-[1.5] text-gray-600">
            <div className="font-semibold text-[#06070A]">Lead Empire OPC</div>
            <div>3rd Flr. J&amp;M Ramos Bldg., Gen. Yengco St.</div>
            <div>Brgy. Poblacion IV-A, Imus, Cavite</div>
            <div>admin@bosslabsai.com · bosslabs.live</div>
          </div>
        </div>
        <div className="mt-3 h-[3px] w-full rounded-full bg-gradient-to-r from-[#00B8E6] via-[#00B8E6] to-transparent" />
      </header>

      {/* 1. Executive Summary */}
      <Section n="1" title="Executive Summary">
        {data.clientVision.trim() && (
          <blockquote className="border-l-[3px] border-[#00B8E6] bg-[#F0FAFE] px-4 py-2 italic text-gray-800">
            &ldquo;{data.clientVision.trim()}&rdquo;
            <div className="mt-1 text-[10.5px] not-italic text-gray-500">— {company}</div>
          </blockquote>
        )}
        <p>
          We are proposing <strong>{platform}</strong> — a hypercustomized web platform built exclusively
          for <strong>{company}</strong>, deployed on enterprise-grade cloud infrastructure using the most
          applicable technology stack for your operation. Unlike off-the-shelf software you bend your
          business around, this is built around how {company} actually works.
        </p>
        <p>
          <strong>Our headline promise:</strong> a working MVP you can click through by{' '}
          <strong>Day {mvpEndDay}</strong>, and a full rollout / go-live in approximately{' '}
          <strong>{goLiveDay} days</strong>. You see real, usable software in the first week — not a slide
          deck of what might come later.
        </p>
      </Section>

      {/* 2. About BossLabs AI */}
      <Section n="2" title="About BossLabs AI">
        <p>
          BossLabs AI (Lead Empire OPC) builds bespoke software for Philippine SMEs. We are AI-native:
          every platform we ship is designed from day one to put artificial intelligence to work inside
          your daily operations, not bolted on as an afterthought.
        </p>
        <div>
          <div className="mb-1.5 mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-600">Ship Log — a sample of what we&rsquo;ve built</div>
          <div className="space-y-1.5">
            {shipLog.length > 0 ? (
              shipLog.map((s) => (
                <div key={s.id} className="flex gap-2">
                  <span className="mt-[6px] h-1.5 w-1.5 flex-none rounded-full bg-[#00B8E6]" />
                  <div>
                    <span className="font-semibold">{s.industry}</span> — {s.descriptor}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-gray-500">Selected case studies appear here.</div>
            )}
          </div>
        </div>
        <div className="mt-2 rounded-lg border border-[#BAE6FD] bg-[#F0FAFE] px-3 py-2 text-[11.5px] text-gray-700">
          <strong>Enterprise-grade by default.</strong> Your platform runs on enterprise cloud
          infrastructure with encryption in transit and at rest, continuous database backups, and handling
          of personal data compliant with the Philippine Data Privacy Act of 2012 (RA 10173).
        </div>
      </Section>

      {/* 3. Detailed Scope of Work */}
      <Section n="3" title="Detailed Scope of Work">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-600">Modules</div>
        <table className="mt-1.5 w-full border-collapse text-[11.5px]">
          <thead>
            <tr>
              <th className="border border-black bg-gray-100 px-2 py-1 text-left font-bold">Module</th>
              <th className="border border-black bg-gray-100 px-2 py-1 text-left font-bold">Key Features</th>
              <th className="border border-black bg-gray-100 px-2 py-1 text-left font-bold">Users / Roles</th>
            </tr>
          </thead>
          <tbody>
            {modules.length > 0 ? (
              modules.map((m) => (
                <tr key={m.id}>
                  <td className="border border-black px-2 py-1 align-top font-semibold">{m.name || '—'}</td>
                  <td className="border border-black px-2 py-1 align-top">{m.features || '—'}</td>
                  <td className="border border-black px-2 py-1 align-top">{m.roles || '—'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="border border-black px-2 py-2 text-center italic text-gray-500">
                  Modules to be confirmed with {company}.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-600">Integrations</div>
        {data.integrations.length > 0 ? (
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {data.integrations.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-gray-500">No third-party integrations in the base scope.</p>
        )}
        <p className="mt-1 text-[10.5px] italic text-gray-600">
          Integrations are subject to {company} granting the necessary access and to each third party&rsquo;s
          API availability (see Web Development &amp; Services Agreement §2.7).
        </p>

        <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-600">AI Functionalities (Phase 1 — included)</div>
        {data.aiPhase1.length > 0 ? (
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {data.aiPhase1.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-gray-500">AI functionalities to be scoped with {company}.</p>
        )}

        <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-600">Explicitly Out of Scope</div>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-gray-700">
          <li>Native mobile apps (iOS / Android) — the platform is a responsive web app</li>
          <li>Hardware, devices, and on-site networking equipment</li>
          <li>Third-party license or subscription fees (paid to the third parties directly)</li>
          <li>Historical data encoding / manual back-capture of legacy records</li>
        </ul>

        <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-[11.5px] text-gray-700">
          <strong>Capacity.</strong> The platform is provisioned for up to 5,000 active users, with roles
          and access levels you define and manage yourself. Capacity can be scaled by mutual agreement.
        </p>
      </Section>

      {/* 4. Timeline & Milestones */}
      <Section n="4" title="Timeline & Milestones">
        <p>
          Every date below is measured from the implementation (kick-off) meeting
          {data.kickoffDate ? <> on <strong>{fmtShort(addDays(data.kickoffDate, 0))}</strong></> : null}.
        </p>
        <table className="mt-2 w-full border-collapse text-[11.5px]">
          <thead>
            <tr>
              <th className="border border-black bg-gray-100 px-2 py-1 text-left font-bold">Phase</th>
              <th className="border border-black bg-gray-100 px-2 py-1 text-left font-bold">Days</th>
              <th className="border border-black bg-gray-100 px-2 py-1 text-left font-bold">Dates</th>
              <th className="border border-black bg-gray-100 px-2 py-1 text-left font-bold">Milestone</th>
            </tr>
          </thead>
          <tbody>
            {phases.map((p) => (
              <tr key={p.name} className={p.name === 'MVP Build' ? 'bg-[#F0FAFE]' : undefined}>
                <td className="border border-black px-2 py-1 align-top font-semibold">{p.name}</td>
                <td className="border border-black px-2 py-1 align-top tabular-nums whitespace-nowrap">
                  Day {p.startDay}
                  {p.endDay !== p.startDay ? `–${p.endDay}` : ''}
                </td>
                <td className="border border-black px-2 py-1 align-top whitespace-nowrap">
                  {fmtShort(p.startDate)}
                  {p.endDate && p.endDay !== p.startDay ? ` – ${fmtShort(p.endDate)}` : ''}
                </td>
                <td className="border border-black px-2 py-1 align-top">{p.milestone}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-semibold">
              <td className="border border-black px-2 py-1 align-top">Go-Live</td>
              <td className="border border-black px-2 py-1 align-top tabular-nums whitespace-nowrap">~Day {goLiveDay}</td>
              <td className="border border-black px-2 py-1 align-top whitespace-nowrap">{fmtShort(goLiveDate)}</td>
              <td className="border border-black px-2 py-1 align-top">Platform live and in daily use</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 font-semibold text-[#0A6E85]">
          You&rsquo;ll be clicking through a working MVP — not a mockup — in the first week.
        </p>
        <p className="mt-1 text-[10.5px] italic text-gray-600">
          Timelines are estimates and may be reasonably adjusted where delays are caused by the client
          (e.g. delayed feedback, content, approvals, or payments) or by factors outside our control, as
          set out in the Web Development &amp; Services Agreement §2.4.
        </p>
      </Section>

      {/* 5. Acceptance Process */}
      <Section n="5" title="Acceptance Process (UAT & Sign-off)">
        <Numbered n="1">
          <strong>UAT kit at handover.</strong> When the build is handed over for testing, we provide a
          User Acceptance Testing (UAT) kit: test scenarios, sample data, and a checklist covering each
          module in scope.
        </Numbered>
        <Numbered n="2">
          <strong>UAT window.</strong> Testing happens during the Implementation phase, so you validate the
          platform against real workflows before go-live — not after.
        </Numbered>
        <Numbered n="3">
          <strong>Defect classification.</strong> Issues raised during UAT are classified as Critical,
          High, Medium, or Low. Critical and High defects are resolved before sign-off; Medium and Low
          items are scheduled and tracked.
        </Numbered>
        <Numbered n="4">
          <strong>Acceptance criteria.</strong> The platform is accepted when the in-scope modules perform
          the agreed workflows and no Critical or High defects remain open.
        </Numbered>
        <Numbered n="5">
          <strong>Sign-off.</strong> Acceptance is confirmed by a <strong>Certificate of Acceptance</strong>.
          Signing it triggers the 50% balance payment, go-live, and the start of the warranty period.
        </Numbered>
        <Numbered n="6">
          <strong>Deemed acceptance.</strong> If the platform is put into live business use, or no defects
          are raised within a reasonable review period after handover, it is considered accepted.
        </Numbered>
      </Section>

      {/* 6. AI Roadmap */}
      <Section n="6" title="AI Roadmap">
        <p>
          We ship a set of AI functionalities with the build (Phase 1), and keep a roadmap of more powerful
          upgrades for later (Phase 2), quoted separately when you&rsquo;re ready.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-[#BAE6FD] bg-[#F0FAFE] p-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0A6E85]">Phase 1 — Included</div>
            {data.aiPhase1.length > 0 ? (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11.5px]">
                {data.aiPhase1.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-[11.5px] text-gray-500">To be scoped.</p>
            )}
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-600">Phase 2 — Future (quoted separately)</div>
            {data.aiPhase2.length > 0 ? (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11.5px]">
                {data.aiPhase2.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-[11.5px] text-gray-500">Roadmap items on request.</p>
            )}
          </div>
        </div>
        <p className="mt-2 text-[10.5px] italic text-gray-600">
          While your Retainer is active, reasonable upgrades and added features are included at no extra
          charge, subject to scope and capacity (Web Development &amp; Services Agreement §8.4).
        </p>
      </Section>

      {/* 7. Training & Post-Implementation Support */}
      <Section n="7" title="Training & Post-Implementation Support">
        <Numbered n="7.1">
          <strong>Training.</strong> {data.trainingSessions} live training session
          {data.trainingSessions === 1 ? '' : 's'} (Admin and End-user tracks), delivered{' '}
          <strong>{trainingModeLabel(data.trainingMode)}</strong>. Sessions are recorded and the recordings
          are turned over to you.
        </Numbered>
        <Numbered n="7.2">
          <strong>Documentation.</strong> You receive a User Manual (PDF), an Admin Guide, and short how-to
          videos covering the day-to-day workflows.
        </Numbered>
        <Numbered n="7.3">
          <strong>Hypercare.</strong> For the first two (2) weeks after go-live we provide close, priority
          support to settle the platform into daily use.
        </Numbered>
        <Numbered n="7.4">
          <strong>Warranty.</strong> A {data.warrantyDays}-day warranty from acceptance covers defects in
          the delivered scope at no charge.
        </Numbered>
        <Numbered n="7.5">
          <strong>Ongoing support — the Retainer.</strong> Beyond warranty, ongoing maintenance, hosting,
          and support are provided under the monthly Retainer, with the following service targets during
          business hours:
        </Numbered>
        <table className="mt-1 w-full border-collapse text-[11.5px]">
          <thead>
            <tr>
              <th className="border border-black bg-gray-100 px-2 py-1 text-left font-bold">Severity</th>
              <th className="border border-black bg-gray-100 px-2 py-1 text-left font-bold">Response</th>
              <th className="border border-black bg-gray-100 px-2 py-1 text-left font-bold">Restore / Fix</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-black px-2 py-1 font-semibold">Critical</td>
              <td className="border border-black px-2 py-1">Within 4 business hours</td>
              <td className="border border-black px-2 py-1">Restore/workaround within 1 business day</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 font-semibold">High</td>
              <td className="border border-black px-2 py-1">Within 8 business hours</td>
              <td className="border border-black px-2 py-1">Fix within 3 business days</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 font-semibold">Medium / Low</td>
              <td className="border border-black px-2 py-1">Next business days</td>
              <td className="border border-black px-2 py-1">Scheduled by mutual agreement</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1.5 text-[11.5px] text-gray-700">
          Business hours are 9:00 AM–6:00 PM Philippine time, Mondays to Fridays (excluding public
          holidays). We target 99% monthly platform availability while the Retainer (which covers hosting)
          is active.
        </p>
        <Numbered n="7.6">
          <strong>Continuity guarantee — you&rsquo;re never locked in.</strong> Your data is always yours and
          exportable, and you may, at your option, take full ownership of the source code and all operating
          accounts via the Exit Clause (a one-time handover fee of{' '}
          <strong>{fmtPHP(data.exitFeeCentavos)}</strong>), with turnover support included. Full terms are
          in the Web Development &amp; Services Agreement.
        </Numbered>
      </Section>

      {/* 8. Investment */}
      <Section n="8" title="Investment">
        <p>
          Based on <strong>{option.name}</strong> ({option.description}), your investment is:
        </p>
        <table className="mt-2 w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="border border-black bg-gray-100 px-2 py-1 text-left font-bold">Item</th>
              <th className="border border-black bg-gray-100 px-2 py-1 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-black px-2 py-1 align-top">
                <div className="font-semibold">Hypercustomized Web Development</div>
                <div className="mt-0.5 text-[10.5px] italic text-gray-700">
                  One-time · 50% on signing, 50% on Certificate of Acceptance.
                </div>
              </td>
              <td className="border border-black px-2 py-1 text-right align-top tabular-nums whitespace-nowrap">
                {fmtPHP(data.oneTimeTotalCentavos)}
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top">
                <div className="font-semibold">Maintenance &amp; Server Fees</div>
                <div className="mt-0.5 text-[10.5px] italic text-gray-700">
                  Monthly retainer · billed in advance · minimum {data.minRetainerMonths} months.
                </div>
              </td>
              <td className="border border-black px-2 py-1 text-right align-top tabular-nums whitespace-nowrap">
                {fmtPHP(data.monthlyRetainerCentavos)} /mo
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top">
                <div className="font-semibold">Optional — Exit / Full Code Handover</div>
                <div className="mt-0.5 text-[10.5px] italic text-gray-700">
                  One-time · only if you choose to take full ownership of the source code.
                </div>
              </td>
              <td className="border border-black px-2 py-1 text-right align-top tabular-nums whitespace-nowrap">
                {fmtPHP(data.exitFeeCentavos)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-[11.5px] text-gray-700">
          All amounts are in Philippine Pesos and inclusive of VAT where applicable — no VAT is added on
          top. Official Receipts are issued for every payment.
        </p>
      </Section>

      {/* 9. Key Terms Summary */}
      <Section n="9" title="Key Terms Summary">
        <p className="text-[11.5px] text-gray-600">In plain English — the essentials at a glance:</p>
        <ul className="mt-1 space-y-1.5">
          <KeyTerm label="Exclusivity">
            The platform is built exclusively for {company} and won&rsquo;t be resold or handed to your
            competitors.
          </KeyTerm>
          <KeyTerm label="Your data is yours">
            You own your data and can export it any time in Excel / Google Sheets format.
          </KeyTerm>
          <KeyTerm label="Data privacy">
            Personal data is handled in line with the Philippine Data Privacy Act of 2012 (RA 10173).
          </KeyTerm>
          <KeyTerm label="Availability">
            We target 99% monthly platform availability while the Retainer is active.
          </KeyTerm>
          <KeyTerm label="Term">
            A two-year working relationship, with a {data.minRetainerMonths}-month minimum on the Retainer.
          </KeyTerm>
          <KeyTerm label="Full legal terms">
            Everything here is governed by the <strong>Web Development &amp; Services Agreement</strong>,
            which controls in the event of any conflict.
          </KeyTerm>
        </ul>
      </Section>

      {/* 10. Next Steps + Conforme */}
      <Section n="10" title="Next Steps">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <NextStep n={1} title="Confirm scope">Review this proposal and confirm the modules and option.</NextStep>
          <NextStep n={2} title="Sign & pay">Sign the Agreement and settle the 50% downpayment.</NextStep>
          <NextStep n={3} title="Kick-off">We kick off within 5 business days of downpayment.</NextStep>
          <NextStep n={4} title="Backbone live">Core build (Backbone) delivered in ~30 days.</NextStep>
        </div>

        <div className="break-inside-avoid mt-6">
          <p className="text-[11.5px] text-gray-700">
            To accept this proposal and proceed to the Web Development &amp; Services Agreement, please sign
            below.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-10">
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wider">Prepared &amp; Proposed by</div>
              <div className="mt-1">Lead Empire OPC (BOSSLABS AI)</div>
              <div className="mt-10 border-t border-black pt-1 text-[11px]">
                <div className="font-semibold">Michael B. Manago</div>
                <div className="italic">Chief Executive Officer</div>
              </div>
              <div className="mt-8 border-t border-black pt-1 text-[11px]">
                <div className="font-semibold">Kyle Matthew C. Jarque</div>
                <div className="italic">Chief Technology Officer</div>
              </div>
            </div>
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wider">Conforme — Accepted by</div>
              <div className="mt-1">{company}</div>
              <div className="mt-10 border-t border-black pt-1 text-[11px]">
                <div className="font-semibold">{repName}</div>
                <div className="italic">{repPosition}</div>
              </div>
              <div className="mt-8 text-[10.5px] text-gray-500">Date: ____________________</div>
            </div>
          </div>
        </div>
      </Section>

      {/* Lead Empire OPC footer — mirrors the contract's provider identity block */}
      <footer className="mt-8 border-t border-gray-300 pt-3 text-center text-[10px] leading-[1.6] text-gray-500">
        <div className="font-semibold text-gray-700">Lead Empire OPC (BOSSLABS AI)</div>
        <div>3rd Flr. J&amp;M Ramos Bldg., Gen. Yengco St., Brgy. Poblacion IV-A, Imus, Cavite</div>
        <div>admin@bosslabsai.com · bosslabs.live · {proposalNo}</div>
      </footer>
    </article>
  );
}

function trainingModeLabel(mode: ProposalFormData['trainingMode']): string {
  if (mode === 'on-site') return 'on-site';
  if (mode === 'online') return 'online';
  return 'on-site or online (your preference)';
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid mt-5" style={{ fontFamily: SERIF }}>
      <h2 className="text-[13.5px] font-bold uppercase tracking-[0.02em]" style={{ fontFamily: SERIF }}>
        {n}. {title}
      </h2>
      <div className="mt-1.5 space-y-2">{children}</div>
    </section>
  );
}

function Numbered({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <p>
      <span className="font-semibold">{n}</span>&nbsp;&nbsp;{children}
    </p>
  );
}

function KeyTerm({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-[6px] h-1.5 w-1.5 flex-none rounded-full bg-[#00B8E6]" />
      <div>
        <span className="font-semibold">{label}.</span> {children}
      </div>
    </li>
  );
}

function NextStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#00B8E6] text-[12px] font-bold text-white">
        {n}
      </div>
      <div className="mt-1.5 text-[12px] font-semibold text-gray-900">{title}</div>
      <div className="mt-0.5 text-[11px] text-gray-600">{children}</div>
    </div>
  );
}

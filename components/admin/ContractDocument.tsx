/**
 * Renders the BossLabs Web Development Agreement as printable HTML. Pure
 * function of form data — no state, no fetches. Print-friendly CSS lives
 * in ContractMaker (only this document is visible in @media print).
 *
 * NOTES ON THE NDA SECTION (Section 11): rewritten from the NextDrive draft
 * to address: longer survival (5 years general, perpetual for trade secrets
 * + source code), explicit return/destruction on termination, mandatory
 * notice before any compelled disclosure, equitable-relief carve-out, and
 * an explicit definition of confidential information.
 */
import type { ContractFormData, ContractLineItem } from '@/lib/contract-defaults';
import { findOption } from '@/lib/contract-defaults';

function fmtPHP(centavos: number): string {
  return `PHP ${(centavos / 100).toLocaleString('en-PH')}`;
}

function fmtDate(iso: string): string {
  // Long-form Filipino business style: "this 25th day of June, 2026"
  try {
    const d = new Date(iso + 'T00:00:00');
    const day = d.getDate();
    const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][Math.min(day % 10, 4)] || 'th';
    const month = d.toLocaleString('en-US', { month: 'long' });
    const year = d.getFullYear();
    return `this ${day}${suffix} day of ${month}, ${year}`;
  } catch {
    return iso;
  }
}

function lineItemRow(li: ContractLineItem): { label: string; value: string; note: string } {
  return {
    label: li.label,
    value: `${fmtPHP(li.amountCentavos)}${li.kind === 'monthly' ? ' /mo' : ''}`,
    note: li.note ?? '',
  };
}

export function ContractDocument({ data }: { data: ContractFormData }) {
  const option = findOption(data.optionId);
  const oneTimes = data.lineItems.filter((li) => li.kind === 'oneTime');
  const monthlies = data.lineItems.filter((li) => li.kind === 'monthly');
  const oneTimeTotal = oneTimes.reduce((s, li) => s + li.amountCentavos, 0);
  const monthlyTotal = monthlies.reduce((s, li) => s + li.amountCentavos, 0);

  const repName = data.clientRepName.trim() || '__________________________';
  const repPosition = data.clientRepPosition.trim() || 'Owner';
  const company = data.clientCompanyName.trim() || '_____________________';
  const address = data.clientAddress.trim() || '_______________________________________';
  const venue = data.governingVenue.trim() || '__________________';

  return (
    <article className="contract-doc font-serif text-[12.5px] leading-[1.55] text-black">
      <header className="mb-6 text-center">
        <h1 className="font-serif text-[19px] font-bold tracking-tight">WEB DEVELOPMENT &amp; SERVICES AGREEMENT</h1>
        <div className="mt-1 text-[12px] italic">(Hypercustomized Platform Build, Management, and Hosting)</div>
      </header>

      <p>
        This Web Development &amp; Services Agreement (the &ldquo;Agreement&rdquo;) is entered into on{' '}
        <strong>{fmtDate(data.effectiveDate)}</strong> (the &ldquo;Effective Date&rdquo;), by and between:
      </p>
      <p className="mt-3">
        <strong>LEAD EMPIRE OPC</strong>, a One Person Corporation duly organized and existing under the
        laws of the Republic of the Philippines, operating under the brand name &ldquo;BOSSLABS AI&rdquo;, with
        principal office at 3rd Flr. J&amp;M Ramos Bldg., Gen. Yengco St., Brgy. Poblacion IV-A, Imus, Cavite,
        herein represented by its Chief Executive Officer, <strong>Mr. Michael B. Manago</strong>{' '}
        (the &ldquo;<strong>Provider</strong>&rdquo;);
      </p>
      <p className="mt-2">and</p>
      <p className="mt-2">
        <strong>{company.toUpperCase()}</strong>, a corporation duly organized and existing under the laws
        of the Republic of the Philippines, with principal office at {address}, herein represented by its{' '}
        <strong>{repPosition}</strong>, <strong>Mr./Ms. {repName}</strong>{' '}
        (the &ldquo;<strong>Client</strong>&rdquo;).
      </p>
      <p className="mt-2">
        The Provider and the Client are each referred to herein as a &ldquo;Party&rdquo; and collectively as
        the &ldquo;Parties.&rdquo;
      </p>

      <h2 className="mt-5 text-[14px] font-bold">Recitals</h2>
      <p className="mt-1">
        <strong>WHEREAS</strong>, the Provider is engaged in the business of bespoke software and web
        application development for small and medium enterprises;
      </p>
      <p className="mt-1">
        <strong>WHEREAS</strong>, the Client desires to engage the Provider to design, develop, deploy,
        manage, and host a hypercustomized web platform built exclusively for the Client&rsquo;s business
        operations (the &ldquo;Platform&rdquo;); and
      </p>
      <p className="mt-1">
        <strong>WHEREAS</strong>, the Provider is willing to provide such services on the terms and
        conditions set forth herein.
      </p>
      <p className="mt-2">
        <strong>NOW, THEREFORE</strong>, in consideration of the mutual covenants contained herein, the
        Parties agree as follows:
      </p>

      {/* 1. Definitions */}
      <Section n="1" title="Definitions">
        <Def term="Platform">
          the hypercustomized web application and all related modules, features, and configurations
          developed by the Provider exclusively for the Client under this Agreement, as further described
          and agreed by the Parties in writing.
        </Def>
        <Def term="Source Code">
          the human-readable programming code, scripts, and configuration files that comprise the
          Platform, together with related technical documentation.
        </Def>
        <Def term="Client Data">
          all data, records, content, and information that the Client or its users input into, generate
          within, or upload to the Platform, including its business and customer information.
        </Def>
        <Def term="Selected Option">
          the one (1) Service Option ({option.id}) elected by the Client at signing under Section 3.3,
          which shall govern the scope of work, target timelines, and fees throughout this Agreement.
        </Def>
        <Def term="Retainer">
          the monthly retainer services applicable under the Selected Option, as described in Section 3.5
          and Section 4.
        </Def>
        <Def term="Upgrade">
          a significant feature update to the Platform, such as the introduction of a new system, module,
          or department-level process not included in the agreed scope of the Platform. For the avoidance
          of doubt, an Upgrade does not include minor changes, aesthetic or cosmetic updates, copy or
          label changes, or workflow improvements to existing features; such items are treated as routine
          maintenance covered under the active Retainer or, where applicable, as ad-hoc support under
          Section 8.5.
        </Def>
      </Section>

      {/* 2. Scope */}
      <Section n="2" title="Scope of Services">
        <Numbered n="2.1">
          The Provider shall design, develop, and deploy the Platform exclusively for the Client, in
          accordance with the specifications agreed by the Parties in writing.
        </Numbered>
        <Numbered n="2.2">
          The Provider shall provide the one-time deliverables and ongoing services applicable under the
          Selected Option, each as described in Section 3 and Section 4.
        </Numbered>
        <Numbered n="2.3">
          Any work, feature, or deliverable not expressly agreed in writing shall be considered a change
          request and may be subject to additional fees and timelines, to be agreed by the Parties in
          writing before such work commences (see Section 8 for upgrade pricing).
        </Numbered>
        <Numbered n="2.4">
          <strong>Target Delivery and Implementation.</strong> The Provider shall use commercially
          reasonable efforts to deliver the core build (the &ldquo;Backbone&rdquo;) within the target
          delivery timeline of the Selected Option (<strong>{option.targetTimeline}</strong>), measured
          from the implementation (kick-off) meeting. Before work begins, the Provider shall share an
          implementation plan with corresponding milestones, and shall track progress against it; an
          interim checkpoint shall be set at approximately three-quarters (3/4) of the target timeline to
          assess whether an extension is needed. If delivery reasonably exceeds the target timeline, the
          additional time shall be handled either on a pro-rated basis or by the addition of one (1)
          further month of monthly Retainer, as agreed by the Parties. Timelines are estimates and may be
          reasonably adjusted where delays are caused by the Client (e.g., delayed feedback, content,
          approvals, or payments) or by factors outside the Provider&rsquo;s control.
        </Numbered>
        <Numbered n="2.5">
          <strong>Users.</strong> For Option A, the Platform is provisioned for up to five thousand
          (5,000) active users. For Options B and C, user capacity is scaled as part of the engagement and
          may be further increased by mutual agreement. The Client may define and manage its own user
          roles, codes, and access levels.
        </Numbered>
        <Numbered n="2.6">
          <strong>Usability.</strong> The Platform shall be designed to be user-friendly and readily
          understood by ordinary, non-technical users.
        </Numbered>
        <Numbered n="2.7">
          <strong>Third-Party Integrations.</strong> Where required by the Client, the Platform can
          integrate with third-party APIs, services, or channels as specified in the agreed scope. Such
          integrations are subject to the Client granting the necessary access and to the availability of
          each third party&rsquo;s API. The Provider is not responsible for limitations, changes, fees, or
          downtime imposed by third-party platforms or their APIs.
        </Numbered>
      </Section>

      {/* 3. Fees */}
      <Section n="3" title="Fees and Payment Terms">
        <Numbered n="3.1">
          <strong>Selected Option.</strong> The Client has elected <strong>{option.name}</strong>
          {' '}for this Agreement: {option.description} The corresponding fees, scope, and timelines
          apply throughout this Agreement.
        </Numbered>
        <Numbered n="3.2">
          <strong>Fee Schedule.</strong> The following fees shall apply. All amounts are in Philippine
          Pesos (PHP) and inclusive of VAT where applicable.
        </Numbered>

        <table className="mt-3 w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="border border-black bg-gray-100 px-2 py-1 text-left font-bold">Item</th>
              <th className="border border-black bg-gray-100 px-2 py-1 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {oneTimes.length > 0 && (
              <tr>
                <td colSpan={2} className="border border-black bg-gray-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider">
                  One-Time Fees
                </td>
              </tr>
            )}
            {oneTimes.map((li) => {
              const row = lineItemRow(li);
              return (
                <tr key={li.id}>
                  <td className="border border-black px-2 py-1 align-top">
                    <div>{row.label}</div>
                    {row.note && <div className="mt-0.5 text-[10.5px] italic text-gray-700">{row.note}</div>}
                  </td>
                  <td className="border border-black px-2 py-1 text-right align-top tabular-nums whitespace-nowrap">{row.value}</td>
                </tr>
              );
            })}
            {oneTimes.length > 0 && (
              <tr>
                <td className="border border-black bg-gray-50 px-2 py-1 text-right font-semibold">Subtotal — One-Time</td>
                <td className="border border-black bg-gray-50 px-2 py-1 text-right font-semibold tabular-nums whitespace-nowrap">
                  {fmtPHP(oneTimeTotal)}
                </td>
              </tr>
            )}
            {monthlies.length > 0 && (
              <tr>
                <td colSpan={2} className="border border-black bg-gray-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider">
                  Monthly Retainer
                </td>
              </tr>
            )}
            {monthlies.map((li) => {
              const row = lineItemRow(li);
              return (
                <tr key={li.id}>
                  <td className="border border-black px-2 py-1 align-top">
                    <div>{row.label}</div>
                    {row.note && <div className="mt-0.5 text-[10.5px] italic text-gray-700">{row.note}</div>}
                  </td>
                  <td className="border border-black px-2 py-1 text-right align-top tabular-nums whitespace-nowrap">{row.value}</td>
                </tr>
              );
            })}
            {monthlies.length > 0 && (
              <tr>
                <td className="border border-black bg-gray-50 px-2 py-1 text-right font-semibold">Subtotal — Monthly Retainer</td>
                <td className="border border-black bg-gray-50 px-2 py-1 text-right font-semibold tabular-nums whitespace-nowrap">
                  {fmtPHP(monthlyTotal)} /mo
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <Numbered n="3.3">
          All amounts are stated in Philippine Pesos (PHP) and are inclusive of value-added tax (VAT)
          where applicable. No additional VAT shall be charged on top of the stated amounts. The Provider
          shall issue the appropriate official receipt or invoice for all payments received.
        </Numbered>
        <Numbered n="3.4">
          Monthly Retainer fees are billed monthly in advance and due within seven (7) days of invoice.
          The first monthly cycle commences on the day of the implementation (kick-off) meeting, unless
          otherwise agreed in writing.
        </Numbered>
        <Numbered n="3.5">
          Late payments may accrue interest at one percent (1%) per month on the overdue amount. The
          Provider may suspend services, including hosting and platform access, after written notice if
          any undisputed amount remains unpaid for more than fifteen (15) days. The Provider shall restore
          services promptly upon settlement.
        </Numbered>
        <Numbered n="3.6">
          Optional services after discontinuation of the Retainer (ad-hoc support per call and Upgrades as
          defined in Section 1) are charged as set out in Section 8 and are engaged only at the
          Client&rsquo;s request.
        </Numbered>
      </Section>

      {/* 4. SLA */}
      <Section n="4" title="Service Levels and Operations">
        <Numbered n="4.1">
          <strong>Maintenance / DevOps.</strong> The Provider shall provide the maintenance or DevOps
          services described under the Selected Option. The Provider shall apply commercially reasonable
          measures to keep the Platform available and secure but does not guarantee uninterrupted,
          error-free operation. Major new modules or features remain change requests under Section 2.3.
        </Numbered>
        <Numbered n="4.2">
          <strong>Cybersecurity (where applicable).</strong> For so long as the Cybersecurity retainer
          remains active, the Provider shall provide the security monitoring and incident-response
          services described under the Selected Option. Cybersecurity services are scoped to the Platform
          and exclude (i) the Client&rsquo;s own endpoints, devices, or office networks; (ii) systems or
          data not under the Provider&rsquo;s administrative control; and (iii) acts of the Client or its
          users that materially weaken the Platform&rsquo;s security posture.
        </Numbered>
        <Numbered n="4.3">
          <strong>SLA Targets.</strong> While the Retainer is active, the Provider targets, measured
          during business hours: Critical issues — response within 4 business hours, restoration or
          workaround within 1 business day; High — response within 8 business hours, fix within 3 business
          days; Medium — response within 2 business days, addressed in the next maintenance cycle;
          Low — response within 3 business days, scheduled by mutual agreement.
        </Numbered>
        <Numbered n="4.4">
          <strong>Business Hours.</strong> 9:00 AM to 6:00 PM Philippine Standard Time, Mondays to
          Fridays, excluding Philippine public holidays. Critical security incidents under Options B and C
          may be reported outside business hours through the agreed Cybersecurity escalation channel.
        </Numbered>
        <Numbered n="4.5">
          <strong>Availability.</strong> The Provider targets monthly Platform availability of ninety-nine
          percent (99%), excluding scheduled maintenance, Client-caused downtime, third-party outages, and
          force majeure events. Availability targets apply only while the Retainer (which covers hosting)
          remains active.
        </Numbered>
      </Section>

      {/* 5. IP */}
      <Section n="5" title="Intellectual Property and Exclusivity">
        <Numbered n="5.1">
          <strong>Ownership.</strong> Unless and until the Client acquires the Source Code under
          Section 6, all right, title, and interest in and to the Platform and the Source Code, including
          all intellectual property rights therein, shall belong exclusively to the Provider
          (Lead Empire OPC / BOSSLABS AI).
        </Numbered>
        <Numbered n="5.2">
          <strong>License to Use.</strong> During the term of this Agreement and for so long as the
          Client&rsquo;s fees are current, the Provider grants the Client a non-transferable license to
          access and use the Platform for the Client&rsquo;s internal business operations. This license
          terminates upon termination of this Agreement (subject to Section 6).
        </Numbered>
        <Numbered n="5.3">
          <strong>Exclusivity to the Client.</strong> The Platform is built exclusively for the Client.
          The Provider shall not license, sell, sublicense, lease, or deploy the Platform, or any
          substantially similar derivative built specifically for the Client, to any third party, and in
          particular shall not provide it to any direct competitor of the Client. This restriction applies
          for so long as this Agreement remains in force.
        </Numbered>
        <Numbered n="5.4">
          <strong>Reusable Components and Know-How.</strong> Notwithstanding Section 5.3, the Provider
          retains all rights to its pre-existing materials and to general frameworks, libraries, tools,
          templates, techniques, and know-how that are not unique or specific to the Client, and may
          freely reuse such generic components in other projects.
        </Numbered>
        <Numbered n="5.5">
          <strong>Client Materials.</strong> The Client retains ownership of all trademarks, logos, brand
          assets, and content it provides, and grants the Provider a license to use the same solely to
          perform the services under this Agreement.
        </Numbered>
      </Section>

      {/* 6. Exit */}
      <Section n="6" title="Exit Clause (Full Code Handover)">
        <Numbered n="6.1">
          <strong>Why an Exit Clause.</strong> Unlike traditional software development, the Platform
          incorporates AI- and agent-driven components — including system prompts, agent configurations,
          prompt-engineering decisions, knowledge-base structures, integrations with AI providers, and
          operational workflows that have been iteratively tuned over the course of the engagement. A full
          handover therefore requires substantially more effort than transferring a conventional codebase.
          The Exit Fee below reflects this additional effort.
        </Numbered>
        <Numbered n="6.2">
          <strong>Option to Fully Handover.</strong> The Client may, at its option, fully acquire
          ownership of the Source Code together with all accounts and materials used to operate the
          Platform by paying the Provider a one-time Exit Fee of <strong>PHP 100,000.00</strong>, in
          addition to settling all amounts then due.
        </Numbered>
        <Numbered n="6.3">
          <strong>What is Turned Over.</strong> Upon the Provider&rsquo;s receipt of the Exit Fee and
          settlement of all outstanding amounts, the Provider shall: (a) assign and transfer to the Client
          all right, title, and interest in and to the Source Code and its associated intellectual
          property; (b) deliver the complete Source Code, technical documentation, system prompts and
          agent configurations, integration credentials, all accounts used to operate the Platform, and
          (where produced under the Selected Option) security configurations, audit findings, and VAPT
          reports; and (c) provide reasonable turnover and implementation support, including knowledge
          transfer on the AI- and agent-driven components, sufficient to enable the Client (or a successor
          developer) to operate the Platform independently.
        </Numbered>
        <Numbered n="6.4">
          <strong>If the Exit Clause Is Not Exercised.</strong> If the Client does not pay the Exit Fee,
          ownership of the Source Code and associated intellectual property remains exclusively with the
          Provider, and the Client&rsquo;s rights are limited to the license to use the Platform under
          Section 5.2. In that case, upon termination or upon the Client&rsquo;s reasonable request, the
          Provider shall export the Client&rsquo;s database and provide the Client Data in a usable XLSX
          (Excel) or Google Sheets format, which the Client may freely use, print, and retain.
        </Numbered>
        <Numbered n="6.5">
          <strong>Effect on Ongoing Services.</strong> Upon exercise of the Exit Clause and completed
          migration to the Client&rsquo;s own infrastructure, the Provider&rsquo;s ongoing obligations
          (Maintenance, DevOps, Cybersecurity, and Hosting, as applicable) and the corresponding fees
          shall cease, unless the Parties separately agree in writing for the Provider to continue
          providing any such services.
        </Numbered>
      </Section>

      {/* 7. Client Data */}
      <Section n="7" title="Client Data, Access, and Security">
        <Numbered n="7.1">
          <strong>Ownership.</strong> As between the Parties, all Client Data is and shall remain the
          exclusive property of the Client. Ownership of Client Data is independent of, and unaffected by,
          ownership of the Source Code.
        </Numbered>
        <Numbered n="7.2">
          <strong>Data Export.</strong> Upon termination of this Agreement or upon the Client&rsquo;s
          reasonable written request, the Provider shall, within a reasonable period, provide the Client
          an export of the Client Data in a commonly used electronic format such as XLSX (Excel) or Google
          Sheets.
        </Numbered>
        <Numbered n="7.3">
          <strong>Provider Access.</strong> To develop, operate, manage, and support the Platform, the
          Provider has administrative access to the live Platform and its database. The Provider does not
          have access to users&rsquo; passwords, which are stored in encrypted form. Other data may be
          accessed and extracted by the Provider solely to operate, support, and back up the Platform.
        </Numbered>
        <Numbered n="7.4">
          <strong>Security and Backups.</strong> The Platform is hosted on a Supabase Pro account with
          continuous database backups. The Provider applies commercially reasonable technical and
          organizational measures to protect Client Data and processes it only as necessary to provide the
          services and in accordance with applicable law, including the Data Privacy Act of 2012
          (Republic Act No. 10173).
        </Numbered>
      </Section>

      {/* 8. Term + Upgrades */}
      <Section n="8" title="Term, Minimum Term, Upgrades, and Termination">
        <Numbered n="8.1">
          <strong>Initial Term.</strong> This Agreement takes effect on the Effective Date and shall have
          an initial term of two (2) years (the &ldquo;Initial Term&rdquo;), unless earlier terminated in
          accordance with this Section.
        </Numbered>
        <Numbered n="8.2">
          <strong>Minimum Retainer Commitment.</strong> The Client commits to a minimum of six (6) months
          from the Effective Date for the Retainer applicable under the Selected Option.
        </Numbered>
        <Numbered n="8.3">
          <strong>Discontinuing the Retainer.</strong> After the six (6)-month minimum, the Client may
          discontinue the Retainer upon thirty (30) days&rsquo; prior written notice. Any hosting and
          infrastructure component required to keep the Platform online shall continue to be billed as
          long as the Provider hosts the Platform.
        </Numbered>
        <Numbered n="8.4">
          <strong>Upgrades during the Initial Term.</strong> While the Retainer remains active, reasonable
          upgrades and added features requested by the Client are included at no additional charge,
          subject to reasonable scope and the Provider&rsquo;s capacity. Minor changes, aesthetic or
          cosmetic updates, and workflow improvements to existing features are always included.
          Substantial Upgrades (as defined in Section 1) materially beyond the agreed scope of the
          Platform may be scoped and quoted separately by mutual agreement.
        </Numbered>
        <Numbered n="8.5">
          <strong>Optional Support after the Retainer.</strong> If the Retainer is discontinued (after the
          six (6)-month minimum), or after the Initial Term where not renewed, ad-hoc support is charged
          at <strong>PHP 3,000.00</strong> per consultation or maintenance call/request. Upgrades (as
          defined in Section 1) are quoted per scope before work begins, starting at{' '}
          <strong>PHP 15,000.00</strong>. Minor changes are not considered Upgrades.
        </Numbered>
        <Numbered n="8.6">
          <strong>Termination for Cause.</strong> Either Party may terminate this Agreement immediately
          upon written notice if the other Party commits a material breach and fails to cure it within
          fifteen (15) days after written notice describing the breach.
        </Numbered>
      </Section>

      {/* 9. Warranties */}
      <Section n="9" title="Warranties and Disclaimers">
        <Numbered n="9.1">
          The Provider warrants that it will perform the services in a professional and workmanlike manner
          consistent with industry standards.
        </Numbered>
        <Numbered n="9.2">
          Except as expressly stated, the Platform and services are provided &ldquo;as is.&rdquo; To the
          fullest extent permitted by law, the Provider disclaims all other warranties, whether express or
          implied, including any implied warranty of merchantability or fitness for a particular purpose.
        </Numbered>
        <Numbered n="9.3">
          The Client is responsible for the accuracy and legality of the Client Data and content it
          provides, and for its use of the Platform in compliance with applicable law.
        </Numbered>
      </Section>

      {/* 10. Liability */}
      <Section n="10" title="Limitation of Liability">
        <Numbered n="10.1">
          To the fullest extent permitted by law, neither Party shall be liable to the other for any
          indirect, incidental, consequential, special, or exemplary damages, including loss of profits,
          revenue, data, or goodwill, arising out of or in connection with this Agreement.
        </Numbered>
        <Numbered n="10.2">
          Except for the Client&rsquo;s payment obligations and either Party&rsquo;s liability for willful
          misconduct, gross negligence, or breach of confidentiality, the aggregate liability of either
          Party arising out of or related to this Agreement shall not exceed the total fees paid by the
          Client to the Provider in the three (3) months immediately preceding the event giving rise to
          the claim.
        </Numbered>
      </Section>

      {/* 11. NDA — REWRITTEN */}
      <Section n="11" title="Confidentiality and Non-Disclosure">
        <Numbered n="11.1">
          <strong>Confidential Information.</strong> &ldquo;Confidential Information&rdquo; means any
          non-public information disclosed by one Party (the &ldquo;Disclosing Party&rdquo;) to the other
          (the &ldquo;Receiving Party&rdquo;) in connection with this Agreement, whether orally, in
          writing, electronically, or by inspection, and whether or not marked or identified as
          confidential. This includes, without limitation: (a) the Source Code, system prompts, agent
          configurations, prompt-engineering decisions, and operational workflows of the Platform;
          (b) Client Data, customer lists, business plans, pricing, financial information, and strategy;
          (c) security audit findings, VAPT reports, and infrastructure configurations; and (d) the terms
          of this Agreement.
        </Numbered>
        <Numbered n="11.2">
          <strong>Obligations of the Receiving Party.</strong> The Receiving Party shall: (i) hold the
          Disclosing Party&rsquo;s Confidential Information in strict confidence; (ii) use it solely to
          perform its obligations or exercise its rights under this Agreement; (iii) protect it with at
          least the same degree of care it uses for its own confidential information of like importance,
          and in no event less than a reasonable standard of care; and (iv) limit access to those of its
          employees, contractors, and advisers who have a need to know and who are bound by written
          confidentiality obligations no less protective than those in this Section.
        </Numbered>
        <Numbered n="11.3">
          <strong>Exclusions.</strong> These obligations do not apply to information that the Receiving
          Party can demonstrate by competent evidence: (a) was already known to it without restriction
          before disclosure; (b) is or becomes publicly available through no breach by the Receiving
          Party; (c) was rightfully obtained from a third party not bound by a confidentiality obligation;
          or (d) was independently developed by the Receiving Party without reference to the Disclosing
          Party&rsquo;s Confidential Information.
        </Numbered>
        <Numbered n="11.4">
          <strong>Compelled Disclosure.</strong> If the Receiving Party is required by law, court order,
          or governmental authority to disclose Confidential Information, it shall (where legally
          permitted) give the Disclosing Party prompt written notice before disclosure, cooperate with any
          reasonable effort to seek a protective order or other limitation, and disclose only the portion
          of Confidential Information that is legally required.
        </Numbered>
        <Numbered n="11.5">
          <strong>Survival.</strong> The confidentiality obligations in this Section shall survive
          termination or expiry of this Agreement for a period of five (5) years. Notwithstanding the
          foregoing, the obligations with respect to trade secrets, Source Code, system prompts, agent
          configurations, and security audit / VAPT reports shall remain in effect for so long as such
          information retains its confidential or trade-secret character under applicable law.
        </Numbered>
        <Numbered n="11.6">
          <strong>Return or Destruction.</strong> Upon termination of this Agreement or upon the
          Disclosing Party&rsquo;s written request at any time, the Receiving Party shall, at the
          Disclosing Party&rsquo;s option, return or securely destroy all Confidential Information in its
          possession or control (including all copies and extracts), and certify such return or
          destruction in writing within thirty (30) days. The Receiving Party may retain one (1) archival
          copy solely for legal-compliance and audit purposes, which shall remain subject to the
          confidentiality obligations of this Section for as long as it is retained.
        </Numbered>
        <Numbered n="11.7">
          <strong>Equitable Relief.</strong> The Parties acknowledge that unauthorized use or disclosure
          of Confidential Information may cause irreparable harm for which monetary damages would be an
          inadequate remedy. Accordingly, the Disclosing Party shall be entitled to seek injunctive or
          other equitable relief (without the necessity of posting a bond) in addition to any other
          remedies available at law or in equity.
        </Numbered>
        <Numbered n="11.8">
          <strong>Security Audit and VAPT Reports.</strong> Security audit reports and VAPT reports
          prepared under this Agreement are confidential and may not be shared externally by the Client
          without the Provider&rsquo;s prior written consent, except to the Client&rsquo;s legal, audit,
          or regulatory advisers under written confidentiality obligations no less protective than this
          Section.
        </Numbered>
      </Section>

      {/* 12. General */}
      <Section n="12" title="General Provisions">
        <Numbered n="12.1">
          <strong>Independent Contractor.</strong> The Provider is an independent contractor. Nothing in
          this Agreement creates a partnership, joint venture, agency, or employment relationship between
          the Parties.
        </Numbered>
        <Numbered n="12.2">
          <strong>Force Majeure.</strong> Neither Party shall be liable for any delay or failure to
          perform caused by events beyond its reasonable control, including acts of God, natural
          disasters, power or internet outages, government action, or failures of third-party service
          providers.
        </Numbered>
        <Numbered n="12.3">
          <strong>Assignment.</strong> Neither Party may assign this Agreement without the other
          Party&rsquo;s prior written consent, which shall not be unreasonably withheld, except that the
          Provider may use qualified subcontractors (including, for Option C, the third-party VAPT vendor)
          provided it remains responsible for their work.
        </Numbered>
        <Numbered n="12.4">
          <strong>Notices.</strong> All notices under this Agreement shall be in writing and delivered to
          the Parties&rsquo; respective addresses or official email addresses as set out herein or as
          later updated in writing.
        </Numbered>
        <Numbered n="12.5">
          <strong>Entire Agreement; Amendments.</strong> This Agreement constitutes the entire agreement
          between the Parties and supersedes all prior discussions and understandings. Any amendment must
          be in writing and signed by both Parties.
        </Numbered>
        <Numbered n="12.6">
          <strong>Severability.</strong> If any provision of this Agreement is held invalid or
          unenforceable, the remaining provisions shall continue in full force and effect.
        </Numbered>
        <Numbered n="12.7">
          <strong>Governing Law and Dispute Resolution.</strong> This Agreement shall be governed by and
          construed in accordance with the laws of the Republic of the Philippines. The Parties shall
          first attempt to resolve any dispute amicably through good-faith negotiation. Failing
          resolution, the dispute shall be submitted to the proper courts of <strong>{venue}</strong>, to
          the exclusion of all other venues.
        </Numbered>
      </Section>

      {/* Signatures */}
      <section className="break-inside-avoid mt-8">
        <h2 className="text-[14px] font-bold">Signatures</h2>
        <p className="mt-2">
          IN WITNESS WHEREOF, the Parties have caused this Agreement to be signed on the date first
          written above.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-10">
          <div>
            <div className="text-[12px] font-bold uppercase tracking-wider">PROVIDER</div>
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
            <div className="text-[12px] font-bold uppercase tracking-wider">CLIENT</div>
            <div className="mt-1">{company}</div>
            <div className="mt-10 border-t border-black pt-1 text-[11px]">
              <div className="font-semibold">{repName}</div>
              <div className="italic">{repPosition}</div>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid mt-5">
      <h2 className="text-[14px] font-bold">{n}. {title}</h2>
      <div className="mt-1 space-y-2">{children}</div>
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

function Def({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <p>
      &ldquo;<strong>{term}</strong>&rdquo; means {children}
    </p>
  );
}

/**
 * Renders the BossLabs Mutual NDA as printable HTML. Pure function of form
 * data — no state, no fetches. Print CSS lives in NdaMaker.
 *
 * Body text matches the MHECO-BossLabs NDA template verbatim except for
 * counterparty-specific fields (name, address, signatory, recital phrasing,
 * effective date, venue). Boilerplate sections 1–16 are fixed.
 */
import type { NdaFormData } from '@/lib/nda-defaults';

const SERIF = "'Georgia', 'Times New Roman', 'Cambria', serif";

function fmtDayMonthYear(iso: string): { day: string; month: string; year: string } {
  try {
    const d = new Date(iso + 'T00:00:00');
    return {
      day: String(d.getDate()),
      month: d.toLocaleString('en-US', { month: 'long' }),
      year: String(d.getFullYear()).slice(-2),
    };
  } catch {
    return { day: '_____', month: '______________', year: '__' };
  }
}

export function NdaDocument({ data }: { data: NdaFormData }) {
  const { day, month, year } = fmtDayMonthYear(data.effectiveDate);
  const company = data.counterpartyCompanyName.trim() || '__________________________';
  const companyShort = company; // used as the defined party name in headings
  const address = data.counterpartyOfficeAddress.trim() || '____________________________________________';
  const repName = data.counterpartyRepName.trim() || '__________________________';
  const repPosition = data.counterpartyRepPosition.trim() || '__________________';
  const bossOffice = data.bosslabsOfficeAddress.trim() || '____________________________________________';
  const bossSec = data.bosslabsSecRegNo.trim() || '________________';
  const businessDesc = data.counterpartyBusinessDescription.trim() || 'a duly organized enterprise';
  const purpose = data.purposeDescription.trim() ||
    'the Parties wish to explore and undertake a potential or actual business engagement';
  const venue = data.governingVenue.trim() || 'Makati City';

  return (
    <article className="contract-doc text-[12px] leading-[1.55] text-black" style={{ fontFamily: SERIF }}>
      {/* Letterhead */}
      <header className="contract-letterhead mb-6">
        <div className="flex items-start justify-between gap-6">
          <div className="leading-tight">
            <div className="text-[22px] font-extrabold tracking-tight text-[#06070A]" style={{ fontFamily: SERIF, letterSpacing: '0.01em' }}>
              BOSSLABS <span className="text-[#00B8E6]">AI</span>
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-gray-500">
              Command Centers for Filipino Businesses
            </div>
          </div>
          <div className="text-right text-[10px] leading-[1.5] text-gray-600">
            <div className="font-semibold text-[#06070A]">Lead Empire OPC</div>
            <div>{bossOffice}</div>
            <div>admin@bosslabsai.com &middot; bosslabs.live</div>
          </div>
        </div>
        <div className="mt-3 h-[3px] w-full rounded-full bg-gradient-to-r from-[#00B8E6] via-[#00B8E6] to-transparent" />
      </header>

      {/* Title */}
      <div className="mb-6 text-center">
        <h1 className="text-[20px] font-bold tracking-tight text-[#06070A]" style={{ fontFamily: SERIF, letterSpacing: '0.01em' }}>
          MUTUAL NON-DISCLOSURE AGREEMENT
        </h1>
        <div className="mt-1 text-[11.5px] italic text-gray-700" style={{ fontFamily: SERIF }}>
          Confidential
        </div>
      </div>

      <p>
        This Mutual Non-Disclosure Agreement (the &ldquo;<strong>Agreement</strong>&rdquo;) is made and entered into in
        {' '}{venue}, Philippines on this <strong>{day}</strong> day of <strong>{month}</strong>, 20<strong>{year}</strong> (the
        &ldquo;<strong>Effective Date</strong>&rdquo;), by and between:
      </p>

      <p className="mt-3">
        <strong>LEAD EMPIRE OPC</strong>, a One Person Corporation duly organized and existing under the laws of the
        Republic of the Philippines, operating under the trade name &ldquo;<strong>BossLabs AI</strong>,&rdquo; with principal
        office address at {bossOffice}, and SEC Registration No. {bossSec}, herein represented by its CEO,{' '}
        <strong>MICHAEL BATIQUIN MANAGO</strong> (hereinafter referred to as &ldquo;<strong>BossLabs</strong>&rdquo;);
      </p>

      <p className="mt-2 text-center font-semibold">- and -</p>

      <p className="mt-2">
        <strong>{company.toUpperCase()}</strong>, a corporation duly organized and existing under the laws of the
        Republic of the Philippines, with principal office address at {address}, herein represented by its duly
        authorized representative, <strong>{repName}</strong>, in his/her capacity as <strong>{repPosition}</strong>{' '}
        (hereinafter referred to as &ldquo;<strong>{companyShort.toUpperCase()}</strong>&rdquo;).
      </p>

      <p className="mt-2">
        BossLabs and {companyShort.toUpperCase()} are each referred to herein individually as a &ldquo;<strong>Party</strong>&rdquo;
        and collectively as the &ldquo;<strong>Parties.</strong>&rdquo;
      </p>

      {/* RECITALS */}
      <h2 className="mt-5 text-[13.5px] font-bold uppercase tracking-[0.02em]" style={{ fontFamily: SERIF }}>Recitals</h2>
      <p className="mt-1">
        <strong>WHEREAS</strong>, BossLabs is engaged in the business of artificial intelligence consulting, software
        development, and the design and deployment of custom digital applications and systems;
      </p>
      <p className="mt-1">
        <strong>WHEREAS</strong>, {companyShort.toUpperCase()} is {businessDesc};
      </p>
      <p className="mt-1">
        <strong>WHEREAS</strong>, {purpose} (the &ldquo;<strong>Purpose</strong>&rdquo;);
      </p>
      <p className="mt-1">
        <strong>WHEREAS</strong>, in connection with the Purpose, each Party (as the &ldquo;Disclosing Party&rdquo;) may
        disclose to the other Party (as the &ldquo;Receiving Party&rdquo;) certain confidential and proprietary
        information, and the Parties desire to protect such information from unauthorized use and disclosure;
      </p>
      <p className="mt-2">
        <strong>NOW, THEREFORE</strong>, for and in consideration of the foregoing premises and the mutual covenants
        set forth herein, the Parties hereby agree as follows:
      </p>

      {/* 1. */}
      <Section n="1" title="Definition of Confidential Information">
        <Numbered n="1.1">
          &ldquo;Confidential Information&rdquo; means any and all non-public information, in whatever form or medium
          (whether written, oral, electronic, visual, or otherwise), disclosed by or on behalf of the Disclosing Party
          to the Receiving Party, whether before or after the Effective Date, that is designated as confidential or that
          ought reasonably to be understood as confidential given its nature or the circumstances of its disclosure.
        </Numbered>
        <Numbered n="1.2">Confidential Information includes, without limitation:</Numbered>
        <Lettered n="(a)">business plans, strategies, pricing, costs, financial data, and commercial terms;</Lettered>
        <Lettered n="(b)">
          source code, object code, software architecture, technical designs, system specifications, build
          methodologies, prompts, datasets, and development processes;
        </Lettered>
        <Lettered n="(c)">
          customer, supplier, partner, and employee lists and related data of {companyShort.toUpperCase()} and its
          group of companies;
        </Lettered>
        <Lettered n="(d)">
          operational data, internal systems, infrastructure details, network configurations, and access credentials;
        </Lettered>
        <Lettered n="(e)">trade secrets, know-how, inventions, and intellectual property; and</Lettered>
        <Lettered n="(f)">
          the existence and contents of any discussions, negotiations, or agreements between the Parties relating to
          the Purpose.
        </Lettered>
      </Section>

      {/* 2. */}
      <Section n="2" title="Use of Confidential Information">
        <Numbered n="2.1">
          The Receiving Party shall use the Confidential Information solely for the Purpose and for no other reason
          whatsoever.
        </Numbered>
        <Numbered n="2.2">
          The Receiving Party shall not, directly or indirectly, use the Confidential Information for its own benefit
          or for the benefit of any third party, nor in any manner that is detrimental to the Disclosing Party.
        </Numbered>
      </Section>

      {/* 3. */}
      <Section n="3" title="Obligations of the Receiving Party">
        <Numbered n="3.1">
          The Receiving Party shall hold the Confidential Information in strict confidence and shall protect it using
          at least the same degree of care it uses to protect its own confidential information of a similar nature, and
          in no event less than a reasonable degree of care.
        </Numbered>
        <Numbered n="3.2">
          The Receiving Party shall not disclose, publish, reproduce, or disseminate any Confidential Information to
          any person or entity except as expressly permitted under this Agreement.
        </Numbered>
        <Numbered n="3.3">
          The Receiving Party shall promptly notify the Disclosing Party in writing upon discovery of any unauthorized
          use, disclosure, loss, or breach of the Confidential Information and shall reasonably cooperate with the
          Disclosing Party to remedy the same.
        </Numbered>
      </Section>

      {/* 4. */}
      <Section n="4" title="Permitted Disclosure to Representatives">
        <Numbered n="4.1">
          The Receiving Party may disclose Confidential Information to its directors, officers, employees, advisers,
          subcontractors, and agents (collectively, &ldquo;Representatives&rdquo;) strictly on a need-to-know basis for
          the Purpose, provided that each such Representative is bound by confidentiality obligations no less
          protective than those contained in this Agreement.
        </Numbered>
        <Numbered n="4.2">
          The Receiving Party shall be fully responsible and liable for any breach of this Agreement by any of its
          Representatives as if such breach were committed by the Receiving Party itself.
        </Numbered>
      </Section>

      {/* 5. */}
      <Section n="5" title="Exclusions from Confidential Information">
        <Numbered n="5.1">
          The obligations under this Agreement shall not apply to information that the Receiving Party can demonstrate
          by competent written evidence:
        </Numbered>
        <Lettered n="(a)">
          was already lawfully in its possession, without obligation of confidence, prior to disclosure by the
          Disclosing Party;
        </Lettered>
        <Lettered n="(b)">
          is or becomes publicly available through no act or omission of the Receiving Party or its Representatives;
        </Lettered>
        <Lettered n="(c)">is rightfully received from a third party without breach of any obligation of confidentiality; or</Lettered>
        <Lettered n="(d)">
          is independently developed by the Receiving Party without use of or reference to the Confidential
          Information.
        </Lettered>
      </Section>

      {/* 6. */}
      <Section n="6" title="Compelled Disclosure">
        <Numbered n="6.1">
          If the Receiving Party is required by law, regulation, court order, or any governmental or regulatory
          authority to disclose any Confidential Information, it shall, to the extent legally permitted, give the
          Disclosing Party prompt prior written notice so that the Disclosing Party may seek a protective order or
          other appropriate remedy. The Receiving Party shall disclose only that portion of the Confidential
          Information that it is legally compelled to disclose and shall use reasonable efforts to ensure that such
          information is afforded confidential treatment.
        </Numbered>
      </Section>

      {/* 7. */}
      <Section n="7" title="Data Privacy and Protection">
        <Numbered n="7.1">
          Each Party shall comply with the Data Privacy Act of 2012 (Republic Act No. 10173), its Implementing Rules
          and Regulations, and all applicable issuances of the National Privacy Commission in relation to any personal
          data that may be processed in connection with the Purpose.
        </Numbered>
        <Numbered n="7.2">
          The Receiving Party shall implement appropriate organizational, physical, and technical security measures to
          protect any personal data against accidental or unlawful destruction, alteration, unauthorized disclosure, or
          access, and shall process such personal data only as necessary for the Purpose.
        </Numbered>
      </Section>

      {/* 8. */}
      <Section n="8" title="No License; Intellectual Property">
        <Numbered n="8.1">
          All Confidential Information shall remain the exclusive property of the Disclosing Party. Nothing in this
          Agreement shall be construed as granting to the Receiving Party, whether by implication, estoppel, or
          otherwise, any license or right to any patent, copyright, trademark, trade secret, or other intellectual
          property of the Disclosing Party, except the limited right to use the Confidential Information for the
          Purpose.
        </Numbered>
        <Numbered n="8.2">
          Ownership of any work product, deliverables, software, or intellectual property created in the course of the
          engagement between the Parties shall be governed by a separate written agreement. This Agreement does not
          effect any assignment or transfer of intellectual property.
        </Numbered>
      </Section>

      {/* 9. */}
      <Section n="9" title="Non-Circumvention">
        <Numbered n="9.1">
          During the term of this Agreement and for a period of two (2) years thereafter, neither Party shall use the
          Confidential Information to circumvent, avoid, bypass, or otherwise deprive the other Party of any business
          opportunity, relationship, or economic benefit arising from or in connection with the Purpose, including by
          directly engaging any client, supplier, subcontractor, or partner introduced or disclosed in confidence by
          the other Party, without the prior written consent of that Party.
        </Numbered>
      </Section>

      {/* 10. */}
      <Section n="10" title="Return or Destruction of Materials">
        <Numbered n="10.1">
          Upon the written request of the Disclosing Party or upon termination of this Agreement, the Receiving Party
          shall promptly return or, at the Disclosing Party&rsquo;s option, destroy all Confidential Information and
          all copies, notes, and derivatives thereof in its possession or control, and shall certify such return or
          destruction in writing.
        </Numbered>
        <Numbered n="10.2">
          Notwithstanding the foregoing, the Receiving Party may retain one (1) copy of the Confidential Information
          solely to the extent required by law or its internal records-retention or back-up policies, provided that
          such retained information remains subject to the confidentiality obligations of this Agreement for so long as
          it is retained.
        </Numbered>
      </Section>

      {/* 11. */}
      <Section n="11" title="Term and Survival">
        <Numbered n="11.1">
          This Agreement shall take effect on the Effective Date and shall continue in force for a period of three (3)
          years, unless earlier terminated by either Party upon thirty (30) days&rsquo; prior written notice.
        </Numbered>
        <Numbered n="11.2">
          The confidentiality obligations under this Agreement shall survive the expiration or termination of this
          Agreement for a period of three (3) years from the date of disclosure of the relevant Confidential
          Information; provided, however, that with respect to any Confidential Information constituting a trade
          secret, such obligations shall survive for as long as such information remains a trade secret under
          applicable law.
        </Numbered>
      </Section>

      {/* 12. */}
      <Section n="12" title="No Obligation; No Warranty">
        <Numbered n="12.1">
          Nothing in this Agreement shall obligate either Party to proceed with any transaction or business
          relationship. Each Party reserves the right, in its sole discretion, to terminate discussions relating to the
          Purpose at any time.
        </Numbered>
        <Numbered n="12.2">
          All Confidential Information is provided &ldquo;as is.&rdquo; The Disclosing Party makes no representation or
          warranty, express or implied, as to the accuracy or completeness of the Confidential Information, except as
          may be set out in a separate definitive agreement.
        </Numbered>
      </Section>

      {/* 13. */}
      <Section n="13" title="Remedies">
        <Numbered n="13.1">
          The Parties acknowledge that any breach of this Agreement may cause irreparable harm for which monetary
          damages would be an inadequate remedy. Accordingly, the Disclosing Party shall be entitled to seek injunctive
          relief, specific performance, and other equitable remedies, in addition to all other remedies available at
          law or in equity, without the necessity of posting a bond or proving actual damages.
        </Numbered>
      </Section>

      {/* 14. */}
      <Section n="14" title="Notices">
        <Numbered n="14.1">
          All notices under this Agreement shall be in writing and delivered personally, by courier, or by electronic
          mail to the addresses of the Parties first written above, or to such other address as a Party may designate
          in writing. Notices shall be deemed received upon actual receipt or, in the case of electronic mail, upon
          confirmation of transmission.
        </Numbered>
      </Section>

      {/* 15. */}
      <Section n="15" title="Miscellaneous">
        <Numbered n="15.1">
          <strong>Entire Agreement.</strong> This Agreement constitutes the entire understanding between the Parties
          with respect to its subject matter and supersedes all prior or contemporaneous agreements, whether written or
          oral, relating thereto.
        </Numbered>
        <Numbered n="15.2">
          <strong>Amendment.</strong> No amendment or modification of this Agreement shall be valid unless made in
          writing and signed by both Parties.
        </Numbered>
        <Numbered n="15.3">
          <strong>Assignment.</strong> Neither Party may assign this Agreement, in whole or in part, without the prior
          written consent of the other Party.
        </Numbered>
        <Numbered n="15.4">
          <strong>Severability.</strong> If any provision of this Agreement is held invalid or unenforceable, the
          remaining provisions shall continue in full force and effect.
        </Numbered>
        <Numbered n="15.5">
          <strong>Waiver.</strong> The failure of either Party to enforce any provision of this Agreement shall not
          constitute a waiver of that or any other provision.
        </Numbered>
        <Numbered n="15.6">
          <strong>Counterparts.</strong> This Agreement may be executed in counterparts, including by electronic or
          scanned signature, each of which shall be deemed an original and all of which together shall constitute one
          and the same instrument.
        </Numbered>
      </Section>

      {/* 16. */}
      <Section n="16" title="Governing Law and Venue">
        <Numbered n="16.1">
          This Agreement shall be governed by and construed in accordance with the laws of the Republic of the
          Philippines.
        </Numbered>
        <Numbered n="16.2">
          Any dispute arising out of or in connection with this Agreement shall be subject to the exclusive
          jurisdiction of the proper courts of <strong>{venue}</strong>, to the exclusion of all other venues.
        </Numbered>
      </Section>

      {/* Signatures */}
      <section className="break-inside-avoid mt-8">
        <p>
          <strong>IN WITNESS WHEREOF</strong>, the Parties have caused this Agreement to be signed by their duly
          authorized representatives on the date and at the place first above written.
        </p>

        <div className="mt-6">
          <div className="text-[12px] font-bold uppercase tracking-wider">LEAD EMPIRE OPC (operating as BossLabs AI)</div>
          <div className="mt-10 border-t border-black pt-1 text-[11px]">
            <div className="font-semibold">MICHAEL BATIQUIN MANAGO</div>
            <div className="italic">CEO</div>
          </div>
        </div>

        <div className="mt-8">
          <div className="text-[12px] font-bold uppercase tracking-wider">{company.toUpperCase()}</div>
          <div className="mt-10 border-t border-black pt-1 text-[11px]">
            <div className="font-semibold">Name: {repName}</div>
            <div className="italic">Position: {repPosition}</div>
          </div>
        </div>

        <div className="mt-8">
          <div className="text-[12px] font-bold uppercase tracking-wider">Signed in the Presence Of:</div>
          <div className="mt-10 grid grid-cols-2 gap-10">
            <div className="border-t border-black pt-1 text-[11px]">&nbsp;</div>
            <div className="border-t border-black pt-1 text-[11px]">&nbsp;</div>
          </div>
        </div>

        <p className="mt-6 text-[10.5px] italic text-gray-600">
          Note: For enforceability and evidentiary weight in the Philippines, this Agreement should be notarized
          (acknowledged before a notary public). An Acknowledgment page can be appended upon finalization of signatory
          details.
        </p>
      </section>
    </article>
  );
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

function Lettered({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <p className="ml-5">
      <span className="font-semibold">{n}</span>&nbsp;&nbsp;{children}
    </p>
  );
}

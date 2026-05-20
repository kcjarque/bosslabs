import { LegalLayout, Section } from '@/components/LegalLayout';

export const metadata = { title: 'Terms — BOSSLABS AI' };

export default function TermsPage() {
  return (
    <LegalLayout eyebrow="Legal" title="Terms of Service" updated="2026-05-16">
      <Section title="The agreement">
        <p>
          By purchasing a seat to the BOSSLABS AI webinar, you agree to these
          terms. If you don't agree, don't complete checkout — we'll happily
          refund any accidental purchase per the refund policy below.
        </p>
      </Section>

      <Section title="What you're buying">
        <p>
          A live 90-minute Zoom webinar conducted by Michael Manago and Kyle
          Jarque, plus a 7-day replay, the Free Tools Stack (Claude Code Skills
          pack, Founder Workflow Audit Checklist), BOSSLABS Community access,
          and any included bonuses described on the checkout page at the time
          of purchase.
        </p>
        <p>
          The optional One-on-One AI Integration Audit (One-Time Offer) is a
          separately delivered 45-minute private call with a BOSSLABS founder,
          available only at the time of purchase on the post-checkout offer page.
        </p>
      </Section>

      <Section title="7-day implementation guarantee">
        <p>
          Show up to the webinar (live or replay), apply the frameworks to your
          business, and if it genuinely doesn't apply within 7 days, email us at{' '}
          <a className="text-cyan-400 hover:underline" href="mailto:hello@bosslabs.ai">
            hello@bosslabs.ai
          </a>
          . We'll refund you in full — no questions, no forms, no friction.
        </p>
        <p>
          The guarantee does not apply if you didn't attend either the live
          session or the replay, or if 7 days have elapsed since the webinar
          date.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>
          The materials (workbook, blueprint, prompts, recordings) are licensed
          to you personally. You may use them inside your own business and with
          your own team. You may not republish, resell, or distribute the
          materials publicly.
        </p>
      </Section>

      <Section title="No guarantee of results">
        <p>
          We share frameworks and case studies, including stories from our own
          businesses and from other operators. Your results depend on your
          business, your effort, your market, and the quality of your
          implementation. We make no guarantee of specific income, growth, or
          outcomes.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          To the maximum extent permitted by Philippine law, BOSSLABS AI's total
          liability under these terms is limited to the amount you paid for the
          webinar.
        </p>
      </Section>

      <Section title="Governing law">
        <p>
          These terms are governed by the laws of the Republic of the
          Philippines. Any dispute will be resolved in the appropriate courts of
          Metro Manila.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update these terms occasionally — the "last updated" date at
          the top of this page will always reflect the latest version. Material
          changes will be announced via email to registered customers.
        </p>
      </Section>
    </LegalLayout>
  );
}

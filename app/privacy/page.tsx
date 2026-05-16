import { LegalLayout, Section } from '@/components/LegalLayout';

export const metadata = { title: 'Privacy — BOSSLABS AI' };

export default function PrivacyPage() {
  return (
    <LegalLayout eyebrow="Legal" title="Privacy Policy" updated="2026-05-16">
      <Section title="What we collect">
        <p>
          When you reserve a seat, we collect your name, email, mobile number, and
          payment details — through our payment processor, Xendit. We never store
          full card numbers; Xendit handles all card and e-wallet data per PCI-DSS
          standards.
        </p>
        <p>
          When you submit the onboarding form on the thank-you page, we collect
          your business type and the one challenge you want to solve. We use this
          to tailor the live build segment of the webinar.
        </p>
      </Section>

      <Section title="How we use it">
        <p>
          Your email and mobile number are used to send you the Zoom link, the
          replay, the Free Tools stack, and follow-up content related to the
          webinar. You may unsubscribe from any email at any time.
        </p>
        <p>
          We do not sell, rent, or share your personal information with third
          parties — except processors we use to deliver the product (Xendit for
          payment, Zoom for the webinar, our email tool for delivery).
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          We use a small number of first-party cookies for session, checkout
          state, and analytics. No third-party advertising cookies are set on
          this site.
        </p>
      </Section>

      <Section title="Your rights (Republic Act 10173 — Data Privacy Act)">
        <p>
          As a Philippine resident, you have the right to access, correct, or
          delete your personal data. To exercise these rights, email{' '}
          <a className="text-cyan-400 hover:underline" href="mailto:hello@bosslabs.ai">
            hello@bosslabs.ai
          </a>{' '}
          and we'll respond within 15 working days.
        </p>
        <p>
          If you believe your privacy rights have been violated, you may file a
          complaint with the National Privacy Commission (NPC) at{' '}
          <a className="text-cyan-400 hover:underline" href="https://privacy.gov.ph" target="_blank" rel="noreferrer">
            privacy.gov.ph
          </a>
          .
        </p>
      </Section>

      <Section title="Retention">
        <p>
          We keep your data only as long as needed to deliver the webinar and
          related communications. Inactive accounts are purged after 24 months,
          subject to any legal retention requirements (e.g., BIR records).
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy? Email{' '}
          <a className="text-cyan-400 hover:underline" href="mailto:hello@bosslabs.ai">
            hello@bosslabs.ai
          </a>
          . We answer all privacy-related questions within 5 working days.
        </p>
      </Section>
    </LegalLayout>
  );
}

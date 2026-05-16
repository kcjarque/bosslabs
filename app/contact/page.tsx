import { LegalLayout, Section } from '@/components/LegalLayout';
import { ContactForm } from '@/components/ContactForm';

export const metadata = { title: 'Contact — BOSSLABS AI' };

export default function ContactPage() {
  return (
    <LegalLayout eyebrow="Get in touch" title="Send us a message.">
      <Section title="Fastest way">
        <p>
          Email <a className="text-cyan-400 hover:underline" href="mailto:hello@bosslabs.ai">hello@bosslabs.ai</a>. We answer within
          one business day — usually faster.
        </p>
        <p>
          For refund requests, include the email address you used at checkout
          and the date of your order. We'll process the refund through Xendit
          within 3 working days.
        </p>
      </Section>

      <Section title="Or send a note here">
        <ContactForm />
      </Section>

      <Section title="Mailing">
        <p>
          BOSSLABS AI Inc.
          <br />
          [Address line 1]
          <br />
          [City, Province, Postal Code]
          <br />
          Philippines
        </p>
        <p className="text-[12px] uppercase tracking-[0.22em] text-ink-300">
          [Placeholder — swap with the actual mailing address before launch]
        </p>
      </Section>
    </LegalLayout>
  );
}

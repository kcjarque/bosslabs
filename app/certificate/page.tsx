import type { Metadata } from 'next';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { Mark } from '@/components/Mark';
import { CertificateForm } from '@/components/CertificateForm';

export const metadata: Metadata = {
  title: 'Certificate of Participation — AI Vibe Coding 101',
  description:
    'Attended AI Vibe Coding 101? Enter your registered email to get your official Certificate of Participation, signed by the founders.',
};

export default function CertificatePage() {
  return (
    <div className="min-h-screen bg-[#06070A] text-ink-100">
      <header className="border-b border-white/[0.05] bg-[#06070A]/80 backdrop-blur-md">
        <div className="container-tight flex h-16 items-center justify-between">
          <div className="inline-flex items-center gap-3">
            <Mark size={26} />
            <Logo size="md" />
          </div>
          <span className="hidden text-[11px] uppercase tracking-[0.22em] text-cyan-400 sm:inline">
            Certificate of Participation
          </span>
        </div>
      </header>

      <main className="container-tight py-16 sm:py-24">
        <div className="mx-auto max-w-lg text-center">
          <div className="eyebrow justify-center">
            <span className="pulse-dot" />
            Certificate of Participation
          </div>
          <h1 className="h-display mt-5">
            Claim your <span className="accent-italic">certificate.</span>
          </h1>
          <p className="lead mx-auto mt-5">
            Joined <span className="text-white">AI Vibe Coding 101</span>? Enter your name and the email you
            registered with — we&rsquo;ll generate your official <span className="text-white">Certificate of
            Participation</span> printed with the name you give, signed by the founders and dated to your
            session, then email it straight to you.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-md">
          <CertificateForm />
        </div>
      </main>

      <Footer />
    </div>
  );
}

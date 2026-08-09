import type { Metadata } from 'next';
import { verifyContactToken } from '@/lib/admin-auth';
import { SurveyForm } from '@/components/SurveyForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'One quick question — BossLabs AI',
  robots: { index: false, follow: false },
};

export default async function SurveyPage(props: { searchParams: Promise<{ c?: string }> }) {
  const searchParams = await props.searchParams;
  const token = searchParams.c ?? '';
  const contactId = verifyContactToken(token);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#06070A] px-4 py-10 text-white">
      <div className="w-full max-w-md">
        {!contactId ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <div className="text-4xl">🔒</div>
            <h1 className="mt-3 text-xl font-semibold">Link expired</h1>
            <p className="mt-2 text-sm text-white/60">
              This survey link isn&rsquo;t valid anymore. Check the latest email from us for a fresh link.
            </p>
          </div>
        ) : (
          <SurveyForm token={token} />
        )}
      </div>
    </div>
  );
}

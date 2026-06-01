import { requireCloser } from '@/lib/closer-auth';
import { CloserBoard } from '@/components/CloserBoard';

export const dynamic = 'force-dynamic';

export default async function CloserHomePage() {
  const closer = await requireCloser();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Hi {closer.name.split(' ')[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Claim an abandoned cart to reveal the number, call to close — and earn{' '}
          <strong>{closer.commissionPercent}%</strong>. Claimed leads (and their numbers) are
          yours alone.
        </p>
      </header>
      <CloserBoard commissionPercent={closer.commissionPercent} />
    </div>
  );
}

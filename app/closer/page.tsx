import { requireCloser } from '@/lib/closer-auth';

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
          Your leads board is on the way. Claim an abandoned cart, call the customer, and close —
          you earn <strong>{closer.commissionPercent}%</strong> of everything you close.
        </p>
      </header>
      <div className="card text-sm text-slate-500">
        Leads kanban coming next. You&rsquo;re signed in as{' '}
        <strong className="text-slate-700">{closer.username}</strong>.
      </div>
    </div>
  );
}

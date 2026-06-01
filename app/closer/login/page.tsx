import { redirect } from 'next/navigation';
import { getCloserSession } from '@/lib/closer-auth';
import { CloserLoginForm } from '@/components/CloserLoginForm';

export const metadata = { title: 'Closer sign in · BOSSLABS' };
export const dynamic = 'force-dynamic';

export default async function CloserLoginPage() {
  if (await getCloserSession()) redirect('/closer');
  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          BOSSLABS Closer
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Sign in to work your assigned leads and track commissions.
        </p>
      </div>
      <div className="card">
        <CloserLoginForm />
      </div>
    </div>
  );
}

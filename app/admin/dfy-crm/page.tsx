import { requireAdmin } from '@/lib/admin-auth';
import { DfyBoard } from '@/components/DfyBoard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'DFY CRM · BOSSLABS AI' };

export default function DfyCrmPage() {
  requireAdmin();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">DFY CRM</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your Done-For-You sales pipeline. Add prospects and drag them across stages:{' '}
          <strong>Discovery Call → Contract Sent → Follow Up → Contract Signing → Onboarding</strong>. Tap{' '}
          <strong>Text</strong> to message them from your phone.
        </p>
      </header>

      <DfyBoard />
    </div>
  );
}

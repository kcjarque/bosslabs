import { requireAdmin } from '@/lib/admin-auth';
import { RetreatCrmBoard } from '@/components/RetreatCrmBoard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'VibeCode Retreat CRM · BOSSLABS AI' };

export default function RetreatCrmPage() {
  requireAdmin();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          VibeCode Retreat CRM
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Everyone who reserves a retreat seat lands here as <strong>Interested</strong>; once they
          pay (proof submitted) they auto-move to <strong>Paid</strong>. Promote anyone who expressed
          interest with <strong>Add to Interested</strong>, then drag them across the stages and{' '}
          <strong>Text</strong> them from your phone.
        </p>
      </header>

      <RetreatCrmBoard />
    </div>
  );
}

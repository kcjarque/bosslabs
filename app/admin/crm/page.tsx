import { requireAdmin } from '@/lib/admin-auth';
import { CrmBoard } from '@/components/CrmBoard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Order-bump CRM · BOSSLABS AI' };

export default function CrmPage() {
  requireAdmin();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Order-bump CRM
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          A follow-up board for the order bump. Drag people across stages, and tap{' '}
          <strong>Text</strong> on a card to open your phone&rsquo;s Messages app with your saved
          template already filled in with their name.
        </p>
      </header>

      <CrmBoard />
    </div>
  );
}

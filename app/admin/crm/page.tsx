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
          Only customers who took the <strong>order bump (OTO)</strong> show here, each with the
          total they paid — your live check of order-bump buyers. Drag across stages, and tap{' '}
          <strong>Text</strong> to message them from your phone with your saved template.
        </p>
      </header>

      <CrmBoard />
    </div>
  );
}

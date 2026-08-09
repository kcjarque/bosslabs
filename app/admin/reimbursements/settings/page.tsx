import { redirect } from 'next/navigation';
import { requireAdmin, getAdminSession } from '@/lib/admin-auth';
import { getPayoutSettings } from '@/lib/reimbursements';
import { ReimbursementsTabs } from '@/components/ReimbursementsTabs';
import { PayoutMethodFields } from '@/components/reimbursements/PayoutMethodFields';
import { updatePayoutSettingsAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My payout settings · BOSSLABS AI' };

export default async function MyReimbursementSettingsPage() {
  await requireAdmin();
  const session = await getAdminSession();
  if (!session || session.role !== 'staff' || !session.id) {
    redirect('/admin/reimbursements/payable');
  }

  const settings = (await getPayoutSettings(session.id)) ?? {
    payoutMethod: null,
    bankName: '',
    bankAccountName: '',
    bankAccountNumber: '',
    gcashName: '',
    gcashNumber: '',
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          My Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Where should we send your reimbursements? Admin sees this when they pay out your pending claims.
        </p>
      </header>

      <ReimbursementsTabs active="settings" role="staff" />

      <form action={updatePayoutSettingsAction} className="card max-w-md space-y-3">
        <PayoutMethodFields settings={settings} />
        <button type="submit" className="btn btn-primary w-full">
          Save
        </button>
      </form>
    </div>
  );
}

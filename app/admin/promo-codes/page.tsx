import { requireAdmin } from '@/lib/admin-auth';
import { getPromoCodes } from '@/lib/db';
import { PromoCodesEditor } from '@/components/PromoCodesEditor';

export const dynamic = 'force-dynamic';

export default async function PromoCodesPage() {
  requireAdmin();
  const codes = await getPromoCodes();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Promo codes
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {codes.length} code{codes.length === 1 ? '' : 's'} · 100%-off codes
          route the buyer to /accepted with no payment step.
        </p>
      </header>
      <PromoCodesEditor initial={codes} />
    </div>
  );
}

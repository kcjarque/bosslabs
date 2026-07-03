import { requireCloser } from '@/lib/closer-auth';
import { CloserUpsellBoard } from '@/components/CloserUpsellBoard';

export const dynamic = 'force-dynamic';

export default async function CloserCustomersPage() {
  const closer = await requireCloser();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Customers · {closer.name.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Claim a paid customer, then send them a <strong>personal promo code</strong> for the
          Retreat, Vault, or Build Session over SMS + email. The discount is baked into the link.
        </p>
      </header>
      <CloserUpsellBoard />
    </div>
  );
}

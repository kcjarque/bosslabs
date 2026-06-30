import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import { getNda } from '@/lib/ndas';
import { getSignupById } from '@/lib/db';
import { NdaMaker } from '@/components/admin/NdaMaker';
import type { NdaFormData } from '@/lib/nda-defaults';
import type { LinkedCustomer } from '@/components/admin/CustomerLinkPicker';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const n = await getNda(params.id);
  return {
    title: n?.counterpartyCompanyName ? `${n.counterpartyCompanyName} — NDA` : 'NDA — Admin',
  };
}

export default async function NdaEditPage({ params }: { params: { id: string } }) {
  requireAdmin();
  const nda = await getNda(params.id);
  if (!nda) return notFound();

  const initial: NdaFormData = {
    bosslabsOfficeAddress: nda.bosslabsOfficeAddress,
    bosslabsSecRegNo: nda.bosslabsSecRegNo,
    counterpartyCompanyName: nda.counterpartyCompanyName,
    counterpartyOfficeAddress: nda.counterpartyOfficeAddress,
    counterpartyRepName: nda.counterpartyRepName,
    counterpartyRepPosition: nda.counterpartyRepPosition,
    counterpartyBusinessDescription: nda.counterpartyBusinessDescription,
    purposeDescription: nda.purposeDescription,
    effectiveDate: nda.effectiveDate,
    governingVenue: nda.governingVenue,
  };

  let initialLinked: LinkedCustomer | null = null;
  if (nda.signupId) {
    const s = await getSignupById(nda.signupId);
    if (s) {
      initialLinked = {
        signupId: s.id,
        email: s.email,
        firstName: s.firstName ?? '',
        lastName: s.lastName ?? '',
        status: s.status ?? '',
      };
    }
  }

  return <NdaMaker initial={initial} ndaId={nda.id} initialLinked={initialLinked} />;
}

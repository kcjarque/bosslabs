import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import { getContract } from '@/lib/contracts';
import { getSignupById } from '@/lib/db';
import { ContractMaker } from '@/components/admin/ContractMaker';
import type { ContractFormData } from '@/lib/contract-defaults';
import type { LinkedCustomer } from '@/components/admin/CustomerLinkPicker';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const c = await getContract(params.id);
  return {
    title: c?.clientCompanyName
      ? `${c.clientCompanyName} — Contract`
      : 'Contract — Admin',
  };
}

export default async function ContractEditPage({ params }: { params: { id: string } }) {
  requireAdmin();
  const contract = await getContract(params.id);
  if (!contract) return notFound();

  const initial: ContractFormData = {
    effectiveDate: contract.effectiveDate,
    clientCompanyName: contract.clientCompanyName,
    clientAddress: contract.clientAddress,
    clientRepPosition: contract.clientRepPosition,
    clientRepName: contract.clientRepName,
    // Cast — DB row gives back the string we stored, which is always a
    // valid ContractOption['id'] because save validates against the enum.
    optionId: contract.optionId as ContractFormData['optionId'],
    lineItems: contract.lineItems,
    governingVenue: contract.governingVenue,
    requiresDownpayment: contract.requiresDownpayment,
    downpaymentMode: contract.downpaymentMode,
    downpaymentPercent: contract.downpaymentPercent,
    downpaymentFixedCentavos: contract.downpaymentFixedCentavos,
  };

  // If linked to a customer, hydrate the picker chip from the signup row.
  let initialLinked: LinkedCustomer | null = null;
  if (contract.signupId) {
    const s = await getSignupById(contract.signupId);
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

  return (
    <ContractMaker
      initial={initial}
      contractId={contract.id}
      initialLinked={initialLinked}
    />
  );
}

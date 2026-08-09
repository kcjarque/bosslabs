import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import { getProposal } from '@/lib/proposals';
import { getSignupById } from '@/lib/db';
import { ProposalMaker } from '@/components/admin/ProposalMaker';
import type { ProposalFormData } from '@/lib/proposal-defaults';
import type { LinkedCustomer } from '@/components/admin/CustomerLinkPicker';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const p = await getProposal(params.id);
  return {
    title: p?.clientCompanyName ? `${p.clientCompanyName} — Proposal` : 'Proposal — Admin',
  };
}

export default async function ProposalEditPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await requireAdmin();
  const proposal = await getProposal(params.id);
  if (!proposal) return notFound();

  const initial: ProposalFormData = {
    proposalDate: proposal.proposalDate,
    validityDays: proposal.validityDays,
    proposalNo: proposal.proposalNo,
    clientCompanyName: proposal.clientCompanyName,
    clientRepName: proposal.clientRepName,
    clientRepPosition: proposal.clientRepPosition,
    clientAddress: proposal.clientAddress,
    platformName: proposal.platformName,
    clientVision: proposal.clientVision,
    // Cast — the DB row gives back the string we stored, always a valid
    // ProposalOption['id'] because save writes it from the enum.
    optionId: proposal.optionId as ProposalFormData['optionId'],
    modules: proposal.modules,
    integrations: proposal.integrations,
    aiPhase1: proposal.aiPhase1,
    aiPhase2: proposal.aiPhase2,
    shipLog: proposal.shipLog,
    kickoffDate: proposal.kickoffDate,
    onboardingDays: proposal.onboardingDays,
    workflowDays: proposal.workflowDays,
    mvpDays: proposal.mvpDays,
    dataMigrationDays: proposal.dataMigrationDays,
    implementationDays: proposal.implementationDays,
    warrantyDays: proposal.warrantyDays,
    trainingSessions: proposal.trainingSessions,
    trainingMode: proposal.trainingMode,
    oneTimeTotalCentavos: proposal.oneTimeTotalCentavos,
    monthlyRetainerCentavos: proposal.monthlyRetainerCentavos,
    minRetainerMonths: proposal.minRetainerMonths,
    exitFeeCentavos: proposal.exitFeeCentavos,
  };

  // If linked to a customer, hydrate the picker chip from the signup row.
  let initialLinked: LinkedCustomer | null = null;
  if (proposal.signupId) {
    const s = await getSignupById(proposal.signupId);
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

  return <ProposalMaker initial={initial} proposalId={proposal.id} initialLinked={initialLinked} />;
}

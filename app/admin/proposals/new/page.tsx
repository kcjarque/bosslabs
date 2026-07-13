import { requireAdmin } from '@/lib/admin-auth';
import { ProposalMaker } from '@/components/admin/ProposalMaker';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Proposal Maker — Admin',
};

export default function NewProposalPage() {
  requireAdmin();
  return <ProposalMaker />;
}

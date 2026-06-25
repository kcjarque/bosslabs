import { requireAdmin } from '@/lib/admin-auth';
import { ContractMaker } from '@/components/admin/ContractMaker';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Contract Maker — Admin',
};

export default function NewContractPage() {
  requireAdmin();
  return <ContractMaker />;
}

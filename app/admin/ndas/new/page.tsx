import { requireAdmin } from '@/lib/admin-auth';
import { NdaMaker } from '@/components/admin/NdaMaker';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New NDA — Admin' };

export default function NewNdaPage() {
  requireAdmin();
  return <NdaMaker />;
}

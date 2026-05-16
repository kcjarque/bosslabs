import { requireAdmin } from '@/lib/admin-auth';
import { getSmsTemplates } from '@/lib/db';
import { SmsTemplatesEditor } from '@/components/SmsTemplatesEditor';

export const dynamic = 'force-dynamic';

export default async function SmsTemplatesPage() {
  requireAdmin();
  const templates = await getSmsTemplates();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          SMS Templates
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {templates.length} templates · sent via OneWaySMS. Cost = 1 part per
          160 ASCII chars (or 70 unicode chars).
        </p>
      </header>
      <SmsTemplatesEditor initial={templates} />
    </div>
  );
}

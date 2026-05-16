import { requireAdmin } from '@/lib/admin-auth';
import { getEmailTemplates } from '@/lib/db';
import { EmailTemplatesEditor } from '@/components/EmailTemplatesEditor';

export const dynamic = 'force-dynamic';

export default async function EmailTemplatesPage() {
  requireAdmin();
  const templates = await getEmailTemplates();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Email Templates
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {templates.length} templates · use{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-[12px]">
            {'{{firstName}}'}
          </code>{' '}
          variables. Sent through Resend when an API key is set.
        </p>
      </header>
      <EmailTemplatesEditor initial={templates} />
    </div>
  );
}

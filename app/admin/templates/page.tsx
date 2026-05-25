import { requireAdmin } from '@/lib/admin-auth';
import { getEmailTemplates, getSmsTemplates } from '@/lib/db';
import { TemplatesTabs } from '@/components/TemplatesTabs';

/**
 * /admin/templates — single nav entry hosting both Email and SMS template
 * editors behind a tab swap. The legacy /admin/email-templates and
 * /admin/sms-templates routes redirect here, deep-linking to the right tab
 * via ?tab=email|sms.
 */

export const dynamic = 'force-dynamic';

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  requireAdmin();
  const [emailTemplates, smsTemplates] = await Promise.all([
    getEmailTemplates(),
    getSmsTemplates(),
  ]);
  const initialTab: 'email' | 'sms' =
    searchParams.tab === 'sms' ? 'sms' : 'email';
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Templates
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {emailTemplates.length} email · {smsTemplates.length} SMS — edit the
          copy buyers see in confirmation, reminders, replay, and recovery
          messages.
        </p>
      </header>
      <TemplatesTabs
        initialTab={initialTab}
        emailTemplates={emailTemplates}
        smsTemplates={smsTemplates}
      />
    </div>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import {
  getSequence,
  getSequenceSteps,
  getLists,
  getEvents,
  getEmailTemplates,
  getSmsTemplates,
  getSequenceStepSendCounts,
} from '@/lib/db';
import { SequenceEditor } from '@/components/SequenceEditor';
import {
  updateSequenceAction,
  deleteSequenceAction,
  createStepAction,
  updateStepAction,
  deleteStepAction,
} from '../actions';

export const dynamic = 'force-dynamic';

export default async function SequenceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  requireAdmin();
  const sequence = await getSequence(params.id);
  if (!sequence) notFound();

  const [steps, lists, events, emailTemplates, smsTemplates, sendCounts] =
    await Promise.all([
      getSequenceSteps(params.id),
      getLists(),
      getEvents(),
      getEmailTemplates(),
      getSmsTemplates(),
      getSequenceStepSendCounts(params.id),
    ]);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/sequences" className="text-xs text-slate-500 hover:underline">
          ← All sequences
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {sequence.name}
        </h1>
        {sequence.description && (
          <p className="mt-1 text-sm text-slate-500">{sequence.description}</p>
        )}
      </header>

      <SequenceEditor
        sequence={sequence}
        steps={steps}
        lists={lists}
        events={events}
        emailTemplates={emailTemplates}
        smsTemplates={smsTemplates}
        sendCounts={Object.fromEntries(sendCounts)}
        onSequenceUpdate={updateSequenceAction}
        onSequenceDelete={deleteSequenceAction}
        onStepCreate={createStepAction}
        onStepUpdate={updateStepAction}
        onStepDelete={deleteStepAction}
      />
    </div>
  );
}

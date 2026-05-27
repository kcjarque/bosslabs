import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import {
  getSequences,
  getLists,
  getEvents,
  getSequenceSteps,
} from '@/lib/db';
import { SequencesEditor } from '@/components/SequencesEditor';
import {
  createSequenceAction,
  updateSequenceAction,
  deleteSequenceAction,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function SequencesPage() {
  requireAdmin();
  const [sequences, lists, events] = await Promise.all([
    getSequences(),
    getLists(),
    getEvents(),
  ]);

  // Step counts per sequence for the table — one quick call each.
  const stepCounts: Record<string, number> = {};
  for (const seq of sequences) {
    const steps = await getSequenceSteps(seq.id);
    stepCounts[seq.id] = steps.length;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Sequences
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {sequences.length} sequence{sequences.length === 1 ? '' : 's'} ·{' '}
            {lists.length} list{lists.length === 1 ? '' : 's'} ·{' '}
            {events.length} event{events.length === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      {(lists.length === 0 || events.length === 0) && (
        <div className="card border-amber-200 bg-amber-50/40 text-amber-800">
          <p className="text-sm">
            You need at least one{' '}
            {lists.length === 0 && <Link href="/admin/lists" className="font-semibold underline">list</Link>}
            {lists.length === 0 && events.length === 0 && ' and one '}
            {events.length === 0 && <Link href="/admin/events" className="font-semibold underline">event</Link>}
            {' '}before creating a sequence.
          </p>
        </div>
      )}

      <SequencesEditor
        initial={sequences}
        lists={lists}
        events={events}
        stepCounts={stepCounts}
        onCreate={createSequenceAction}
        onUpdate={updateSequenceAction}
        onDelete={deleteSequenceAction}
      />
    </div>
  );
}

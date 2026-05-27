import { requireAdmin } from '@/lib/admin-auth';
import { getLists, getEvents, computeListMembers } from '@/lib/db';
import { ListsEditor } from '@/components/ListsEditor';
import { createListAction, updateListAction, deleteListAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function ListsPage() {
  requireAdmin();
  const [lists, events] = await Promise.all([getLists(), getEvents()]);

  // Compute member counts (live) once per list. For 5-ish lists this is fine;
  // if we ever grow to many lists, batch into a single sql with grouping.
  const counts: Record<string, number> = {};
  for (const list of lists) {
    counts[list.id] = (await computeListMembers(list)).length;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Lists
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {lists.length} list{lists.length === 1 ? '' : 's'}. Each list is a
          dynamic filter — members are computed at send time from the current
          signups table.
        </p>
      </header>
      <ListsEditor
        initial={lists}
        events={events}
        memberCounts={counts}
        onCreate={createListAction}
        onUpdate={updateListAction}
        onDelete={deleteListAction}
      />
    </div>
  );
}

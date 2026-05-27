import { requireAdmin } from '@/lib/admin-auth';
import { getEvents } from '@/lib/db';
import { EventsEditor } from '@/components/EventsEditor';
import {
  createEventAction,
  updateEventAction,
  deleteEventAction,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function EventsPage() {
  requireAdmin();
  const events = await getEvents();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Events
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {events.length} event{events.length === 1 ? '' : 's'}. Sequences
          anchor their send times to a specific event's start.
        </p>
      </header>
      <EventsEditor
        initial={events}
        onCreate={createEventAction}
        onUpdate={updateEventAction}
        onDelete={deleteEventAction}
        defaultTimezone="Asia/Manila"
      />
    </div>
  );
}

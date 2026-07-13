'use client';

import { useActionState } from 'react';
import { scheduleBroadcastAction, type BroadcastFormResult } from '@/app/admin/broadcasts/actions';

export function BroadcastComposer({ lists }: { lists: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<BroadcastFormResult, FormData>(
    scheduleBroadcastAction,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="mb-1 block text-[12px] font-medium text-slate-600">Subject</label>
        <input
          name="subject"
          required
          placeholder="e.g. Yung print shop na dati group-chat lang"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[14px] outline-none focus:border-slate-500"
        />
      </div>

      <div>
        <label className="mb-1 block text-[12px] font-medium text-slate-600">
          Body <span className="text-slate-400">— markdown; {'{{firstName}}'}, {'{{link:retreat}}'}, {'{{offer.retreat.price_display}}'} all work</span>
        </label>
        <textarea
          name="body"
          required
          rows={12}
          placeholder={'^^One real thing this week^^\n\n# {{firstName}}, quick one.\n\n...\n\n[[See the systems]]({{link:systems}})\n\n— Kyle'}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus:border-slate-500"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-slate-600">Send to list</label>
          <select
            name="listId"
            required
            defaultValue=""
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[14px] outline-none focus:border-slate-500"
          >
            <option value="" disabled>
              Pick a list…
            </option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-slate-600">Schedule (Manila)</label>
          <input
            type="datetime-local"
            name="scheduledAt"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[14px] outline-none focus:border-slate-500"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-[13px] text-slate-600">
        <input type="checkbox" name="sendNow" className="h-4 w-4" />
        Send now instead (ignores the schedule — goes out within ~10 min)
      </label>

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{state.error}</p>
      )}
      {state?.ok && state.message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-4 py-2 text-[14px] font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? 'Queuing…' : 'Queue broadcast'}
      </button>
    </form>
  );
}

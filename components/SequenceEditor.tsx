'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type {
  SequenceModel,
  SequenceStep,
  SequenceScheduleType,
  ListModel,
  EventModel,
  EmailTemplate,
  SmsTemplate,
} from '@/lib/db';

const SCHEDULE_OPTIONS: { value: SequenceScheduleType; label: string }[] = [
  { value: 'before_event', label: 'Before event' },
  { value: 'after_event', label: 'After event' },
  { value: 'after_subscribe', label: 'After signup' },
];

export function SequenceEditor({
  sequence,
  steps,
  lists,
  events,
  emailTemplates,
  smsTemplates,
  sendCounts,
  onSequenceUpdate,
  onSequenceDelete,
  onStepCreate,
  onStepUpdate,
  onStepDelete,
}: {
  sequence: SequenceModel;
  steps: SequenceStep[];
  lists: ListModel[];
  events: EventModel[];
  emailTemplates: EmailTemplate[];
  smsTemplates: SmsTemplate[];
  sendCounts: Record<string, number>;
  onSequenceUpdate: (
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      listId?: string;
      eventId?: string | null;
      active?: boolean;
    },
  ) => Promise<void>;
  onSequenceDelete: (id: string) => Promise<void>;
  onStepCreate: (input: {
    sequenceId: string;
    position: number;
    emailTemplateId: string | null;
    smsTemplateId: string | null;
    scheduleType: SequenceScheduleType;
    hoursOffset: number;
  }) => Promise<void>;
  onStepUpdate: (
    id: string,
    sequenceId: string,
    patch: {
      position?: number;
      emailTemplateId?: string | null;
      smsTemplateId?: string | null;
      scheduleType?: SequenceScheduleType;
      hoursOffset?: number;
      active?: boolean;
    },
  ) => Promise<void>;
  onStepDelete: (id: string, sequenceId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [addingStep, setAddingStep] = useState(false);

  return (
    <div className="space-y-6">
      {/* Sequence-level settings */}
      <section className="card">
        <h2 className="text-base font-semibold text-slate-900">Sequence settings</h2>
        <SequenceSettings
          sequence={sequence}
          lists={lists}
          events={events}
          onSave={(patch) =>
            startTransition(async () => {
              await onSequenceUpdate(sequence.id, patch);
              router.refresh();
            })
          }
          onDelete={() => {
            if (
              !confirm(
                `Delete sequence "${sequence.name}"? All steps + send history will be deleted.`,
              )
            )
              return;
            startTransition(async () => {
              await onSequenceDelete(sequence.id);
              router.push('/admin/sequences');
            });
          }}
        />
      </section>

      {/* Steps */}
      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Steps ({steps.length})
          </h2>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setAddingStep((v) => !v)}
          >
            {addingStep ? 'Cancel' : '+ Add step'}
          </button>
        </div>

        {addingStep && (
          <StepForm
            initial={null}
            emailTemplates={emailTemplates}
            smsTemplates={smsTemplates}
            nextPosition={steps.length}
            onSubmit={(input) =>
              startTransition(async () => {
                await onStepCreate({ ...input, sequenceId: sequence.id });
                setAddingStep(false);
                router.refresh();
              })
            }
            onCancel={() => setAddingStep(false)}
          />
        )}

        {steps.length === 0 && !addingStep && (
          <p className="mt-4 text-sm text-slate-500">
            No steps yet. Add the first email or SMS to send.
          </p>
        )}

        {steps.length > 0 && (
          <ul className="mt-4 space-y-2">
            {steps.map((step, idx) => (
              <li
                key={step.id}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                {editingStepId === step.id ? (
                  <StepForm
                    initial={step}
                    emailTemplates={emailTemplates}
                    smsTemplates={smsTemplates}
                    nextPosition={step.position}
                    onSubmit={(input) =>
                      startTransition(async () => {
                        await onStepUpdate(step.id, sequence.id, input);
                        setEditingStepId(null);
                        router.refresh();
                      })
                    }
                    onCancel={() => setEditingStepId(null)}
                  />
                ) : (
                  <StepRow
                    step={step}
                    index={idx}
                    emailTemplate={emailTemplates.find((t) => t.id === step.emailTemplateId)}
                    smsTemplate={smsTemplates.find((t) => t.id === step.smsTemplateId)}
                    sendCount={sendCounts[step.id] ?? 0}
                    onEdit={() => setEditingStepId(step.id)}
                    onToggleActive={() =>
                      startTransition(async () => {
                        await onStepUpdate(step.id, sequence.id, { active: !step.active });
                        router.refresh();
                      })
                    }
                    onDelete={() => {
                      if (!confirm('Delete this step? Past send history will be lost.')) return;
                      startTransition(async () => {
                        await onStepDelete(step.id, sequence.id);
                        router.refresh();
                      });
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isPending && (
        <p className="text-xs text-slate-500">Saving…</p>
      )}
    </div>
  );
}

function SequenceSettings({
  sequence,
  lists,
  events,
  onSave,
  onDelete,
}: {
  sequence: SequenceModel;
  lists: ListModel[];
  events: EventModel[];
  onSave: (patch: {
    name?: string;
    description?: string | null;
    listId?: string;
    eventId?: string | null;
    active?: boolean;
  }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(sequence.name);
  const [description, setDescription] = useState(sequence.description ?? '');
  const [listId, setListId] = useState(sequence.listId);
  const [eventId, setEventId] = useState<string>(sequence.eventId ?? '');
  const [active, setActive] = useState(sequence.active);

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Description</label>
        <input
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div>
        <label className="label">List</label>
        <select
          className="select"
          value={listId}
          onChange={(e) => setListId(e.target.value)}
        >
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Event (anchor)</label>
        <select
          className="select"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
        >
          <option value="">— None —</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Sequence is active
        </label>
      </div>
      <div className="sm:col-span-2 flex items-center justify-between">
        <button
          className="btn btn-primary"
          onClick={() =>
            onSave({
              name,
              description: description || null,
              listId,
              eventId: eventId || null,
              active,
            })
          }
        >
          Save
        </button>
        <button className="btn btn-ghost text-red-600" onClick={onDelete}>
          Delete sequence
        </button>
      </div>
    </div>
  );
}

function StepRow({
  step,
  index,
  emailTemplate,
  smsTemplate,
  sendCount,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  step: SequenceStep;
  index: number;
  emailTemplate?: EmailTemplate;
  smsTemplate?: SmsTemplate;
  sendCount: number;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const scheduleLabel = scheduleDescription(step.scheduleType, step.hoursOffset);

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600">
            #{index + 1}
          </span>
          <span className="font-medium text-slate-900">{scheduleLabel}</span>
          {!step.active && <span className="pill">Paused</span>}
        </div>
        <div className="mt-1 grid gap-1 text-xs text-slate-600">
          {step.emailTemplateId ? (
            <div>📧 {emailTemplate?.name ?? step.emailTemplateId}</div>
          ) : (
            <div className="text-slate-400">📧 — no email —</div>
          )}
          {step.smsTemplateId && (
            <div>📱 SMS · {smsTemplate?.name ?? step.smsTemplateId}</div>
          )}
        </div>
        <div className="mt-1 text-xs text-slate-400">
          Sent to {sendCount} recipient{sendCount === 1 ? '' : 's'}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button className="btn btn-ghost" onClick={onEdit}>
          Edit
        </button>
        <button className="btn btn-ghost" onClick={onToggleActive}>
          {step.active ? 'Pause' : 'Resume'}
        </button>
        <button className="btn btn-ghost text-red-600" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function StepForm({
  initial,
  emailTemplates,
  smsTemplates,
  nextPosition,
  onSubmit,
  onCancel,
}: {
  initial: SequenceStep | null;
  emailTemplates: EmailTemplate[];
  smsTemplates: SmsTemplate[];
  nextPosition: number;
  onSubmit: (input: {
    position: number;
    emailTemplateId: string | null;
    smsTemplateId: string | null;
    scheduleType: SequenceScheduleType;
    hoursOffset: number;
  }) => void;
  onCancel: () => void;
}) {
  const [scheduleType, setScheduleType] = useState<SequenceScheduleType>(
    initial?.scheduleType ?? 'before_event',
  );
  const [hoursOffset, setHoursOffset] = useState<number>(initial?.hoursOffset ?? 24);
  const [emailTemplateId, setEmailTemplateId] = useState<string>(
    initial?.emailTemplateId ?? emailTemplates[0]?.id ?? '',
  );
  const [smsTemplateId, setSmsTemplateId] = useState<string>(
    initial?.smsTemplateId ?? '',
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">Schedule</label>
        <select
          className="select"
          value={scheduleType}
          onChange={(e) => setScheduleType(e.target.value as SequenceScheduleType)}
        >
          {SCHEDULE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Hours offset</label>
        <input
          type="number"
          className="input"
          min={0}
          value={hoursOffset}
          onChange={(e) => setHoursOffset(parseInt(e.target.value, 10) || 0)}
        />
      </div>
      <div>
        <label className="label">Email template</label>
        <select
          className="select"
          value={emailTemplateId}
          onChange={(e) => setEmailTemplateId(e.target.value)}
        >
          <option value="">— No email —</option>
          {emailTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">SMS template (optional)</label>
        <select
          className="select"
          value={smsTemplateId}
          onChange={(e) => setSmsTemplateId(e.target.value)}
        >
          <option value="">— No SMS —</option>
          {smsTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2 mt-2 flex items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            onSubmit({
              position: initial?.position ?? nextPosition,
              emailTemplateId: emailTemplateId || null,
              smsTemplateId: smsTemplateId || null,
              scheduleType,
              hoursOffset,
            })
          }
        >
          {initial ? 'Save step' : 'Add step'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <div className="ml-auto text-xs text-slate-500">
          Preview: <span className="font-medium text-slate-700">{scheduleDescription(scheduleType, hoursOffset)}</span>
        </div>
      </div>
    </div>
  );
}

function scheduleDescription(type: SequenceScheduleType, hours: number): string {
  const h = hours;
  if (type === 'before_event') return `${h}h before event`;
  if (type === 'after_event') return `${h}h after event`;
  return `${h}h after signup`;
}

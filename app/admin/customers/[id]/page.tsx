import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import {
  getSignupById,
  getEvents,
  getLists,
  getSequences,
  getCustomerSubscriptions,
  getCustomerSequenceSends,
  computeListMembers,
  getEmailTemplates,
  getSmsTemplates,
  type Signup,
  type CustomerSequenceSend,
  type ListModel,
  type SequenceModel,
} from '@/lib/db';
import { EventPill } from '@/components/EventPill';
import { CustomerSendForm } from '@/components/CustomerSendForm';
import { CustomerSequences } from '@/components/CustomerSequences';
import {
  subscribeCustomerAction,
  unsubscribeCustomerAction,
} from './actions';

export const dynamic = 'force-dynamic';

type CommsEvent = {
  ts: string;
  channel: 'email' | 'sms' | 'tg';
  kind: string;
  description: string;
  ok: boolean;
};

function paymentMethodLabel(meta: Record<string, unknown>): string {
  const m = (meta.paymentMethodGroup as string | undefined) ?? 'OTHER';
  if (m === 'GCASH') return 'GCash';
  if (m === 'CREDIT_CARD') return 'Credit Card';
  if (m === 'BANKS') return 'Bank';
  if (m === 'ALL') return '—';
  return m;
}

function scheduleLabel(scheduleType: string, hoursOffset: number): string {
  if (scheduleType === 'before_event') return `${hoursOffset}h before event`;
  if (scheduleType === 'after_event') return `${hoursOffset}h after event`;
  return `${hoursOffset}h after signup`;
}

/**
 * Walk the signup's metadata + sequence_sends and assemble a single
 * unified comms timeline (most-recent first).
 */
function buildCommsTimeline(
  signup: Signup,
  sequenceSends: CustomerSequenceSend[],
): CommsEvent[] {
  const events: CommsEvent[] = [];
  const meta = (signup.metadata as Record<string, unknown> | undefined) ?? {};

  // Confirmation email (sent at payment time)
  if (typeof meta.confirmationSent === 'string') {
    events.push({
      ts: meta.confirmationSent,
      channel: 'email',
      kind: 'Payment confirmation',
      description: 'Confirmation email + Zoom link',
      ok: true,
    });
  }

  // Recovery emails (admin re-fire OR webhook recovery)
  if (typeof meta.recoveryEmailSent === 'string') {
    const status = (meta.recoveryEmailStatus as string | undefined) ?? 'sent';
    events.push({
      ts: meta.recoveryEmailSent,
      channel: 'email',
      kind: 'Recovery email',
      description: `Status: ${status}`,
      ok: status !== 'failed',
    });
  }

  // Recovery SMS
  if (typeof meta.recoverySmsSent === 'string') {
    events.push({
      ts: meta.recoverySmsSent,
      channel: 'sms',
      kind: 'Recovery SMS',
      description: 'Cart-abandonment text via OneWaySMS',
      ok: true,
    });
  }

  // Abandoned-checkout TG notification
  if (typeof meta.abandonedNotified === 'string') {
    events.push({
      ts: meta.abandonedNotified,
      channel: 'tg',
      kind: 'Abandoned alert',
      description: 'Team Telegram ping (abandoned checkout)',
      ok: true,
    });
  }

  // Sequence sends (the new generalized engine)
  for (const send of sequenceSends) {
    if (send.emailTemplateId) {
      events.push({
        ts: send.sentAt,
        channel: 'email',
        kind: `${send.sequenceName} · ${scheduleLabel(send.scheduleType, send.hoursOffset)}`,
        description: send.emailTemplateName
          ? `Email template: ${send.emailTemplateName}`
          : `Email template: ${send.emailTemplateId}`,
        ok: send.emailOk,
      });
    }
    if (send.smsTemplateId) {
      events.push({
        ts: send.sentAt,
        channel: 'sms',
        kind: `${send.sequenceName} · ${scheduleLabel(send.scheduleType, send.hoursOffset)}`,
        description: send.smsTemplateName
          ? `SMS template: ${send.smsTemplateName}`
          : `SMS template: ${send.smsTemplateId}`,
        ok: send.smsOk,
      });
    }
  }

  return events.sort((a, b) => b.ts.localeCompare(a.ts));
}

export default async function CustomerProfilePage({
  params,
}: {
  params: { id: string };
}) {
  requireAdmin();

  const [
    customer,
    events,
    lists,
    sequences,
    customerSubscriptions,
    sequenceSends,
    emailTemplates,
    smsTemplates,
  ] = await Promise.all([
    getSignupById(params.id),
    getEvents(),
    getLists(),
    getSequences(),
    getCustomerSubscriptions(params.id),
    getCustomerSequenceSends(params.id),
    getEmailTemplates(),
    getSmsTemplates(),
  ]);
  if (!customer) notFound();

  // Resolve every list this customer currently belongs to. Lists are
  // dynamic filters so membership is a live computation against the
  // current signups table — N+1 here is fine because typical N is small
  // (5–10 lists) and each computeListMembers is a single getSignups+filter.
  const memberLists: ListModel[] = [];
  const memberListIds = new Set<string>();
  for (const list of lists) {
    const members = await computeListMembers(list);
    if (members.some((m) => m.id === customer.id)) {
      memberLists.push(list);
      memberListIds.add(list.id);
    }
  }

  // Sequences the customer is in via their list memberships.
  const sequencesViaList: Array<{ sequence: SequenceModel; listName: string }> = [];
  for (const seq of sequences) {
    if (!seq.active) continue;
    if (memberListIds.has(seq.listId)) {
      const listName = memberLists.find((l) => l.id === seq.listId)?.name ?? '(list)';
      sequencesViaList.push({ sequence: seq, listName });
    }
  }

  // Manual subscriptions (joined with their sequence row for the name).
  const sequencesManual: Array<{ sequence: SequenceModel; subscribedAt: string }> = [];
  for (const sub of customerSubscriptions) {
    const seq = sequences.find((s) => s.id === sub.sequenceId);
    if (seq) sequencesManual.push({ sequence: seq, subscribedAt: sub.subscribedAt });
  }

  const meta = (customer.metadata as Record<string, unknown> | undefined) ?? {};
  const externalId = (meta.externalId as string | undefined) ?? '';
  const otoConfirmed = meta.otoConfirmed as string | undefined;
  const otoAmount = meta.otoAmount as number | undefined;
  const eventName = customer.eventId
    ? events.find((e) => e.id === customer.eventId)?.name
    : null;

  const timeline = buildCommsTimeline(customer, sequenceSends);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/admin/customers" className="text-xs text-slate-500 hover:underline">
          ← All customers
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {customer.firstName} {customer.lastName ?? ''}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <a href={`mailto:${customer.email}`} className="hover:underline">
            {customer.email}
          </a>
          {customer.phone && (
            <>
              <span className="text-slate-300">·</span>
              <span>{customer.phone}</span>
            </>
          )}
          {eventName && (
            <>
              <span className="text-slate-300">·</span>
              <EventPill name={eventName} />
            </>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile card (left) */}
        <section className="card lg:col-span-1">
          <h2 className="text-base font-semibold text-slate-900">Profile</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Field label="Status" value={<StatusBadge status={customer.status} />} />
            <Field
              label="Event"
              value={
                customer.eventId && eventName ? (
                  <Link
                    href="/admin/events"
                    className="inline-block rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 hover:bg-violet-100"
                  >
                    {eventName}
                  </Link>
                ) : (
                  <span className="text-slate-400">— No event tag —</span>
                )
              }
            />
            <Field
              label="Lists"
              value={
                memberLists.length === 0 ? (
                  <span className="text-slate-400">Not in any list</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {memberLists.map((l) => (
                      <Link
                        key={l.id}
                        href={`/admin/lists/${l.id}`}
                        className="inline-block rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-700 hover:bg-cyan-100"
                      >
                        {l.name}
                      </Link>
                    ))}
                  </div>
                )
              }
            />
            <Field label="Source" value={customer.source} />
            <Field
              label="Method"
              value={paymentMethodLabel(meta)}
            />
            <Field
              label="Created"
              value={new Date(customer.createdAt).toLocaleString('en-PH', {
                timeZone: 'Asia/Manila',
              })}
            />
            {customer.amountCentavos != null && (
              <Field
                label="Amount"
                value={
                  <>
                    ₱{(customer.amountCentavos / 100).toLocaleString()}
                    {customer.bumped && (
                      <span className="ml-1 text-xs text-cyan-600">+ OTO bump</span>
                    )}
                  </>
                }
              />
            )}
            {otoConfirmed && otoAmount && (
              <Field
                label="OTO upsell"
                value={`₱${otoAmount.toLocaleString()} · ${new Date(
                  otoConfirmed,
                ).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}`}
              />
            )}
            {externalId && (
              <Field label="Order ID" value={<code className="text-xs">{externalId}</code>} />
            )}
            <Field label="Row ID" value={<code className="text-xs">{customer.id}</code>} />
            {customer.message && (
              <Field
                label="Message"
                value={<span className="whitespace-pre-wrap">{customer.message}</span>}
              />
            )}
          </dl>
        </section>

        {/* Send + sequences + comms (right) */}
        <div className="space-y-6 lg:col-span-2">
          <CustomerSequences
            signupId={customer.id}
            allSequences={sequences}
            viaList={sequencesViaList}
            manual={sequencesManual}
            onSubscribe={subscribeCustomerAction}
            onUnsubscribe={unsubscribeCustomerAction}
          />

          <section className="card">
            <h2 className="text-base font-semibold text-slate-900">Send a message</h2>
            <p className="mt-1 text-xs text-slate-500">
              Pick a template + channel. Templates pull from /admin/templates.
            </p>
            <div className="mt-4">
              <CustomerSendForm
                signupId={customer.id}
                hasPhone={Boolean(customer.phone)}
                emailTemplates={emailTemplates.map((t) => ({ id: t.id, name: t.name }))}
                smsTemplates={smsTemplates.map((t) => ({ id: t.id, name: t.name }))}
              />
            </div>
          </section>

          <section className="card">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                Communications history
              </h2>
              <span className="text-xs text-slate-500">{timeline.length} events</span>
            </div>
            {timeline.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                Nothing sent to this customer yet.
              </p>
            ) : (
              <ol className="mt-4 space-y-3">
                {timeline.map((ev, i) => (
                  <li
                    key={`${ev.ts}-${i}`}
                    className="grid grid-cols-[80px_1fr] gap-3 rounded-md border border-slate-100 bg-slate-50/40 p-3"
                  >
                    <div className="flex flex-col gap-1">
                      <ChannelBadge channel={ev.channel} />
                      {!ev.ok && (
                        <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-center text-[10px] font-medium text-red-700">
                          failed
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">{ev.kind}</div>
                      <div className="text-xs text-slate-500">{ev.description}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        {new Date(ev.ts).toLocaleString('en-PH', {
                          timeZone: 'Asia/Manila',
                        })}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3">
      <dt className="text-xs uppercase tracking-[0.06em] text-slate-500">{label}</dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: 'pill pill-green',
    attended: 'pill pill-green',
    registered: 'pill pill-amber',
    refunded: 'pill pill-red',
    unsubscribed: 'pill pill-red',
  };
  return <span className={map[status] ?? 'pill'}>{status}</span>;
}

function ChannelBadge({ channel }: { channel: 'email' | 'sms' | 'tg' }) {
  if (channel === 'email')
    return <span className="rounded-md bg-cyan-100 px-2 py-0.5 text-center text-[11px] font-medium text-cyan-700">Email</span>;
  if (channel === 'sms')
    return <span className="rounded-md bg-violet-100 px-2 py-0.5 text-center text-[11px] font-medium text-violet-700">SMS</span>;
  return <span className="rounded-md bg-slate-200 px-2 py-0.5 text-center text-[11px] font-medium text-slate-700">TG</span>;
}

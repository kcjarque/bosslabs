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
import { CustomerRemarks } from '@/components/CustomerRemarks';
import { MarkPaidButton } from '@/components/MarkPaidButton';
import { ResendButton } from '@/components/ResendButton';
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
  /** Resend / OneWaySMS lifecycle status (optional — only filled for
   *  emails where the webhook has matched a recorded send). */
  status?:
    | 'sent'
    | 'delivered'
    | 'opened'
    | 'clicked'
    | 'bounced'
    | 'complained'
    | 'failed';
  statusAt?: string;
  /** Template this event sent — drives the Resend button. Omitted for events
   *  that can't be re-fired (e.g. the internal Telegram alert). */
  templateId?: string;
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
  emailTemplateNames: Map<string, string>,
  smsTemplateNames: Map<string, string>,
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
      ok: meta.confirmationStatus !== 'failed',
      // Real delivery status arrives via the SES webhook (defaults to 'sent'
      // until a delivered/bounced event lands). 'failed' = the send itself
      // errored (e.g. SES rejected it), stamped by the sender.
      status: (meta.confirmationStatus as CommsEvent['status']) ?? 'sent',
      statusAt: meta.confirmationStatusAt as string | undefined,
      templateId: 'paid_confirmation',
    });
  }

  // Confirmation SMS (sent at payment time, alongside the email). Real
  // delivered/failed status arrives via the OneWaySMS DLR webhook.
  if (typeof meta.confirmationSmsSent === 'string') {
    events.push({
      ts: meta.confirmationSmsSent,
      channel: 'sms',
      kind: 'Payment confirmation',
      description: 'Confirmation SMS to mobile',
      ok: meta.confirmationSmsOk !== false,
      status:
        (meta.confirmationSmsStatus as CommsEvent['status']) ??
        (meta.confirmationSmsOk === false ? undefined : 'sent'),
      statusAt: meta.confirmationSmsStatusAt as string | undefined,
      templateId: 'paid_confirmation',
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
      templateId: 'payment_recovery',
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
      status: 'sent',
      templateId: 'payment_recovery',
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

  // Admin-fired sends (single from profile, bulk from customers table).
  type AdminSendEntry = {
    ts: string;
    channel: 'email' | 'sms';
    templateId: string;
    ok?: boolean;
    providerId?: string;
    status?: CommsEvent['status'];
    statusAt?: string;
  };
  const adminSends = (meta.adminSends as AdminSendEntry[] | undefined) ?? [];
  for (const s of adminSends) {
    const nameMap = s.channel === 'email' ? emailTemplateNames : smsTemplateNames;
    const friendlyName = nameMap.get(s.templateId);
    // Show the human name first, fall back to the id for templates that
    // have since been renamed or deleted.
    const label = friendlyName
      ? `${friendlyName} (${s.templateId})`
      : s.templateId;
    events.push({
      ts: s.ts,
      channel: s.channel,
      kind: 'Admin send',
      description: `Template: ${label}`,
      ok: s.ok !== false,
      // Fall back to a baseline 'sent' pill when the webhook hasn't (yet)
      // reported a richer lifecycle status.
      status: s.status ?? (s.ok !== false ? 'sent' : undefined),
      statusAt: s.statusAt,
      templateId: s.templateId,
    });
  }

  // Recovery email — surface its status too (was already tracked via Resend
  // webhook, just wasn't pilled in the UI).
  if (typeof meta.recoveryEmailSent === 'string') {
    const ev = events.find(
      (e) => e.ts === meta.recoveryEmailSent && e.kind === 'Recovery email',
    );
    if (ev) {
      ev.status = (meta.recoveryEmailStatus as CommsEvent['status']) ?? 'sent';
      ev.statusAt = meta.recoveryEmailStatusAt as string | undefined;
    }
  }

  // Sequence sends (the new generalized engine). Email legs now carry the
  // real Resend lifecycle status (delivered/bounced/opened) via the webhook;
  // until that fires they show a baseline 'sent'. SMS has no delivery webhook,
  // so it shows 'sent' when the provider accepted it.
  for (const send of sequenceSends) {
    if (send.emailTemplateId) {
      const emailStatus = (send.emailStatus as CommsEvent['status'] | null) ?? null;
      events.push({
        ts: send.sentAt,
        channel: 'email',
        kind: `${send.sequenceName} · ${scheduleLabel(send.scheduleType, send.hoursOffset)}`,
        description: send.emailTemplateName
          ? `Email template: ${send.emailTemplateName}`
          : `Email template: ${send.emailTemplateId}`,
        ok: send.emailOk,
        status: emailStatus ?? (send.emailOk ? 'sent' : undefined),
        statusAt: send.emailStatusAt ?? undefined,
        templateId: send.emailTemplateId,
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
        status: send.smsOk ? 'sent' : undefined,
        templateId: send.smsTemplateId,
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

  const emailTemplateNames = new Map(emailTemplates.map((t) => [t.id, t.name]));
  const smsTemplateNames = new Map(smsTemplates.map((t) => [t.id, t.name]));
  const timeline = buildCommsTimeline(
    customer,
    sequenceSends,
    emailTemplateNames,
    smsTemplateNames,
  );

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
          {customer.status === 'registered' && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="text-xs uppercase tracking-[0.06em] text-slate-500">Manual payment</div>
              <p className="mt-1 text-[11px] text-slate-400">
                Abandoned cart — upload the payment screenshot to mark paid. Fires the paid
                email/SMS + Telegram and records any closer commission.
              </p>
              <div className="mt-2">
                <MarkPaidButton signupId={customer.id} endpoint="/api/admin/mark-paid" />
              </div>
            </div>
          )}
          <CustomerRemarks
            signupId={customer.id}
            initial={typeof meta.remarks === 'string' ? meta.remarks : ''}
          />
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
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {ev.kind}
                        </span>
                        {ev.status && <StatusPill status={ev.status} />}
                        {ev.templateId && (ev.channel === 'email' || ev.channel === 'sms') && (
                          <span className="ml-auto">
                            <ResendButton
                              signupId={customer.id}
                              channel={ev.channel}
                              templateId={ev.templateId}
                            />
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{ev.description}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        {new Date(ev.ts).toLocaleString('en-PH', {
                          timeZone: 'Asia/Manila',
                        })}
                        {ev.statusAt && ev.status && (
                          <>
                            {' · '}
                            <span className="text-slate-500">
                              {ev.status}{' '}
                              {new Date(ev.statusAt).toLocaleString('en-PH', {
                                timeZone: 'Asia/Manila',
                              })}
                            </span>
                          </>
                        )}
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

/**
 * Email delivery status pill — Resend lifecycle events flow in via the
 * /api/webhooks/resend handler. Each status has its own color so the
 * admin can scan a timeline and immediately spot bounces/complaints.
 */
function StatusPill({
  status,
}: {
  status: NonNullable<CommsEvent['status']>;
}) {
  const styles: Record<NonNullable<CommsEvent['status']>, string> = {
    sent: 'border-slate-200 bg-slate-100 text-slate-600',
    delivered: 'border-emerald-300 bg-emerald-50 text-emerald-700',
    opened: 'border-cyan-300 bg-cyan-50 text-cyan-700',
    clicked: 'border-cyan-400 bg-cyan-100 text-cyan-800',
    bounced: 'border-red-300 bg-red-50 text-red-700',
    complained: 'border-amber-300 bg-amber-50 text-amber-700',
    failed: 'border-red-300 bg-red-50 text-red-700',
  };
  const labels: Record<NonNullable<CommsEvent['status']>, string> = {
    sent: 'Sent',
    delivered: 'Delivered',
    opened: 'Opened',
    clicked: 'Clicked',
    bounced: 'Bounced',
    complained: 'Spam',
    failed: 'Failed',
  };
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function ChannelBadge({ channel }: { channel: 'email' | 'sms' | 'tg' }) {
  if (channel === 'email')
    return <span className="rounded-md bg-cyan-100 px-2 py-0.5 text-center text-[11px] font-medium text-cyan-700">Email</span>;
  if (channel === 'sms')
    return <span className="rounded-md bg-violet-100 px-2 py-0.5 text-center text-[11px] font-medium text-violet-700">SMS</span>;
  return <span className="rounded-md bg-slate-200 px-2 py-0.5 text-center text-[11px] font-medium text-slate-700">TG</span>;
}

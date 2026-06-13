/**
 * /admin/capi-status — shows whether Meta CAPI is correctly configured
 * AND lets you re-fire a Purchase event for any paid signup that didn't
 * make it to Meta (e.g. webhook-chain breakage during the early launch).
 *
 * No tokens are exposed — only a configured/missing/value-shape check.
 *
 * Deploy stamp: 2026-05-25 — META_CAPI_TEST_EVENT_CODE removed in Vercel,
 * Purchase events now flow to real attribution instead of the Test Events
 * tab. The Configuration block on this page reflects whichever env state
 * the running deployment has — refresh after any Vercel redeploy.
 */

import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { getSignups, type Signup } from '@/lib/db';
import { sendCapiEvent } from '@/lib/meta';
import { refireCapiForAction } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export default async function CapiStatusPage({
  searchParams,
}: {
  searchParams: { refireId?: string; refireStatus?: string };
}) {
  requireAdmin();

  // Same isCapiConfigured() check sendCapiEvent uses internally
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const tokenPresent = Boolean(process.env.META_CAPI_ACCESS_TOKEN);
  const testCodePresent = Boolean(process.env.META_CAPI_TEST_EVENT_CODE);
  const isConfigured = Boolean(pixelId && tokenPresent);

  // Fire a noop test event to confirm Meta actually accepts our payload.
  // Uses a generic ViewContent so we don't pollute Purchase data.
  //
  // Meta requires "sufficient customer information" on every CAPI event
  // (error_subcode 2804050) — country alone isn't enough anymore. We send
  // a stable synthetic identity for the health check: a fixed email +
  // external_id derived from "capi-health@bosslabs.ai" so the same
  // ping always hashes to the same shadow user. Doesn't pollute real
  // attribution because there's no fbp/fbc/IP attached.
  let liveCheck: { ok: boolean; detail: string } | null = null;
  if (isConfigured) {
    const r = await sendCapiEvent({
      eventName: 'ViewContent',
      eventId: `capi_health_${Date.now()}`,
      userData: {
        email: 'capi-health@bosslabs.ai',
        country: 'ph',
        externalId: 'capi-health-check',
      },
      customData: { value: 0, currency: 'PHP', contentName: 'capi-health-check' },
    });
    liveCheck = r.ok
      ? {
          ok: true,
          detail: `Meta accepted the test event (events_received=${'eventsReceived' in r ? r.eventsReceived : '?'})`,
        }
      : { ok: false, detail: r.error };
  }

  const paid = (await getSignups()).filter((s) => s.status === 'paid');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Meta Conversions API — status
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Verifies the server-side CAPI integration is wired up correctly
          and lets you re-fire Purchase events for paid signups whose
          original webhook may not have reached Meta.
        </p>
      </header>

      {searchParams.refireStatus && (
        <RefireResult
          refireId={searchParams.refireId ?? ''}
          status={searchParams.refireStatus}
        />
      )}

      {/* Config status */}
      <section className="card">
        <h2 className="text-base font-semibold text-slate-900">Configuration</h2>
        <ul className="mt-3 space-y-2 text-[13px]">
          <li>
            <Badge ok={Boolean(pixelId)} />{' '}
            <strong>NEXT_PUBLIC_META_PIXEL_ID</strong>:{' '}
            {pixelId ? `set (${pixelId})` : 'MISSING — set this in Vercel env vars'}
          </li>
          <li>
            <Badge ok={tokenPresent} />{' '}
            <strong>META_CAPI_ACCESS_TOKEN</strong>:{' '}
            {tokenPresent
              ? 'set (server-only, value masked)'
              : 'MISSING — without this, CAPI events fall into demo mode and never reach Meta'}
          </li>
          <li>
            <Badge ok={!testCodePresent} warn />{' '}
            <strong>META_CAPI_TEST_EVENT_CODE</strong>:{' '}
            {testCodePresent
              ? 'set — events route to "Test Events" tab in Meta, NOT real attribution. Blank this out in Vercel for production traffic.'
              : 'blank (correct for production)'}
          </li>
        </ul>
      </section>

      {/* Live ping */}
      {liveCheck && (
        <section
          className={`card ${
            liveCheck.ok ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'
          }`}
        >
          <h2 className="text-base font-semibold text-slate-900">
            Live ping to graph.facebook.com
          </h2>
          <p className={`mt-2 text-[13px] ${liveCheck.ok ? 'text-emerald-800' : 'text-red-800'}`}>
            {liveCheck.ok ? '✓' : '✗'} {liveCheck.detail}
          </p>
          <p className="mt-2 text-[12px] text-slate-600">
            (Sent a ViewContent test event — visible in Meta Events Manager →
            Activity within ~30 seconds.)
          </p>
        </section>
      )}

      {!isConfigured && (
        <section className="card border-red-300 bg-red-50">
          <h2 className="text-base font-semibold text-red-900">
            CAPI is NOT firing to Meta
          </h2>
          <p className="mt-2 text-[13px] text-red-800">
            One or both env vars are missing in Vercel. All CAPI calls are
            silently falling into demo-log mode — Meta has received zero
            server-side events. Set the env vars + redeploy, then re-fire
            the events below.
          </p>
        </section>
      )}

      {/* Re-fire UI */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Paid signups — re-fire CAPI Purchase ({paid.length})
          </h2>
          <Link
            href="/admin/customers"
            className="text-xs text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline"
          >
            View all customers →
          </Link>
        </div>
        {paid.length === 0 ? (
          <div className="card text-sm text-slate-500">
            No paid signups yet.
          </div>
        ) : (
          paid.map((s) => (
            <PaidRow key={s.id} signup={s} />
          ))
        )}
      </section>
    </div>
  );
}

function RefireResult({ refireId, status }: { refireId: string; status: string }) {
  const ok = status.startsWith('ok');
  return (
    <section
      className={`card ${ok ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}`}
    >
      <h2 className={`text-base font-semibold ${ok ? 'text-emerald-900' : 'text-red-900'}`}>
        {ok ? '✓ Re-fire successful' : '✗ Re-fire failed'}
      </h2>
      <p className={`mt-2 text-[13px] ${ok ? 'text-emerald-800' : 'text-red-800'}`}>
        Signup <code>{refireId}</code> — {decodeURIComponent(status)}
      </p>
    </section>
  );
}

function Badge({ ok, warn }: { ok: boolean; warn?: boolean }) {
  if (warn && !ok)
    return (
      <span className="inline-flex h-5 items-center rounded-full bg-amber-100 px-2 text-[10px] font-semibold text-amber-700">
        WARN
      </span>
    );
  return ok ? (
    <span className="inline-flex h-5 items-center rounded-full bg-emerald-100 px-2 text-[10px] font-semibold text-emerald-700">
      OK
    </span>
  ) : (
    <span className="inline-flex h-5 items-center rounded-full bg-red-100 px-2 text-[10px] font-semibold text-red-700">
      MISSING
    </span>
  );
}

function PaidRow({ signup }: { signup: Signup }) {
  const meta = (signup.metadata as Record<string, unknown> | undefined) ?? {};
  const metaMeta = (meta.meta as Record<string, string> | undefined) ?? {};
  const ext = (meta.externalId as string) ?? '';
  const hasMatchKeys = Boolean(metaMeta.fbp || metaMeta.fbc);

  return (
    <div className="card flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px] text-slate-700">{ext}</span>
          {signup.bumped && (
            <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-cyan-700">
              Bumped
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
              hasMatchKeys ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {hasMatchKeys ? 'Has fbp/fbc' : 'No match keys — low quality'}
          </span>
        </div>
        <p className="mt-2 text-[12px] text-slate-600">
          {signup.firstName}{' '}
          {signup.lastName ?? ''} · {signup.email} · ₱{(signup.amountCentavos ?? 0) / 100}
        </p>
        <p className="text-[11px] text-slate-500">
          Created {new Date(signup.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
        </p>
      </div>
      <form action={refireCapiForAction}>
        <input type="hidden" name="id" value={signup.id} />
        <button type="submit" className="btn btn-secondary whitespace-nowrap text-[12px]">
          Re-fire CAPI Purchase
        </button>
      </form>
    </div>
  );
}

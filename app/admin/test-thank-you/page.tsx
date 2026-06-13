/**
 * /admin/test-thank-you — QA tool for previewing /thank-you in every
 * funnel state (bare / paid / bumped at checkout / OTO purchased / OTO
 * failed) without running a real Xendit invoice.
 *
 * Click "Spin up new test order" → a real signup row is inserted into
 * Supabase with `metadata.demo: true`, so the thank-you page does its
 * real signup lookup, fires real Meta Pixel + CAPI events with real
 * eventIDs, and behaves exactly like production. The row is tagged so
 * "Cleanup demo signups" can wipe them in one click.
 *
 * Real signups (metadata.demo undefined) are NEVER touched.
 */

import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import {
  addSignup,
  deleteDemoSignups,
  getSignups,
  updateSignup,
  type Signup,
} from '@/lib/db';
import { OFFER } from '@/lib/config';

export const dynamic = 'force-dynamic';

/* --------------------------------------------------------------------- */
/* Server actions                                                        */
/* --------------------------------------------------------------------- */

async function createTestOrderAction(formData: FormData) {
  'use server';
  requireAdmin();
  const bumped = formData.get('bumped') === '1';
  const externalId = `BL-MAIN-DEMO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const amountCentavos =
    OFFER.main.priceCentavos + (bumped ? OFFER.oto.priceCentavos : 0);

  await addSignup({
    firstName: 'Test',
    lastName: 'Buyer',
    email: 'test+demo@bosslabs.ai',
    phone: '+639170000000',
    source: 'paid',
    status: 'paid', // assume paid so the thank-you page renders the confirmed state
    amountCentavos,
    bumped,
    metadata: {
      externalId,
      demo: true,
      paymentMethodGroup: 'GCASH',
      confirmationSent: new Date().toISOString(),
      meta: { sourceUrl: '/admin/test-thank-you' },
    },
  });

  revalidatePath('/admin/test-thank-you');
}

async function flipBumpAction(formData: FormData) {
  'use server';
  requireAdmin();
  const id = String(formData.get('id') || '');
  const nextBump = formData.get('bumped') === '1';
  if (!id) return;
  const all = await getSignups();
  const s = all.find((x) => x.id === id);
  if (!s) return;
  // Adjust amount alongside the bump flip so the Purchase pixel value
  // stays accurate when the admin toggles it mid-test.
  const newAmount =
    OFFER.main.priceCentavos + (nextBump ? OFFER.oto.priceCentavos : 0);
  await updateSignup(id, { bumped: nextBump, amountCentavos: newAmount });
  revalidatePath('/admin/test-thank-you');
}

async function cleanupAction() {
  'use server';
  requireAdmin();
  await deleteDemoSignups();
  revalidatePath('/admin/test-thank-you');
}

/* --------------------------------------------------------------------- */
/* Page                                                                  */
/* --------------------------------------------------------------------- */

function isDemo(s: Signup): boolean {
  return (s.metadata as { demo?: boolean } | undefined)?.demo === true;
}

export default async function TestThankYouPage() {
  requireAdmin();
  const all = await getSignups();
  const demos = all
    .filter(isDemo)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            QA · Test /thank-you
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Spin up a fake order, then preview every thank-you-page variant
            with real pixel + CAPI events. Cleanup wipes only demo rows
            (real signups are never touched).
          </p>
        </div>
      </header>

      {/* Spin up actions */}
      <section className="card">
        <h2 className="text-base font-semibold text-slate-900">
          Spin up a new test order
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Inserts a marked-demo signup row, gives you preview links for
          every funnel state below.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <form action={createTestOrderAction}>
            <input type="hidden" name="bumped" value="0" />
            <button type="submit" className="btn btn-primary w-full sm:w-auto">
              New ₱{(OFFER.main.priceCentavos / 100).toLocaleString()} order (no bump)
            </button>
          </form>
          <form action={createTestOrderAction}>
            <input type="hidden" name="bumped" value="1" />
            <button type="submit" className="btn btn-secondary w-full sm:w-auto">
              New ₱
              {(
                (OFFER.main.priceCentavos + OFFER.oto.priceCentavos) /
                100
              ).toLocaleString()}{' '}
              order (bumped at checkout)
            </button>
          </form>
        </div>
      </section>

      {/* Existing demo orders */}
      {demos.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Demo orders ({demos.length})
            </h2>
            <form action={cleanupAction}>
              <button
                type="submit"
                className="text-xs font-medium text-red-600 underline-offset-4 hover:underline"
              >
                Cleanup all demo signups
              </button>
            </form>
          </div>

          {demos.map((s) => (
            <DemoCard
              key={s.id}
              signup={s}
              flipBumpAction={flipBumpAction}
            />
          ))}
        </section>
      ) : (
        <section className="card text-center">
          <p className="text-sm text-slate-500">
            No demo orders yet. Hit a button above to spin one up.
          </p>
        </section>
      )}

      <section className="card bg-amber-50/60 border-amber-200">
        <h3 className="text-sm font-semibold text-amber-900">
          What this fires (when you click the preview links)
        </h3>
        <ul className="mt-2 space-y-1 text-[13px] text-amber-900">
          <li>
            • Pixel <code>PageView</code> on every load (from layout)
          </li>
          <li>
            • Pixel <code>Purchase</code> when <code>?order=</code> is set —
            with the real amount from the demo signup row
          </li>
          <li>
            • CAPI Purchase does <strong>NOT</strong> fire from a preview
            click (it fires from the Xendit webhook, which a preview
            doesn&rsquo;t hit). To verify CAPI deduplication, set{' '}
            <code>META_CAPI_TEST_EVENT_CODE</code> in Vercel and complete a
            real ₱999 Xendit invoice instead.
          </li>
        </ul>
      </section>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Demo order row                                                        */
/* --------------------------------------------------------------------- */

function DemoCard({
  signup,
  flipBumpAction,
}: {
  signup: Signup;
  flipBumpAction: (formData: FormData) => Promise<void>;
}) {
  const meta = signup.metadata as { externalId?: string } | undefined;
  const externalId = meta?.externalId ?? '';
  const totalPhp = ((signup.amountCentavos ?? 0) / 100).toLocaleString();
  const bumped = Boolean(signup.bumped);

  const variants = [
    {
      label: 'Standard confirmation',
      url: `/thank-you?order=${encodeURIComponent(externalId)}`,
      hint: `Pixel Purchase value: ₱${totalPhp}`,
    },
    {
      label: 'After OTO purchased (oto=1)',
      url: `/thank-you?order=${encodeURIComponent(externalId)}&oto=1`,
      hint: `Pixel Purchase value: ₱${(
        ((signup.amountCentavos ?? 0) +
          (bumped ? 0 : OFFER.oto.priceCentavos)) /
        100
      ).toLocaleString()}`,
    },
    {
      label: 'OTO failed (oto=failed)',
      url: `/thank-you?order=${encodeURIComponent(externalId)}&oto=failed`,
      hint: 'Amber soft-error banner, Purchase still fires for main amount',
    },
    {
      label: 'Bare URL (no order param)',
      url: '/thank-you',
      hint: 'Renders, but Purchase pixel is gated — no event fires',
    },
  ];

  return (
    <div className="card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px] text-slate-700">
              {externalId}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                bumped
                  ? 'bg-cyan-100 text-cyan-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {bumped ? 'Bumped' : 'No bump'}
            </span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-700">
              Paid · ₱{totalPhp}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Created {new Date(signup.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
          </p>
        </div>
        <form action={flipBumpAction}>
          <input type="hidden" name="id" value={signup.id} />
          <input type="hidden" name="bumped" value={bumped ? '0' : '1'} />
          <button
            type="submit"
            className="text-[12px] font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
          >
            Flip bump → {bumped ? 'No bump' : 'Bumped'}
          </button>
        </form>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {variants.map((v) => (
          <Link
            key={v.label}
            href={v.url}
            target="_blank"
            className="group flex flex-col gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition hover:border-cyan-400 hover:bg-cyan-50/50"
          >
            <span className="text-[13px] font-medium text-slate-900 group-hover:text-cyan-700">
              {v.label} ↗
            </span>
            <span className="font-mono text-[10px] text-slate-500">{v.url}</span>
            <span className="text-[11px] text-slate-500">{v.hint}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

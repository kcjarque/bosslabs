import Link from 'next/link';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { Mark } from '@/components/Mark';
import { PurchasePixel } from '@/components/PurchasePixel';
import { findSignupByExternalId } from '@/lib/db';
import { resolvePurchaseAmount } from '@/lib/purchase-amount';
import { VaultCredentialsCard } from '@/components/VaultCredentialsCard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: "You're in the Hub — BossLabs AI",
  description: 'Your AI Secrets Builder Vault is unlocked. Save your Hub credentials below.',
};

type Search = {
  order?: string;
  oto?: string;
};

/**
 * Vault-specific thank-you page. Reads the buyer's signup from the order id,
 * pulls the Hub credentials provisioned by the webhook (signup.metadata.hubAccount),
 * and shows them once. The credentials are also emailed via the standard
 * vault_confirmation template — this page just makes them visible immediately
 * so the buyer doesn't have to dig through their inbox.
 *
 * Fallback states:
 *   - No order id → generic "check your email" notice (rare; only if redirect lost params)
 *   - No hubAccount on the signup → webhook is still racing; show "we'll email it"
 *   - hubAccount.password is null (re-fire) → show username + "check the email we sent earlier"
 */
export default async function VaultThankYouPage({ searchParams }: { searchParams: Search }) {
  const order = searchParams.order ?? '';
  const purchase = await resolvePurchaseAmount(order, searchParams.oto);
  const signup = order ? await findSignupByExternalId(order) : null;
  const hub = (signup?.metadata as { hubAccount?: { email: string; password: string | null; existed?: boolean } } | undefined)?.hubAccount;
  const firstName = signup?.firstName?.split(/\s+/)[0] ?? 'there';

  return (
    <>
      <PurchasePixel orderId={order} value={purchase.value} bumped={purchase.bumped} />
      <header className="border-b border-white/[0.05] bg-[#06070A]/80 backdrop-blur-md">
        <div className="container-tight flex h-16 items-center justify-between">
          <div className="inline-flex items-center gap-3">
            <Mark size={26} />
            <Logo size="md" />
          </div>
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-cyan-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 [box-shadow:0_0_6px_2px_rgba(52,211,153,0.5)]" />
            Hub access unlocked
          </span>
        </div>
      </header>

      <main className="container-tight py-12 sm:py-20">
        <div className="mx-auto max-w-2xl">
          {/* Confirm */}
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/60 bg-emerald-500/[0.12] shadow-[0_0_60px_-10px_rgba(34,197,94,0.55)]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-emerald-300">
                <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="mt-6 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
              Vault confirmed
            </div>
            <h1 className="mt-3 font-serif text-4xl tracking-tight text-white sm:text-5xl">
              You&rsquo;re in, {firstName}.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-[1.65] text-ink-200">
              Your <strong className="text-white">AI Secrets Builder Vault</strong> is unlocked. Save the
              credentials below — they&rsquo;re your single key into the BossLabs Hub.
            </p>
          </div>

          {/* Credentials */}
          <div className="mt-9">
            <VaultCredentialsCard hub={hub} buyerEmail={signup?.email ?? ''} />
          </div>

          {/* What's inside the Hub */}
          <div className="mt-10 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
              Inside the Hub
            </div>
            <ul className="mt-3 space-y-2.5 text-[14.5px] text-ink-100">
              <li className="flex items-start gap-3">
                <Check />
                <span>Every live build recording — full end-to-end</span>
              </li>
              <li className="flex items-start gap-3">
                <Check />
                <span>BossLabs AI-Flix — step-by-step tutorials, 1-year access</span>
              </li>
              <li className="flex items-start gap-3">
                <Check />
                <span>Prompt library + skill packs + starter repos</span>
              </li>
              <li className="flex items-start gap-3">
                <Check />
                <span>The 4-Step Vision-to-Reality App Blueprint</span>
              </li>
              <li className="flex items-start gap-3">
                <Check />
                <span>Marketplace + freelance escrow + job board (all unlocked)</span>
              </li>
            </ul>
          </div>

          {/* Backups */}
          <div className="mt-10 rounded-2xl border border-amber-400/25 bg-amber-500/[0.05] p-5 text-[13.5px] leading-[1.6] text-amber-100">
            <strong className="text-amber-50">Save your password.</strong> We sent it to your email too,
            but if you lose both you&rsquo;ll need to reset from inside the Hub. Bookmark{' '}
            <Link href="https://bosslabs-hub.vercel.app" className="font-semibold underline">
              bosslabs-hub.vercel.app
            </Link>{' '}
            now.
          </div>

          {/* Back to main */}
          <div className="mt-10 text-center">
            <Link
              href="/"
              className="text-sm font-medium text-cyan-300/90 underline-offset-4 transition hover:text-cyan-200 hover:underline"
            >
              ← Back to BossLabs AI
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-[3px] flex-none text-cyan-400">
      <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

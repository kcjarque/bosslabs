/**
 * Shared Hub-backfill helpers — used by the admin tool (/api/admin/hub-backfill)
 * and the safety-net cron (/api/cron/hub-backfill).
 *
 * A "stuck" Vault buyer paid for the Vault (which includes BossLabs Hub access)
 * but their payment webhook never provisioned a Hub account. This module finds
 * them (high-confidence + deduped by email) and provisions + emails them.
 */
import { getSignups, updateSignup, type Signup } from '@/lib/db';
import { provisionHubAccount } from '@/lib/hub-provision';
import { sendEmail } from '@/lib/email';
import { signVaultOrder } from '@/lib/vault-token';

const VAULT_BUMP_TOTAL_CENTAVOS = 199800; // ₱999 ticket + ₱999 Vault bump

export type StuckBuyer = {
  signupId: string;
  email: string;
  firstName: string;
  externalId: string;
  amountCentavos: number;
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '%22');
}

/** Credentials email — inline-styled for wide client compatibility. */
export function credsEmailHtml(args: { firstName: string; hubEmail: string; hubPassword: string; loginUrl: string }): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="padding:24px 16px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="560" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.04)">
    <tr><td style="padding:28px 32px;border-bottom:1px solid #f0f2f5">
      <div style="font-size:11.5px;font-weight:700;letter-spacing:0.18em;color:#0891B2;text-transform:uppercase;margin-bottom:6px">VAULT ACCESS</div>
      <h1 style="margin:0;font-size:24px;line-height:1.25;color:#111827;font-weight:700">Your BossLabs Hub is ready, ${escapeHtml(args.firstName)}</h1>
    </td></tr>
    <tr><td style="padding:24px 32px 8px">
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.65">Your <strong>AI Secrets Builder Vault</strong> unlocks the full BossLabs Hub — recordings, AI-Flix, prompts, marketplace, the works. <strong>Save these credentials</strong> — they&rsquo;re your single key in.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;margin:20px 0"><tr><td style="padding:18px 22px">
        <div style="font-size:10.5px;font-weight:700;letter-spacing:0.14em;color:#6b7280;text-transform:uppercase;margin-bottom:6px">USERNAME (EMAIL)</div>
        <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:15px;color:#111827;margin-bottom:18px;word-break:break-all">${escapeHtml(args.hubEmail)}</div>
        <div style="font-size:10.5px;font-weight:700;letter-spacing:0.14em;color:#6b7280;text-transform:uppercase;margin-bottom:6px">PASSWORD</div>
        <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:15px;color:#111827;word-break:break-all">${escapeHtml(args.hubPassword)}</div>
      </td></tr></table>
      <div style="text-align:center;margin:8px 0 22px"><a href="${escapeAttr(args.loginUrl)}" style="display:inline-block;padding:14px 30px;background:#0891b2;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:15px">Log in to the BossLabs Hub →</a></div>
      <p style="margin:0 0 8px;color:#6b7280;font-size:13px">Inside the Hub:</p>
      <ul style="margin:0 0 18px;padding-left:18px;color:#4b5563;font-size:14px;line-height:1.75">
        <li>Every live build recording — full end-to-end</li>
        <li>BossLabs AI-Flix tutorials (1-year access)</li>
        <li>Prompt library + skill packs + starter repos</li>
        <li>Marketplace + freelance escrow + job board</li>
      </ul>
      <p style="margin:18px 0 0;color:#6b7280;font-size:13px;line-height:1.6">Lost your password? Use <em>Forgot password</em> at <a href="https://bosslabs-hub.vercel.app/login" style="color:#0891b2">bosslabs-hub.vercel.app/login</a> — we&rsquo;ll email a reset link.</p>
    </td></tr>
    <tr><td style="padding:18px 32px;background:#f9fafb;border-top:1px solid #f0f2f5;color:#9ca3af;font-size:12px">— Mikey &amp; Kyle, BossLabs</td></tr>
  </table></div></body></html>`;
}

/** High-confidence, deduped-by-email list of Vault buyers with no Hub account.
 *
 *  - Dedupe: if ANY signup row for an email already has a hubAccount, the whole
 *    email is considered covered (handles duplicate signup rows like RC Moran's).
 *  - High-confidence Vault only: exact ₱1,998 (ticket+Vault bump) or an
 *    OTO/standalone-Vault external id. Excludes 1:1-only bumps (₱3,997),
 *    ambiguous ₱999, and ₱0 test rows so the cron never mis-emails.
 */
export function findStuckVaultBuyers(signups: Signup[]): StuckBuyer[] {
  const byEmail = new Map<string, Signup[]>();
  for (const s of signups) {
    const e = (s.email ?? '').toLowerCase().trim();
    if (!e) continue;
    const list = byEmail.get(e) ?? [];
    list.push(s);
    byEmail.set(e, list);
  }

  const out: StuckBuyer[] = [];
  for (const [email, rows] of byEmail) {
    // Covered if ANY row already has a Hub account.
    const covered = rows.some((r) => Boolean((r.metadata as { hubAccount?: unknown } | undefined)?.hubAccount));
    if (covered) continue;

    // Pick a high-confidence Vault row.
    const vaultRow = rows.find((r) => {
      if (r.status !== 'paid' && r.status !== 'attended') return false;
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const ext = String(meta.externalId ?? '');
      const otoProduct = typeof meta.otoProduct === 'string' ? meta.otoProduct : undefined;
      const otoConfirmed = Boolean(meta.otoConfirmed);
      if (ext.startsWith('BL-OTOX-VAULT-')) return otoConfirmed || (r.amountCentavos ?? 0) === 0;
      if (ext.startsWith('BL-OTO-') && (otoProduct === 'oto' || otoProduct === 'both') && otoConfirmed) return true;
      // Main-checkout: only the exact ticket+Vault total is high-confidence.
      if (r.bumped === true && (r.amountCentavos ?? 0) === VAULT_BUMP_TOTAL_CENTAVOS) return true;
      return false;
    });
    if (!vaultRow) continue;

    const meta = (vaultRow.metadata ?? {}) as Record<string, unknown>;
    out.push({
      signupId: vaultRow.id,
      email,
      firstName: vaultRow.firstName || email.split('@')[0],
      externalId: String(meta.externalId ?? ''),
      amountCentavos: vaultRow.amountCentavos ?? 0,
    });
  }
  return out;
}

/** Provision a Hub account for one buyer + persist creds on the signup +
 *  email them. Idempotent-ish (forceReset gives a fresh password). */
export async function provisionAndEmailBuyer(
  buyer: StuckBuyer,
  opts: { baseUrl: string; allSignups?: Signup[] },
): Promise<{ email: string; provisioned: boolean; emailSent: boolean; error?: string }> {
  const result = await provisionHubAccount({ email: buyer.email, fullName: buyer.firstName, forceReset: true });
  if (!result?.ok || !result.password) {
    return { email: buyer.email, provisioned: false, emailSent: false, error: 'provision failed' };
  }

  if (buyer.signupId) {
    const signups = opts.allSignups ?? (await getSignups());
    const s = signups.find((sg) => sg.id === buyer.signupId);
    await updateSignup(buyer.signupId, {
      metadata: {
        ...((s?.metadata ?? {}) as Record<string, unknown>),
        hubAccount: {
          email: result.email,
          password: result.password,
          userId: result.userId,
          provisionedAt: new Date().toISOString(),
          existed: result.existed,
          backfilled: true,
        },
      },
    });
  }

  const sig = buyer.externalId ? signVaultOrder(buyer.externalId) : null;
  const loginUrl = buyer.externalId && sig
    ? `${opts.baseUrl}/thank-you/vault?order=${encodeURIComponent(buyer.externalId)}&t=${sig}`
    : 'https://bosslabs-hub.vercel.app/login';
  const html = credsEmailHtml({ firstName: buyer.firstName, hubEmail: result.email, hubPassword: result.password, loginUrl });
  const send = await sendEmail({
    to: buyer.email,
    subject: `Your BossLabs Hub access is ready — save these credentials, ${buyer.firstName}`,
    html,
  });
  return { email: buyer.email, provisioned: true, emailSent: send.ok, error: send.ok ? undefined : send.error };
}

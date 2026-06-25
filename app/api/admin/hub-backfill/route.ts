/**
 * POST /api/admin/hub-backfill
 *
 * Provisions Hub accounts for Vault buyers whose webhook never managed to
 * call Hub (env misconfig: HUB_PROVISION_TOKEN was empty in prod, so the
 * helper bailed silently before today's incident fix). For each affected
 * buyer:
 *   1. Calls Hub /api/provision-account with `forceReset: true` so we get a
 *      fresh password even when the auth user already exists.
 *   2. Persists hubAccount in signup.metadata so the thank-you page can
 *      render it.
 *   3. Emails the buyer their credentials + a signed thank-you URL.
 *
 * Auth: Bearer HUB_PROVISION_TOKEN (same shared secret the Hub uses — there's
 * one obvious place that secret lives, and rotating it rotates everything).
 *
 * Body:
 *   {
 *     emails?: string[];     // explicit list (skips DB scan; useful for CJ-only fix)
 *     testCopyTo?: string;   // also send the FIRST email's content here with [TEST] prefix
 *     dryRun?: boolean;      // return the affected list without writing or sending
 *   }
 */
import { NextResponse } from 'next/server';
import { getSignups, updateSignup, type Signup } from '@/lib/db';
import { provisionHubAccount } from '@/lib/hub-provision';
import { sendEmail } from '@/lib/email';
import { signVaultOrder } from '@/lib/vault-token';
import { siteUrl } from '@/lib/site';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Body = {
  emails?: string[];
  testCopyTo?: string;
  dryRun?: boolean;
};

type Affected = {
  signupId: string;
  email: string;
  firstName: string;
  externalId: string;
  reason: 'otox-vault' | 'oto-vault' | 'main-bumped';
};

function isVaultStuck(s: Signup): Affected | null {
  if (!s.email) return null;
  const meta = (s.metadata ?? {}) as Record<string, unknown>;
  if (meta.hubAccount) return null; // already provisioned
  const ext = String(meta.externalId ?? '');
  const otoProduct = meta.otoProduct;
  const otoConfirmed = meta.otoConfirmed === true;
  const base = {
    signupId: s.id,
    email: s.email,
    firstName: s.firstName || s.email.split('@')[0],
    externalId: ext,
  };
  if (ext.startsWith('BL-OTOX-VAULT-')) {
    // Standalone Vault. Paid path = otoConfirmed; free-promo path = amount 0.
    if (otoConfirmed || (s.amountCentavos ?? 0) === 0) {
      return { ...base, reason: 'otox-vault' };
    }
    return null;
  }
  if (ext.startsWith('BL-OTO-') && (otoProduct === 'oto' || otoProduct === 'both') && otoConfirmed) {
    return { ...base, reason: 'oto-vault' };
  }
  if (ext.startsWith('BL-MAIN-') && s.bumped === true && (s.amountCentavos ?? 0) > 0) {
    return { ...base, reason: 'main-bumped' };
  }
  return null;
}

function credsHtml(args: { firstName: string; hubEmail: string; hubPassword: string; loginUrl: string }) {
  // Inline-styled HTML for transactional. Wide email-client compatibility
  // matters more than looking perfect in modern Gmail — keep it boring.
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '%22');
}

export async function POST(req: Request) {
  const expected = process.env.HUB_PROVISION_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 'HUB_PROVISION_TOKEN not set on bosslabs-ai' }, { status: 503 });
  }
  const auth = req.headers.get('authorization') ?? '';
  const presented = auth.replace(/^Bearer\s+/i, '');
  if (presented !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const explicitEmails = (body.emails ?? []).map((e) => e.toLowerCase().trim()).filter(Boolean);
  const testCopyTo = (body.testCopyTo ?? '').trim();
  const dryRun = body.dryRun === true;

  // Find affected signups
  const allSignups = await getSignups();
  let affected: Affected[] = [];
  if (explicitEmails.length > 0) {
    // Explicit-list mode: bypass the auto-detect, take these emails regardless
    // of stuck-state (the caller knows what they're asking for — CJ may already
    // have a hubAccount but the password was never saved, so we force-reset).
    for (const e of explicitEmails) {
      const s = allSignups.find((sg) => sg.email?.toLowerCase() === e);
      if (s) {
        const meta = (s.metadata ?? {}) as Record<string, unknown>;
        const ext = String(meta.externalId ?? '');
        affected.push({
          signupId: s.id,
          email: s.email,
          firstName: s.firstName || s.email.split('@')[0],
          externalId: ext,
          reason: ext.startsWith('BL-OTOX-VAULT-')
            ? 'otox-vault'
            : ext.startsWith('BL-OTO-')
              ? 'oto-vault'
              : ext.startsWith('BL-MAIN-')
                ? 'main-bumped'
                : 'otox-vault',
        });
      } else {
        // No signup row — provision a Hub account from email alone, no metadata write.
        affected.push({
          signupId: '',
          email: e,
          firstName: e.split('@')[0],
          externalId: '',
          reason: 'otox-vault',
        });
      }
    }
  } else {
    affected = allSignups.map(isVaultStuck).filter((a): a is Affected => a !== null);
  }

  if (dryRun) {
    return NextResponse.json({ dryRun: true, count: affected.length, affected });
  }

  const base = siteUrl(req);
  const provisioned: Array<Affected & { newPassword: boolean; emailSent: boolean; emailError?: string }> = [];
  let firstSuccess: { html: string; subject: string; firstName: string; hubEmail: string; hubPassword: string } | null = null;

  for (const a of affected) {
    const fullName = a.firstName; // best-effort; we don't always have last name
    // forceReset so explicit-list buyers (CJ) get a fresh password even though
    // their Hub auth user already exists. For genuinely new accounts, the Hub
    // ignores forceReset and goes through the createUser path.
    const result = await provisionHubAccount({ email: a.email, fullName, forceReset: true });
    if (!result?.ok || !result.password) {
      provisioned.push({ ...a, newPassword: false, emailSent: false, emailError: 'provision failed (see server logs)' });
      continue;
    }

    // Persist on the signup row so /thank-you/vault can render the card.
    if (a.signupId) {
      const s = allSignups.find((sg) => sg.id === a.signupId);
      await updateSignup(a.signupId, {
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

    // Send credentials email + a signed thank-you link (so a future click on
    // the link from the email still resolves to a working URL).
    const subject = `Your BossLabs Hub access is ready — save these credentials, ${a.firstName}`;
    const sig = a.externalId ? signVaultOrder(a.externalId) : null;
    const loginUrl = a.externalId && sig
      ? `${base}/thank-you/vault?order=${encodeURIComponent(a.externalId)}&t=${sig}`
      : 'https://bosslabs-hub.vercel.app/login';
    const html = credsHtml({
      firstName: a.firstName,
      hubEmail: result.email,
      hubPassword: result.password,
      loginUrl,
    });
    const send = await sendEmail({ to: a.email, subject, html });
    provisioned.push({
      ...a,
      newPassword: true,
      emailSent: send.ok,
      emailError: send.ok ? undefined : send.error,
    });
    if (!firstSuccess && send.ok) {
      firstSuccess = { html, subject, firstName: a.firstName, hubEmail: result.email, hubPassword: result.password };
    }
  }

  // Test copy to whoever asked — clones the first successful email's content
  // verbatim, prefixed [TEST] so the recipient knows it's a template review.
  let testCopyResult: { ok: boolean; error?: string } | null = null;
  if (testCopyTo && firstSuccess) {
    const tc = await sendEmail({
      to: testCopyTo,
      subject: `[TEST] ${firstSuccess.subject}`,
      html: `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:14px 18px;font-family:-apple-system,sans-serif;color:#78350f;font-size:13px;margin-bottom:16px">
  <strong>TEST EMAIL.</strong> This is the credentials email that was just sent to <code>${escapeHtml(firstSuccess.hubEmail)}</code>. Reviewing the template — no action required.
</div>${firstSuccess.html}`,
    });
    testCopyResult = { ok: tc.ok, error: tc.ok ? undefined : tc.error };
  }

  return NextResponse.json({
    ok: true,
    count: affected.length,
    provisionedCount: provisioned.filter((p) => p.newPassword).length,
    emailSentCount: provisioned.filter((p) => p.emailSent).length,
    testCopy: testCopyResult,
    detail: provisioned,
  });
}

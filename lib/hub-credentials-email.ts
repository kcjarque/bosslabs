/**
 * Send a Vault buyer their BossLabs Hub credentials.
 *
 * Same HTML template the admin backfill endpoint uses, extracted here so
 * the Xendit webhook can also fire it automatically when a Vault payment
 * clears. Both call sites land on the same email shape.
 */
import { sendEmail } from '@/lib/email';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function hubCredentialsHtml(args: {
  firstName: string;
  hubEmail: string;
  hubPassword: string;
  loginUrl: string;
}): string {
  // Inline-styled HTML for wide email-client compatibility.
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
      <div style="text-align:center;margin:8px 0 22px"><a href="${args.loginUrl.replace(/"/g, '%22')}" style="display:inline-block;padding:14px 30px;background:#0891b2;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:15px">Log in to the BossLabs Hub →</a></div>
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

export async function sendHubCredentialsEmail(args: {
  firstName: string;
  email: string;
  hubPassword: string;
  loginUrl?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const subject = `Your BossLabs Hub access is ready — save these credentials, ${args.firstName}`;
  const html = hubCredentialsHtml({
    firstName: args.firstName,
    hubEmail: args.email,
    hubPassword: args.hubPassword,
    loginUrl: args.loginUrl ?? 'https://bosslabs-hub.vercel.app/login',
  });
  const res = await sendEmail({ to: args.email, subject, html });
  return { ok: res.ok, error: res.ok ? undefined : res.error };
}

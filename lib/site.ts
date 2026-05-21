/**
 * Site-URL helper used by every API route that builds an absolute callback
 * URL (Xendit redirect, Resend "from" header, etc).
 *
 * Prefers NEXT_PUBLIC_SITE_URL when set; falls back to the request's own
 * host + protocol so previews on bosslabs-git-foo.vercel.app still build
 * working callbacks.
 */

export function siteUrl(req: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

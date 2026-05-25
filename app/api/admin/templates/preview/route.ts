/**
 * /api/admin/templates/preview — render markdown body to BOSSLABS-styled
 * HTML for the live preview pane in the template editor. Keeps the
 * rendering logic single-sourced on the server.
 */

import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { htmlToApproxMarkdown, renderEmailMarkdown } from '@/lib/email-markdown';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    /** Markdown body to render. */
    body?: string;
    /** If provided instead of body, do a best-effort HTML → markdown
     *  conversion and render that. Used by the "Open in text editor"
     *  affordance on legacy templates. */
    fromHtml?: string;
  };

  if (typeof body.fromHtml === 'string' && body.fromHtml) {
    const md = htmlToApproxMarkdown(body.fromHtml) ?? '';
    return NextResponse.json({ markdown: md, html: renderEmailMarkdown(md) });
  }

  const md = typeof body.body === 'string' ? body.body : '';
  return NextResponse.json({ html: renderEmailMarkdown(md) });
}

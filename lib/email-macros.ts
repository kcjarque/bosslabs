/**
 * Body macros for the Email Machine copy (TEMPLATES.md v3 conventions):
 *
 *   {{link:TAG}}        → a tracked redirect. Email: /api/l/{tag}?c={cid}&u={target}
 *                         so every CTA click attributes + lead-tags the contact
 *                         (SPEC §5.2). SMS: a per-contact bosslabs.live/l/{slug}.
 *                         The target is read live from the offers table / tag map,
 *                         so a link can never point at a stale price or cohort.
 *   {{screenshot:A#}}   → the proof image for a block. Rendered as a markdown
 *                         image when the asset exists; DROPPED when it doesn't
 *                         ("blocks don't ship without it", SPEC §11) — we never
 *                         fabricate a client-system screenshot.
 *
 * Macros are resolved on the markdown BODY *before* renderEmailMarkdown, so a
 * dropped screenshot removes the whole image and a resolved link flows into the
 * <a href> cleanly. `{{offer.*}}` and `{{firstName}}` are NOT handled here —
 * those are plain vars substituted later by renderTemplate.
 */
import { resolveTagTarget, createShortLink } from './engagement';

/** Supabase Storage bucket that hosts email images. Exported so the screenshot
 *  audit + future asset wiring share one base. */
export const ASSET_BASE =
  'https://hsbowpbuqlctxeglpqyd.supabase.co/storage/v1/object/public/email-assets';

/**
 * Screenshot assets that actually exist and are verified. A tag NOT in this map
 * is dropped at render and reported (see auditTemplateScreenshots). Add entries
 * here as Kyle uploads the real client-system captures — never point at a
 * placeholder or a generated image, or the "proof" stops being proof.
 */
export const SCREENSHOTS: Record<string, string> = {
  // A1:  `${ASSET_BASE}/emails/fleet-dashboard.png`     (logistics fleet ops)
  // A2:  `${ASSET_BASE}/emails/choco-crm.png`           (order & delivery CRM)
  // A3:  `${ASSET_BASE}/emails/print-workflow.png`      (20-stage workflow)
  // A5:  `${ASSET_BASE}/emails/retreat-cohort.png`      (June cohort building)
  // A6:  `${ASSET_BASE}/emails/retreat-app-load.png`    (app loads on phone)
  // A10: `${ASSET_BASE}/emails/testimonial.png`         (real DM screenshot)
};
void ASSET_BASE;

const LINK_MACRO = /\{\{\s*link:([a-z0-9_]+)\s*\}\}/gi;
const SHOT_MACRO = /\{\{\s*screenshot:([A-Za-z0-9]+)\s*\}\}/gi;

/** All distinct link tags referenced in a body. */
function linkTagsIn(body: string): string[] {
  return [...new Set([...body.matchAll(LINK_MACRO)].map((m) => m[1].toLowerCase()))];
}

/** All distinct screenshot tags referenced in a body (for auditing/reporting). */
export function screenshotTagsIn(body: string): string[] {
  return [...new Set([...body.matchAll(SHOT_MACRO)].map((m) => m[1]))];
}

export type EmailMacroCtx = {
  contactId: string | null;
  siteUrl: string;
  /** Per-contact signed survey URL — used as the {{link:survey}} target. */
  surveyUrl: string;
};

/**
 * Resolve {{link:*}} + {{screenshot:*}} in an email markdown body.
 * Returns the rewritten body plus any screenshot tags that had no asset (dropped).
 */
export async function resolveEmailBodyMacros(
  body: string,
  ctx: EmailMacroCtx,
): Promise<{ body: string; missingScreenshots: string[] }> {
  const tags = linkTagsIn(body);
  const linkMap: Record<string, string> = {};
  for (const tag of tags) {
    const target = tag === 'survey' && ctx.surveyUrl ? ctx.surveyUrl : await resolveTagTarget(tag);
    linkMap[tag] = ctx.contactId
      ? `${ctx.siteUrl}/api/l/${tag}?c=${encodeURIComponent(ctx.contactId)}&u=${encodeURIComponent(target)}`
      : target;
  }
  let out = body.replace(LINK_MACRO, (_m, t: string) => linkMap[t.toLowerCase()] ?? `${ctx.siteUrl}/`);

  const missing: string[] = [];
  out = out.replace(SHOT_MACRO, (_m, a: string) => {
    const url = SCREENSHOTS[a];
    if (url) return `![](${url})`;
    missing.push(a);
    return '';
  });
  return { body: out, missingScreenshots: missing };
}

/**
 * Resolve {{link:*}} in an SMS body → per-contact short links; strip any
 * {{screenshot:*}} (no images in SMS). `surveyUrl` is the signed survey link so
 * {{link:survey}} texts point at the right per-contact page.
 */
export async function resolveSmsBodyMacros(
  body: string,
  contactId: string | null,
  surveyUrl: string,
): Promise<string> {
  const tags = linkTagsIn(body);
  const linkMap: Record<string, string> = {};
  for (const tag of tags) {
    const target = tag === 'survey' && surveyUrl ? surveyUrl : await resolveTagTarget(tag);
    const slug = await createShortLink({ contactId, linkTag: tag, channel: 'sms', targetUrl: target });
    linkMap[tag] = slug ? `https://bosslabs.live/l/${slug}` : target;
  }
  let out = body.replace(LINK_MACRO, (_m, t: string) => linkMap[t.toLowerCase()] ?? 'https://bosslabs.live/');
  out = out.replace(SHOT_MACRO, '');
  return out;
}

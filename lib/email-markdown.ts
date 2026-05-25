/**
 * Tiny markdown → branded-email-HTML renderer.
 *
 * The admin types a small markdown subset in the template editor; this
 * module wraps it in the BOSSLABS email shell (560px container, Inter +
 * Georgia typography, inline SVG logomark) so the buyer always sees a
 * properly-branded email without the admin having to hand-write `<table>`
 * email HTML.
 *
 * Supported syntax (intentionally small — fewer footguns):
 *
 *   ^^EYEBROW^^           a cyan uppercase eyebrow above the headline
 *   # Headline            big serif H1
 *   ## Subhead            small uppercase subhead
 *   ---                   horizontal divider rule
 *   [[Button label]](url) CTA button (cyan pill, white text)
 *   [label](url)          inline link
 *   **bold**              bold inline
 *   *italic*              italic inline
 *   {{firstName}}         passes through untouched — the existing
 *                         template renderer substitutes at send time
 *
 * Anything else is a paragraph. A blank line starts a new paragraph.
 * No raw HTML escape hatch on purpose — keeps the markdown predictable
 * and stops admins from accidentally pasting broken HTML in.
 */

/** Inline-only escaping. Block-level rendering builds its own HTML so we
 *  can't blanket-escape upfront; instead each producer escapes its own
 *  text content as it emits. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Resolve URLs that are safe to drop into an href. Allowlist scheme to
 *  block javascript: and data: injection from a compromised admin. */
function safeHref(raw: string): string {
  const trimmed = raw.trim();
  // Mustache vars pass through (the email send pipeline substitutes them).
  if (trimmed.includes('{{')) return trimmed;
  if (/^(https?:|mailto:|tel:|\/)/i.test(trimmed)) return trimmed;
  // Relative paths or anything else — refuse to render an href.
  return '#';
}

/**
 * Inline pass — runs on the contents of a single paragraph or heading
 * (NOT across line breaks). Order matters: process the longest-match
 * patterns first so e.g. `[[btn]]` isn't mistaken for `[link]`.
 */
function renderInline(text: string): string {
  // Tokenize by recognized inline patterns. Anything not a token is
  // treated as plain text and HTML-escaped.
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    // Button: [[Label]](url)
    const btn = /^\[\[([^\]]+?)\]\]\(([^)]+?)\)/.exec(text.slice(i));
    if (btn) {
      out.push(
        `<a href="${escapeHtml(safeHref(btn[2]))}" style="background:#00B8E6;color:#06070A;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(btn[1])}</a>`,
      );
      i += btn[0].length;
      continue;
    }
    // Link: [label](url)
    const link = /^\[([^\]]+?)\]\(([^)]+?)\)/.exec(text.slice(i));
    if (link) {
      out.push(
        `<a href="${escapeHtml(safeHref(link[2]))}" style="color:#0093B8">${escapeHtml(link[1])}</a>`,
      );
      i += link[0].length;
      continue;
    }
    // Bold: **text**
    const bold = /^\*\*([^*]+?)\*\*/.exec(text.slice(i));
    if (bold) {
      out.push(`<strong>${escapeHtml(bold[1])}</strong>`);
      i += bold[0].length;
      continue;
    }
    // Italic: *text* — guard against ** by requiring the next char to not be *.
    const italic = /^\*([^*\s][^*]*?)\*/.exec(text.slice(i));
    if (italic && text[i + 1] !== '*') {
      out.push(`<em>${escapeHtml(italic[1])}</em>`);
      i += italic[0].length;
      continue;
    }
    // No match — emit one char as escaped text.
    out.push(escapeHtml(text[i]));
    i += 1;
  }
  return out.join('');
}

/**
 * Inline SVG logomark — same shapes as components/Mark.tsx, tuned for an
 * email-client safe palette (dark nodes on light bg). Gmail strips most
 * CSS but inline SVG renders fine. Falls back to alt text everywhere.
 */
const LOGO_SVG = `<svg width="56" height="44" viewBox="0 0 100 78" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="BOSSLABS AI">
  <path d="M14 14 Q 30 60, 50 64 T 86 64" stroke="#0B0D12" stroke-width="5.5" stroke-linecap="round" fill="none" />
  <path d="M86 14 Q 70 60, 50 64 T 14 64" stroke="#00B8E6" stroke-width="5.5" stroke-linecap="round" fill="none" />
  <circle cx="14" cy="14" r="9" stroke="#0B0D12" stroke-width="3" fill="#FFFFFF" />
  <circle cx="86" cy="14" r="9" stroke="#00B8E6" stroke-width="3" fill="#FFFFFF" />
  <circle cx="14" cy="64" r="9" stroke="#00B8E6" stroke-width="3" fill="#FFFFFF" />
  <circle cx="50" cy="64" r="9" stroke="#0B0D12" stroke-width="3" fill="#FFFFFF" />
  <circle cx="86" cy="64" r="9" stroke="#0B0D12" stroke-width="3" fill="#FFFFFF" />
</svg>`;

/** Render the wrapped <body> shell with the logomark header + footer. */
function renderShell(innerHtml: string): string {
  return [
    '<div style="background:#F5F7FB;padding:24px 0;font-family:Inter,system-ui,sans-serif">',
    '<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden">',
    // Header
    '<div style="padding:24px 24px 0;text-align:left">',
    LOGO_SVG,
    '</div>',
    // Body
    `<div style="padding:20px 28px 28px;color:#0B0D12">${innerHtml}</div>`,
    // Footer band
    '<div style="border-top:1px solid #E5E9F2;padding:16px 28px;color:#6B6F7C;font-size:11px">',
    'BOSSLABS AI · Built in Manila',
    '</div>',
    '</div>',
    '</div>',
  ].join('');
}

/** Render markdown source → full email HTML (shell + body). */
export function renderEmailMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const joined = paragraph.join(' ').trim();
    if (joined) {
      blocks.push(
        `<p style="font-size:16px;line-height:1.55;margin:0 0 16px">${renderInline(joined)}</p>`,
      );
    }
    paragraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === '') {
      flushParagraph();
      continue;
    }

    // Eyebrow: ^^TEXT^^
    const eyebrow = /^\^\^(.+?)\^\^$/.exec(line);
    if (eyebrow) {
      flushParagraph();
      blocks.push(
        `<p style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:#0093B8;margin:0 0 12px;font-weight:600">${renderInline(eyebrow[1])}</p>`,
      );
      continue;
    }

    // Horizontal rule: ---
    if (line === '---') {
      flushParagraph();
      blocks.push(
        '<hr style="border:none;border-top:1px solid #E5E9F2;margin:24px 0" />',
      );
      continue;
    }

    // ## subhead
    if (line.startsWith('## ')) {
      flushParagraph();
      blocks.push(
        `<p style="font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#454A57;margin:24px 0 8px;font-weight:600">${renderInline(line.slice(3))}</p>`,
      );
      continue;
    }

    // # headline
    if (line.startsWith('# ')) {
      flushParagraph();
      blocks.push(
        `<h1 style="font-family:Georgia,serif;font-weight:400;font-size:34px;line-height:1.1;margin:0 0 16px;color:#0B0D12">${renderInline(line.slice(2))}</h1>`,
      );
      continue;
    }

    // Standalone button line: [[Label]](url) on its own line → centered button block
    const standaloneButton = /^\[\[([^\]]+?)\]\]\(([^)]+?)\)$/.exec(line);
    if (standaloneButton) {
      flushParagraph();
      blocks.push(
        `<p style="margin:8px 0 24px"><a href="${escapeHtml(safeHref(standaloneButton[2]))}" style="background:#00B8E6;color:#06070A;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(standaloneButton[1])}</a></p>`,
      );
      continue;
    }

    paragraph.push(line);
  }
  flushParagraph();

  return renderShell(blocks.join('\n'));
}

/**
 * Best-effort HTML → markdown extractor for the legacy templates. Strips
 * tags and decodes entities; lossy but good enough to give the admin a
 * starting point. Returns null when input is clearly non-HTML (no tags).
 */
export function htmlToApproxMarkdown(html: string): string | null {
  if (!/<[a-z][^>]*>/i.test(html)) return null;
  let out = html;
  // Normalize whitespace inside tags so block-detection is consistent.
  out = out.replace(/\r\n?/g, '\n');
  // Eyebrow paragraph (first <p> with uppercase + 0.18em letter-spacing).
  out = out.replace(
    /<p[^>]*letter-spacing:0\.18em[^>]*>([\s\S]*?)<\/p>/gi,
    (_, inner) => `\n\n^^${stripTags(inner)}^^\n\n`,
  );
  // H1
  out = out.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, inner) => `\n\n# ${stripTags(inner)}\n\n`);
  // Button anchors — heuristic: <a ... background: ...>
  out = out.replace(
    /<a([^>]*)style="[^"]*background:[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
    (_, attrs, inner) => {
      const href = /href="([^"]+)"/.exec(attrs)?.[1] ?? '#';
      return `[[${stripTags(inner)}]](${href})`;
    },
  );
  // Inline anchors
  out = out.replace(
    /<a([^>]*)>([\s\S]*?)<\/a>/gi,
    (_, attrs, inner) => {
      const href = /href="([^"]+)"/.exec(attrs)?.[1] ?? '#';
      return `[${stripTags(inner)}](${href})`;
    },
  );
  // Bold
  out = out.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_, inner) => `**${stripTags(inner)}**`);
  out = out.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, (_, inner) => `**${stripTags(inner)}**`);
  // Paragraphs and divs become double-newline-separated blocks.
  out = out.replace(/<\/?(p|div)[^>]*>/gi, '\n\n');
  // Line breaks
  out = out.replace(/<br\s*\/?>/gi, '\n');
  // Strip remaining tags + decode minimal entities.
  out = stripTags(out);
  // Collapse 3+ newlines to two.
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ''));
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rdquo;/g, '”')
    .replace(/&ldquo;/g, '“');
}

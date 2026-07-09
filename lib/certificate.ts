/**
 * Certificate of Participation — serverless PDF (pdf-lib + fontkit, no browser).
 *
 * Dark cinematic canvas matching the BossLabs brand (retreat brochure look):
 * #06070A ground, faint grid + cyan/indigo glows, cyan + gold double frame,
 * Instrument Serif display, and real Great Vibes SCRIPT signatures for the two
 * founders. Fonts are base64-embedded (lib/cert-fonts.ts) so they bundle into
 * the lambda. Generated per request for a verified paid attendee, then uploaded.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  GREAT_VIBES_B64,
  INSTRUMENT_SERIF_B64,
  INSTRUMENT_SERIF_ITALIC_B64,
  HEADER_PNG_B64,
} from './cert-fonts';
import { getSupabase, isSupabaseConfigured } from './supabase';

const INK = rgb(0.024, 0.027, 0.039); // #06070A
const WHITE = rgb(1, 1, 1);
const TEXT = rgb(0.79, 0.8, 0.85); // #C9CDD8
const MUTED = rgb(0.54, 0.56, 0.61); // #8A8F9C
const CYAN = rgb(0.13, 0.83, 0.93); // #22D3EE
const CYAN2 = rgb(0, 0.72, 0.9); // #00B8E6
const GOLD = rgb(0.82, 0.66, 0.35);
const INDIGO = rgb(0.31, 0.27, 0.9); // #4f46e5

const b64 = (s: string) => Uint8Array.from(Buffer.from(s, 'base64'));

export async function generateCertificatePdf(opts: {
  name: string;
  webinarName: string;
  dateLabel: string;
  certId: string;
}): Promise<Uint8Array> {
  const { name, webinarName, dateLabel, certId } = opts;
  const W = 842;
  const H = 595;
  const C = W / 2;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([W, H]);

  const serif = await doc.embedFont(b64(INSTRUMENT_SERIF_B64), { subset: true });
  const serifIt = await doc.embedFont(b64(INSTRUMENT_SERIF_ITALIC_B64), { subset: true });
  const script = await doc.embedFont(b64(GREAT_VIBES_B64), { subset: true });
  const sans = await doc.embedFont(StandardFonts.HelveticaBold);
  const sansReg = await doc.embedFont(StandardFonts.Helvetica);
  const headerImg = await doc.embedPng(b64(HEADER_PNG_B64));

  const centerAt = (
    text: string,
    font: PDFFont,
    size: number,
    cx: number,
    y: number,
    color = WHITE,
    spacing = 0,
  ) => {
    let width = font.widthOfTextAtSize(text, size);
    if (spacing) width += spacing * Math.max(0, text.length - 1);
    let x = cx - width / 2;
    if (!spacing) {
      page.drawText(text, { x, y, size, font, color });
    } else {
      for (const ch of text) {
        page.drawText(ch, { x, y, size, font, color });
        x += font.widthOfTextAtSize(ch, size) + spacing;
      }
    }
    return width;
  };

  // ── Cinematic ground: dark fill, faint grid, corner glows ───────────────
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: INK });
  for (let x = 54; x < W; x += 54)
    page.drawLine({ start: { x, y: 0 }, end: { x, y: H }, thickness: 0.5, color: CYAN, opacity: 0.035 });
  for (let y = 54; y < H; y += 54)
    page.drawLine({ start: { x: 0, y }, end: { x: W, y }, thickness: 0.5, color: CYAN, opacity: 0.035 });
  page.drawCircle({ x: 40, y: H - 20, size: 230, color: CYAN2, opacity: 0.1 });
  page.drawCircle({ x: W - 60, y: 50, size: 250, color: INDIGO, opacity: 0.09 });

  // Double frame
  page.drawRectangle({ x: 26, y: 26, width: W - 52, height: H - 52, borderColor: CYAN2, borderWidth: 2, borderOpacity: 0.9 });
  page.drawRectangle({ x: 36, y: 36, width: W - 72, height: H - 72, borderColor: GOLD, borderWidth: 0.8, borderOpacity: 0.65 });

  // ── Brand header — real two-arc mark + Orbitron wordmark + eyebrow (PNG) ──
  const hW = 500;
  const hH = (headerImg.height / headerImg.width) * hW;
  page.drawImage(headerImg, { x: C - hW / 2, y: H - 30 - hH, width: hW, height: hH });

  // ── Recipient ───────────────────────────────────────────────────────────
  centerAt('This certificate is proudly presented to', serifIt, 16, C, H - 202, MUTED);
  let ns = 48;
  while (serif.widthOfTextAtSize(name, ns) > W - 210 && ns > 22) ns -= 1;
  centerAt(name, serif, ns, C, H - 264, WHITE);
  const uw = Math.min(serif.widthOfTextAtSize(name, ns) + 90, W - 150);
  page.drawRectangle({ x: C - uw / 2, y: H - 280, width: uw, height: 1, color: CYAN, opacity: 0.9 });

  // ── Body ────────────────────────────────────────────────────────────────
  centerAt(`for participating in ${webinarName} — a live, hands-on`, serif, 16, C, H - 324, TEXT);
  centerAt(`AI app-building webinar held on ${dateLabel}.`, serif, 16, C, H - 346, TEXT);

  // ── Center seal ─────────────────────────────────────────────────────────
  page.drawCircle({ x: C, y: 152, size: 32, borderColor: GOLD, borderWidth: 1.4, borderOpacity: 0.85 });
  page.drawCircle({ x: C, y: 152, size: 25, borderColor: CYAN, borderWidth: 1, borderOpacity: 0.9 });
  centerAt('AI', serif, 19, C, 144, CYAN);

  // ── Founder signatures (real script) ────────────────────────────────────
  const sig = (cx: number, who: string, title: string) => {
    const sw = script.widthOfTextAtSize(who, 30);
    page.drawText(who, { x: cx - sw / 2, y: 122, size: 30, font: script, color: WHITE });
    page.drawRectangle({ x: cx - 94, y: 110, width: 188, height: 0.8, color: MUTED, opacity: 0.55 });
    centerAt(who, sans, 12, cx, 91, WHITE);
    centerAt(title, sansReg, 8.5, cx, 78, MUTED);
  };
  sig(232, 'Michael Manago', 'Co-Founder · BossLabs AI');
  sig(610, 'Kyle Jarque', 'Co-Founder · BossLabs AI');

  // ── Footer ──────────────────────────────────────────────────────────────
  centerAt(`Verified attendee   ·   Issued via bosslabs.live   ·   ID ${certId}`, sansReg, 8, C, 46, MUTED);

  return doc.save();
}

/** Upload a certificate PDF to public storage → returns a download URL. */
export async function uploadCertificate(bytes: Uint8Array, filename: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const key = `certificates/${filename}`;
  const { error } = await sb.storage.from('email-assets').upload(key, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) return null;
  return sb.storage.from('email-assets').getPublicUrl(key).data.publicUrl;
}

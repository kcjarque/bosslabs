/**
 * Certificate of Participation — serverless PDF generator (pdf-lib, no browser).
 *
 * Draws a landscape A4 certificate for a verified paid webinar attendee, with
 * two generated founder signatures (deterministic per name, so they stay
 * consistent), then uploads it to public storage and returns a download URL.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { getSupabase, isSupabaseConfigured } from './supabase';

const CYAN = rgb(0, 0.72, 0.9); // #00B8E6
const INK = rgb(0.05, 0.06, 0.1);
const MUTED = rgb(0.42, 0.45, 0.52);
const GOLD = rgb(0.8, 0.63, 0.3);
const LINE = rgb(0.72, 0.75, 0.82);

/** Tiny deterministic PRNG so a given name always signs the same way. */
function prng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** A handwritten-looking open signature path in a (w × h) box, per name. */
function signaturePath(name: string, w: number, h: number): string {
  const r = prng('sig:' + name);
  const n = 6 + Math.floor(r() * 3);
  let d = `M 0 ${(h * (0.45 + r() * 0.2)).toFixed(1)}`;
  for (let i = 1; i <= n; i++) {
    const x = (i / n) * w;
    const y = h * (0.12 + r() * 0.76);
    // control point loops alternately toward top/bottom for a cursive feel
    const cx = x - w / (n * 2) + (r() - 0.5) * 14;
    const cy = (i % 2 ? h * 0.05 : h * 0.95) + (r() - 0.5) * h * 0.3;
    d += ` Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  // trailing flourish
  d += ` q ${(w * 0.14).toFixed(1)} ${(-h * 0.28).toFixed(1)} ${(w * 0.04).toFixed(1)} ${(h * 0.12).toFixed(1)}`;
  return d;
}

export async function generateCertificatePdf(opts: {
  name: string;
  webinarName: string;
  dateLabel: string;
  certId: string;
}): Promise<Uint8Array> {
  const { name, webinarName, dateLabel, certId } = opts;
  const doc = await PDFDocument.create();
  const W = 842;
  const H = 595;
  const page = doc.addPage([W, H]);

  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await doc.embedFont(StandardFonts.HelveticaBold);
  const sansReg = await doc.embedFont(StandardFonts.Helvetica);

  // Center `text` around x=cx at baseline y, with optional letter-spacing.
  const centerAt = (
    p: PDFPage,
    text: string,
    font: PDFFont,
    size: number,
    cx: number,
    y: number,
    color = INK,
    spacing = 0,
  ) => {
    let width = font.widthOfTextAtSize(text, size);
    if (spacing) width += spacing * Math.max(0, text.length - 1);
    let x = cx - width / 2;
    if (!spacing) {
      p.drawText(text, { x, y, size, font, color });
    } else {
      for (const ch of text) {
        p.drawText(ch, { x, y, size, font, color });
        x += font.widthOfTextAtSize(ch, size) + spacing;
      }
    }
    return width;
  };
  const C = W / 2;

  // Canvas + double frame
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 26, y: 26, width: W - 52, height: H - 52, borderColor: CYAN, borderWidth: 2.5 });
  page.drawRectangle({ x: 36, y: 36, width: W - 72, height: H - 72, borderColor: GOLD, borderWidth: 0.8 });

  // Brand + title
  centerAt(page, 'BOSSLABS AI', sans, 15, C, H - 82, INK, 4);
  centerAt(page, 'CERTIFICATE OF PARTICIPATION', sans, 13, C, H - 140, CYAN, 3);
  page.drawRectangle({ x: C - 42, y: H - 154, width: 84, height: 2, color: CYAN });

  // Recipient
  centerAt(page, 'This certificate is proudly presented to', serifItalic, 14, C, H - 202, MUTED);
  let nameSize = 40;
  while (serifBold.widthOfTextAtSize(name, nameSize) > W - 220 && nameSize > 18) nameSize -= 1;
  centerAt(page, name, serifBold, nameSize, C, H - 262, INK);
  const underline = Math.min(serifBold.widthOfTextAtSize(name, nameSize) + 70, W - 170);
  page.drawRectangle({ x: C - underline / 2, y: H - 278, width: underline, height: 1.2, color: CYAN });

  // Body
  centerAt(page, `for participating in ${webinarName} — a live, hands-on`, serif, 14, C, H - 322, INK);
  centerAt(page, `AI app-building webinar held on ${dateLabel}.`, serif, 14, C, H - 344, INK);

  // Center seal
  page.drawCircle({ x: C, y: 152, size: 33, borderColor: GOLD, borderWidth: 1.5 });
  page.drawCircle({ x: C, y: 152, size: 26, borderColor: CYAN, borderWidth: 1 });
  centerAt(page, 'AI', serifBold, 17, C, 145, CYAN);

  // Two founder signatures
  const sigBlock = (cx: number, who: string, title: string) => {
    page.drawSvgPath(signaturePath(who, 130, 46), {
      x: cx - 65,
      y: 172,
      borderColor: INK,
      borderWidth: 1.4,
    });
    page.drawRectangle({ x: cx - 92, y: 112, width: 184, height: 0.8, color: LINE });
    centerAt(page, who, serifBold, 13, cx, 94, INK);
    centerAt(page, title, sansReg, 9, cx, 80, MUTED);
  };
  sigBlock(238, 'Michael Manago', 'Co-Founder · BossLabs AI');
  sigBlock(604, 'Kyle Jarque', 'Co-Founder · BossLabs AI');

  // Footer
  centerAt(page, `Verified attendee · Issued via bosslabs.live · ID ${certId}`, sansReg, 8, C, 50, MUTED);

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

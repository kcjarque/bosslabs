/**
 * Email typo guard — suggests a correction for a likely-mistyped address so the
 * person fixes it BEFORE it enters our list and hard-bounces. Pure + synchronous,
 * so it runs client-side as a live "did you mean?" hint (and could run on the
 * server too). Deliberately conservative: returns null for any domain that's
 * already known-good or that isn't a clear typo — it never "corrects" a real
 * address into the wrong one (and the hint is only a suggestion either way).
 */

// The domains the bulk of real signups use. A bounce on one of these is a dead
// mailbox (verification-API territory), NOT a domain typo — so we never touch them.
const KNOWN_DOMAINS = [
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.com.ph', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'zoho.com',
];
const KNOWN = new Set(KNOWN_DOMAINS);

// Unambiguous .com TLD typos (none of these is a TLD anyone in this funnel uses).
const TLD_FIX: Record<string, string> = {
  con: 'com', cpm: 'com', cmo: 'com', ocm: 'com', vom: 'com', xom: 'com',
  om: 'com', comm: 'com', coom: 'com', ccom: 'com', cm: 'com', co: 'com',
};

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[n];
}

/** A corrected email if the address looks mistyped, else null. */
export function suggestEmailCorrection(raw: string): string | null {
  const e = (raw || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1 || at >= e.length - 3) return null; // not a complete address yet
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (!domain.includes('.') || domain.includes(' ')) return null;
  if (KNOWN.has(domain)) return null; // already good — leave it alone

  // 1) Fix an obvious TLD typo (gmail.con → gmail.com), then re-check known.
  const lastDot = domain.lastIndexOf('.');
  const base = domain.slice(0, lastDot);
  const tld = domain.slice(lastDot + 1);
  const tldFixed = TLD_FIX[tld] && TLD_FIX[tld] !== tld ? `${base}.${TLD_FIX[tld]}` : domain;
  if (KNOWN.has(tldFixed)) return `${local}@${tldFixed}`;

  // 2) Near a known free-provider domain (1–2 edits) → suggest it. Distance-2 only
  //    for short, free-provider-shaped domains so we never rewrite a real company
  //    domain that happens to be a couple letters from gmail/yahoo.
  let best: string | null = null;
  let bestD = 3;
  for (const k of KNOWN_DOMAINS) {
    const d = levenshtein(tldFixed, k);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  if (best && (bestD === 1 || (bestD === 2 && tldFixed.length <= 12))) return `${local}@${best}`;

  // 3) A clear TLD typo on an otherwise-unknown domain — still worth offering.
  if (tldFixed !== domain) return `${local}@${tldFixed}`;
  return null;
}

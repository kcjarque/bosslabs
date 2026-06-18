/**
 * OTO invoice externalId encoding. The OTO upsell can be either product, so the
 * externalId carries a product marker the webhook reads to send the right
 * confirmation (and attribute the right product to Meta):
 *
 *   BL-OTO-VAULT-<mainOrder>-<ts>   → the ₱999 AI Secrets Builder Vault (oto)
 *   BL-OTO-1ON1-<mainOrder>-<ts>    → the ₱3,997 1:1 Build Session (oto2)
 *   BL-OTO-<mainOrder>-<ts>         → LEGACY (no marker) → treated as the 1:1
 *
 * mainOrder is itself `BL-MAIN-<ts>-<rand>`, so we strip the marker (if any)
 * then drop the trailing OTO timestamp to recover it.
 */
export type OtoProduct = 'oto' | 'oto2';

const MARKER: Record<OtoProduct, string> = { oto: 'VAULT', oto2: '1ON1' };

export function buildOtoExternalId(product: OtoProduct, mainOrder: string): string {
  return `BL-OTO-${MARKER[product]}-${mainOrder}-${Date.now()}`;
}

/**
 * Standalone OTO purchase (no parent webinar order) — someone buying the
 * product directly from a shared /oto link. Distinct `BL-OTOX-` prefix so the
 * webhook routes it to handleStandaloneOtoPaid (which recovers the buyer by
 * externalId) instead of handleOtoPaid (which expects a parent BL-MAIN order).
 *
 *   BL-OTOX-1ON1-<ts>-<rand>   → standalone ₱3,997 1:1 Build Session (oto2)
 */
export function buildStandaloneOtoExternalId(product: OtoProduct): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `BL-OTOX-${MARKER[product]}-${Date.now()}-${rand}`;
}

export function parseOtoExternalId(externalId: string): {
  product: OtoProduct;
  mainOrderId: string;
} {
  let stripped = externalId.replace(/^BL-OTO-/, '');
  // Legacy IDs (and the post-checkout /oto flow before this change) had no
  // marker — those were always the 1:1, so default to 'oto2'.
  let product: OtoProduct = 'oto2';
  if (stripped.startsWith('VAULT-')) {
    product = 'oto';
    stripped = stripped.slice('VAULT-'.length);
  } else if (stripped.startsWith('1ON1-')) {
    product = 'oto2';
    stripped = stripped.slice('1ON1-'.length);
  }
  const lastDash = stripped.lastIndexOf('-');
  const mainOrderId = lastDash > 0 ? stripped.slice(0, lastDash) : stripped;
  return { product, mainOrderId };
}

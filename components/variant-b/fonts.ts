/**
 * Variant-B typefaces — self-hosted via next/font (zero render-blocking
 * external requests). Loaded ONLY when OptInPageB renders, so the control
 * page ships zero extra font bytes.
 *
 *  - Space Grotesk: characterful modern grotesk for display headlines —
 *    tight tracking, confident weight, distinct from the control's serif.
 *  - JetBrains Mono: the mono accent for terminal/numbers/badges — on-brand
 *    for a Claude Code product; makes the proof read as "real system".
 *  - Body stays Inter (already loaded globally as --font-inter) — premium
 *    legibility with no double font cost.
 */
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';

export const displayFont = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-vb-display',
  display: 'swap',
});

export const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-vb-mono',
  display: 'swap',
});

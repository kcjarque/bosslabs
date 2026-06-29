/**
 * Variant-B typefaces — display now matches the control: Instrument Serif,
 * loaded GLOBALLY in app/layout.tsx (--font-instrument → Tailwind font-serif),
 * so the variant adds zero display-font bytes. Only the mono accent loads here
 * (and only when the variant renders).
 *
 *  - Display: Instrument Serif via `font-serif` — the brand's editorial face.
 *  - Body: Inter (global --font-inter).
 *  - JetBrains Mono: terminal/numbers/badges — Claude Code-flavored proof.
 */
import { JetBrains_Mono } from 'next/font/google';

export const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-vb-mono',
  display: 'swap',
});

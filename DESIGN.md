# DESIGN.md — Variant B (Homepage Split Test)

Design system for the conversion-first rebuild served as **Variation B** of the
homepage split test (`components/variant-b/`). The control page is untouched.
Traffic split: Admin → Funnels → webinar funnel → "Homepage split test".

## Locked brand palette (extracted, not invented)

| Token | Hex | Role |
|---|---|---|
| `canvas` | `#06070A` | Page background (ink-950) |
| `surface-1` | `#0A0C12` | Cards/terminal (elevation 1) |
| `surface-2` | `rgba(255,255,255,0.02–0.04)` | Tinted panels (elevation 2) |
| `accent` | `#00B8E6` (cyan-500) | THE accent — CTAs, highlights, one per moment |
| `accent-hover` | `#1FBEEC` (cyan-400) | Hover state |
| `accent-soft` | `#80DBF6` (cyan-200) | Italic/inline accents |
| `text-primary` | `#FFFFFF` | Headlines |
| `text-body` | `#D7D9E0` (ink-100) | Body |
| `text-muted` | `#9CA0AC` / `#6B6F7C` (ink-200/300) | Support/microcopy |
| `border` | `rgba(255,255,255,0.06–0.10)` | 1px low-opacity borders |
| `danger` | `#E14848` (danger-400) | Urgency only (strike-through, scarcity) |
| `success` | emerald-300/500 @ 10–40% | Guarantee, live badges, check-offs |

Derived (allowed): white/cyan at 1.5–10% opacities for elevation tints, glows
`rgba(0,184,230,0.3–0.55)` for shadows.

## Typography

- **Display — Space Grotesk** (`--font-vb-display`, 500/600/700, next/font
  self-hosted): characterful grotesk, tight tracking (−0.02 to −0.03em) for
  big confident headlines. Why: premium tech personality without losing PH
  warmth; distinct from the control's serif so the test reads differently at
  a glance.
- **Body — Inter** (already global `--font-inter`): top-tier screen
  legibility; zero extra font cost.
- **Mono — JetBrains Mono** (`--font-vb-mono`, 400/600): all numbers,
  terminal, badges, eyebrows. Why: on-brand for a Claude Code product —
  makes metrics/proof read as "real system output".

Scale (mobile → desktop): h1 34→64px / h2 26→44px / h3 17→26px, body
14–17px at 1.6–1.75 line-height, micro 10–11px tracked +0.14–0.24em.

## Depth & texture

3 elevations: canvas → `#0A0C12` cards → white-tint panels; 1px low-opacity
borders everywhere; cyan glow shadows reserved for CTA + hover lifts. A fixed
SVG-noise **grain overlay** at 3.5% opacity (mix-blend overlay) across the
whole canvas. Exactly two radial accent glows: hero top + final-CTA bottom.

## Motion (zero-dependency)

IntersectionObserver + CSS, spring-feel `cubic-bezier(0.22,1,0.36,1)`:
section reveals (fade + 22px rise, staggered), count-up stats (easeOutExpo),
self-typing terminal (type → sequential check-offs → live-badge glow),
strike-through price anchor draw, card hover lift+glow, CTA press scale.
ALL gated behind `prefers-reduced-motion` → instant static state.
No framer-motion: keeps the JS budget lean.

## Conversion system

One goal (`/checkout`) everywhere · sticky bottom CTA (mobile, safe-area
aware) + slim top bar (desktop) after the hero · trust strip on every CTA
(GCash · Maya · Cards · 7-day guarantee) · real countdown + honest seat copy ·
proof adjacent to each CTA · loud guarantee block at the close · animated
₱2,997→₱999 anchor + ₱4,997 value stack · fbq `ReserveCTAClick` (placement-
tagged) + `ScrollDepth` 25/50/75/100 + dataLayer pushes · existing pixel and
ExitIntentModal untouched.

## Intentional copy changes (labels only — substance preserved verbatim)

- New sections (per brief): 6-item Taglish FAQ + "Para kanino 'to / hindi"
  qualifier — written in the existing bawal-hao-shao operator voice.
- New connective microcopy: section eyebrows, "See it live ↗", guarantee
  paragraph ("Walang tanong-tanong…"), final headline ("One seat. One
  evening…"), CTA subline "Lahat ng ito… Ikaw naman."
- Everything factual is unchanged and sourced from `lib/config.ts`: price
  ₱999/₱2,997 anchor, ₱4,997 pack, all 5 apps + metrics + "Shipped in X",
  both demos, hosts/bios/skill values, 5-step framework, all 6 testimonials
  + names-changed line, 19-min build claim, 24h/₱1M+/7d stats, disclaimers
  (footer reused from control — single source of truth).

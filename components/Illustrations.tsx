/**
 * Illustration library for the BOSSLABS AI landing page.
 *
 * All icons are inline SVG, brand-cyan accented, line-style with light fills.
 * Each visual element is intentionally DISTINCT so sections do not feel
 * repetitive. Used by Pillars, Workflow, Wins, and the TicketIncludes
 * StarterPackMockup.
 */

type IconProps = { size?: number; className?: string };

const CYAN = '#00B8E6';
const CYAN_SOFT = '#80DBF6';

/* --------------------------------------------------------------------- */
/* PILLAR ICONS — three distinct shapes, never repeated                  */
/* --------------------------------------------------------------------- */

/** Pillar 01: The 24-Hour Replacement — a clock with a swap-arrow */
export function PillarReplacementIcon({ size = 80, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" className={className} aria-hidden>
      <circle cx="40" cy="40" r="26" stroke={CYAN} strokeWidth="1.8" />
      <circle cx="40" cy="40" r="34" stroke={CYAN} strokeOpacity="0.25" strokeWidth="1" strokeDasharray="3 4" />
      <path d="M40 24 V40 L52 48" stroke={CYAN} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M60 60 L66 54 M60 60 L66 66 M66 54 Q72 60 66 66"
        stroke={CYAN_SOFT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="40" cy="40" r="2.2" fill={CYAN} />
    </svg>
  );
}

/** Pillar 02: The Replacement Math — bar chart trending down */
export function PillarMathIcon({ size = 80, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" className={className} aria-hidden>
      <rect x="12" y="14" width="56" height="52" rx="6" stroke={CYAN} strokeWidth="1.6" />
      <line x1="12" y1="26" x2="68" y2="26" stroke={CYAN} strokeOpacity="0.35" strokeWidth="1" />
      <text x="18" y="22" fill={CYAN_SOFT} fontSize="6" fontFamily="ui-sans-serif" letterSpacing="0.5">COST</text>
      {/* Falling bars */}
      <rect x="20" y="34" width="7" height="22" fill={CYAN} opacity="0.6" rx="1" />
      <rect x="30" y="40" width="7" height="16" fill={CYAN} opacity="0.5" rx="1" />
      <rect x="40" y="46" width="7" height="10" fill={CYAN} opacity="0.4" rx="1" />
      <rect x="50" y="50" width="7" height="6" fill={CYAN} opacity="0.3" rx="1" />
      {/* Trend line */}
      <path d="M23 34 L33 40 L43 46 L53 50" stroke={CYAN_SOFT} strokeWidth="1.4" fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="53" cy="50" r="2.4" fill={CYAN} />
    </svg>
  );
}

/** Pillar 03: The Founder Multiplier — single node multiplying outward */
export function PillarMultiplierIcon({ size = 80, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" className={className} aria-hidden>
      {/* Center node */}
      <circle cx="40" cy="40" r="9" fill={CYAN_SOFT} opacity="0.18" />
      <circle cx="40" cy="40" r="6" stroke={CYAN} strokeWidth="2" fill="none" />
      <circle cx="40" cy="40" r="2.6" fill={CYAN} />
      {/* Six radiating nodes */}
      {[
        { x: 64, y: 22 },
        { x: 68, y: 50 },
        { x: 52, y: 68 },
        { x: 28, y: 68 },
        { x: 12, y: 50 },
        { x: 16, y: 22 },
      ].map((p, i) => (
        <g key={i}>
          <line x1="40" y1="40" x2={p.x} y2={p.y} stroke={CYAN} strokeOpacity="0.3" strokeWidth="1" strokeDasharray="2 3" />
          <circle cx={p.x} cy={p.y} r="3.6" fill={CYAN} opacity={0.55 + (i % 3) * 0.12} />
        </g>
      ))}
    </svg>
  );
}

/* --------------------------------------------------------------------- */
/* WORKFLOW ICONS — six distinct mini-glyphs for the 6 steps             */
/* --------------------------------------------------------------------- */

export function WorkflowSetupIcon({ size = 44, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" className={className} aria-hidden>
      <rect x="4" y="8" width="36" height="28" rx="3" stroke={CYAN} strokeWidth="1.6" />
      <line x1="4" y1="14" x2="40" y2="14" stroke={CYAN} strokeOpacity="0.45" strokeWidth="1" />
      <circle cx="8" cy="11" r="1" fill={CYAN} />
      <circle cx="11" cy="11" r="1" fill={CYAN} opacity="0.6" />
      <path d="M10 22 L14 26 L10 30 M17 30 H22" stroke={CYAN_SOFT} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function WorkflowSpecIcon({ size = 44, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" className={className} aria-hidden>
      <path d="M10 6 H28 L34 12 V38 H10 Z" stroke={CYAN} strokeWidth="1.6" fill="none" strokeLinejoin="round" />
      <path d="M28 6 V12 H34" stroke={CYAN} strokeWidth="1.6" strokeLinejoin="round" fill="none" />
      <line x1="14" y1="20" x2="30" y2="20" stroke={CYAN_SOFT} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="14" y1="25" x2="28" y2="25" stroke={CYAN_SOFT} strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
      <line x1="14" y1="30" x2="24" y2="30" stroke={CYAN_SOFT} strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

export function WorkflowBuildIcon({ size = 44, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" className={className} aria-hidden>
      <path d="M14 16 L8 22 L14 28" stroke={CYAN} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 16 L36 22 L30 28" stroke={CYAN} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M26 12 L18 32" stroke={CYAN_SOFT} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function WorkflowShipIcon({ size = 44, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" className={className} aria-hidden>
      <path d="M22 6 C28 12 30 20 30 26 V32 H14 V26 C14 20 16 12 22 6 Z" stroke={CYAN} strokeWidth="1.6" fill="none" strokeLinejoin="round" />
      <circle cx="22" cy="20" r="3" stroke={CYAN_SOFT} strokeWidth="1.4" fill="none" />
      <path d="M14 32 L10 38 L16 36 M30 32 L34 38 L28 36" stroke={CYAN_SOFT} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WorkflowIterateIcon({ size = 44, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" className={className} aria-hidden>
      <path d="M12 22 A10 10 0 1 1 32 22" stroke={CYAN} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M28 18 L32 22 L36 18" stroke={CYAN} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M32 26 A10 10 0 1 1 12 26" stroke={CYAN_SOFT} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M16 30 L12 26 L8 30" stroke={CYAN_SOFT} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WorkflowCompoundIcon({ size = 44, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" className={className} aria-hidden>
      <rect x="6" y="22" width="14" height="14" rx="2" stroke={CYAN} strokeWidth="1.6" fill="none" />
      <rect x="15" y="13" width="14" height="14" rx="2" stroke={CYAN} strokeWidth="1.6" fill="none" opacity="0.7" />
      <rect x="24" y="4" width="14" height="14" rx="2" stroke={CYAN_SOFT} strokeWidth="1.6" fill="none" opacity="0.5" />
    </svg>
  );
}

/* --------------------------------------------------------------------- */
/* CATEGORY ICONS — for Wins section, varies by business type            */
/* --------------------------------------------------------------------- */

export function CategoryAgencyIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M3 21h18M5 21V8l7-4 7 4v13M9 12h6M9 16h6" stroke={CYAN} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CategoryEcomIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M5 7h14l-1.5 10a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2L5 7Z" stroke={CYAN} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 7V5a3 3 0 0 1 6 0v2" stroke={CYAN} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function CategorySaasIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="5" width="18" height="12" rx="2" stroke={CYAN} strokeWidth="1.5" />
      <path d="M7 21h10M12 17v4" stroke={CYAN} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="11" r="3" stroke={CYAN} strokeWidth="1.5" />
    </svg>
  );
}

export function CategoryStudioIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4 18.4 5.6" stroke={CYAN} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3.5" stroke={CYAN} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

export function CategoryRetailIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M4 8h16l-1 12H5L4 8Z" stroke={CYAN} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 8V5h8v3" stroke={CYAN} strokeWidth="1.5" />
    </svg>
  );
}

export function CategoryBpoIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M5 12c0-4 3-7 7-7s7 3 7 7v4M5 12v4a2 2 0 0 0 2 2h1v-6H5Zm14 0v4a2 2 0 0 1-2 2h-1v-6h3Z" stroke={CYAN} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

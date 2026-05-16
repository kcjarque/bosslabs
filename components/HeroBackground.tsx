/**
 * HeroBackground — futuristic light overlay used only inside the hero section.
 *
 * Layered, subtle, and animated:
 *   1. Faint dotted grid (tech blueprint feel)
 *   2. Floating twinkling particles (glowing dots)
 *   3. Soft blurred cyan orbs (depth + warmth)
 *
 * Performance-friendly: pure CSS animations. No JS, no canvas.
 * Respects `prefers-reduced-motion` (see globals.css).
 */

const PARTICLES = [
  { x: 8, y: 18, delay: 0 },
  { x: 22, y: 72, delay: 0.6 },
  { x: 35, y: 28, delay: 1.4 },
  { x: 48, y: 82, delay: 2.1 },
  { x: 60, y: 12, delay: 0.3 },
  { x: 72, y: 64, delay: 1.8 },
  { x: 85, y: 30, delay: 1.0 },
  { x: 92, y: 78, delay: 2.4 },
  { x: 16, y: 50, delay: 3.0 },
  { x: 78, y: 44, delay: 2.6 },
];

export function HeroBackground() {
  return (
    <div
      aria-hidden
      className="hero-bg pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {/* 1 — dotted grid (blueprint texture) */}
      <div className="absolute inset-0 opacity-[0.45] [background-image:radial-gradient(circle_at_1px_1px,rgba(0,184,230,0.32)_1px,transparent_0)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black_55%,transparent_95%)]" />

      {/* 2 — floating twinkling particles */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="twinkle absolute h-[6px] w-[6px] rounded-full bg-cyan-300 shadow-[0_0_10px_3px_rgba(0,184,230,0.55)]"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}

      {/* 3 — soft blurred cyan orbs for depth */}
      <div
        className="orb absolute -left-32 -top-40 h-[420px] w-[420px] rounded-full bg-cyan-500/[0.16] blur-[100px]"
        style={{ animationDelay: '0s' }}
      />
      <div
        className="orb absolute -right-40 top-1/3 h-[480px] w-[480px] rounded-full bg-cyan-500/[0.12] blur-[120px]"
        style={{ animationDelay: '2.5s' }}
      />
      <div
        className="orb absolute left-1/4 -bottom-32 h-[360px] w-[360px] rounded-full bg-cyan-500/[0.10] blur-[100px]"
        style={{ animationDelay: '5s' }}
      />

      {/* 4 — bottom fade to keep section transition clean */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-[#06070A]" />
    </div>
  );
}

/**
 * PageGlow — global ambient background applied to non-landing pages.
 *
 * Lighter, calmer cousin of HeroBackground. Two big blurred orbs + a faint
 * dotted grid at top. No particles, no animation. Designed to add depth without
 * competing with form fields, legal copy, or confirmation visuals.
 */

export function PageGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* Faint top blueprint dots — quickly fade out */}
      <div className="absolute inset-x-0 top-0 h-[480px] opacity-[0.35] [background-image:radial-gradient(circle_at_1px_1px,rgba(0,184,230,0.22)_1px,transparent_0)] [background-size:32px_32px] [mask-image:linear-gradient(to_bottom,black_0%,transparent_85%)]" />

      {/* Two soft orbs at opposite corners */}
      <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-cyan-500/[0.08] blur-[120px]" />
      <div className="absolute -right-40 top-1/3 h-[480px] w-[480px] rounded-full bg-cyan-500/[0.06] blur-[120px]" />
      <div className="absolute left-1/3 -bottom-32 h-[360px] w-[360px] rounded-full bg-cyan-500/[0.04] blur-[100px]" />
    </div>
  );
}

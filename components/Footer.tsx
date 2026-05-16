import { Logo } from './Logo';
import { Mark } from './Mark';

export function Footer() {
  return (
    <footer className="border-t border-white/[0.05] bg-[#06070A]/70">
      <div className="container-tight py-14">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center gap-3">
            <Mark size={28} />
            <Logo size="md" withTagline />
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-ink-200 sm:text-[11px]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 [box-shadow:0_0_6px_2px_rgba(0,184,230,0.45)]" />
              Built in Manila · Two Filipino founders
            </div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-ink-300">
              © {new Date().getFullYear()} BOSSLABS AI. All rights reserved.
            </div>
          </div>
        </div>
        <div className="mt-10 max-w-4xl text-[11px] leading-relaxed text-ink-300">
          <p className="uppercase tracking-[0.22em] text-ink-200">
            Earnings & Results Disclaimer
          </p>
          <p className="mt-2">
            The results, case studies, and testimonials featured on this page are not typical and do not
            guarantee that you will achieve the same. Income examples are shared voluntarily by clients and
            represent their individual experience. Your results will vary based on your business,
            implementation, work ethic, and market conditions. Nothing on this page is a promise or
            guarantee of earnings. This site is not affiliated with, endorsed by, or sponsored by Meta,
            Google, Zoom, or any third-party platform mentioned.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[11px] uppercase tracking-[0.22em] text-ink-300">
          <a href="/privacy" className="hover:text-cyan-400">Privacy</a>
          <a href="/terms" className="hover:text-cyan-400">Terms</a>
          <a href="/contact" className="hover:text-cyan-400">Contact</a>
        </div>
      </div>
    </footer>
  );
}

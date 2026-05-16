import { Nav } from './Nav';
import { Footer } from './Footer';

type Props = {
  eyebrow: string;
  title: string;
  updated?: string;
  children: React.ReactNode;
};

export function LegalLayout({ eyebrow, title, updated, children }: Props) {
  return (
    <>
      <Nav />
      <main className="container-narrow py-20 sm:py-28">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/[0.05] px-3 py-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400" />
          <span className="text-[10px] uppercase tracking-[0.22em] text-cyan-300 sm:text-[11px]">
            {eyebrow}
          </span>
        </div>
        <h1 className="h-display mt-5">{title}</h1>
        {updated && (
          <p className="mt-4 font-sans text-[11px] uppercase tracking-[0.22em] text-ink-300">
            Last updated · {updated}
          </p>
        )}
        <div className="prose-legal mt-14 space-y-10">{children}</div>
      </main>
      <Footer />
    </>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-serif text-2xl text-white sm:text-3xl">{title}</h2>
      <div className="mt-5 space-y-4 font-sans text-[15px] leading-relaxed text-ink-100">
        {children}
      </div>
    </section>
  );
}

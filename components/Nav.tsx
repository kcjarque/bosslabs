import Link from 'next/link';
import { Logo } from './Logo';
import { Mark } from './Mark';

type Props = { ctaLabel?: string; ctaHref?: string };

export function Nav({ ctaLabel = 'Reserve a Seat', ctaHref = '/checkout' }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.05] bg-[#06070A]/80 backdrop-blur-md">
      <div className="container-tight flex h-16 items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-3 transition hover:opacity-80">
          <Mark size={26} />
          <Logo size="md" />
        </Link>
        <Link href={ctaHref} className="btn-primary !px-5 !py-2 !text-[12px]">
          {ctaLabel}
        </Link>
      </div>
    </header>
  );
}

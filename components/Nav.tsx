import Link from 'next/link';
import { Logo } from './Logo';
import { Mark } from './Mark';

type Props = { ctaLabel?: string; ctaHref?: string };

export function Nav({ ctaLabel = 'Reserve a Seat', ctaHref = '/checkout' }: Props) {
  const ctaClass = 'btn-primary !px-5 !py-2 !text-[12px]';
  const isInternal = ctaHref.startsWith('/');
  const isHttp = /^https?:\/\//.test(ctaHref);
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.05] bg-[#06070A]/80 backdrop-blur-md">
      <div className="container-tight flex h-16 items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-3 transition hover:opacity-80">
          <Mark size={26} />
          <Logo size="md" />
        </Link>
        {isInternal ? (
          <Link href={ctaHref} className={ctaClass}>
            {ctaLabel}
          </Link>
        ) : (
          <a
            href={ctaHref}
            {...(isHttp ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className={ctaClass}
          >
            {ctaLabel}
          </a>
        )}
      </div>
    </header>
  );
}

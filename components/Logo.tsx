type Props = {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  withTagline?: boolean;
  className?: string;
};

const SIZE = {
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-3xl sm:text-4xl',
  xl: 'text-5xl sm:text-6xl md:text-7xl',
};

export function Logo({ size = 'md', withTagline = false, className = '' }: Props) {
  return (
    <div className={`inline-flex flex-col items-start ${className}`}>
      <div className={`brand-wordmark leading-none ${SIZE[size]}`}>
        <span>BOSS</span>
        <span className="accent">LABS</span>
        <span> AI</span>
      </div>
      {withTagline && (
        <div className="brand-tagline mt-2">Command Centers for Businesses</div>
      )}
    </div>
  );
}

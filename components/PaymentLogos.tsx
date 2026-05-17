/**
 * PaymentLogos — small brand chips for Credit Card (Visa + Mastercard),
 * GCash, and Maya, rendered as inline SVG so we don't ship asset files.
 *
 * White chip backgrounds give high contrast on the dark theme and read as
 * "real payment badges" the way they appear on every legit checkout page.
 * The grid wraps cleanly on narrow screens.
 */

export function PaymentLogos({
  className = '',
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md';
}) {
  const h = size === 'sm' ? 22 : 26;
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-2 ${className}`}
    >
      <VisaBadge height={h} />
      <MastercardBadge height={h} />
      <GCashBadge height={h} />
      <MayaBadge height={h} />
    </div>
  );
}

function Chip({
  children,
  bg = '#FFFFFF',
  height,
  width,
  ariaLabel,
}: {
  children: React.ReactNode;
  bg?: string;
  height: number;
  width: number;
  ariaLabel: string;
}) {
  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className="inline-flex flex-none items-center justify-center rounded-[5px] shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
      style={{ height, width, backgroundColor: bg }}
    >
      {children}
    </span>
  );
}

function VisaBadge({ height }: { height: number }) {
  const w = Math.round(height * 1.85);
  return (
    <Chip ariaLabel="Visa" height={height} width={w}>
      <svg viewBox="0 0 48 16" width="80%" height="62%" aria-hidden="true">
        <text
          x="24"
          y="13"
          textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif"
          fontWeight="900"
          fontSize="14"
          fontStyle="italic"
          letterSpacing="0.5"
          fill="#1A1F71"
        >
          VISA
        </text>
      </svg>
    </Chip>
  );
}

function MastercardBadge({ height }: { height: number }) {
  const w = Math.round(height * 1.6);
  return (
    <Chip ariaLabel="Mastercard" height={height} width={w}>
      <svg viewBox="0 0 32 20" width="78%" height="78%" aria-hidden="true">
        <circle cx="13" cy="10" r="7" fill="#EB001B" />
        <circle cx="20" cy="10" r="7" fill="#F79E1B" fillOpacity="0.95" />
        {/* Overlap blend */}
        <path
          d="M16.5 4.6a7 7 0 0 1 0 10.8 7 7 0 0 1 0-10.8Z"
          fill="#FF5F00"
        />
      </svg>
    </Chip>
  );
}

function GCashBadge({ height }: { height: number }) {
  const w = Math.round(height * 2);
  return (
    <Chip ariaLabel="GCash" bg="#007DFF" height={height} width={w}>
      <svg viewBox="0 0 64 20" width="86%" height="68%" aria-hidden="true">
        <text
          x="32"
          y="15"
          textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif"
          fontWeight="800"
          fontSize="15"
          letterSpacing="-0.2"
          fill="#FFFFFF"
        >
          GCash
        </text>
      </svg>
    </Chip>
  );
}

function MayaBadge({ height }: { height: number }) {
  const w = Math.round(height * 1.95);
  return (
    <Chip ariaLabel="Maya" bg="#0E1A2B" height={height} width={w}>
      <svg viewBox="0 0 64 20" width="80%" height="70%" aria-hidden="true">
        <text
          x="32"
          y="15"
          textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif"
          fontWeight="800"
          fontSize="15"
          letterSpacing="-0.1"
          fill="#16C04A"
        >
          maya
        </text>
      </svg>
    </Chip>
  );
}

type Props = { size?: number; className?: string };

/**
 * BOSSLABS AI logomark — two intersecting bezier arcs over 6 nodes.
 * Companion to the wordmark; works in nav, footer, favicon contexts.
 */
export function Mark({ size = 32, className = '' }: Props) {
  const STROKE = 5.5;
  const RADIUS = 9;
  const NODE_FILL = '#06070A';
  const BLACK = '#E8EAEE'; // light "black" so it reads on dark bg; swap to #0B0D12 for light bg
  const CYAN = '#00B8E6';

  return (
    <svg
      width={size}
      height={size * 0.78}
      viewBox="0 0 100 78"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="BOSSLABS AI"
    >
      {/* Arc 1 — white/ink curve, top-left → bottom-mid → bottom-right */}
      <path
        d="M14 14 Q 30 60, 50 64 T 86 64"
        stroke={BLACK}
        strokeWidth={STROKE}
        strokeLinecap="round"
        fill="none"
      />
      {/* Arc 2 — cyan curve, top-right → bottom-mid → bottom-left */}
      <path
        d="M86 14 Q 70 60, 50 64 T 14 64"
        stroke={CYAN}
        strokeWidth={STROKE}
        strokeLinecap="round"
        fill="none"
      />

      {/* Nodes */}
      <Node cx={14} cy={14} stroke={BLACK} fill={NODE_FILL} r={RADIUS} />
      <Node cx={86} cy={14} stroke={CYAN} fill={NODE_FILL} r={RADIUS} />
      <Node cx={14} cy={64} stroke={CYAN} fill={NODE_FILL} r={RADIUS} />
      <Node cx={50} cy={64} stroke={BLACK} fill={NODE_FILL} r={RADIUS} />
      <Node cx={86} cy={64} stroke={BLACK} fill={NODE_FILL} r={RADIUS} />
    </svg>
  );
}

function Node({
  cx,
  cy,
  stroke,
  fill,
  r,
}: {
  cx: number;
  cy: number;
  stroke: string;
  fill: string;
  r: number;
}) {
  return <circle cx={cx} cy={cy} r={r} stroke={stroke} strokeWidth={5.5} fill={fill} />;
}

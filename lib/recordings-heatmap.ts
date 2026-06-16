import { getChunksForPage } from '@/lib/db';

/**
 * Consolidated heatmap aggregation (server-side, admin-only).
 *
 * Walks the stored rrweb event stream for one recorded page across ALL
 * sessions and extracts where people clicked / moved. The backdrop is rendered
 * client-side by loading the live page in a sandboxed iframe, so this only
 * returns the points + page dimensions. Pure data work: nothing ships to the
 * funnel.
 *
 * DEVICE SPLIT — why two buckets:
 * A recorded x-coordinate only means something relative to the screen width it
 * was captured on. Mobile traffic (~320–440px) and desktop traffic (~1500px+)
 * cannot share one canvas: drawn on a desktop-width backdrop, every mobile tap
 * collapses into the left strip. So we bucket points by the viewport width
 * active when they were captured (mobile < 768px, desktop ≥ 768px) and render a
 * separate heatmap per device, each over a representative backdrop width.
 *
 * To also handle width spread *within* a bucket (a 320px phone vs a 430px
 * phone), x is stored as a FRACTION of its own viewport width (0..1). The
 * client multiplies by the backdrop width, so the same button lines up across
 * every device in the bucket. y stays absolute (scroll folded in) — page height
 * is consistent enough within a device class.
 *
 * rrweb wire format (v2):
 *   Meta(4)          → { data: { width, height } }
 *   FullSnapshot(2)  → { data: { initialOffset: { top, left } } }
 *   Incremental(3)   → { data: { source, ... } }
 *       source 1 MouseMove        → { positions: [{ x, y, timeOffset }] }
 *       source 2 MouseInteraction → { type, x, y }   (type 2 = Click, 4 = DblClick, 9 = TouchEnd)
 *       source 3 Scroll           → { x, y }         (scroll offset of the scroller)
 */

export type HeatPoint = { xFrac: number; y: number };

export type DeviceHeatmap = {
  device: 'desktop' | 'mobile';
  backdropWidth: number; // width the iframe backdrop renders at
  clicks: HeatPoint[];
  moves: HeatPoint[];
  sessionCount: number;
  clickCount: number;
};

export type SurfaceHeatmap = {
  page: string;
  chunkCount: number;
  desktop: DeviceHeatmap;
  mobile: DeviceHeatmap;
};

type RrEvent = {
  type?: number;
  data?: {
    source?: number;
    type?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    positions?: { x?: number; y?: number }[];
    initialOffset?: { top?: number; left?: number };
  };
};

const FULL_SNAPSHOT = 2;
const META = 4;
const INCREMENTAL = 3;
const SRC_MOUSEMOVE = 1;
const SRC_MOUSE_INTERACTION = 2;
const SRC_SCROLL = 3;
const CLICK_TYPES = new Set([2, 4, 9]); // Click, DblClick, TouchEnd

const MOBILE_MAX_WIDTH = 768; // < this = mobile bucket
// Representative widths the backdrop iframe renders the responsive page at.
const DESKTOP_BACKDROP_WIDTH = 1280;
const MOBILE_BACKDROP_WIDTH = 390;

const MAX_CLICKS = 5000; // per device bucket
const MAX_MOVES = 9000; // per device bucket
const MOVE_SAMPLE = 4; // keep 1 in N move samples — moves are dense

type Bucket = {
  clicks: HeatPoint[];
  moves: HeatPoint[];
  sessions: Set<string>;
  moveCounter: number;
};

function newBucket(): Bucket {
  return { clicks: [], moves: [], sessions: new Set(), moveCounter: 0 };
}

/** Build the consolidated heatmap for a single recorded page, split by device. */
export async function aggregateSurfaceHeatmap(page: string): Promise<SurfaceHeatmap> {
  const chunks = await getChunksForPage(page, 150);

  const desktop = newBucket();
  const mobile = newBucket();

  for (const chunk of chunks) {
    const events = Array.isArray(chunk.events) ? (chunk.events as RrEvent[]) : [];

    // Track scroll + viewport width within this chunk. A point's bucket and its
    // x-fraction both depend on the width active when it was captured.
    let scrollY = 0;
    let scrollX = 0;
    let width = 0;

    for (const ev of events) {
      if (ev.type === META && ev.data) {
        if (ev.data.width) width = ev.data.width;
      } else if (ev.type === FULL_SNAPSHOT) {
        scrollY = ev.data?.initialOffset?.top ?? 0;
        scrollX = ev.data?.initialOffset?.left ?? 0;
      } else if (ev.type === INCREMENTAL && ev.data) {
        const { source } = ev.data;
        if (source === SRC_SCROLL) {
          scrollY = ev.data.y ?? scrollY;
          scrollX = ev.data.x ?? scrollX;
        } else if (source === SRC_MOUSE_INTERACTION && CLICK_TYPES.has(ev.data.type ?? -1)) {
          if (width > 0 && typeof ev.data.x === 'number' && typeof ev.data.y === 'number') {
            const b = width < MOBILE_MAX_WIDTH ? mobile : desktop;
            b.sessions.add(chunk.sessionId);
            if (b.clicks.length < MAX_CLICKS) {
              const xFrac = clamp01((ev.data.x + scrollX) / width);
              b.clicks.push({ xFrac, y: ev.data.y + scrollY });
            }
          }
        } else if (source === SRC_MOUSEMOVE && Array.isArray(ev.data.positions)) {
          if (width <= 0) continue;
          const b = width < MOBILE_MAX_WIDTH ? mobile : desktop;
          for (const p of ev.data.positions) {
            if (typeof p.x !== 'number' || typeof p.y !== 'number') continue;
            if (b.moveCounter++ % MOVE_SAMPLE !== 0) continue;
            if (b.moves.length < MAX_MOVES) {
              b.moves.push({ xFrac: clamp01((p.x + scrollX) / width), y: p.y + scrollY });
            }
          }
        }
      }
    }
  }

  return {
    page,
    chunkCount: chunks.length,
    desktop: toDeviceHeatmap('desktop', DESKTOP_BACKDROP_WIDTH, desktop),
    mobile: toDeviceHeatmap('mobile', MOBILE_BACKDROP_WIDTH, mobile),
  };
}

function toDeviceHeatmap(
  device: 'desktop' | 'mobile',
  backdropWidth: number,
  b: Bucket,
): DeviceHeatmap {
  return {
    device,
    backdropWidth,
    clicks: b.clicks,
    moves: b.moves,
    sessionCount: b.sessions.size,
    clickCount: b.clicks.length,
  };
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

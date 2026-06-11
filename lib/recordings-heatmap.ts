import { getChunksForPage } from '@/lib/db';

/**
 * Consolidated heatmap aggregation (server-side, admin-only).
 *
 * Walks the stored rrweb event stream for one recorded page across ALL
 * sessions and extracts where people clicked / moved — turned into page-
 * absolute coordinates by tracking scroll as we go. Returns the points plus a
 * representative snapshot to render as the backdrop. Pure data work: nothing
 * here ships to the funnel.
 *
 * rrweb wire format (v2):
 *   Meta(4)          → { data: { width, height } }
 *   FullSnapshot(2)  → { data: { initialOffset: { top, left } } }
 *   Incremental(3)   → { data: { source, ... } }
 *       source 1 MouseMove        → { positions: [{ x, y, timeOffset }] }
 *       source 2 MouseInteraction → { type, x, y }   (type 2 = Click, 4 = DblClick, 9 = TouchEnd)
 *       source 3 Scroll           → { x, y }         (scroll offset of the scroller)
 */

export type HeatPoint = { x: number; y: number };

export type SurfaceHeatmap = {
  page: string;
  recordedWidth: number;
  recordedHeight: number;
  backdrop: unknown[] | null;
  clicks: HeatPoint[];
  moves: HeatPoint[];
  sessionCount: number;
  clickCount: number;
  chunkCount: number;
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

const MAX_CLICKS = 5000;
const MAX_MOVES = 9000;
const MOVE_SAMPLE = 4; // keep 1 in N move samples — moves are dense

/** Build the consolidated heatmap for a single recorded page. */
export async function aggregateSurfaceHeatmap(page: string): Promise<SurfaceHeatmap> {
  const chunks = await getChunksForPage(page, 150);

  const clicks: HeatPoint[] = [];
  const moves: HeatPoint[] = [];
  const sessions = new Set<string>();
  let recordedWidth = 0;
  let recordedHeight = 0;
  let backdrop: unknown[] | null = null;
  let backdropLen = 0;
  let moveCounter = 0;

  for (const chunk of chunks) {
    sessions.add(chunk.sessionId);
    const events = Array.isArray(chunk.events) ? (chunk.events as RrEvent[]) : [];

    // Track scroll within this chunk so clicks become page-absolute. Reset per
    // chunk; seed from the FullSnapshot's initialOffset if present.
    let scrollY = 0;
    let scrollX = 0;
    let hasFullSnapshot = false;

    for (const ev of events) {
      if (ev.type === META && ev.data) {
        if (ev.data.width && ev.data.width > recordedWidth) recordedWidth = ev.data.width;
        if (ev.data.height && ev.data.height > recordedHeight) recordedHeight = ev.data.height;
      } else if (ev.type === FULL_SNAPSHOT) {
        hasFullSnapshot = true;
        scrollY = ev.data?.initialOffset?.top ?? 0;
        scrollX = ev.data?.initialOffset?.left ?? 0;
      } else if (ev.type === INCREMENTAL && ev.data) {
        const { source } = ev.data;
        if (source === SRC_SCROLL) {
          scrollY = ev.data.y ?? scrollY;
          scrollX = ev.data.x ?? scrollX;
        } else if (source === SRC_MOUSE_INTERACTION && CLICK_TYPES.has(ev.data.type ?? -1)) {
          if (typeof ev.data.x === 'number' && typeof ev.data.y === 'number' && clicks.length < MAX_CLICKS) {
            clicks.push({ x: ev.data.x + scrollX, y: ev.data.y + scrollY });
          }
        } else if (source === SRC_MOUSEMOVE && Array.isArray(ev.data.positions)) {
          for (const p of ev.data.positions) {
            if (typeof p.x !== 'number' || typeof p.y !== 'number') continue;
            if (moveCounter++ % MOVE_SAMPLE !== 0) continue;
            if (moves.length < MAX_MOVES) moves.push({ x: p.x + scrollX, y: p.y + scrollY });
          }
        }
      }
    }

    // Keep the richest chunk that has a full snapshot as the backdrop.
    if (hasFullSnapshot && events.length > backdropLen) {
      backdrop = chunk.events;
      backdropLen = events.length;
    }
  }

  return {
    page,
    recordedWidth: recordedWidth || 1280,
    recordedHeight: recordedHeight || 800,
    backdrop,
    clicks,
    moves,
    sessionCount: sessions.size,
    clickCount: clicks.length,
    chunkCount: chunks.length,
  };
}

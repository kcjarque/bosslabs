/**
 * Funnel classification for session recordings — the single source of truth
 * shared by the recordings tabs and the consolidated heatmap so they never
 * drift. A "session" is a visitor's whole visit; we classify it purely from
 * the set of pages it touched (no cross-table joins needed).
 *
 *   - main (₱999):   touched the homepage funnel or checkout
 *   - orderbump:     reached the post-checkout one-time offer (/oto)
 *   - abandoned:     reached /checkout but never got to /oto (dropped off
 *                    before completing — the sessions worth studying)
 */

export type FunnelTab = 'all' | 'main' | 'abandoned' | 'orderbump';

export const FUNNEL_TABS: { key: FunnelTab; label: string; hint: string }[] = [
  { key: 'all', label: 'All sessions', hint: 'Every recorded visit' },
  { key: 'main', label: '₱999 funnel', hint: 'Homepage + checkout' },
  { key: 'abandoned', label: 'Abandoned', hint: 'Reached checkout, never finished' },
  { key: 'orderbump', label: 'Order bump', hint: 'Reached the /oto offer' },
];

export function isFunnelTab(v: string | undefined): v is FunnelTab {
  return v === 'all' || v === 'main' || v === 'abandoned' || v === 'orderbump';
}

export function classifySession(pages: Iterable<string>): {
  main: boolean;
  abandoned: boolean;
  orderbump: boolean;
} {
  const set = pages instanceof Set ? pages : new Set(pages);
  const main = set.has('/') || set.has('/checkout');
  const orderbump = set.has('/oto');
  const abandoned = set.has('/checkout') && !set.has('/oto');
  return { main, abandoned, orderbump };
}

export function sessionMatchesTab(pages: Iterable<string>, tab: FunnelTab): boolean {
  if (tab === 'all') return true;
  const c = classifySession(pages);
  return tab === 'main' ? c.main : tab === 'abandoned' ? c.abandoned : c.orderbump;
}

/** Which recorded pages feed a tab's heatmap (the surface[s] to aggregate). */
export function tabPages(tab: FunnelTab): string[] {
  switch (tab) {
    case 'main':
      return ['/', '/checkout'];
    case 'abandoned':
      return ['/checkout'];
    case 'orderbump':
      return ['/oto'];
    default:
      return ['/', '/checkout', '/oto'];
  }
}

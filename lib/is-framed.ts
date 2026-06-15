/**
 * True when the page is running inside an iframe — e.g. the admin heatmap loads
 * the live funnel page as a backdrop. All client trackers bail when framed so a
 * heatmap render never creates a phantom recording / pageview / Pixel hit.
 *
 * In production the funnel is never legitimately framed, so this is always false
 * there → zero behavior change on real visits. Cross-origin access to
 * window.top throws, which also means "framed", so we treat that as framed too.
 */
export function isFramedView(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

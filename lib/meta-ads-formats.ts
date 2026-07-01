/**
 * Client-safe constants/types for Meta ad preview formats.
 *
 * Split out from lib/meta-ads.ts because that file imports lib/db.ts (which
 * uses `fs`), which webpack refuses to bundle into a client component. Any
 * client component that needs the format list should import from HERE.
 */

export const AD_PREVIEW_FORMATS = [
  { key: 'DESKTOP_FEED_STANDARD', label: 'Desktop Feed' },
  { key: 'MOBILE_FEED_STANDARD', label: 'Mobile Feed' },
  { key: 'INSTAGRAM_STANDARD', label: 'Instagram' },
  { key: 'INSTAGRAM_STORY', label: 'IG Story' },
  { key: 'FACEBOOK_STORY_MOBILE', label: 'FB Story' },
  { key: 'INSTAGRAM_REELS', label: 'IG Reels' },
] as const;

export type AdPreviewFormat = (typeof AD_PREVIEW_FORMATS)[number]['key'];

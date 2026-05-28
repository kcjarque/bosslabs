import type { Metadata } from 'next';
import { OptInPage } from '@/components/OptInPage';
import { getWebinarInfo } from '@/lib/webinar';

// Render per-request so the live webinar date/time/countdown always reflect
// the current Settings. Without this the homepage is statically cached at
// build time and keeps showing whichever event was active at deploy.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reserve a Seat — BOSSLABS AI · For Filipino Business Owners',
  description:
    'How to build an automated business and save at least ₱100K/month using Claude Code — without hiring a single developer. Live webinar.',
  openGraph: {
    title: 'BOSSLABS AI — The Webinar',
    description:
      'Build an automated business and save at least ₱100K/month using Claude Code, without a single developer.',
    type: 'website',
  },
};

export default async function Page() {
  const webinar = await getWebinarInfo();
  return <OptInPage webinar={webinar} />;
}

import type { Metadata } from 'next';
import { OptInPage } from '@/components/OptInPage';
import { getWebinarInfo } from '@/lib/webinar';

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

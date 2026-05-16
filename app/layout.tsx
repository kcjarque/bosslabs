import type { Metadata } from 'next';
import { Inter, Orbitron, Instrument_Serif } from 'next/font/google';
import './globals.css';
import { CountdownBar } from '@/components/CountdownBar';
import { PageGlow } from '@/components/PageGlow';
import { WEBINAR } from '@/lib/config';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
  display: 'swap',
  weight: ['500', '600', '700', '800'],
});

const instrument = Instrument_Serif({
  subsets: ['latin'],
  variable: '--font-instrument',
  display: 'swap',
  weight: ['400'],
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'BOSSLABS AI — Install an AI Command Center in Your Business',
  description:
    'A live webinar by Michael Manago & Kyle Jarque. We help operators install AI Command Centers that compound — without hiring an army.',
  openGraph: {
    title: 'BOSSLABS AI — The Webinar',
    description:
      'Install an AI Command Center that runs your business while you sleep.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${orbitron.variable} ${instrument.variable}`}
    >
      <body className="relative font-sans antialiased">
        <PageGlow />
        <div className="relative z-10">
          <CountdownBar startsAtIso={WEBINAR.startsAtIso} />
          {children}
        </div>
      </body>
    </html>
  );
}

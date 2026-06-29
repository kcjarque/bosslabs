/**
 * Seed the funnels table with the webinar funnel + the VibeCode Retreat
 * upsell funnel. Idempotent via on-conflict(slug) — re-running refreshes
 * the config payload to match this file (source of truth).
 *
 * Usage: npx tsx scripts/seed-funnels.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
try {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
} catch {}

import { createClient } from '@supabase/supabase-js';

const FUNNELS = [
  {
    slug: 'webinar',
    name: 'AI Coding 101 — Webinar Funnel',
    kind: 'webinar',
    active: true,
    config: {
      // The live webinar config (dates, Zoom, deliverables) lives in
      // Settings and is wired into the public site + emails. This funnel
      // entry is a pointer/summary; edit the live values in Settings.
      managedIn: 'settings',
      note: 'Webinar dates, Zoom links, and deliverables are configured in Settings → Webinar.',
    },
  },
  {
    slug: 'vibecode-retreat',
    name: 'VibeCode Retreat',
    kind: 'event',
    active: true,
    config: {
      tagline: 'One Weekend. One Build. 10 Founders.',
      subtitle: '2-Day In-Person Exclusive Event',
      location: 'Antipolo',
      capacity: 10,
      standardPriceCentavos: 6_000_000, // ₱60,000
      payInFullPriceCentavos: 5_000_000, // ₱50,000 if paid in full today
      depositCentavos: 1_000_000, // ₱10,000 to secure the slot
      balanceDueDate: 'July 24',
      eventDate: 'July 31 – August 1, 2026',
      extraPersonCentavos: 1_500_000, // +₱15,000 extra person
      totalValueCentavos: 55_500_000, // ₱555,000 stack value
      paymentMethods: ['Bank transfer', 'Maya'],
      guarantee:
        'What you pay here is the GUARANTEE to build the app you want. Not a training course. Not a tutorial. Not another guru BS that makes you feel good. Here, we get in the trenches and work to build your vision. We will prove anyone can do this — even if you are 100% not a techy person.',
      valueStack: [
        {
          label: 'Complete, hyper-customized app for your business',
          description: 'Architected, built, shipped before checkout. A real asset.',
          valueCentavos: 30_000_000,
        },
        {
          label: 'Over-the-shoulder guidance from the founders',
          description: 'The people who built this, sitting beside you — building with you.',
          valueCentavos: 10_000_000,
        },
        {
          label: 'Hands-on dev team — architecture pressure-tested live',
          description: "Your blueprint stress-tested so it's rock solid, not fragile.",
          valueCentavos: 7_500_000,
        },
        {
          label: 'Premium villa accommodation',
          description: 'Full immersion. Wake up, walk ten steps, build. Engineered for flow.',
          valueCentavos: 4_000_000,
        },
        {
          label: 'Private chef, all weekend',
          description: 'Every meal handled, built around energy and focus. Never break flow for food.',
          valueCentavos: 2_500_000,
        },
        {
          label: 'Premium alcohol on site',
          description: 'Celebrate milestones. Build like adults. Not a zero-alcohol bootcamp.',
          valueCentavos: 1_500_000,
        },
        {
          label: 'Near 1:1 attention — capped at 15 seats',
          description: "The room is small on purpose. Doesn't scale and we don't want it to.",
          valueCentavos: null, // Priceless
        },
      ],
      byTheNumbers: [
        { stat: '10', label: 'Builders only' },
        { stat: '48h', label: 'To ship your app' },
        { stat: '1:1', label: 'Founder access' },
        { stat: '100%', label: 'Refund if unfinished' },
      ],
      alternatives: [
        {
          label: 'Dev Agency',
          headline: '₱250k–₱500k+',
          timeframe: '2–4 months',
          detail: "Waiting. Revisions. Chasing. You're not in the room. You learn nothing.",
        },
        {
          label: 'Freelancer',
          headline: 'Cheap upfront',
          timeframe: 'Until they ghost',
          detail: "They disappear at 60% done. You've lost the money AND the time.",
        },
        {
          label: '"Someday"',
          headline: 'The most expensive option in existence',
          timeframe: 'Never ships',
          detail: "Every month it doesn't exist is a month your business runs without it.",
        },
      ],
    },
  },
  {
    slug: 'founders-bootcamp',
    name: "AI Founder's Bootcamp",
    kind: 'event',
    active: true,
    config: {
      tagline: 'Walk in with an idea. Walk out with a launched app.',
      subtitle: '24-Hour Build-or-Refund Bootcamp',
      capacity: 80,
      standardPriceCentavos: 25_000_00, // ₱25,000 (single seat default)
      depositCentavos: 10_000_00, // ₱10,000 per-seat downpayment
      paymentMethods: ['Bank transfer', 'Maya'],
      publicUrl: 'https://www.bosslabs.live/founders-bootcamp',
      // Tier breakdown for the funnel detail page. Source of truth for
      // checkout pricing lives in lib/bootcamp.ts (BOOTCAMP_TIERS) — keep
      // these two in sync when you change prices.
      tiers: [
        { id: 'single', label: '1 seat', perSeatCentavos: 25_000_00, seats: 1, totalCentavos: 25_000_00 },
        { id: 'group3', label: '3 seats — Corporate trio', perSeatCentavos: 22_000_00, seats: 3, totalCentavos: 66_000_00, badge: 'Save ₱9,000' },
        { id: 'group5', label: '5 seats — Corporate squad', perSeatCentavos: 20_000_00, seats: 5, totalCentavos: 100_000_00, badge: 'Save ₱25,000' },
      ],
    },
  },
];

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  for (const f of FUNNELS) {
    const { error } = await sb
      .from('funnels')
      .upsert(
        { slug: f.slug, name: f.name, kind: f.kind, active: f.active, config: f.config },
        { onConflict: 'slug' },
      );
    if (error) console.log(`  ✗ ${f.slug}: ${error.message}`);
    else console.log(`  ✓ ${f.slug}`);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

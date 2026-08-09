import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateBreakdown } from './breakdowns';

const rows = [
  { publisher_platform: 'facebook', platform_position: 'feed', spend: '1000', action_values: [{ action_type: 'omni_purchase', value: '2280' }] },
  { publisher_platform: 'facebook', platform_position: 'facebook_reels', spend: '1000', action_values: [{ action_type: 'omni_purchase', value: '1290' }] },
];

test('aggregates by placement + computes ROAS', () => {
  const out = aggregateBreakdown(rows as any, ['publisher_platform', 'platform_position']);
  const reels = out.find((r) => r.key === 'facebook/facebook_reels')!;
  assert.ok(Math.abs(reels.roas! - 1.29) < 0.01);
});

test('feed placement in the same set computes its own ROAS (2.28x)', () => {
  const out = aggregateBreakdown(rows as any, ['publisher_platform', 'platform_position']);
  const feed = out.find((r) => r.key === 'facebook/feed')!;
  assert.ok(Math.abs(feed.roas! - 2.28) < 0.01);
});

test('empty rows → empty array', () => {
  const out = aggregateBreakdown([], ['publisher_platform']);
  assert.deepEqual(out, []);
});

test('zero-spend group → roas null (no divide-by-zero)', () => {
  const zeroSpend = [{ publisher_platform: 'instagram', spend: '0', action_values: [] }];
  const out = aggregateBreakdown(zeroSpend as any, ['publisher_platform']);
  const ig = out.find((r) => r.key === 'instagram')!;
  assert.equal(ig.roas, null);
  assert.equal(ig.spendCentavos, 0);
  assert.equal(ig.cpp, null); // also zero purchases
});

test('omni_purchase + purchase co-occurring on one row is picked, not summed (Meta reports omni_purchase as an inclusive dedupe of purchase, not an additional conversion)', () => {
  const overlap = [
    {
      publisher_platform: 'facebook',
      spend: '1000',
      actions: [{ action_type: 'purchase', value: '254' }, { action_type: 'omni_purchase', value: '260' }],
      action_values: [{ action_type: 'purchase', value: '407650' }, { action_type: 'omni_purchase', value: '408649' }],
    },
  ];
  const out = aggregateBreakdown(overlap as any, ['publisher_platform']);
  const fb = out.find((r) => r.key === 'facebook')!;
  assert.equal(fb.purchases, 260); // omni_purchase (priority), not 254+260
  assert.equal(fb.revenueCentavos, 40_864_900); // omni_purchase value * 100, not the sum
});

test('offsite_conversion.fb_pixel_purchase is used as a 3rd-priority fallback when omni_purchase/purchase are both absent (matches meta-sync.ts\'s purchasesOf/revenueOf)', () => {
  const pixelOnly = [
    {
      publisher_platform: 'facebook',
      spend: '1000',
      actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '4' }],
      action_values: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '3996' }],
    },
  ];
  const out = aggregateBreakdown(pixelOnly as any, ['publisher_platform']);
  const fb = out.find((r) => r.key === 'facebook')!;
  assert.equal(fb.purchases, 4);
  assert.equal(fb.revenueCentavos, 399_600); // 3996 * 100
});

test('purchase still outranks offsite_conversion.fb_pixel_purchase when both are present (priority order, not additive)', () => {
  const both = [
    {
      publisher_platform: 'facebook',
      spend: '1000',
      actions: [{ action_type: 'purchase', value: '2' }, { action_type: 'offsite_conversion.fb_pixel_purchase', value: '2' }],
      action_values: [{ action_type: 'purchase', value: '1998' }, { action_type: 'offsite_conversion.fb_pixel_purchase', value: '1998' }],
    },
  ];
  const out = aggregateBreakdown(both as any, ['publisher_platform']);
  const fb = out.find((r) => r.key === 'facebook')!;
  assert.equal(fb.purchases, 2); // purchase (priority), not 2+2
  assert.equal(fb.revenueCentavos, 199_800); // purchase value * 100, not the sum
});

test('rows sharing a key get summed, not overwritten', () => {
  const dup = [
    { publisher_platform: 'facebook', spend: '500', actions: [{ action_type: 'purchase', value: '2' }], action_values: [{ action_type: 'purchase', value: '1000' }] },
    { publisher_platform: 'facebook', spend: '500', actions: [{ action_type: 'purchase', value: '3' }], action_values: [{ action_type: 'purchase', value: '1500' }] },
  ];
  const out = aggregateBreakdown(dup as any, ['publisher_platform']);
  assert.equal(out.length, 1);
  const fb = out[0];
  assert.equal(fb.spendCentavos, 100_000); // (500+500) * 100
  assert.equal(fb.revenueCentavos, 250_000); // (1000+1500) * 100
  assert.equal(fb.purchases, 5); // 2 + 3
  assert.ok(Math.abs(fb.cpp! - 20_000) < 1); // 100000 / 5
});

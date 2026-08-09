import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyNetCentavos, targetNetSpendCentavos, netGapCentavos } from './economics';

test('dailyNet: 2.49x on ₱17,700/day nets ~₱24.8k (fee 3.5%)', () => {
  const net = dailyNetCentavos(1_770_000, 2.49, 0.035);
  assert.ok(Math.abs(net - 2_484_255) < 5_000, `got ${net}`); // 1.77M × (2.49×0.965 − 1)
});
test('dailyNet: at breakeven 1.04x net ≈ 0', () => {
  assert.ok(Math.abs(dailyNetCentavos(1_000_000, 1.04, 0.035)) < 4_000);
});
test('targetNetSpend: ₱50k/day net at 2.0x needs ~₱53.8k/day spend', () => {
  const spend = targetNetSpendCentavos(5_000_000, 2.0, 0.035);
  assert.ok(Math.abs(spend - 5_376_344) < 20_000, `got ${spend}`); // 5M / (2×0.965 − 1)=5M/0.93
});
test('targetNetSpend: 0 when ROAS cannot clear breakeven', () => {
  assert.equal(targetNetSpendCentavos(5_000_000, 1.0, 0.035), 0);
});
test('netGap is target minus current', () => {
  assert.equal(netGapCentavos(2_480_000, 5_000_000), 2_520_000);
});

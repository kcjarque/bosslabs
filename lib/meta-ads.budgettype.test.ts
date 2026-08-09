import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveBudgetType } from './meta-ads';
test('GUIDED_CREATION is NOT ADVANTAGE+ (BUG-3)', () => {
  assert.equal(deriveBudgetType({ smartPromotionType: 'GUIDED_CREATION', campDaily: 500000, campLifetime: 0, anyAdsetBudget: false }), 'CBO');
});
test('SMART_PROMOTION → ADVANTAGE+', () => {
  assert.equal(deriveBudgetType({ smartPromotionType: 'SMART_PROMOTION', campDaily: 0, campLifetime: 0, anyAdsetBudget: false }), 'ADVANTAGE+');
});
test('adset budget only → ABO', () => {
  assert.equal(deriveBudgetType({ smartPromotionType: '', campDaily: 0, campLifetime: 0, anyAdsetBudget: true }), 'ABO');
});

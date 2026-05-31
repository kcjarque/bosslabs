/**
 * End-to-end test of the order-bump CRM data layer against the live DB.
 * Usage: npx tsx scripts/test-crm.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
try {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch {}

async function main() {
  const crm = await import('../lib/crm');

  console.log('1) getCrmTemplate (default seed):');
  const tpl = await crm.getCrmTemplate();
  console.log('   →', JSON.stringify(tpl));

  console.log('2) addCrmCard:');
  const card = await crm.addCrmCard({ name: 'Test Person QA', phone: '09171234567' });
  console.log('   → id', card.id, '| stage', card.stage, '| phone', card.phone);

  console.log('3) listCrmCards (should include the new card):');
  let cards = await crm.listCrmCards();
  console.log('   → count', cards.length, '| has new?', cards.some((c) => c.id === card.id));

  console.log('4) updateCrmCard → move to "messaged":');
  await crm.updateCrmCard(card.id, { stage: 'messaged' });
  cards = await crm.listCrmCards();
  console.log('   → stage now', cards.find((c) => c.id === card.id)?.stage);

  console.log('5) saveCrmTemplate + read back:');
  const probe = 'Hi {{name}}! QA probe ' + tpl.length;
  await crm.saveCrmTemplate(probe);
  const got = await crm.getCrmTemplate();
  console.log('   → roundtrip ok?', got === probe);
  await crm.saveCrmTemplate(tpl); // restore original

  console.log('6) sms href construction (what the Text button emits):');
  const first = card.name.trim().split(/\s+/)[0];
  const body = probe.replace(/\{\{\s*name\s*\}\}/gi, first);
  console.log('   →', `sms:${card.phone}?&body=${encodeURIComponent(body)}`);

  console.log('7) importPaidCustomers (deduped):');
  const added = await crm.importPaidCustomers();
  console.log('   → added', added);
  const added2 = await crm.importPaidCustomers();
  console.log('   → added again (should be 0 if dedup works)', added2);

  console.log('8) deleteCrmCard (cleanup QA card):');
  await crm.deleteCrmCard(card.id);
  cards = await crm.listCrmCards();
  console.log('   → still present?', cards.some((c) => c.id === card.id));

  console.log('\n✅ CRM data layer test complete.');
}

main().catch((e) => {
  console.error('❌ test failed:', e);
  process.exit(1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { splitForTelegram } from '../lib/telegram';

test('splitForTelegram: text under the limit is a single chunk, unchanged', () => {
  assert.deepEqual(splitForTelegram('hello\n\nworld', 3900), ['hello\n\nworld']);
});

test('splitForTelegram: splits on \\n\\n block boundaries; every chunk ≤ limit; reassembles exactly', () => {
  const block = 'x'.repeat(2000);
  const text = [block, block, block].join('\n\n'); // ~6004 chars
  const chunks = splitForTelegram(text, 3900);
  assert.ok(chunks.length >= 2, 'must split');
  for (const c of chunks) assert.ok(c.length <= 3900, `chunk length ${c.length} must be ≤ 3900`);
  // Splitting only at \n\n boundaries means the blocks rejoin to the original.
  assert.equal(chunks.join('\n\n'), text);
});

test('splitForTelegram: a single block bigger than the limit falls back to line splits, still ≤ limit', () => {
  const oneBlock = Array.from({ length: 12 }, (_, i) => `line ${i} ` + 'y'.repeat(400)).join('\n'); // ~4900 chars, no \n\n
  const chunks = splitForTelegram(oneBlock, 3900);
  assert.ok(chunks.length >= 2, 'oversized block must be split');
  for (const c of chunks) assert.ok(c.length <= 3900, `chunk length ${c.length} must be ≤ 3900`);
});

test('splitForTelegram: exactly-at-limit text stays one chunk', () => {
  const text = 'a'.repeat(3900);
  assert.deepEqual(splitForTelegram(text, 3900), [text]);
});

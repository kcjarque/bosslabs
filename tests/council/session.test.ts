import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from '../../lib/council/session';

// --- extractJson: substring from the first '{' to the last '}' inclusive ---

test('extractJson: plain JSON passes through unchanged', () => {
  assert.equal(extractJson('{"a":1}'), '{"a":1}');
});

test('extractJson: fenced JSON (```json ... ```) strips the fence', () => {
  assert.equal(extractJson('```json\n{"a":1}\n```'), '{"a":1}');
});

test('extractJson: fenced JSON with no language tag strips the fence', () => {
  assert.equal(extractJson('```\n{"a":1}\n```'), '{"a":1}');
});

test('extractJson: prose-wrapped JSON extracts just the object', () => {
  const text = "Here is the verdict:\n{\"a\":1}\nLet me know if you need anything else.";
  assert.equal(extractJson(text), '{"a":1}');
});

test('extractJson: leading/trailing whitespace is stripped along with everything outside the braces', () => {
  assert.equal(extractJson('   \n  {"a":1}  \n  '), '{"a":1}');
});

test('extractJson: nested objects keep their inner braces intact (first { to last })', () => {
  const text = '{"a":1,"nested":{"b":2}}';
  assert.equal(extractJson(text), text);
});

test('extractJson: no braces at all falls back to the trimmed original text', () => {
  assert.equal(extractJson('  no json here  '), 'no json here');
});

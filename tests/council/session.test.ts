import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, validateSessionJson } from '../../lib/council/session';

// --- extractJson: balanced-brace scan from the first '{' to the brace that
// closes depth back to 0, ignoring braces inside string literals ---

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

test('extractJson: nested objects keep their inner braces intact (depth tracked, not first-to-last)', () => {
  const text = '{"a":1,"nested":{"b":2}}';
  assert.equal(extractJson(text), text);
});

test('extractJson: trailing prose containing stray braces no longer breaks extraction', () => {
  // A naive first-'{'-to-last-'}' substring would run all the way to the
  // '}' inside "{changes}", producing invalid JSON. The balanced scan
  // stops at the brace that closes the real object's depth back to 0.
  const text = '{"a":1}\n\nHope that helps! Let me know if you need any {changes} made.';
  assert.equal(extractJson(text), '{"a":1}');
});

test('extractJson: braces inside string values are not mistaken for structural braces, even with trailing prose', () => {
  const text = '{"note":"use curly braces like {this} in your ad copy"}\n\nLet me know if you need {more} help.';
  assert.equal(extractJson(text), '{"note":"use curly braces like {this} in your ad copy"}');
});

test('extractJson: an escaped quote inside a string value does not end the string early', () => {
  const text = '{"note":"she said \\"hello\\" to {everyone}"}\nTrailing prose with a stray } too.';
  assert.equal(extractJson(text), '{"note":"she said \\"hello\\" to {everyone}"}');
});

test('extractJson: no braces at all throws a descriptive error', () => {
  assert.throws(() => extractJson('no json here'), /extractJson/);
});

test('extractJson: unbalanced/truncated JSON (never closes depth 0) throws a descriptive error', () => {
  assert.throws(() => extractJson('{"a": {"b": 1'), /extractJson/);
});

// --- validateSessionJson: narrows `unknown` -> SessionJson. Unsalvageable
// gaps (no verdict, no verdict.action, floor not an array) throw with the
// missing path named; everything else gets a safe default so one
// incomplete field never loses an entire paid session. ---

function validFloorEntry(over: Record<string, unknown> = {}) {
  return {
    expert: 'CHARLEY', read: 'the read', diagnosis: 'the diagnosis', action: 'the action',
    prediction: { text: 'pred text', metric: 'cpp_7d', threshold: 60000, target_id: 'ad1', deadline_days: 5 },
    confidence: 'High',
    ...over,
  };
}
function validSession(over: Record<string, unknown> = {}) {
  return {
    snapshot: ['line1'],
    floor: [validFloorEntry()],
    cross_examination: ['CHARLEY -> NICK: ...'],
    disagreement: 'C1 is live',
    diagnosis: { root_cause: 'CPM is climbing', lever: 'audience', evidence: 'CPM up 18% week over week' },
    action_plan: [{ step: 'Test 2 new audiences', because: 'CPM is the bottleneck', lever: 'audience' }],
    creative_ideas: [{
      concept: 'Problem-based ad for resto owners', angle: 'pain-point', persona: 'resto-owner',
      hook: 'Paulit-ulit bang nawawalan ka ng staff?', why: 'Testimonial angle is winning but resto-owner persona is untested',
    }],
    problems: [{
      type: 'audience', description: 'CPM climbing across the account', severity: 'medium', pesoImpact: 8000,
      evidence: { confidence: 'DIRECTIONAL', text: 'CPM up 18% week over week' },
    }],
    solutions: [{
      problem: 'CPM climbing across the account', fix: 'Test 2 new lookalike audiences',
      lever: 'audience', expectedEffect: 'Lower blended CPM ~10%',
    }],
    synthesis: 'CPM is the bottleneck this week; testing fresh audiences is the move.',
    watchlist: [{ item: '7_Manual2 at ₱186 CPP', why: 'Only ₱929 spend — NOISE tier, not a real signal yet' }],
    verdict: {
      action: 'do the thing', why_it_wins: 'because', what_it_costs: 'a little',
      kill_switch: { text: 'reverse if X', metric: 'cpp_7d', threshold: 70000, target_id: 'ad1', deadline_days: 5 },
      dissent_on_record: 'NICK disagrees', also_cleared: ['prereq A'],
    },
    transcript_md: '=== transcript ===',
    ...over,
  };
}

test('validateSessionJson: a full valid object passes through with every field intact', () => {
  const input = validSession();
  const out = validateSessionJson(input);
  assert.deepEqual(out, input);
});

test('validateSessionJson: missing verdict throws, naming "verdict" in the message', () => {
  const input = validSession();
  delete (input as { verdict?: unknown }).verdict;
  assert.throws(() => validateSessionJson(input), /verdict/);
});

test('validateSessionJson: missing verdict.action throws, naming the path', () => {
  const input = validSession();
  const v = input.verdict as Record<string, unknown>;
  delete v.action;
  assert.throws(() => validateSessionJson(input), /verdict\.action/);
});

test('validateSessionJson: missing floor (key absent) throws', () => {
  const input = validSession();
  delete (input as { floor?: unknown }).floor;
  assert.throws(() => validateSessionJson(input), /floor/);
});

test('validateSessionJson: floor present but non-array throws', () => {
  const input = validSession({ floor: 'not an array' });
  assert.throws(() => validateSessionJson(input), /floor/);
});

test('validateSessionJson: missing kill_switch is filled with the safe default shape', () => {
  const input = validSession();
  const v = input.verdict as Record<string, unknown>;
  delete v.kill_switch;
  const out = validateSessionJson(input);
  assert.deepEqual(out.verdict.kill_switch, { text: '', metric: '', threshold: null, target_id: null, deadline_days: 7 });
});

test('validateSessionJson: a floor entry missing prediction is filled with the default shape (text \'\')', () => {
  const entry = validFloorEntry();
  delete (entry as { prediction?: unknown }).prediction;
  const input = validSession({ floor: [entry] });
  const out = validateSessionJson(input);
  assert.deepEqual(out.floor[0].prediction, { text: '', metric: '', threshold: null, target_id: null, deadline_days: 7 });
});

test('validateSessionJson: missing cross_examination/snapshot/also_cleared default to empty arrays', () => {
  const input = validSession();
  delete (input as { cross_examination?: unknown }).cross_examination;
  delete (input as { snapshot?: unknown }).snapshot;
  delete (input.verdict as Record<string, unknown>).also_cleared;
  const out = validateSessionJson(input);
  assert.deepEqual(out.cross_examination, []);
  assert.deepEqual(out.snapshot, []);
  assert.deepEqual(out.verdict.also_cleared, []);
});

test('validateSessionJson: missing transcript_md renders a minimal fallback naming the verdict action', () => {
  const input = validSession();
  delete (input as { transcript_md?: unknown }).transcript_md;
  const out = validateSessionJson(input);
  assert.match(out.transcript_md, /do the thing/); // the verdict.action text
  assert.notEqual(out.transcript_md, '');
});

test('validateSessionJson: missing verdict prose fields (why_it_wins/what_it_costs/dissent_on_record/disagreement) default to \'\'', () => {
  const input = validSession();
  const v = input.verdict as Record<string, unknown>;
  delete v.why_it_wins;
  delete v.what_it_costs;
  delete v.dissent_on_record;
  delete (input as { disagreement?: unknown }).disagreement;
  const out = validateSessionJson(input);
  assert.equal(out.verdict.why_it_wins, '');
  assert.equal(out.verdict.what_it_costs, '');
  assert.equal(out.verdict.dissent_on_record, '');
  assert.equal(out.disagreement, '');
});

test('validateSessionJson: missing problems/solutions/synthesis/watchlist default to []/[]/\'\'/[]', () => {
  const input = validSession();
  delete (input as { problems?: unknown }).problems;
  delete (input as { solutions?: unknown }).solutions;
  delete (input as { synthesis?: unknown }).synthesis;
  delete (input as { watchlist?: unknown }).watchlist;
  const out = validateSessionJson(input);
  assert.deepEqual(out.problems, []);
  assert.deepEqual(out.solutions, []);
  assert.equal(out.synthesis, '');
  assert.deepEqual(out.watchlist, []);
});

test('validateSessionJson: a problem entry missing its evidence object never throws and defaults evidence.text to \'\'', () => {
  const input = validSession({
    problems: [{ type: 'audience', description: 'CPM climbing', severity: 'medium', pesoImpact: 8000 }],
  });
  const out = validateSessionJson(input);
  assert.equal(out.problems[0].description, 'CPM climbing');
  assert.equal(out.problems[0].evidence.text, '');
});

test('validateSessionJson: a non-object top-level value throws', () => {
  assert.throws(() => validateSessionJson('just a string'), /not a JSON object/);
  assert.throws(() => validateSessionJson(null), /not a JSON object/);
});

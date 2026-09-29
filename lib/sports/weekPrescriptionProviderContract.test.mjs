import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sportsRuntime, plain } from './trainingContractTestRuntime.mjs';

// Exact synthetic input and both raw 6E responses; independent of the untracked live report.
const captured = JSON.parse(readFileSync(new URL('./weekPrescriptionProviderContract.fixture.json', import.meta.url), 'utf8'));
const paths = new Set();
const load = sportsRuntime({ console: { info() {}, warn() {}, log() {}, error() {} },
  fetch() { throw Error('NO_PROVIDER_IN_6F'); } }, (path, exports) => { paths.add(path.replaceAll('\\', '/')); return exports; });
const bridge = load('weekPrescriptionSessionAdapter');
const structured = load('structuredSession');
const input = () => structuredClone(captured.input);
const parsed = raw => { const result = structured.parseStructuredSession(raw, true); assert.equal(result.ok, true); return result.proposal; };
function corrected(raw) {
  const p = parsed(raw);
  // A deterministic provider fixture, never a production post-generation repair.
  p.finalDecision = { kind: 'session_decision', version: 1, stimulus: p.stimulusId };
  return p;
}

test('both exact 6E bodies parse but still fail mandatory decision admission, with two attempts only', async () => {
  for (const raw of captured.responses) {
    const p = parsed(raw), c = bridge.adaptWeekPrescriptionSession(input()).contract;
    assert.equal(Object.hasOwn(p, 'finalDecision'), false);
    assert.throws(() => load('finalSessionDecision').admitFinalDecision(c, p), /FINAL_SESSION_DECISION_INVALID/);
  }
  let calls = 0;
  const result = await bridge.materializeWeekPrescriptionSession(input(), [], async () => captured.responses[calls++]);
  assert.equal(calls, 2); assert.equal(result.ok, false);
  assert.deepEqual(plain(result.violations), ['FINAL_SESSION_DECISION_INVALID']);
  assert.equal(Object.hasOwn(result, 'session'), false);
});

for (const [i, raw] of captured.responses.entries()) {
  test(`capture ${i + 1}: explicit initial envelope and focused retry lead to validation, renderer and fidelity`, async () => {
    const f = input(), before = plain(f), prompts = [];
    const response = corrected(raw);
    const result = await bridge.materializeWeekPrescriptionSession(f, [], async prompt => {
      prompts.push(prompt);
      assert.match(prompt, /V5_REQUIRED_OUTPUT:.*AND finalDecision/);
      assert.match(prompt, /finalDecision is REQUIRED, not optional/);
      assert.match(prompt, /Coach purpose.*immutable/);
      assert.doesNotMatch(prompt, /You may keep or revise the guidance/);
      if (prompts.length === 1) return raw;
      assert.match(prompt, /FINAL_SESSION_DECISION_INVALID/);
      const repair = JSON.parse(prompt.split('FINAL_DECISION_REPAIR:\n')[1].split('\n')[0]);
      assert.equal(repair.field, 'finalDecision'); assert.equal(repair.issue, 'MISSING_REQUIRED_FIELD');
      assert.deepEqual(repair.previousProposal, plain(parsed(raw)));
      assert.match(repair.instruction, /preserve all other valid fields, discipline and factual constraints/);
      assert.match(repair.instruction, /original CONTRACT.stimulusId exactly/);
      return JSON.stringify(response);
    });
    assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(prompts.length, 2);
    assert.equal(structured.validateSessionAgainstTrainingContract(result.contract, result.proposal).ok, true);
    assert.equal(bridge.checkWeekPrescriptionSessionFidelity(bridge.adaptWeekPrescriptionSession(f), result).ok, true);
    assert.equal(result.session.tipo, 'carrera'); assert.ok(result.session.descripcion.length);
    assert.deepEqual(plain(result.proposal.blocks), plain(response.blocks));
    assert.deepEqual(plain(f), before);
  });
}

test('shaped changed purpose is still rejected by WeekPrescription fidelity', async () => {
  const p = corrected(captured.responses[1]);
  p.stimulusId = p.finalDecision.stimulus = 'Recuperación fácil';
  p.finalDecision.reason = 'Deliberate negative fixture.';
  const result = await bridge.materializeWeekPrescriptionSession(input(), [], async () => JSON.stringify(p));
  assert.equal(result.ok, false); assert.equal(result.code, 'COACH_PURPOSE_CONFLICT');
  assert.equal(Object.hasOwn(result, 'session'), false);
});

test('malformed decision receives field-specific repair and cannot bypass admission', async () => {
  const p = corrected(captured.responses[0]); p.finalDecision.version = '1';
  let calls = 0;
  const result = await bridge.materializeWeekPrescriptionSession(input(), [], async prompt => {
    if (++calls === 2) assert.match(prompt, /INVALID_FIELD_OR_STIMULUS_MISMATCH/);
    return JSON.stringify(p);
  });
  assert.equal(result.ok, false); assert.equal(calls, 2);
  assert.deepEqual(plain(result.violations), ['FINAL_SESSION_DECISION_INVALID']);
});

test('dose text warnings are separate and runtime has no planning, provider or persistence authority', () => {
  for (const raw of captured.responses) {
    const result = structured.parseStructuredSession(raw, true);
    assert.equal(result.ok, true);
    assert.ok(result.representationAdvisories.includes('DOSE_INSTRUCTION_UNRESOLVED'));
  }
  assert.doesNotMatch([...paths].join('\n'), /\/(?:chat|providers)\/|\/(?:strategyResolution|canonicalWeekStrategy|weeklyCalendarAuthority|trainingFrequencySafetyNet|planPersistence|sessionAuthority)\.ts|\/(?:[^/]*Analyzer|[^/]*Planner)[^/]*\.ts/i);
});

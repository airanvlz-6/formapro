import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { compile, plain } from '../sports/trainingContractTestRuntime.mjs';

const source = readFileSync(new URL('./longitudinalIntent.ts', import.meta.url), 'utf8');
const compiled = compile(source);
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module, exports: module.exports, structuredClone,
  require: name => { throw new Error(`Forbidden runtime dependency: ${name}`); },
});
const project = input => plain(module.exports.projectLongitudinalIntent(input));
const provenance = {
  kind: 'recorded_decision', authority: 'human_coach', source: 'coaching_review',
  decidedAt: '2026-09-27T15:30:00+01:00', sourceReference: 'decision:block-12',
};
function fixture() {
  return {
    block: { blockId: 'block-12', revision: 3, goalReference: { source: 'preparation', id: 'goal-7' },
      purpose: 'Desarrollar durabilidad aeróbica manteniendo la fuerza', provenance: { ...provenance } },
    week: { weekStart: '2026-09-28', revision: 2, blockIntentReference: { blockId: 'block-12', revision: 3 },
      positionInBlock: 2, purpose: 'Consolidar la tolerancia al esfuerzo sostenido',
      contributionToBlock: 'Dar continuidad a la durabilidad sin desplazar la fuerza',
      provenance: { ...provenance, authority: 'coach', sourceReference: 'decision:week-2' } },
  };
}

test('preserves open purposes, exact block revision, position and independent contribution', () => {
  const input = fixture(), result = project(input);
  assert.equal(result.block.status, 'known');
  assert.equal(result.week.status, 'known');
  assert.deepEqual(result.block.value, input.block);
  assert.deepEqual(result.week.value, input.week);
  assert.notEqual(result.week.value.purpose, result.week.value.contributionToBlock);
  input.block.purpose = 'Refinar la lectura de rutas de escalada';
  input.week.purpose = 'Explorar decisiones de equilibrio';
  assert.equal(project(input).block.value.purpose, input.block.purpose);
  assert.equal(project(input).week.value.purpose, input.week.purpose);
});

test('preserves provenance without requiring Coach or an available source reference', () => {
  const input = fixture();
  input.block.provenance.authority = 'athlete';
  input.block.provenance.sourceReference = null;
  assert.deepEqual(project(input).block.value.provenance, input.block.provenance);
  assert.deepEqual(project(input).week.value.provenance, input.week.provenance);
});

test('missing intent and unknown position stay unknown without fallback', () => {
  const empty = project();
  assert.equal(empty.block.status, 'unknown');
  assert.equal(empty.week.status, 'unknown');
  assert.equal(empty.block.value, null);
  assert.equal(empty.week.value, null);
  const input = fixture();
  input.week.positionInBlock = null;
  assert.equal(project(input).week.value.positionInBlock, null);
  assert.equal(project({ block: input.block }).week.reason, 'WEEK_INTENT_ABSENT');
  assert.equal(project({ week: input.week }).week.reason, 'BLOCK_INTENT_UNAVAILABLE');
});

test('rejects a different block or revision, never silently relinks a week', () => {
  for (const reference of [{ blockId: 'other', revision: 3 }, { blockId: 'block-12', revision: 2 }]) {
    const input = fixture();
    input.week.blockIntentReference = reference;
    const result = project(input);
    assert.equal(result.block.status, 'known');
    assert.equal(result.week.status, 'unknown');
    assert.equal(result.week.reason, 'BLOCK_INTENT_REFERENCE_MISMATCH');
  }
});

test('legacy fields and explicitly unverified provenance never become canonical', () => {
  assert.deepEqual(project({ usuarios: { ciclo_actual: { objetivo: 'legacy block' } },
    weekly_plan: { week_objective: 'legacy week' } }), project());
  const raw = project({ block: { objetivo: 'legacy block' }, week: { week_objective: 'legacy week' } });
  assert.equal(raw.block.status, 'unknown');
  assert.equal(raw.week.status, 'unknown');
  for (const target of ['block', 'week']) {
    const input = fixture();
    input[target].provenance.kind = 'legacy_unverified';
    assert.equal(project(input)[target].status, 'unknown');
  }
});

test('rejects incomplete decisions, invalid revisions, positions and provenance', () => {
  for (const [target, key, value] of [
    ['block', 'blockId', ' '], ['block', 'revision', 0], ['block', 'revision', 1.5],
    ['block', 'goalReference', null], ['block', 'purpose', ' '],
    ['week', 'revision', Number.MAX_SAFE_INTEGER + 1], ['week', 'positionInBlock', 0],
    ['week', 'positionInBlock', -1], ['week', 'positionInBlock', 1.5],
    ['week', 'contributionToBlock', ''], ['week', 'purpose', null],
    ['week', 'provenance', { ...provenance, authority: '' }],
    ['block', 'provenance', { ...provenance, source: '' }],
  ]) {
    const input = fixture();
    input[target][key] = value;
    assert.equal(project(input)[target].status, 'unknown', `${target}.${key}: ${value}`);
  }
});

test('requires real civil Mondays and explicit valid decision timestamps', () => {
  for (const weekStart of ['2026-02-30', '2026-09-29', '2026-9-28', '2026-09-28T00:00:00Z']) {
    const input = fixture();
    input.week.weekStart = weekStart;
    assert.equal(project(input).week.status, 'unknown', weekStart);
  }
  for (const decidedAt of ['yesterday', '2026-02-30T00:00:00Z', '2026-09-28T24:00:00Z',
    '2026-09-28T00:00:00', '2026-09-28']) {
    const input = fixture();
    input.block.provenance.decidedAt = decidedAt;
    assert.equal(project(input).block.status, 'unknown', decidedAt);
  }
});

test('availability is irrelevant; no prescription, result or pending data are inferred or accepted', () => {
  const input = fixture(), result = project(input);
  assert.deepEqual(project({ ...input, availability: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] }), result);
  assert.deepEqual(Object.keys(result.block.value).sort(), Object.keys(input.block).sort());
  assert.deepEqual(Object.keys(result.week.value).sort(), Object.keys(input.week).sort());
  for (const key of ['frequency', 'trainingDays', 'methods', 'allowedMethods', 'requiredMethods',
    'availability', 'sessions', 'stimuli', 'volume', 'intensity', 'exercises', 'deload', 'progression',
    'result', 'pending', 'progressScore', 'nextWeekRecommendation']) {
    for (const target of ['block', 'week']) {
      const extra = fixture();
      extra[target][key] = [];
      assert.equal(project(extra)[target].status, 'unknown', `${target}.${key}`);
    }
  }
});

test('known and unknown contracts round-trip through JSON and projection does not alias inputs', () => {
  const input = fixture(), before = plain(input);
  const result = module.exports.projectLongitudinalIntent(input);
  assert.deepEqual(plain(result), project(plain(input)));
  assert.deepEqual(plain(project()), project());
  result.block.value.provenance.authority = 'changed';
  result.week.value.blockIntentReference.revision = 99;
  assert.deepEqual(input, before);
});

test('architecture uses only a shared type and has zero runtime imports', () => {
  const imports = source.match(/^import .*$/gm);
  assert.deepEqual(imports, ["import type { CoreFact } from './athleteContext';"]);
  assert.doesNotMatch(compiled, /\brequire\s*\(|\bimport\s*\(/);
  assert.doesNotMatch(source, /\b(?:fetch|process|window|document|supabase)\b/);
  assert.equal(project(fixture()).week.status, 'known');
});

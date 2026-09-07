import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { sportsRuntime, plain, compile } from '../sports/trainingContractTestRuntime.mjs';
const load = sportsRuntime(), library = load('movementLibrary').MOVEMENT_LIBRARY;
const { resolveDataSufficiency: resolve } = load('../prescription/dataSufficiency');
const available = (signal, source = 'manual_profile') => ({ signal, state: 'available', source, updatedAt: '2026-09-07' });
const missing = signal => ({ signal, state: 'unknown', source: null, answerType: 'availability' });
function equipmentChecks(movementId, states) {
  const movement = library[movementId]; assert.ok(movement);
  return movement.equipment.map(id => ({ requirement: { signal: `equipment.${id}`, reason: 'movement_equipment', requiredFor: movementId,
    criticality: 'required', acceptableFallbacks: [] }, evidence: [states[`equipment.${id}`] || missing(`equipment.${id}`)] }));
}
function cyclingFixture(measurement = available('capability.canMeasureHeartRate'), allowFallback = false) {
  // Existing cyclic movement/implement and existing HR reference taxonomy; no invented cycling catalog.
  const movementId = 'bike_erg'; assert.equal(library[movementId].movement_pattern, 'cyclic');
  const benchmark = available('reference.running:z2', 'usuarios.datos_entrenamiento.z2_fc');
  return { checks: [...equipmentChecks(movementId, { 'equipment.bici_estatica': available('equipment.bici_estatica') }),
    { requirement: { signal: benchmark.signal, reason: 'numeric_intensity', requiredFor: movementId,
      criticality: 'required', acceptableFallbacks: allowFallback ? ['duration_rpe'] : [] }, evidence: [benchmark, measurement],
      fallbackOptions: allowFallback ? [{ fallback: { signal: benchmark.signal, fallback: 'duration_rpe' }, evidence: [] }] : [] }] };
}
function powerliftingFixture(withBenchmark = true, states) {
  const movementId = 'back_squat', signal = 'reference.1rm:back_squat';
  const equipment = states || { 'equipment.barra': available('equipment.barra'), 'equipment.rack': available('equipment.rack') };
  return { checks: [...equipmentChecks(movementId, equipment), {
    requirement: { signal, reason: 'numeric_intensity', requiredFor: movementId, criticality: 'preferred', acceptableFallbacks: ['rpe'] },
    evidence: [withBenchmark ? available(signal, 'usuarios.test_atleta.back_squat') : { ...missing(signal), answerType: 'reference' }],
    fallbackOptions: [{ fallback: { signal, fallback: 'rpe' }, evidence: [] }],
  }] };
}
test('cycling-like duration + HR requirement + measurement resolves without a sport parameter', () => {
  const input = cyclingFixture(); assert.ok(!Object.hasOwn(input, 'discipline'));
  const result = resolve(input); assert.equal(result.status, 'sufficient'); assert.equal(result.questionRequirements.length, 0);
  assert.ok(result.resolvedSignals.some(e => e.signal === 'equipment.bici_estatica'));
});
test('cycling-like unknown measurement uses explicitly authorized duration RPE, otherwise asks capability', () => {
  const measurement = missing('capability.canMeasureHeartRate');
  const fallback = resolve(cyclingFixture(measurement, true)); assert.equal(fallback.status, 'fallback_available');
  assert.equal(fallback.fallbacks[0].fallback, 'duration_rpe'); assert.equal(fallback.questionRequirements.length, 0);
  const required = resolve(cyclingFixture(measurement)); assert.equal(required.status, 'missing_required_data');
  assert.deepEqual(plain(required.questionRequirements[0].signalIds), ['capability.canMeasureHeartRate']);
});
test('powerlifting-like load requirements resolve through equipment and benchmark, without sport branches', () => {
  const result = resolve(powerliftingFixture()); assert.equal(result.status, 'sufficient');
  assert.ok(result.resolvedSignals.some(e => e.source === 'usuarios.test_atleta.back_squat'));
});
test('powerlifting-like missing benchmark uses RPE but missing rack still requires a question', () => {
  const fallback = resolve(powerliftingFixture(false)); assert.equal(fallback.status, 'fallback_available');
  assert.equal(fallback.fallbacks[0].fallback, 'rpe'); assert.equal(fallback.questionRequirements.length, 0);
  const required = resolve(powerliftingFixture(false, { 'equipment.barra': available('equipment.barra') }));
  assert.equal(required.status, 'missing_required_data'); assert.deepEqual(plain(required.questionRequirements[0].signalIds), ['equipment.rack']);
});
test('provider provenance is opaque, preserved and cannot change sufficiency semantics', () => {
  // Simulated adapter output only: no integration, provider data fetch or device inference is implemented.
  for (const source of ['manual_profile', 'HealthKit', 'Garmin', 'mobile_sensor', 'external_provider']) {
    const result = resolve(cyclingFixture(available('capability.canMeasureHeartRate', source)));
    assert.equal(result.status, 'sufficient');
    assert.deepEqual(plain(result.resolvedSignals.find(e => e.signal === 'capability.canMeasureHeartRate')), available('capability.canMeasureHeartRate', source));
  }
});
test('unavailable or ambiguous provider evidence never becomes available', () => {
  for (const state of ['unknown', 'ambiguous', 'unavailable']) {
    const result = resolve(cyclingFixture({ ...available('capability.canMeasureHeartRate', 'external_provider'), state }));
    assert.equal(result.status, 'missing_required_data'); assert.ok(result.missingSignals.some(e => e.state === state));
  }
});
test('fallback measurement evidence retains provider source in shared decision', () => {
  const input = cyclingFixture(missing('capability.canMeasureHeartRate'));
  input.checks.at(-1).fallbackOptions = [{ fallback: { signal: 'reference.running:z2', fallback: 'pace', referenceId: 'running:easyPace' },
    evidence: [available('capability.canMeasurePace', 'mobile_sensor'), available('reference.running:easyPace', 'manual_profile')] }];
  const result = resolve(input); assert.equal(result.status, 'fallback_available');
  assert.equal(result.fallbackEvidence[0].source, 'mobile_sensor');
});
test('mobile transport roundtrip preserves decisions and question IDs without rendered strings', () => {
  const input = powerliftingFixture(false, {}), result = plain(resolve(input));
  assert.deepEqual(plain(resolve(JSON.parse(JSON.stringify(input)))), result);
  assert.equal(result.status, 'missing_required_data');
  assert.deepEqual(result.questionRequirements[0].signalIds, ['equipment.barra', 'equipment.rack']);
  assert.equal(Object.hasOwn(result.questionRequirements[0], 'text'), false);
});
test('shared engine executes without React, Next, DOM, browser, Node APIs or UI renderer', () => {
  const source = readFileSync(new URL('./dataSufficiency.ts', import.meta.url), 'utf8');
  const module = { exports: {} };
  // Any future runtime import fails; only standard language primitives are provided by the VM.
  vm.runInNewContext(compile(source), { module, exports: module.exports, require() { throw Error('Core runtime dependency'); } });
  assert.equal(module.exports.resolveDataSufficiency(cyclingFixture()).status, 'sufficient');
  assert.equal(module.exports.resolveDataSufficiency(powerliftingFixture(false)).status, 'fallback_available');
  assert.doesNotMatch(source, /\b(carrera|running|crossfit|cycling|powerlifting|box)\b/i);
});
test('sports adapter uses shared core and preserves all 20 captured pre-gate results', () => {
  const cases = JSON.parse(readFileSync(new URL('./compatibilityFixtures.json', import.meta.url), 'utf8'));
  const adapter = load('prescriptionDataSufficiency');
  for (const c of cases) assert.deepEqual(plain(adapter.resolvePrescriptionDataSufficiency(c.context, c.references, c.request)), c.expected);
  const compiled = adapter.movementPrescriptionRequirements(cases[0].context, cases[0].references, cases[0].request);
  assert.equal(resolve(compiled).status, cases[0].expected.status);
});

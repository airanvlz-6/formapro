import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, contractFixture, plain } from '../sports/trainingContractTestRuntime.mjs';
const load = sportsRuntime({ console: { info(){}, log(){}, warn(){} } });
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const { admittedHrZones } = load('../athlete/hrZoneBootstrap');
const { resolveRunningReferences } = load('runningReferenceAuthority');

// Exact real-world data for athlete 060385 (usuarios.datos_entrenamiento), used verbatim
// as the regression fixture for the "hasta N" open-ended Z1 legacy format.
const realZones = { z1: 'hasta 136', z2: '136-151', z3: '151-166', z4: '166-181', z5: '181-196',
  fc_max: 181, fc_reposo: 47, umbral_fc: 166 };

test('1. "hasta 136" is parsed for Z1', () => {
  const athlete = project({ datos_entrenamiento: { z1: 'hasta 136' } });
  const r = athlete.running.byMetric.z1;
  assert.equal(r?.reason, 'resolved', JSON.stringify(r));
  assert.deepEqual(plain(r.resolved.value.value), { min: 1, max: 136 });
});

test('2. "hasta N" is NOT accepted for Z2-Z5 (open-ended form is Z1/bpm-only)', () => {
  for (const metric of ['z2', 'z3', 'z4', 'z5']) {
    const athlete = project({ datos_entrenamiento: { [metric]: 'hasta 136' } });
    const r = athlete.running.byMetric[metric];
    assert.equal(r?.reason ?? 'unknown', 'unknown', `${metric} must stay unresolved, got ${JSON.stringify(r)}`);
  }
});

test('3. the five real zones are admitted as USER_DECLARED without hrZoneBootstrap', () => {
  const athlete = project({ datos_entrenamiento: realZones });
  assert.equal(athlete.hrZoneBootstrap, undefined);
  const admitted = admittedHrZones(athlete.running, athlete.hrZoneBootstrap ?? null);
  assert.ok(admitted, 'real athlete zones must be admitted without hrZoneBootstrap');
  assert.equal(admitted.confirmation, 'USER_CONFIRMED');
  assert.equal(admitted.origin, 'USER_DECLARED');
  assert.deepEqual(plain(admitted.zones), [
    { id: 'Z1', lower: 1, upper: 136 }, { id: 'Z2', lower: 136, upper: 151 },
    { id: 'Z3', lower: 151, upper: 166 }, { id: 'Z4', lower: 166, upper: 181 },
    { id: 'Z5', lower: 181, upper: 196 },
  ]);
});

test('4. running:z2 exists and is exactly 136-151 bpm', () => {
  const athlete = project({ datos_entrenamiento: realZones });
  const refs = resolveRunningReferences(athlete).references;
  const z2 = refs.find(r => r.id === 'running:z2');
  assert.ok(z2, 'running:z2 must be present');
  assert.deepEqual(plain(z2.value), { min: 136, max: 151 });
  assert.equal(z2.unit, 'bpm');
});

test('5. running:confirmedBaseZone exists and corresponds to Z2', () => {
  const athlete = project({ datos_entrenamiento: realZones });
  const refs = resolveRunningReferences(athlete).references;
  const base = refs.find(r => r.id === 'running:confirmedBaseZone');
  assert.ok(base, 'running:confirmedBaseZone must be present');
  assert.deepEqual(plain(base.value), { min: 136, max: 151 });
  assert.equal(base.intensityEvidence.zoneCompatibility.sourceZone, 'Z2');
});

test('8. the pre-existing plain range format "100-136" still works for Z1 (no regression)', () => {
  const athlete = project({ datos_entrenamiento: { z1: '100-136' } });
  const r = athlete.running.byMetric.z1;
  assert.equal(r?.reason, 'resolved');
  assert.deepEqual(plain(r.resolved.value.value), { min: 100, max: 136 });
});

test('9. "hasta" without a following number is rejected, not silently resolved', () => {
  const athlete = project({ datos_entrenamiento: { z1: 'hasta' } });
  assert.equal(athlete.running.byMetric.z1?.reason ?? 'unknown', 'unknown');
});

// --- 6 & 7: full open-execution (coach-first, contractVersion 5) contract built from the
// real athlete's data, exercised through generateContractSession exactly as production does
// (lib/sports/weekPrescriptionSessionAdapter.ts -> sessionGeneration.ts). ---
function openExecutionContract(data = realZones) {
  const athlete = project({ perfil: { duracion: '60 min' }, datos_entrenamiento: data });
  const dc = load('sessionDoseContext').buildSessionDoseContext(athlete, undefined, null, [], true, 'coach');
  const input = contractFixture({ discipline: 'carrera', targetWeekStart: '2026-09-07', targetDay: 'viernes',
    stimulus: 'base_aerobica', doseContext: dc,
    coachingGuidance: { kind: 'weekly_guidance', version: 2, stimulus: 'base_aerobica' } });
  input.exposureContext.report.disciplina = 'carrera';
  const built = load('allowedTrainingContract').buildAllowedTrainingContract(input);
  assert.equal(built.ok, true, JSON.stringify(built));
  return built.contract;
}

test('6. rodaje_z2 backed by running:confirmedBaseZone (real athlete zones) passes validateCoachExecution', async () => {
  const c = openExecutionContract();
  const ref = c.doseContext.references.find(r => r.id === 'running:confirmedBaseZone');
  assert.ok(ref, 'running:confirmedBaseZone must be executable for this athlete');
  assert.deepEqual(plain(ref.value), { min: 136, max: 151 });
  const p = { schemaVersion: 2, stimulusId: c.stimulusId, structureId: 'continuo_carrera',
    explanation: 'Rodaje suave en Z2 segun referencia confirmada.',
    finalDecision: { kind: 'session_decision', version: 1, stimulus: c.stimulusId },
    blocks: [{ blockType: 'main', movements: [{ movementId: 'rodaje_z2',
      prescription: { durationSeconds: 1800, intensity: { kind: 'reference', referenceId: 'running:confirmedBaseZone' } } }] }] };
  const result = await load('sessionGeneration').generateContractSession(c, [], async () => JSON.stringify(p));
  assert.equal(result.ok, true, JSON.stringify(result));
});

test('7. unbacked/incompatible bpm text still fails with NUMERIC_TRUTH', async () => {
  const c = openExecutionContract();
  // Typed intensity is RPE (no reference), but the prose still asserts an explicit bpm
  // range the athlete's resolved Z2 reference (136-151) does not cover: must still reject.
  const p = { schemaVersion: 2, stimulusId: c.stimulusId, structureId: 'continuo_carrera', explanation: 'Rodaje Z2.',
    finalDecision: { kind: 'session_decision', version: 1, stimulus: c.stimulusId },
    blocks: [{ blockType: 'main', movements: [{ movementId: 'rodaje_z2',
      prescription: { durationSeconds: 1800, intensity: { kind: 'rpe', value: 3 }, doseInstruction: 'Z2 200-210 bpm' } }] }] };
  const result = await load('sessionGeneration').generateContractSession(c, [], async () => JSON.stringify(p));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SESSION_CONTRACT_INVALID');
  assert.ok(result.violations.includes('NUMERIC_TRUTH:HR_REFERENCE_REQUIRED'), JSON.stringify(result.violations));
});

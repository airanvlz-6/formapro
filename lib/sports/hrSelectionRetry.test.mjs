import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain, contractFixture, fakeDatabase } from './trainingContractTestRuntime.mjs';
const logs = [], load = sportsRuntime({ console: { info: (...args) => logs.push(args) } });
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const doseContext = (user, intent) => load('sessionDoseContext').buildSessionDoseContext(project(user), intent, null, [], true);
function fixture() {
  const method = load('goalTransferModel').transferMethod('running_threshold');
  const intent = { kind: 'adaptation', goalId: 'half_marathon', adaptationId: method.adaptationId, methodId: method.id,
    role: 'PRIMARY', pattern: method.patterns[0], blockPhase: 'intensification', blockWeek: 12, weaknessId: null };
  const input = contractFixture({ discipline: 'carrera', stimulus: method.stimulusId, intent, targetDay: 'miercoles',
    doseContext: doseContext({ objetivo_principal: 'half_marathon', perfil: { duracion: '90 min' }, datos_entrenamiento: { z2_fc: '130–145' } }, intent) });
  input.exposureContext.report.disciplina = 'carrera';
  const built = load('allowedTrainingContract').buildAllowedTrainingContract(input); assert.equal(built.ok, true);
  const p = { schemaVersion: 2, stimulusId: method.stimulusId, structureId: 'intervalos_carrera', blocks: ['warmup', 'main', 'cooldown'].map((blockType, i) => ({ blockType,
    movements: [{ movementId: 'series_umbral', prescription: i === 1 ? { sets: 5, durationSeconds: 360, restSeconds: 180, intensity: { kind: 'rpe', value: 8 } }
      : { durationSeconds: 120, intensity: { kind: 'rpe', value: i ? 2 : 3 } } }] })) };
  return { c: built.contract, p };
}

test('current UI declarations survive creation/update and canonical server reads without inferring references', async () => {
  const writes = load('../auth/legacyContainment');
  for (const [device, expected] of [['Sí, reloj GPS con pulsómetro', 'available'], ['Sí, solo pulsómetro (banda o reloj básico)', 'available'],
    ['No, entreno por sensación (RPE)', 'unavailable'], [undefined, 'unknown'], ['pulsometro', 'unknown']]) {
    const user = writes.projectLegacyCreate({ categoria: 'carrera', perfil: { dispositivo: device } });
    const patch = writes.projectLegacyUpdate({ perfil: user.perfil });
    const db = fakeDatabase({ usuarios: { ...user, ...patch }, weekly_plan: [], session_modification_events: [], physiology_records: [], athlete_coaching_notes: [] });
    const canonical = await load('../athlete/loadAthletePrescriptionContext').loadAthletePrescriptionContext(db, 'fixture', { asOfDate: '2026-09-08' });
    assert.equal(canonical.prescriptionSignals.signals['capability.canMeasureHeartRate'].state, expected);
    const dc = load('sessionDoseContext').buildSessionDoseContext(canonical, undefined, null, [], true);
    assert.equal(dc.sufficiency.signals['capability.canMeasureHeartRate'].state, expected); assert.equal(dc.references.length, 0);
  }
});

test('structured and dated overrides retain precedence, aliases without a writer do not authorize', () => {
  const signal = 'capability.canMeasureHeartRate';
  for (const state of ['available', 'unavailable', 'unknown', 'ambiguous']) {
    const profile = { dispositivo: 'Sí, reloj GPS con pulsómetro', prescription_signals: { [signal]: { state } } };
    assert.equal(project({ perfil: profile }).prescriptionSignals.signals[signal].state, state);
    profile.prescription_access = { '2026-09-08': { [signal]: { state: 'unavailable' } } };
    assert.equal(project({ perfil: profile }, '2026-09-08').prescriptionSignals.signals[signal].state, 'unavailable');
  }
  assert.equal(project({ perfil: { pulsometro: true, reloj: true, fc_max: 190 } }).prescriptionSignals.signals[signal].state, 'unknown');
});

test('threshold PRIMARY 5400s: known HR reference is not executable without measurement; reject unchanged', () => {
  const { c, p } = fixture(), validate = load('structuredSession').validateSessionAgainstTrainingContract;
  assert.equal(c.doseContext.timeBudget.maximumSeconds, 5400);
  assert.equal(c.doseContext.sufficiency.signals['capability.canMeasureHeartRate'].state, 'unknown');
  assert.ok(c.doseContext.references.some(r => r.id === 'running:z2'));
  const options = load('prescriptionDataSufficiency').prescriptionGenerationOptions(c.doseContext.sufficiency, c.doseContext.references, c.allowedMovementIds, c.discipline);
  assert.ok(options.every(o => !o.executableReferenceIds.includes('running:z2')));
  assert.equal(validate(c, p).ok, true);
  p.blocks[1].movements[0].prescription.intensity = { kind: 'reference', referenceId: 'running:z2' };
  assert.deepEqual(plain(validate(c, p).violations), ['PRESCRIPTION_DATA_MISSING:capability.canMeasureHeartRate']);
});

test('legitimate running recurrence across blocks passes; repeated entries in main produce two violations', () => {
  const { p } = fixture(), shape = load('structuredSession').checkSessionShape;
  assert.equal(shape(p).ok, true);
  p.blocks[1].movements.push(structuredClone(p.blocks[1].movements[0]), structuredClone(p.blocks[1].movements[0]));
  assert.deepEqual(plain(shape(p).violations), ['DUPLICATE_MOVEMENT:1:series_umbral', 'DUPLICATE_MOVEMENT:1:series_umbral']);
  p.blocks[1].movements[2].prescription.durationSeconds = 300;
  assert.equal(shape(p).violations.length, 2); // dose differences do not change uniqueness
});

test('both attempts receive existing shape/intensity constraints; corrected Builder proposal succeeds without server defaults', async () => {
  const { c, p } = fixture(), invalid = structuredClone(p), before = JSON.stringify(c);
  invalid.blocks[1].movements[0].prescription.intensity = { kind: 'reference', referenceId: 'running:z2' };
  let calls = 0;
  const r = await load('sessionGeneration').generateContractSession(c, [], async prompt => {
    assert.match(prompt, /DENTRO de cada bloque/); assert.match(prompt, /ENTRE warmup, main y cooldown/);
    assert.match(prompt, /SU executableReferenceIds/);
    if (++calls === 2) assert.match(prompt, /PRESCRIPTION_DATA_MISSING:capability.canMeasureHeartRate/);
    return JSON.stringify(calls === 1 ? invalid : p);
  }, '', undefined, 'human_v2');
  assert.equal(r.ok, true); assert.equal(calls, 2); assert.deepEqual(plain(r.proposal), p); assert.equal(JSON.stringify(c), before);
});

test('real failure sequence stays closed at two attempts and logs duplicate identities without raw text', async () => {
  logs.length = 0;
  const { c, p } = fixture(), hr = structuredClone(p), duplicate = structuredClone(p);
  hr.blocks[1].movements[0].prescription.intensity = { kind: 'reference', referenceId: 'running:z2' };
  duplicate.blocks[1].movements.push(structuredClone(duplicate.blocks[1].movements[0]), structuredClone(duplicate.blocks[1].movements[0]));
  let calls = 0;
  const r = await load('sessionGeneration').generateContractSession(c, [], async () => JSON.stringify(++calls === 1 ? hr : duplicate));
  assert.equal(r.ok, false); assert.equal(calls, 2); assert.equal(r.session, undefined);
  assert.equal(r.diagnostics.finalStage, 'checkSessionShape');
  const details = logs.filter(([tag]) => tag === 'SESSION_DUPLICATE_MOVEMENT_DETAIL').map(([, text]) => JSON.parse(text));
  assert.equal(details.length, 2); assert.ok(details.every(d => d.blockIndex === 1 && d.movementId === 'series_umbral'));
  const trace = load('builderDiagnostics').builderTrace({ targetDay: 'miercoles', targetWeekStart: '2026-08-31' });
  trace.emit(2, 'checkSessionShape', 'SESSION_PROPOSAL_INVALID', ['DUPLICATE_MOVEMENT:1:private-secret'], false, 'attempt_limit');
  assert.doesNotMatch(JSON.stringify(logs), /private-secret/);
});

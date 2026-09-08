import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain, contractFixture, completeDoseFixture } from './trainingContractTestRuntime.mjs';
const logs = [], load = sportsRuntime({ console: { info: (...args) => logs.push(args) } });
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
function fixture() {
  const doseContext = load('sessionDoseContext').buildSessionDoseContext(project({ datos_entrenamiento: { z2_fc: '130–145' } }), undefined, null, [], true);
  const input = contractFixture({ targetDay: 'sabado', discipline: 'carrera', stimulus: 'base_aerobica', doseContext });
  input.exposureContext.report.disciplina = 'carrera';
  const c = load('allowedTrainingContract').buildAllowedTrainingContract(input).contract;
  const p = completeDoseFixture(c, { stimulusId: c.stimulusId, structureId: 'continuo_carrera', blocks: ['warmup', 'main'].map(blockType => ({ blockType, movements: [{ movementId: 'rodaje_z2', prescription: {} }] })) });
  return { c, p };
}
const validate = load('structuredSession').validateSessionAgainstTrainingContract;
const diagnostic = load('builderDiagnostics').sufficiencyFailure;

test('synthetic Saturday: complete dose fails measurement sufficiency; exact signal survives SAFE trace', async () => {
  const { c, p } = fixture();
  p.blocks[1].movements[0].prescription.intensity = { kind: 'reference', referenceId: 'running:z2' };
  const original = JSON.stringify({ c, p });
  const checked = validate(c, p);
  assert.deepEqual(plain(checked.violations), ['PRESCRIPTION_DATA_MISSING:capability.canMeasureHeartRate']);
  const prompts = [];
  const r = await load('sessionGeneration').generateContractSession(c, [], async prompt => { prompts.push(prompt); return JSON.stringify(p); }, '', undefined, 'human_v2');
  assert.equal(r.ok, false); assert.equal(r.session, undefined); assert.equal(prompts.length, 2);
  assert.match(prompts[1], /PRESCRIPTION_DATA_MISSING:capability.canMeasureHeartRate/);
  assert.doesNotMatch(prompts[1], /PRESCRIPTION_DATA_REPAIR/); // no prompt or retry-policy change
  const d = r.diagnostics.attempts[0].failures[0];
  assert.equal(d.FAILED_FIELD, 'doseContext.sufficiency.signals.capability.canMeasureHeartRate.state');
  assert.equal(d.EXPECTED_KIND, 'available_signal'); assert.equal(d.RECEIVED_TYPE_SAFE_SUMMARY, 'state_unknown');
  assert.equal(d.PROPOSAL_PATH, 'blocks[1].movements[0].prescription');
  assert.equal(JSON.stringify({ c, p }), original);
  const flat = logs.filter(([tag]) => tag === 'SESSION_PRESCRIPTION_DATA_MISSING_DETAIL');
  assert.equal(flat.length, 2); assert.equal(JSON.parse(flat[0][1]).MISSING_CATEGORY, 'capability');
  assert.doesNotMatch(JSON.stringify(flat), /130|145|perfil|prompt|rodaje_z2/);
});

for (const state of ['unknown', 'unavailable', 'ambiguous']) test(`real signal state ${state} is explicit; observer failure cannot admit`, () => {
  const { c, p } = fixture();
  c.doseContext.sufficiency.signals['capability.canMeasureHeartRate'].state = state;
  p.blocks[1].movements[0].prescription.intensity = { kind: 'reference', referenceId: 'running:z2' };
  const details = [];
  const a = validate(c, p, undefined, (...args) => details.push(diagnostic(...args)));
  const b = validate(c, p, undefined, () => { throw Error('observer failure'); });
  assert.deepEqual(plain(a), plain(b)); assert.equal(a.ok, false);
  assert.equal(details[0].RECEIVED_TYPE_SAFE_SUMMARY, `state_${state}`);
});

test('all adapter branches: authorization, equipment, skill, references, capabilities and distance', () => {
  const { c } = fixture(), resolve = load('prescriptionDataSufficiency').resolvePrescriptionDataSufficiency;
  const cases = [
    [{ movementId: 'not_a_movement', discipline: 'carrera' }, 'movement.authorized', 'unresolved_signal'],
    [{ movementId: 'back_squat', discipline: 'box' }, 'equipment.barra', 'equipment'],
    [{ movementId: 'handstand_push_up', discipline: 'box' }, 'skill.box.advanced', 'skill'],
    [{ movementId: 'back_squat', discipline: 'box', intensity: '1rm' }, 'reference.1rm:back_squat', 'reference'],
    [{ movementId: 'rodaje_z2', discipline: 'carrera', intensity: 'pace', referenceId: 'running:easyPace' }, 'reference.running:easyPace', 'reference'],
    [{ movementId: 'rodaje_z2', discipline: 'carrera', intensity: 'hr', referenceId: 'running:easyHr' }, 'reference.running:easyHr', 'reference'],
    [{ movementId: 'rodaje_z2', discipline: 'carrera', intensity: 'hr', referenceId: 'running:z2' }, 'capability.canMeasureHeartRate', 'capability'],
    [{ movementId: 'rodaje_z2', discipline: 'carrera', distance: true }, 'capability.canMeasureDistance', 'capability'],
  ];
  for (const [request, signal, category] of cases) {
    const r = resolve(c.doseContext.sufficiency, c.doseContext.references, request);
    const missing = r.missingSignals.find(s => s.signal === signal);
    assert.ok(missing, JSON.stringify({ request, r })); assert.equal(r.status, 'missing_required_data');
    const d = diagnostic(missing.signal, missing.state, 1, 0);
    assert.equal(d.MISSING_CATEGORY, category); assert.notEqual(d.FAILED_FIELD, 'unknown');
  }
});

test('distance proposal reaches sufficiency; absent reference and invalid dose fail earlier, not as data sufficiency', () => {
  const { c, p } = fixture(), dose = p.blocks[1].movements[0].prescription;
  delete dose.durationSeconds; dose.distanceMeters = 1000;
  assert.ok(validate(c, p).violations.includes('PRESCRIPTION_DATA_MISSING:capability.canMeasureDistance'));
  delete dose.distanceMeters; dose.durationSeconds = 600;
  dose.intensity = { kind: 'reference', referenceId: 'running:easyHr' };
  assert.ok(validate(c, p).violations.some(v => v.startsWith('BENCHMARK_RESOLUTION:')));
  for (const value of [undefined, null, 'private-value']) {
    if (value === undefined) delete dose.durationSeconds; else dose.durationSeconds = value;
    const r = validate(c, p); assert.equal(r.ok, false);
    assert.ok(r.violations.every(v => !v.startsWith('PRESCRIPTION_DATA_MISSING')));
  }
});

test('logger failure, caps and malicious suffixes cannot leak or change outcomes', async () => {
  const trace = load('builderDiagnostics').builderTrace({ targetWeekStart: '2026-08-31', targetDay: 'sabado' });
  const detail = diagnostic('reference.private-secret', 'private-secret', 1, 0);
  trace.emit(1, 'data_sufficiency', 'SESSION_CONTRACT_INVALID', ['PRESCRIPTION_DATA_MISSING:private-secret'], true, 'contract_rule_retry', Array(40).fill(detail));
  const event = trace.summary().attempts[0]; assert.equal(event.failures.length, 32); assert.equal(event.failureTotalCount, 40); assert.equal(event.failuresTruncated, true);
  assert.doesNotMatch(JSON.stringify(event), /private-secret/);
  const { c, p } = fixture(); p.blocks[1].movements[0].prescription.intensity = { kind: 'reference', referenceId: 'running:z2' };
  const throwing = sportsRuntime({ console: { info() { throw Error('private logger error'); } } });
  const r = await throwing('sessionGeneration').generateContractSession(c, [], async () => JSON.stringify(p));
  assert.equal(r.ok, false); assert.equal(r.code, 'SESSION_CONTRACT_INVALID'); assert.equal(r.diagnostics.attemptCount, 2);
});

test('synthetic controls remain valid, renderer and all contract facts invariant', () => {
  for (const day of ['miercoles', 'jueves', 'viernes', 'sabado']) {
    const { c, p } = fixture(); c.targetDay = day; const before = JSON.stringify({ c, p });
    assert.equal(validate(c, p).ok, true);
    const render = load('structuredSession').renderContractSession;
    const legacy = render(c, p), human = render(c, p, 'human_v2');
    const { presentation, ...sports } = human.structuredPrescription;
    assert.equal(presentation.version, 'human_v2'); assert.deepEqual(plain(sports), plain(legacy.structuredPrescription));
    assert.equal(JSON.stringify({ c, p }), before);
  }
});

import nodeTest from 'node:test';
const test = (name, fn) => nodeTest('frozen rejected v1 compatibility: ' + name, fn);
import assert from 'node:assert/strict';
import { sportsRuntime, plain, contractFixture, equippedProfileFixture, fakeDatabase } from './trainingContractTestRuntime.mjs';
// This isolated runtime explicitly emulates LOCAL historical v1 issuance. Production issues v2.
const historical = sportsRuntime();
const v1 = historical('runningMethodDoseAuthorityV1');
const load = sportsRuntime({ console: { info() {}, log() {} } }, (path, exports) => path.endsWith('runningMethodDoseAuthority.ts')
  ? { ...exports, resolveCompatibleRunningDoseEvidence: v1.selectRunningDoseBasis, resolveRunningMethodDose: v1.resolveRunningMethodDose } : exports);
const api = load('runningMethodDoseAuthorityV1');
const baseline = load('../athlete/runningDoseBaseline').resolveRunningDoseBaseline;
const admit = load('runningDoseEvidenceAuthority').admitRunningDoseEvidence;
const actual = (metric = 'durationSeconds', value = 20000, identity = 'activity:fixture') => ({
  source: 'verified_execution', reliability: 'verified_actual', kind: 'EXECUTED', metric, value, identity, date: '2026-09-09' });
const declared = (value = 30000) => ({ source: 'profile_declaration', reliability: 'direct_declaration', kind: 'DECLARED',
  metric: 'declaredWeeklyDistanceMeters', value, identity: null, date: null, sourcePath: 'usuarios.perfil.km_semana' });
const exposure = { ...actual('occurrence', 1), source: 'weekly_plan', reliability: 'completion_flag' };
const admission = facts => admit(baseline('2026-09-09', facts));
function intent(methodId) {
  const m = load('goalTransferModel').transferMethod(methodId);
  return { kind: 'adaptation', methodId, adaptationId: m.adaptationId, goalId: methodId === 'running_vo2' ? '10k' : 'half_marathon',
    role: methodId === 'running_recovery' ? 'MAINTENANCE' : methodId === 'running_economy' ? 'SUPPORTING' : 'PRIMARY',
    blockPhase: methodId === 'running_recovery' ? 'deload' : 'intensification', blockWeek: 1, pattern: 'run', weaknessId: null };
}
const resolve = (methodId = 'running_base', facts = [actual()]) => api.resolveRunningMethodDose(api.selectRunningDoseBasis(admission(facts)), intent(methodId));
function fixture(methodId = 'running_base', facts = [actual()], budget = '90 min') {
  const i = intent(methodId), profile = { especialidad: 'carrera', objetivo_principal: i.goalId,
    perfil: { ...equippedProfileFixture(), duracion: budget } };
  const context = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile(profile);
  const input = contractFixture({ discipline: 'carrera', stimulus: load('goalTransferModel').transferMethod(methodId).stimulusId,
    intent: i, doseContext: load('sessionDoseContext').buildSessionDoseContext(context, i, null, [], true) });
  input.exposureContext.report.disciplina = 'carrera';
  const built = load('allowedTrainingContract').buildAllowedTrainingContract(input);
  assert.equal(built.ok, true, JSON.stringify(built));
  const c = built.contract; c.intensityAuthority = load('methodIntensityAuthority').resolveMethodIntensity(c);
  c.runningMethodDose = resolve(methodId, facts);
  return c;
}
function proposal(c, variant) {
  const d = c.runningMethodDose.dose;
  const structureId = variant ?? d.structures[0];
  const intervals = structureId === 'intervalos_carrera' || d.metric === 'repetitions';
  const n = intervals ? d.interval.minimumSets : 1;
  const movementId = c.allowedMovementIds.find(id => load('movementLibrary').MOVEMENT_LIBRARY[id].movement_pattern === 'run');
  const intensity = c.intensityAuthority.targets?.find(t => t.movementId === movementId)?.primary ?? { kind: 'rpe', value: 2 };
  return { schemaVersion: 2, stimulusId: c.stimulusId, structureId, blocks: ['warmup', 'main', 'cooldown'].map(blockType => ({ blockType,
    movements: [{ movementId, prescription: blockType === 'main'
      ? { [d.unit === 'meters' ? 'distanceMeters' : 'durationSeconds']: d.boutSeconds ? d.boutSeconds.minimum : d.maximumAuthorized / n,
        ...(intervals ? { sets: n, restSeconds: d.interval.minimumRestSeconds } : {}), intensity }
      : { durationSeconds: 300, intensity: { kind: 'rpe', value: 2 } } }] })) };
}
const validate = load('structuredSession').validateSessionAgainstTrainingContract;
for (const [label, facts, status] of [['A UNKNOWN', [], 'UNRESOLVED'], ['B DECLARED', [declared()], 'RESOLVED'],
  ['C OBSERVED', [actual()], 'RESOLVED'], ['D EXPOSURE_ONLY', [exposure], 'UNRESOLVED'],
  ['E CONFLICT', [actual(), actual('durationSeconds', 10000)], 'CONFLICT']]) {
  test(label + ' base', () => assert.equal(resolve('running_base', facts).status, status));
}
test('F recovery is half base in both units with identical evidence', () => {
  for (const facts of [[actual()], [declared()]]) assert.equal(resolve('running_recovery', facts).dose.maximumAuthorized, resolve('running_base', facts).dose.maximumAuthorized / 2);
});
for (const [label, structureId] of [['H continuous', 'tempo_continuo'], ['I intervals', 'intervalos_carrera']]) test(`G/${label} threshold total WORK bounded separately from session time`, () => {
  const c = fixture('running_threshold'), p = proposal(c, structureId);
  assert.equal(validate(c, p).ok, true, JSON.stringify(validate(c, p)));
  p.blocks[1].movements[0].prescription.durationSeconds = 3600;
  assert.ok(validate(c, p).violations.includes('RUNNING_METHOD_DOSE_EXCEEDS_AUTHORITY'));
});
test('J VO2 bounds total work, bouts, repetitions and recovery', () => {
  const c = fixture('running_vo2'), p = proposal(c);
  assert.equal(validate(c, p).ok, true, JSON.stringify(validate(c, p)));
  p.blocks[1].movements[0].prescription.sets = 10;
  assert.ok(validate(c, p).violations.includes('RUNNING_METHOD_DOSE_REPETITIONS_OUTSIDE_AUTHORITY'));
  assert.ok(validate(c, p).violations.includes('RUNNING_METHOD_DOSE_EXCEEDS_AUTHORITY'));
});
test('K HM specific bounded; race distance is never copied as dose', () => {
  assert.equal(resolve('running_specific', [declared()]).dose.maximumAuthorized, 3000);
  const c = fixture('running_specific'); assert.equal(validate(c, proposal(c)).ok, true);
});
test('L economy is repetitions of short timed bouts, not long continuous work', () => {
  const c = fixture('running_economy'), p = proposal(c);
  assert.equal(c.runningMethodDose.dose.metric, 'repetitions');
  assert.equal(validate(c, p).ok, true, JSON.stringify(validate(c, p)));
  p.blocks[1].movements[0].prescription.durationSeconds = 600;
  assert.ok(validate(c, p).violations.includes('RUNNING_METHOD_DOSE_BOUT_EXCEEDED'));
});
test('M 60/90/120 availability invariance, time validator still rejects insufficient time', () => {
  for (const { methodId } of load('runningMethodDosePoliciesV1').RUNNING_METHOD_DOSE_POLICIES) {
    const contracts = ['60 min', '90 min', '120 min'].map(time => fixture(methodId, [actual()], time));
    assert.deepEqual(plain(contracts[0].runningMethodDose), plain(contracts[1].runningMethodDose));
    assert.deepEqual(plain(contracts[1].runningMethodDose), plain(contracts[2].runningMethodDose));
    contracts.forEach(c => assert.equal(validate(c, proposal(c)).ok, true, methodId));
  }
  const small = fixture('running_base', [actual()], '10 min');
  assert.deepEqual(plain(small.runningMethodDose), plain(fixture().runningMethodDose));
  assert.ok(validate(small, proposal(small)).violations.includes('SESSION_BUDGET_EXCEEDED'));
});
test('N/O/P/AC/AD level, readiness, restrictions, raw profile and Analyzer are not policy inputs', () => {
  const a = plain(admission([declared()]));
  const expected = api.resolveRunningMethodDose(api.selectRunningDoseBasis(a), intent('running_base'));
  for (const level of ['beginner', 'intermediate', 'advanced']) {
    const b = { ...a, perfil: { nivel: level, duracion: 7200 }, readiness: level, restrictions: [level], volumen_relativo: 0.9, serverProfile: { target: 3600 } };
    assert.deepEqual(plain(api.resolveRunningMethodDose(api.selectRunningDoseBasis(b), intent('running_base'))), plain(expected));
  }
});
test('Q/R declared scalar/range lower bound only; no midpoint', () => {
  assert.deepEqual(plain(resolve('running_base', [declared()]).dose), plain(resolve('running_base', [declared({ min: 30000, max: 35000 })]).dose));
});
test('S/T partial observed duration/distance retain units; no pace conversion', () => {
  assert.equal(resolve('running_base', [actual()]).dose.unit, 'seconds');
  assert.equal(resolve('running_base', [actual('distanceMeters', 20000)]).dose.unit, 'meters');
});
test('U/V observed or exposure with declared evidence never averaged', () => {
  assert.equal(resolve('running_base', [actual(), declared()]).basis.basisClass, 'OBSERVED');
  assert.equal(resolve('running_base', [exposure, declared()]).basis.basisClass, 'DECLARED');
});
test('W unknown/exposure/conflict block provider, no arbitrary dose fallback', async () => {
  for (const facts of [[], [exposure], [actual(), actual('durationSeconds', 10000), declared()]]) {
    const c = fixture('running_base', facts); let called = 0;
    const result = await load('sessionGeneration').generateContractSession(c, [], async () => { called++; return ''; });
    assert.equal(result.ok, false); assert.equal(called, 0);
  }
});
test('X/Y/Z quantitative target envelope; below target rejected, no invented physiological minimum', () => {
  const c = fixture(), p = proposal(c); assert.equal(validate(c, p).ok, true);
  assert.equal(c.runningMethodDose.dose.minimumUseful, null);
  p.blocks[1].movements[0].prescription.durationSeconds = 1;
  assert.ok(validate(c, p).violations.includes('RUNNING_METHOD_DOSE_UNDER_TARGET'));
  p.blocks[1].movements[0].prescription.durationSeconds = 3600;
  assert.ok(validate(c, p).violations.includes('RUNNING_METHOD_DOSE_EXCEEDS_AUTHORITY'));
});
test('AA retry retains exact authority and supplies deterministic violation', async () => {
  const c = fixture(), good = proposal(c), bad = structuredClone(good); bad.blocks[1].movements[0].prescription.durationSeconds = 3600;
  const prompts = [];
  const result = await load('sessionGeneration').generateContractSession(c, [], async prompt => {
    prompts.push(prompt); return JSON.stringify(prompts.length === 1 ? bad : good);
  });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(prompts.length, 2);
  assert.ok(prompts[1].includes('RUNNING_METHOD_DOSE_EXCEEDS_AUTHORITY'));
  const authority = prompt => JSON.parse(prompt.split('CONTRACT:\n')[1].split('\n')[0]).runningMethodDose;
  assert.deepEqual(authority(prompts[0]), authority(prompts[1]));
});
test('AB deterministic authority rejects tampering; unrelated planned evidence cannot change refs/digest', () => {
  const a = admission([declared()]), b = admission([declared(), { ...exposure, kind: 'PLANNED_ONLY' }]);
  assert.deepEqual(plain(api.selectRunningDoseBasis(a)), plain(api.selectRunningDoseBasis(b)));
  const c = fixture(); assert.equal(api.validRunningMethodDose(c), true);
  c.runningMethodDose.dose.maximumAuthorized += 1; assert.equal(api.validRunningMethodDose(c), false);
});
test('AE incident: declared HM, no actual quantities, 90min never authorizes 3600s across methods', () => {
  for (const method of ['running_base', 'running_threshold', 'running_specific']) {
    const c = fixture(method, [declared()]); const p = proposal(c, method === 'running_threshold' ? 'tempo_continuo' : undefined);
    for (const b of p.blocks) b.movements[0].prescription = { durationSeconds: b.blockType === 'main' ? 3600 : 600,
      intensity: b.blockType === 'main' ? c.intensityAuthority.targets.find(t => t.movementId === b.movements[0].movementId).primary : { kind: 'rpe', value: 2 } };
    assert.equal(c.doseContext.timeBudget.maximumSeconds, 5400);
    assert.ok(validate(c, p).violations.includes('RUNNING_METHOD_DOSE_METRIC_MISMATCH'));
  }
});
test('distance/RPE without reference still fails finite-time feasibility; no invented pace', () => {
  const c = fixture('running_base', [declared()]);
  assert.ok(validate(c, proposal(c)).violations.includes('SESSION_DURATION_ESTIMATE:UNBOUNDED_WITH_FINITE_BUDGET'));
});
test('preparation cannot conceal extra dose', () => {
  const c = fixture(), p = proposal(c); p.blocks[0].movements[0].prescription.durationSeconds = 3600;
  assert.ok(validate(c, p).violations.includes('RUNNING_METHOD_DOSE_PREPARATION_EXCEEDED'));
});
test('real server signs admitted declared-distance dose, verifies receipt and refreshes evidence', async () => {
  const profile = { modo_entrada: 'planificacion', categoria: 'carrera', especialidad: 'carrera', objetivo_principal: 'half_marathon',
    perfil: { ...equippedProfileFixture(), duracion: '90 min', km_semana: 30, ritmo_z2: '5:00 min/km' } };
  const db = fakeDatabase({ usuarios: profile, weekly_plan: [] });
  const server = load('sessionAuthority');
  const request = { targetWeekStart: '2026-09-07', day: 'miercoles', discipline: 'carrera', stimulus: 'base_aerobica', intent: intent('running_base') };
  const result = await server.generateTrainingSession(db, 'fixture', request, async prompt => {
    const c = JSON.parse(prompt.split('CONTRACT:\n')[1].split('\n')[0]); return JSON.stringify(proposal(c));
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(server.verifySessionReceipt(result.sesion.sessionReceipt, result.sesion, 'fixture', request.targetWeekStart).structuredPrescription.runningMethodDose.status, 'RESOLVED');
  await server.assertFreshSessionRestrictions(db, 'fixture', request.targetWeekStart, result.sesion);
  profile.perfil.km_semana = 40;
  await assert.rejects(() => server.assertFreshSessionRestrictions(db, 'fixture', request.targetWeekStart, result.sesion), /CONTEXT_CHANGED_REGENERATE/);
});
test('current server issuance cannot delegate an UNKNOWN Running basis to the provider', async () => {
  const db = fakeDatabase({ usuarios: { modo_entrada: 'planificacion', especialidad: 'carrera', categoria: 'carrera',
    objetivo_principal: 'half_marathon', perfil: { ...equippedProfileFixture(), duracion: '90 min', nivel: 'Intermedio' } }, weekly_plan: [] });
  let calls = 0;
  const result = await load('sessionAuthority').generateTrainingSession(db, 'fixture', { targetWeekStart: '2026-09-07', day: 'miercoles',
    discipline: 'carrera', stimulus: 'base_aerobica', intent: intent('running_base') }, async () => { calls++; return ''; });
  assert.equal(result.code, 'RUNNING_METHOD_DOSE_UNRESOLVED'); assert.equal(calls, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sportsRuntime, plain, contractFixture, equippedProfileFixture, fakeDatabase } from './trainingContractTestRuntime.mjs';
import { runningDoseTestRuntime, testDoseProposal, testSelection } from './runningDoseV2TestFixture.mjs';
const production = sportsRuntime({ console: { info() {}, log() {} } });
const methods = production('runningMethodDosePolicies').RUNNING_METHOD_DOSE_POLICIES.map(p => p.methodId);
const actual = (value = 5400, metric = 'durationSeconds', identity = 'fixture:activity') => ({ source: 'verified_execution',
  reliability: 'verified_actual', kind: 'EXECUTED', metric, value, identity, date: '2026-09-09' });
const declared = (value = 30000) => ({ source: 'profile_declaration', reliability: 'direct_declaration', kind: 'DECLARED',
  metric: 'declaredWeeklyDistanceMeters', value, identity: null, date: null, sourcePath: 'usuarios.perfil.km_semana' });
const exposure = { ...actual(1, 'occurrence'), source: 'weekly_plan', reliability: 'completion_flag', plannedMethodId: 'running_threshold' };
const admission = facts => production('runningDoseEvidenceAuthority').admitRunningDoseEvidence(
  production('../athlete/runningDoseBaseline').resolveRunningDoseBaseline('2026-09-09', facts));
function intent(method = 'running_base', extra = {}) {
  return { kind: 'adaptation', methodId: method, adaptationId: production('goalTransferModel').transferMethod(method).adaptationId,
    goalId: method === 'running_vo2' ? '10k' : 'half_marathon', pattern: 'run',
    role: method === 'running_recovery' ? 'MAINTENANCE' : method === 'running_economy' ? 'SUPPORTING' : 'PRIMARY',
    blockPhase: method === 'running_recovery' ? 'deload' : 'intensification', blockWeek: 1, weaknessId: null, ...extra };
}
function resolve(method, facts = [], load = production, extra = {}) {
  const api = load('runningMethodDoseAuthority'), i = intent(method, extra);
  return api.resolveRunningMethodDose(api.resolveCompatibleRunningDoseEvidence(admission(facts), i), i);
}
function fixture(load = production, method = 'running_base', facts = [declared()], minutes = 90) {
  const i = intent(method), context = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({
    especialidad: 'carrera', objetivo_principal: i.goalId, perfil: { ...equippedProfileFixture(), duracion: `${minutes} min` } });
  const input = contractFixture({ discipline: 'carrera',
    stimulus: load('goalTransferModel').transferMethod(method).stimulusId, intent: i,
    doseContext: load('sessionDoseContext').buildSessionDoseContext(context, i, null, [], true) });
  input.exposureContext.report.disciplina = 'carrera';
  const built = load('allowedTrainingContract').buildAllowedTrainingContract(input);
  assert.equal(built.ok, true, JSON.stringify(built));
  const c = built.contract; c.intensityAuthority = load('methodIntensityAuthority').resolveMethodIntensity(c);
  c.runningMethodDose = resolve(method, facts, load); return c;
}

test('A-D v2 registry has seven distinct families and no shares or universal minima', () => {
  const registry = production('runningMethodDosePolicies').RUNNING_METHOD_DOSE_POLICIES;
  assert.equal(new Set(registry.map(p => p.family)).size, 7);
  for (const p of registry) { assert.equal(p.version, 2); if(p.methodId==='running_base'){assert.equal(typeof p.selectDose,'function');assert.equal(p.policyId,'running_base_declared_habitual_duration_v1');}
    else if(['running_specific','running_economy'].includes(p.methodId)){assert.equal(p.selectDose,null);assert.match(p.policyId,/_v2$/);}
    else {assert.equal(typeof p.selectDose,'function');assert.match(p.policyId,/_reuse_v1$/);} }
  const code = readFileSync('lib/sports/runningMethodDosePolicies.ts', 'utf8');
  for (const number of ['0.12', '0.06', '0.04', '0.03', '0.10', '0.8', '1800', '5000', '900', '2500', '600', '2000', '480', '1600', '1500', '4000']) assert.ok(!code.includes(number));
});
for (const method of methods) test(`E/G-K ${method}: weekly declaration and generic quantities never select dose`, () => {
  for (const facts of [[declared()], [actual()], [actual(30000, 'distanceMeters')], [declared(), actual()]]) {
    const a = resolve(method, facts);
    assert.equal(a.version, 2); assert.equal(a.status, 'UNRESOLVED'); assert.equal(a.dose, null);
    assert.equal(a.reason, method === 'running_economy' ? 'POLICY_NOT_ESTABLISHED' : ['running_base','running_specific'].includes(method) ? 'MISSING_COMPATIBLE_EVIDENCE' : 'RECENT_METHOD_EXECUTION_REQUIRED');
  }
});
test('F unit-switch regression: partial duration coexists with habitual declaration across all methods', () => {
  for (const method of methods) {
    const before = resolve(method, [declared({ min: 30000, max: 35000 })]);
    const after = resolve(method, [declared({ min: 30000, max: 35000 }), actual(), { ...exposure, identity: 'fixture:other' }]);
    assert.deepEqual(plain(after.evidence.habitualDeclaredVolume), plain(before.evidence.habitualDeclaredVolume));
    assert.equal(after.evidence.observedWindows['7'].duration.status, 'PARTIAL');
    assert.equal(after.evidence.observedActivities[0].value, 5400); assert.equal(after.dose, null);
  }
});
test('L-N 90min stays an observed activity, not 648s base or threshold/VO2/specific work', () => {
  for (const method of methods) {
    const a = resolve(method, [{ ...actual(), plannedMethodId: method, title: 'easy threshold VO2 long', description: 'run' }]);
    assert.equal(a.evidence.observedActivities[0].value, 5400);
    assert.equal(a.evidence.observedActivities[0].methodIdentity, 'UNKNOWN');
    assert.equal(a.evidence.longestObservedRun.duration.value, 5400);
    assert.equal(a.evidence.compatibleMethodQuantities.status, 'UNKNOWN'); assert.equal(a.dose, null);
    assert.ok(!JSON.stringify(a).includes('easy threshold'));
  }
});
test('O/P exposure-only and unknown stay non-quantitative; plan association is never executed work', () => {
  const a = resolve('running_threshold', [exposure]);
  assert.equal(a.evidence.status, 'EXPOSURE_ONLY'); assert.equal(a.evidence.observedActivities.length, 0);
  assert.equal(a.evidence.plannedMethodAssociations[0].quantityKnown, false); assert.equal(a.dose, null);
  assert.equal(resolve('running_base').evidence.status, 'UNKNOWN');
});
test('Q conflict cannot be masked by declaration or a test numeric policy', () => {
  for (const load of [production, runningDoseTestRuntime()]) for (const method of methods)
    assert.equal(resolve(method, [actual(), actual(1000), declared()], load).status, 'CONFLICT');
});
test('R availability ceiling does not change v2 authority at 60/90/120', () => {
  for (const method of methods) {
    const values = [60, 90, 120].map(m => plain(fixture(production, method, [declared()], m).runningMethodDose));
    assert.deepEqual(values[0], values[1]); assert.deepEqual(values[1], values[2]);
  }
});
test('S-U irrelevant level/readiness/restrictions/Analyzer/raw payload do not mutate compatible evidence', () => {
  const a = plain(admission([declared(), actual()])), before = structuredClone(a), api = production('runningMethodDoseAuthority');
  for (const level of ['beginner', 'intermediate', 'advanced']) {
    const contaminated = { ...a, perfil: { nivel: level }, readiness: 100, restrictions: ['text'], volumen_relativo: 99 };
    assert.deepEqual(plain(api.resolveCompatibleRunningDoseEvidence(contaminated, intent())), plain(api.resolveCompatibleRunningDoseEvidence(a, intent())));
  }
  assert.deepEqual(a, before);
});
test('V/W unresolved and conflict fail before provider for all six methods', async () => {
  for (const method of methods) for (const facts of [[declared()], [], [actual(), actual(1000)]]) {
    let calls = 0; const c = fixture(production, method, facts);
    const result = await production('sessionGeneration').generateContractSession(c, [], async () => { calls++; return ''; });
    assert.equal(calls, 0); assert.equal(result.ok, false); assert.match(result.code, /^RUNNING_METHOD_DOSE_(UNRESOLVED|CONFLICT)$/);
  }
});
test('event variants and economy run/jump are explicit; volume does not gate technical exposure', () => {
  assert.notEqual(resolve('running_specific', [], production, { goalId: '10k' }).policy.variant,
    resolve('running_specific', [], production).policy.variant);
  for (const pattern of ['run', 'jump']) for (const facts of [[], [declared()]]) {
    const a = resolve('running_economy', facts, production, { pattern });
    assert.equal(a.policy.variant, pattern); assert.equal(a.reason, 'POLICY_NOT_ESTABLISHED');
  }
});
test('digest stable across planned rows/order; tampered v2 RESOLVED target is rejected', () => {
  const before = resolve('running_base', [declared(), actual()]);
  const after = resolve('running_base', [actual(), { ...exposure, kind: 'PLANNED_ONLY' }, declared()]);
  assert.deepEqual(plain(before), plain(after));
  const c = fixture(); c.runningMethodDose.status = 'RESOLVED'; c.runningMethodDose.dose = testSelection('running_base');
  assert.equal(production('runningMethodDoseAuthority').validRunningMethodDose(c), false);
});
test('no target cannot resolve even if an isolated policy supplies a maximum', () => {
  const load = sportsRuntime({}, (path, exports) => path.endsWith('runningMethodDosePolicies.ts') ? { ...exports,
    RUNNING_METHOD_DOSE_POLICIES: exports.RUNNING_METHOD_DOSE_POLICIES.map(p => ({ ...p, policyId:'test_'+p.policyId,
      selectDose: () => ({ ...testSelection(p.methodId), selectedTarget: null }) })) } : exports);
  assert.equal(resolve('running_base', [declared()], load).reason, 'SELECTED_TARGET_NOT_ESTABLISHED');
});
for (const method of methods) test(`test-only v2 ${method} target, unit, structure and envelope enforcement`, () => {
  const load = runningDoseTestRuntime(), c = fixture(load, method), good = testDoseProposal(load, c);
  const validate = p => load('structuredSession').validateSessionAgainstTrainingContract(c, p);
  assert.equal(validate(good).ok, true, JSON.stringify(validate(good)));
  const bad = structuredClone(good); bad.blocks[1].movements[0].prescription.durationSeconds = 9000;
  assert.equal(validate(bad).ok, false);
  const unit = structuredClone(good); delete unit.blocks[1].movements[0].prescription.durationSeconds;
  unit.blocks[1].movements[0].prescription.distanceMeters = 100;
  assert.ok(validate(unit).violations.includes('RUNNING_METHOD_DOSE_METRIC_MISMATCH'));
  const structure = structuredClone(good); structure.structureId = 'unapproved';
  assert.ok(load('runningMethodDoseAuthority').validateRunningMethodDose(c, structure).includes('RUNNING_METHOD_DOSE_STRUCTURE_MISMATCH'));
});
test('X v2 retries preserve exact contract, bounded to two; test policies only', async () => {
  const load = runningDoseTestRuntime(), c = fixture(load), good = testDoseProposal(load, c), bad = structuredClone(good);
  bad.blocks[1].movements[0].prescription.durationSeconds = 9000;
  const prompts = [];
  const result = await load('sessionGeneration').generateContractSession(c, [], async p => { prompts.push(p); return JSON.stringify(prompts.length === 1 ? bad : good); });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(prompts.length, 2);
  const contract = p => JSON.parse(p.split('CONTRACT:\n')[1].split('\n')[0]);
  assert.deepEqual(contract(prompts[0]), contract(prompts[1])); assert.equal(contract(prompts[0]).runningMethodDose.version, 2);
  let attempts = 0;
  const failed = await load('sessionGeneration').generateContractSession(c, [], async () => { attempts++; return JSON.stringify(bad); });
  assert.equal(failed.ok, false); assert.equal(attempts, 2);
});
test('preparation fails closed without composition policy; cannot relabel main work', () => {
  const load = runningDoseTestRuntime(), c = fixture(load), p = testDoseProposal(load, c);
  assert.deepEqual(plain(production('runningPreparationAuthority').validateRunningPreparation(p)), ['RUNNING_METHOD_DOSE_PREPARATION_POLICY_NOT_ESTABLISHED']);
  p.blocks[0].movements[0].prescription.durationSeconds = 9000;
  assert.ok(load('runningMethodDoseAuthority').validateRunningMethodDose(c, p).includes('RUNNING_METHOD_DOSE_PREPARATION_POLICY_NOT_ESTABLISHED'));
});
test('v2 independent target/minimum/maximum and Time Authority (test policies only)', () => {
  const load = runningDoseTestRuntime(), c = fixture(load), p = testDoseProposal(load, c);
  assert.equal(c.runningMethodDose.dose.minimumUseful, null);
  assert.notEqual(c.runningMethodDose.dose.selectedTarget.maximum, c.runningMethodDose.dose.maximumAuthorized);
  p.blocks[1].movements[0].prescription.durationSeconds = 100;
  assert.ok(load('runningMethodDoseAuthority').validateRunningMethodDose(c, p).includes('RUNNING_METHOD_DOSE_OUTSIDE_SELECTED_TARGET'));
  const small = fixture(load, 'running_base', [declared()], 1);
  assert.deepEqual(plain(small.runningMethodDose), plain(c.runningMethodDose));
  assert.ok(load('structuredSession').validateSessionAgainstTrainingContract(small, testDoseProposal(load, small)).violations.includes('SESSION_BUDGET_EXCEEDED'));
});
test('Z real server allows coach composition with declared context without inventing pace or a target', async () => {
  let issued, calls = 0;
  const load = sportsRuntime({}, (path, exports) => path.endsWith('runningMethodDoseAuthority.ts') ? { ...exports,
    resolveRunningMethodDose: (...args) => { issued = exports.resolveRunningMethodDose(...args); return issued; } } : exports);
  const db = fakeDatabase({ usuarios: { modo_entrada: 'planificacion', especialidad: 'carrera', categoria: 'carrera',
    objetivo_principal: 'half_marathon', perfil: { ...equippedProfileFixture(), km_semana: 30, duracion: '90 min' } }, weekly_plan: [] });
  const request = { targetWeekStart: '2026-09-07', day: 'miercoles', discipline: 'carrera', stimulus: 'base_aerobica', intent: intent() };
  const result = await load('sessionAuthority').generateTrainingSession(db, 'fixture', request, async () => { calls++; return ''; });
  assert.equal(result.code, 'SESSION_PROPOSAL_INVALID'); assert.equal(calls, 2);
  assert.equal(issued.decisionAuthority, 'coach');
  assert.equal(issued.version, 2); assert.equal(issued.dose, null); assert.equal(issued.evidence.habitualDeclaredVolume[0].minimumMeters, 30000);
});
test('v2 server signing, receipt tamper/freshness and evidence change (isolated accepted test policy)', async () => {
  const load = runningDoseTestRuntime(), server = load('sessionAuthority');
  const profile = { modo_entrada: 'planificacion', especialidad: 'carrera', categoria: 'carrera', objetivo_principal: 'half_marathon',
    perfil: { ...equippedProfileFixture(), km_semana: 30, duracion: '90 min' } };
  const db = fakeDatabase({ usuarios: profile, weekly_plan: [] });
  const request = { targetWeekStart: '2026-09-07', day: 'miercoles', discipline: 'carrera', stimulus: 'base_aerobica', intent: intent() };
  const result = await server.generateTrainingSession(db, 'fixture', request, async prompt =>
    JSON.stringify(testDoseProposal(load, JSON.parse(prompt.split('CONTRACT:\n')[1].split('\n')[0]))));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(server.verifySessionReceipt(result.sesion.sessionReceipt, result.sesion, 'fixture', request.targetWeekStart).structuredPrescription.runningMethodDose.version, 2);
  await server.assertFreshSessionRestrictions(db, 'fixture', request.targetWeekStart, result.sesion);
  const tampered = structuredClone(result.sesion); tampered.structuredPrescription.runningMethodDose.decisionAuthority = 'forged';
  assert.throws(() => server.verifySessionReceipt(tampered.sessionReceipt, tampered, 'fixture', request.targetWeekStart), /MISMATCH/);
  profile.perfil.km_semana = 40;
  await assert.rejects(() => server.assertFreshSessionRestrictions(db, 'fixture', request.targetWeekStart, result.sesion), /CONTEXT_CHANGED_REGENERATE/);
});

test('v2 test-policy interval effort, bout and recovery constraints are independently enforced', () => {
  const load = runningDoseTestRuntime(), c = fixture(load, 'running_threshold'), good = testDoseProposal(load, c);
  for (const [key, value, code] of [['sets', 4, 'REPETITIONS_OUTSIDE_AUTHORITY'],
    ['durationSeconds', 130, 'BOUT_EXCEEDED'], ['restSeconds', 1, 'RECOVERY_MISMATCH']]) {
    const p = structuredClone(good); p.blocks[1].movements[0].prescription[key] = value;
    assert.ok(load('runningMethodDoseAuthority').validateRunningMethodDose(c, p).includes('RUNNING_METHOD_DOSE_' + code));
  }
});

test('v2 selected minimumUseful/tolerance only enforced when a test policy explicitly defines them', () => {
  const load = sportsRuntime({}, (path, exports) => path.endsWith('runningMethodDosePolicies.ts') ? { ...exports,
    RUNNING_METHOD_DOSE_POLICIES: exports.RUNNING_METHOD_DOSE_POLICIES.map(p => ({ ...p, policyId:'test_'+p.policyId,
      selectDose: () => ({ ...testSelection(p.methodId), selectedTarget: { minimum: 500, maximum: 650 }, maximumAuthorized: 700,
        minimumUseful: 400, compositionTolerance: { minimum: 550, maximum: 620 } }) })) } : exports);
  const c = fixture(load), p = testDoseProposal(load, c);
  p.blocks[1].movements[0].prescription.durationSeconds = 300;
  const errors = load('runningMethodDoseAuthority').validateRunningMethodDose(c, p);
  assert.ok(errors.includes('RUNNING_METHOD_DOSE_BELOW_MINIMUM_USEFUL'));
  assert.ok(errors.includes('RUNNING_METHOD_DOSE_OUTSIDE_COMPOSITION_TOLERANCE'));
});

test('v2 distance authority does not manufacture pace or time (isolated policy)', () => {
  const load = sportsRuntime({}, (path, exports) => {
    if (path.endsWith('runningMethodDosePolicies.ts')) return { ...exports,
      RUNNING_METHOD_DOSE_POLICIES: exports.RUNNING_METHOD_DOSE_POLICIES.map(p => ({ ...p, policyId:'test_'+p.policyId,
        selectDose: () => ({ ...testSelection(p.methodId), metric: 'distance', unit: 'meters' }) })) };
    if (path.endsWith('runningPreparationAuthority.ts')) return { validateRunningPreparation: () => [] };
    return exports;
  });
  const c = fixture(load), p = testDoseProposal(load, c);
  assert.ok(load('structuredSession').validateSessionAgainstTrainingContract(c, p).violations.includes('SESSION_DURATION_ESTIMATE:UNBOUNDED_WITH_FINITE_BUDGET'));
});

test('role and phase stay bound context without a numerical multiplier', () => {
  for (const role of ['PRIMARY', 'SUPPORTING', 'MAINTENANCE', 'OPTIONAL'])
    for (const blockPhase of ['accumulation', 'intensification', 'realization', 'deload', 'unknown']) {
      const a = resolve('running_base', [declared()], production, { role, blockPhase });
      assert.equal(a.context.role, role); assert.equal(a.context.blockPhase, blockPhase); assert.equal(a.dose, null);
    }
});

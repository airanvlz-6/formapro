import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, contractFixture, plain } from './trainingContractTestRuntime.mjs';

// Test-only injection at the domain boundary. No runtime flag or production policy numbers.
const synthetic = { id: 'test-only', provenance: 'synthetic_v1', targetMinSeconds: 1200,
  targetMaxSeconds: 1800, minimumUsefulSeconds: 600, overTargetToleranceSeconds: 60 };
function runtime(policy, globals = {}) {
  let resolve;
  return sportsRuntime(globals, (path, module) => {
    if (path.endsWith('sessionTimeDoseAuthority.ts')) resolve = module.resolveSessionTimeDoseAuthority;
    if (path.endsWith('sessionTimeDosePolicy.ts') && policy) return { ...module,
      timeAuthorityForIntent: available => resolve(available, policy) };
    return module;
  });
}
function fixture(load, budget = '60 min') {
  const intent = { kind: 'stimulus_only' };
  const input = contractFixture({ discipline: 'carrera', stimulus: 'base_aerobica', intent });
  input.exposureContext.report.disciplina = 'carrera';
  const athlete = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({ perfil: { duracion: budget } });
  input.doseContext = load('sessionDoseContext').buildSessionDoseContext(athlete, intent);
  const built = load('allowedTrainingContract').buildAllowedTrainingContract(input);
  return { input, built, c: built.contract };
}
function proposal(c, seconds) {
  return { schemaVersion: 2, stimulusId: c.stimulusId, structureId: 'continuo_carrera', blocks: [
    { blockType: 'warmup', movements: [{ movementId: 'rodaje_z2', prescription: { durationSeconds: 120, intensity: { kind: 'rpe', value: 3 } } }] },
    { blockType: 'main', movements: [{ movementId: 'rodaje_z2', prescription: { durationSeconds: seconds, intensity: { kind: 'rpe', value: 4 } } }] },
  ] };
}
test('production methods all remain UNRESOLVED, no typical range becomes authority', () => {
  const load = runtime();
  for (const methodId of ['running_threshold', 'running_recovery', 'box_technique', 'box_support_strength', 'runner_support_strength']) {
    const a = load('sessionTimeDosePolicy').timeAuthorityForIntent({ minimumSeconds: null, maximumSeconds: 5400, source: null, status: 'resolved' }, { kind: 'adaptation', methodId });
    assert.equal(a.resolution, 'UNRESOLVED'); assert.equal(a.targetDuration, null);
    assert.equal(a.minimumUsefulDurationSeconds, null); assert.equal(a.hardMaximumSeconds, 5400);
  }
});
test('contract rejects infeasible availability and tampering before Builder', async () => {
  const load = runtime(synthetic);
  const short = fixture(load, '5 min');
  assert.equal(short.built.ok, false); assert.ok(short.built.errors.includes('SESSION_DOSE_TIME_INFEASIBLE'));
  const { c } = fixture(load); c.doseContext.timeAuthority.targetDuration.minimumSeconds = 1;
  let calls = 0;
  const result = await load('sessionGeneration').generateContractSession(c, [], async () => { calls++; return ''; });
  assert.equal(calls, 0); assert.equal(result.ok, false);
  assert.ok(result.violations.includes('SESSION_DOSE_AUTHORITY_MISMATCH'));
});
test('Builder receives immutable band, repairs underdose once, logs existing estimates', async () => {
  const logs = [], load = runtime(synthetic, { console: { info: (tag, value) => { if (tag === 'SESSION_DOSE_AUTHORITY') logs.push(JSON.parse(value)); } } });
  const { c } = fixture(load); const before = JSON.stringify(c); let calls = 0;
  const result = await load('sessionGeneration').generateContractSession(c, [], async prompt => {
    assert.match(prompt, /targetDuration/);
    if (calls) assert.match(prompt, /SESSION_DOSE_UNDERDOSED/);
    return JSON.stringify(proposal(c, calls++ ? 1200 : 60));
  });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(calls, 2);
  assert.equal(JSON.stringify(c), before); assert.equal(Object.isFrozen(result.contract.doseContext.timeAuthority), true);
  assert.equal(logs.length, 2); assert.equal(logs[0].result, 'SESSION_DOSE_UNDERDOSED');
  assert.equal(logs[1].estimatedExpectedSeconds, 1380);
});
test('over-target repair cannot exceed hard max and terminates after two attempts', async () => {
  const load = runtime(synthetic), { c } = fixture(load); let calls = 0;
  const result = await load('sessionGeneration').generateContractSession(c, [], async prompt => {
    if (calls) assert.match(prompt, /SESSION_DOSE_OVER_TARGET/);
    return JSON.stringify(proposal(c, calls++ ? 3600 : 2400));
  });
  assert.equal(result.ok, false); assert.equal(calls, 2);
  assert.ok(result.violations.includes('SESSION_BUDGET_EXCEEDED'));
});
test('short recovery policy is valid with 90 minutes; unknown support never auto-fills', () => {
  const load = runtime({ ...synthetic, targetMinSeconds: 240, targetMaxSeconds: 600, minimumUsefulSeconds: 180 });
  const { c } = fixture(load, '90 min');
  assert.equal(load('structuredSession').validateSessionAgainstTrainingContract(c, proposal(c, 240)).ok, true);
  const legacy = runtime(), support = fixture(legacy, '90 min').c;
  assert.equal(support.doseContext.timeAuthority.targetDuration, null);
  assert.equal(legacy('structuredSession').validateSessionAgainstTrainingContract(support, proposal(support, 240)).ok, true);
});
test('logging failure and observer failure never alter admission; flat allowlist excludes free text', async () => {
  const messages = [], load = runtime(undefined, { console: { info: (tag, value) => { if (tag === 'SESSION_DOSE_AUTHORITY') messages.push(value); } } });
  const { c } = fixture(load), p = proposal(c, 600);
  c.externalLoadContext.private = 'SECRET_PROFILE';
  const result = await load('sessionGeneration').generateContractSession(c, [], async () => JSON.stringify(p), 'SECRET_PROMPT', 'SECRET_TOKEN');
  assert.equal(result.ok, true); assert.equal(messages.length, 1);
  assert.doesNotMatch(messages[0], /SECRET|perfil|prompt|token|references|source/);
  const record = JSON.parse(messages[0]); assert.equal(record.planningRunId, null);
  assert.ok(Object.values(record).every(v => v === null || typeof v !== 'object'));
  const failing = runtime(undefined, { console: { info() { throw Error('logger'); } } });
  const fc = fixture(failing).c;
  assert.equal((await failing('sessionGeneration').generateContractSession(fc, [], async () => JSON.stringify(proposal(fc, 600)))).ok, true);
  assert.deepEqual(plain(load('structuredSession').validateSessionAgainstTrainingContract(c, p, () => { throw Error('observer'); })),
    plain(load('structuredSession').validateSessionAgainstTrainingContract(c, p)));
});
test('new estimates include operational midpoint; legacy receipt estimate shape is preserved', () => {
  const load = runtime(), { c } = fixture(load), p = proposal(c, 600);
  const estimate = load('sessionDose').estimateSessionDuration(c, p);
  assert.equal(estimate.expectedSeconds, 780);
  delete c.doseContext.timeAuthority;
  const old = load('sessionDose').estimateSessionDuration(c, p);
  assert.equal(Object.hasOwn(old, 'expectedSeconds'), false);
  assert.equal(old.minimumSeconds, estimate.minimumSeconds); assert.equal(old.maximumSeconds, estimate.maximumSeconds);
});

test('Week adapter recomputes dose from proposal, never trusts claimed duration or coverage', () => {
  const load = runtime(synthetic), { c } = fixture(load);
  const rendered = load('structuredSession').renderContractSession(c, proposal(c, 1200));
  const intent = { kind: 'adaptation', goalId: '10k', methodId: 'running_base', adaptationId: 'base_aerobica', role: 'PRIMARY', pattern: 'run' };
  rendered.structuredPrescription.objective = { intent };
  const evidence = { admittedSlots: [{ day: 'martes', protected: false }], strategy: null };
  const adapt = row => load('../planning/wholeWeekAdapter').wholeWeekInput(c.targetWeekStart, [row], evidence).sessions[0];
  assert.equal(adapt(rendered).adaptationDoseSatisfied, true);
  const reorder = value => value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([k,v]) => [k,reorder(v)])) : value;
  rendered.structuredPrescription.timeAuthority = reorder(rendered.structuredPrescription.timeAuthority);
  assert.equal(adapt(rendered).adaptationDoseSatisfied, true);
  c.doseContext.timeAuthority = reorder(c.doseContext.timeAuthority);
  assert.equal(load('allowedTrainingContract').validateAllowedTrainingContract(c).ok, true);
  rendered.structuredPrescription.proposal = proposal(c, 60);
  rendered.structuredPrescription.duration.expectedSeconds = 1400;
  assert.equal(adapt(rendered).adaptationDoseSatisfied, false);
  delete rendered.structuredPrescription.timeAuthority;
  assert.equal(adapt(rendered).adaptationDoseSatisfied, undefined);
});

test('production audit range is maximum-only: 27:23–56:19 under 60 minutes, support unresolved', () => {
  const load = runtime(), a = load('sessionTimeDosePolicy').timeAuthorityForIntent(
    { minimumSeconds: null, maximumSeconds: 3600, status: 'resolved', source: 'usuarios.perfil.duracion' },
    { kind: 'adaptation', methodId: 'box_support_strength' });
  // Reported bounds, not a reconstruction of unavailable per-block rests.
  const estimate = { minimumSeconds: 1643, maximumSeconds: 3379, expectedSeconds: 2511 };
  assert.equal(a.targetDuration, null); assert.equal(a.resolution, 'UNRESOLVED');
  assert.equal(load('sessionTimeDoseAuthority').validateSessionTimeDose(a, estimate).length, 0);
});

test('diagnostic serialization failures are swallowed', () => {
  const { c } = fixture(runtime());
  const load = runtime(undefined, { JSON: { ...JSON, stringify() { throw Error('serialization'); } } });
  assert.doesNotThrow(() => load('sessionDoseDiagnostics').emitSessionDoseAuthority(c,
    { minimumSeconds: 1, expectedSeconds: 2, maximumSeconds: 3 }, []));
});

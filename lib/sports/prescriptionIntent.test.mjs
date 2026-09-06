import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { sportsRuntime, contractFixture, fakeDatabase, plain } from './trainingContractTestRuntime.mjs';

const load = sportsRuntime();
const intentApi = load('prescriptionIntent');
const core = load('trainingFeasibility').evaluateTrainingFeasibility;
const contracts = load('allowedTrainingContract');
const sessions = load('structuredSession');
const pattern = pattern => ({ kind: 'main_pattern', pattern });
const productionRestrictions = load('../athlete/getCanonicalRestrictions').projectCanonicalRestrictions([], [{
  id: 'fixture', status: 'pending', constraint_level: 'reassessment', valid_until: '2026-09-13',
  prohibits_impact: true, prohibits_jump: true, prohibits_deep_flexion: true, prohibits_axial_load: false,
}], '2026-09-06');
const thursday = intent => contractFixture({ targetWeekStart: '2026-09-07', targetDay: 'jueves',
  restrictionsSnapshot: productionRestrictions, intent });
const build = intent => {
  const result = contracts.buildAllowedTrainingContract(contractFixture({ intent }));
  assert.equal(result.ok, true, JSON.stringify(result)); return result.contract;
};
function proposal(main, warmup = ['bench_press'], cooldown = ['bench_press']) {
  return { stimulusId: 'fuerza_maxima', structureId: 'strength_sets', blocks: [warmup, main, cooldown].map((ids, i) => ({
    blockType: ['warmup', 'main', 'cooldown'][i], movements: ids.map(movementId => ({ movementId, prescription: { reps: 5 } })),
  })) };
}

test('existing taxonomy is accepted exactly; every catalog movement retains its single metadata pattern', () => {
  const library = Object.values(load('movementLibrary').MOVEMENT_LIBRARY);
  assert.equal(library.length, 162);
  for (const m of library) {
    assert.equal(typeof m.movement_pattern, 'string');
    assert.equal(intentApi.resolvePrescriptionIntent(pattern(m.movement_pattern)).ok, true);
    assert.deepEqual(plain(intentApi.intentMatchingMovementIds(pattern(m.movement_pattern), [m.id])), [m.id]);
  }
  assert.equal(intentApi.resolvePrescriptionIntent(pattern('locomotion')).ok, true, 'existing type member without catalog candidates');
  assert.deepEqual(plain(intentApi.intentMatchingMovementIds(pattern('locomotion'), library.map(m => m.id))), []);
});

for (const value of [null, undefined, 'squat', 'pierna', [], {}, { kind: 'main_pattern' }, pattern(123),
  { kind: 'stimulus_only', pattern: 'squat' }, { kind: 'main_pattern', pattern: 'squat', focus: 'pierna' }, { kind: 'other' }]) {
  test(`invalid structured intent fails closed: ${JSON.stringify(value)}`, () => {
    assert.deepEqual(plain(intentApi.resolvePrescriptionIntent(value)), { ok: false, errors: ['INTENT_INVALID'] });
    assert.equal(core(contractFixture({ intent: value })).feasible, false);
    assert.equal(contracts.buildAllowedTrainingContract(contractFixture({ intent: value })).ok, false);
  });
}
test('unknown, aliased, free-text and prototype pattern names fail closed without normalization', () => {
  for (const p of ['unknown', 'Squat', ' squat ', 'lower_body_strength', 'pierna', 'toString', '__proto__']) {
    assert.deepEqual(plain(core(contractFixture({ intent: pattern(p) })).errors), ['INTENT_PATTERN_UNKNOWN']);
  }
});

test('Thursday stimulus_only retains bench press and squat intent rejects it without a replacement', () => {
  const generic = core(thursday({ kind: 'stimulus_only' })), squat = core(thursday(pattern('squat')));
  assert.equal(generic.feasible, true);
  assert.deepEqual(plain(generic.allowedMovementIds), ['bench_press']);
  assert.equal(squat.feasible, false);
  assert.deepEqual(plain(squat.errors), ['INTENT_POOL_EMPTY']);
  assert.deepEqual(plain(squat.intentMovementIds), []);
  assert.deepEqual(plain(squat.allowedMovementIds), ['bench_press'], 'accessory pool cannot discharge main intent');
  assert.deepEqual(plain(squat.restrictionFiltering), plain(generic.restrictionFiltering));
  assert.deepEqual(plain(contracts.buildAllowedTrainingContract(thursday(pattern('squat')))), { ok: false, errors: ['INTENT_POOL_EMPTY'] });
});

test('Thursday horizontal_push accepts bench press in both core and executed main', () => {
  const result = contracts.buildAllowedTrainingContract(thursday(pattern('horizontal_push')));
  assert.equal(result.ok, true);
  assert.deepEqual(plain(core(thursday(pattern('horizontal_push'))).intentMovementIds), ['bench_press']);
  assert.equal(sessions.validateSessionAgainstTrainingContract(result.contract, proposal(['bench_press'])).ok, true);
});

test('main_pattern requires one main movement, permits other accessories, and cannot be satisfied by warmup/cooldown', () => {
  const contract = build(pattern('squat'));
  assert.ok(contract.allowedMovementIds.includes('bench_press'));
  assert.equal(sessions.validateSessionAgainstTrainingContract(contract, proposal(['back_squat', 'bench_press'])).ok, true);
  for (const p of [proposal(['bench_press']), proposal(['bench_press'], ['back_squat'], ['front_squat'])]) {
    assert.deepEqual(plain(sessions.validateSessionAgainstTrainingContract(contract, p).violations), ['INTENT_NOT_SATISFIED']);
    assert.throws(() => sessions.renderContractSession(contract, p), /INTENT_NOT_SATISFIED/);
  }
});

test('hinge intent does not accept squat-only main; real deadlift metadata satisfies it', () => {
  const contract = build(pattern('hinge'));
  assert.deepEqual(plain(sessions.validateSessionAgainstTrainingContract(contract, proposal(['back_squat'])).violations), ['INTENT_NOT_SATISFIED']);
  assert.equal(sessions.validateSessionAgainstTrainingContract(contract, proposal(['deadlift', 'back_squat'])).ok, true);
});

test('stimulus_only preserves existing pools, rankings and filtering for every stimulus', () => {
  for (const s of Object.values(load('movementLibrary').STIMULUS_LIBRARY)) {
    const input = contractFixture({ discipline: s.discipline, stimulus: s.id });
    input.exposureContext.report.disciplina = s.discipline;
    const old = contracts.buildAllowedTrainingContract(input).contract;
    const current = contracts.buildAllowedTrainingContract({ ...input, intent: { kind: 'stimulus_only' } }).contract;
    assert.equal(old.contractVersion, 1); assert.equal(current.contractVersion, 2);
    const { intent, ...withoutIntent } = current;
    assert.deepEqual(plain({ ...withoutIntent, contractVersion: 1 }), plain(old));
    assert.deepEqual(plain(core(input)), plain(core({ ...input, intent: { kind: 'stimulus_only' } })));
  }
});

test('title/focus do not admit intent and explanation cannot assert an unsatisfied adaptation', () => {
  const input = thursday({ kind: 'stimulus_only' }); delete input.intent;
  for (const text of ['Fuerza pierna control excéntrico', 'Back squat progresión volumen', 'snatch técnico']) {
    const result = contracts.buildAllowedTrainingContract({ ...input, title: text, focus: text });
    assert.equal(result.ok, true); assert.equal(result.contract.contractVersion, 1);
    assert.equal(Object.hasOwn(result.contract, 'intent'), false);
    assert.deepEqual(plain(result.contract.allowedMovementIds), ['bench_press']);
    const rendered = sessions.renderContractSession(result.contract, { ...proposal(['bench_press']), explanation: text });
    assert.equal(rendered.por_que, 'Estímulo programado: fuerza maxima.');
    assert.equal(JSON.stringify(rendered).includes(text), false);
  }
});

test('restrictions remove matching candidates before intent and cannot be overridden by the pattern', () => {
  const input = thursday(pattern('squat'));
  const result = core(input);
  assert.ok(result.restrictionFiltering.some(e => e.movementId === 'back_squat'));
  assert.ok(result.restrictionFiltering.some(e => e.unknown.length));
  assert.equal(result.intentMovementIds.includes('back_squat'), false);
  const noPool = core({ ...input, stimulus: 'halterofilia_tecnica', intent: pattern('olympic_lift') });
  assert.deepEqual(plain(noPool.errors), ['MOVEMENT_POOL_EMPTY']);
});

test('structures still require enough distinct IDs; accessories can fill remaining slots', () => {
  const isolated = sportsRuntime();
  // Isolated compatibility fixture only; all movement metadata stays real and unchanged.
  isolated('workoutStructureLibrary').STRUCTURES_BY_STIMULUS.fuerza_maxima = ['couplet', 'triplet'];
  const evaluate = isolated('trainingFeasibility').evaluateTrainingFeasibility;
  const one = evaluate(thursday(pattern('horizontal_push')));
  assert.deepEqual(plain(one.intentMovementIds), ['bench_press']);
  assert.deepEqual(plain(one.errors), ['STRUCTURE_SPACE_UNSATISFIABLE']);
  const input = contractFixture({ intent: pattern('horizontal_push') });
  assert.equal(evaluate(input).feasible, true);
  const contract = isolated('allowedTrainingContract').buildAllowedTrainingContract(input).contract;
  const p = { ...proposal(['bench_press', 'back_squat']), structureId: 'couplet' };
  assert.equal(isolated('structuredSession').validateSessionAgainstTrainingContract(contract, p).ok, true);
});

test('version 2 requires intent; version 1 cannot silently contain a constraint; malformed intents reject', () => {
  const contract = build(pattern('squat'));
  assert.equal(contract.contractVersion, 2);
  const absent = { ...contract }; delete absent.intent;
  assert.deepEqual(plain(contracts.validateAllowedTrainingContract(absent)), { ok: false, errors: ['INTENT_REQUIRED'] });
  assert.deepEqual(plain(contracts.validateAllowedTrainingContract({ ...contract, contractVersion: 1 })), { ok: false, errors: ['INTENT_VERSION_MISMATCH'] });
  assert.equal(contracts.validateAllowedTrainingContract({ ...contract, intent: null }).ok, false);
  const generic = contracts.buildAllowedTrainingContract(thursday({ kind: 'stimulus_only' })).contract;
  assert.deepEqual(plain(contracts.validateAllowedTrainingContract({ ...generic, intent: pattern('squat') })), { ok: false, errors: ['INTENT_POOL_EMPTY'] });
});

test('intent stays immutable through dose retry and is explicit in both LLM prompts', async () => {
  const contract = build(pattern('squat')), prompts = [];
  const valid = proposal(['back_squat', 'bench_press']);
  const invalid = structuredClone(valid); invalid.blocks[1].movements[0].prescription.reps = 1001;
  const result = await load('sessionGeneration').generateContractSession(contract, [], async prompt => {
    prompts.push(prompt);
    contract.intent.pattern = 'hinge';
    return JSON.stringify(prompts.length === 1 ? invalid : valid);
  });
  assert.equal(result.ok, true); assert.equal(result.attempts, 2);
  assert.equal(result.contract.intent.pattern, 'squat');
  assert.equal(Object.isFrozen(result.contract.intent), true);
  for (const prompt of prompts) { assert.match(prompt, /"pattern":"squat"/); assert.match(prompt, /bloque main debe incluir/); }
});

test('receipt verification authenticates intent and revalidates the main block', () => {
  const contract = build(pattern('squat')), p = proposal(['back_squat', 'bench_press']);
  const rendered = sessions.renderContractSession(contract, p);
  // Same payload/domain as the existing server issuer, using the isolated runtime test key.
  const sign = evidence => {
    const payload = Buffer.from(JSON.stringify(evidence)).toString('base64url');
    return payload + '.' + createHmac('sha256', 'isolated-sports-test-key').update('forge-session-contract-v1:' + payload).digest('base64url');
  };
  const evidence = { userCodigo: 'fixture', expiresAt: Date.now() + 60000, contract, proposal: p };
  const receipt = sign(evidence), verify = load('sessionAuthority').verifySessionReceipt;
  assert.deepEqual(plain(verify(receipt, rendered, 'fixture', contract.targetWeekStart)), plain(rendered));
  for (const intent of [undefined, { kind: 'stimulus_only' }, pattern('hinge')]) {
    const changed = structuredClone(evidence); changed.contract.intent = intent;
    const payload = Buffer.from(JSON.stringify(changed)).toString('base64url');
    assert.throws(() => verify(payload + '.' + receipt.split('.')[1], rendered, 'fixture', contract.targetWeekStart), /SESSION_RECEIPT_INVALID/);
  }
  const wrongMain = { ...evidence, proposal: proposal(['bench_press']) };
  assert.throws(() => verify(sign(wrongMain), rendered, 'fixture', contract.targetWeekStart), /INTENT_NOT_SATISFIED/);
});

test('existing adapter does not adopt an untrusted request intent or infer it from focus', async () => {
  const db = fakeDatabase({ athlete_training_sources: [], weekly_plan: [] });
  const result = await load('prepareSessionTrainingContract').prepareSessionTrainingContract(db, 'fixture',
    { modo_entrada: 'coach', categoria: 'box' },
    { targetWeekStart: '2026-09-07', day: 'jueves', discipline: 'box', stimulus: 'fuerza_maxima', intent: pattern('squat'), focus: 'pierna' },
    productionRestrictions);
  assert.equal(result.ok, true); assert.equal(result.contract.contractVersion, 1);
  assert.equal(Object.hasOwn(result.contract, 'intent'), false);
  assert.deepEqual(plain(result.contract.allowedMovementIds), ['bench_press']);
});

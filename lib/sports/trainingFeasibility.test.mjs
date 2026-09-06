import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { sportsRuntime, contractFixture, plain, compile, fakeDatabase } from './trainingContractTestRuntime.mjs';

const load = sportsRuntime();
// Execute the deployed implementation as a parity oracle, not a second maintained engine.
// This test requires the baseline commit in local git history; it never accesses the network.
const baselineCache = new Map();
function baseline(name) {
  if (baselineCache.has(name)) return baselineCache.get(name);
  const module = { exports: {} }; baselineCache.set(name, module.exports);
  const source = execFileSync('git', ['show', `33c7b94:lib/sports/${name}.ts`], { encoding: 'utf8' });
  vm.runInNewContext(compile(source), { module, exports: module.exports, structuredClone,
    require: path => ['allowedTrainingContract', 'structuredSession', 'prepareSessionTrainingContract'].includes(path.slice(2))
      ? baseline(path.slice(2)) : load(path.slice(2)) });
  return module.exports;
}
const core = load('trainingFeasibility').evaluateTrainingFeasibility;
const current = load('allowedTrainingContract');
const old = baseline('allowedTrainingContract');
const library = load('movementLibrary');
const structures = load('workoutStructureLibrary').WORKOUT_STRUCTURE_LIBRARY;
const semantics = load('structureSemantics');
const project = load('../athlete/getCanonicalRestrictions').projectCanonicalRestrictions;
const flags = ['prohibits_impact', 'prohibits_jump', 'prohibits_deep_flexion', 'prohibits_axial_load', 'prohibits_overhead_load'];
const snapshot = (activeFlags = []) => project([], activeFlags.length ? [{ id: 'fixture', status: 'pending', constraint_level: 'reassessment',
  valid_until: '2026-09-13', ...Object.fromEntries(activeFlags.map(f => [f, true])) }] : [], '2026-09-06');
function inputFor(discipline, stimulus, overrides = {}) {
  const input = contractFixture({ targetWeekStart: '2026-09-07', discipline, stimulus, ...overrides });
  input.exposureContext.report.disciplina = discipline;
  return input;
}
const production = [
  ['lunes', 'carrera', 'recuperacion_activa', []], ['martes', 'box', 'halterofilia_tecnica', []],
  ['miercoles', 'carrera', 'base_aerobica', []], ['jueves', 'box', 'fuerza_maxima', ['bench_press']],
  ['viernes', 'carrera', 'economia_carrera', []], ['sabado', 'box', 'halterofilia_tecnica', []],
  ['domingo', 'carrera', 'base_aerobica', []],
];
for (const [day, discipline, stimulus, expected] of production) test(`production ${day}: ${expected.length ? 'bench_press' : 'EMPTY'}`, () => {
  const input = inputFor(discipline, stimulus, { targetDay: day, restrictionsSnapshot: snapshot(flags.slice(0, 3)),
    availableDays: discipline === 'box' ? ['martes', 'jueves', 'sabado'] : ['lunes', 'miercoles', 'viernes', 'domingo'] });
  const result = core(input);
  assert.equal(result.resolved, true);
  assert.deepEqual(plain(result.allowedMovementIds), expected);
  assert.equal(result.feasible, expected.length > 0);
  assert.deepEqual(plain(result.errors), expected.length ? [] : ['MOVEMENT_POOL_EMPTY']);
  assert.equal(JSON.stringify(current.buildAllowedTrainingContract(input)), JSON.stringify(old.buildAllowedTrainingContract(input)));
  if (expected.length) assert.deepEqual(plain(current.buildAllowedTrainingContract(input).contract.allowedMovementIds), expected);
  else assert.ok(result.restrictionFiltering.some(e => e.unknown.length), 'unknown capabilities stay excluded');
});

test('all stimuli and all 32 restriction-flag combinations preserve byte-level public results and pure decisions', () => {
  for (const stimulus of Object.values(library.STIMULUS_LIBRARY)) for (let mask = 0; mask < 32; mask++) {
    const input = inputFor(stimulus.discipline, stimulus.id, { restrictionsSnapshot: snapshot(flags.filter((_, i) => mask & (1 << i))) });
    input.exposureContext.report.exposiciones = Object.keys(library.MOVEMENT_LIBRARY).map((movementId, i) => ({ movementId, vecesUltimas4Semanas: i % 5 }));
    const before = JSON.stringify(input);
    const expected = old.buildAllowedTrainingContract(input), actual = current.buildAllowedTrainingContract(input), space = core(input);
    assert.equal(JSON.stringify(actual), JSON.stringify(expected), `${stimulus.id}/${mask}`);
    assert.equal(space.feasible, actual.ok);
    assert.equal(JSON.stringify(input), before, 'no mutation');
    assert.equal(JSON.stringify(core(input)), JSON.stringify(space), 'deterministic');
    if (actual.ok) {
      assert.deepEqual(plain(space.allowedMovementIds), plain(actual.contract.allowedMovementIds));
      assert.deepEqual(plain(space.allowedStructureIds), plain(actual.contract.allowedStructureIds));
      assert.deepEqual(plain(space.restrictionFiltering), plain(actual.contract.restrictionFiltering));
      assert.deepEqual(plain(space.rankedCandidates), plain(actual.contract.rankedCandidates));
      assert.ok(space.satisfiableStructureIds.length);
    }
  }
});

test('invalid canonical inputs retain public rejection codes and cannot create a feasible space', () => {
  const cases = [null, {}, { discipline: 'pista' }, { discipline: 'natacion' }, { stimulus: null }, { stimulus: 'unknown' },
    { stimulus: 'base_aerobica' }, { targetWeekStart: '2026-09-08' }, { targetDay: 'unknown' }, { availableDays: [] },
    { availableDays: {} }, { availableDays: ['martes', null] }, { restrictionsSnapshot: null }, { exposureContext: null },
    { externalLoadContext: null }, { source: 'weekly' }, { prescriptionScope: null },
    { restrictionsSnapshot: { ...snapshot(), areas: ['unknown'] } },
    { restrictionsSnapshot: { ...snapshot(), reassessments: [{ movement: 'unknown' }] } }];
  for (const override of cases) {
    const input = override === null || !Object.keys(override).length ? override : contractFixture(override);
    assert.equal(JSON.stringify(current.buildAllowedTrainingContract(input)), JSON.stringify(old.buildAllowedTrainingContract(input)));
    assert.equal(core(input).feasible, false);
  }
});

test('area and explicit movement restrictions, scope failures and tampered contracts preserve errors', () => {
  for (const restrictionsSnapshot of [
    { ...snapshot(), areas: ['rodilla'] },
    { ...snapshot(), restrictions: [{ movement: 'bench_press' }] },
    { ...snapshot(), state: { estado: 'evaluation' } },
  ]) {
    const input = contractFixture({ restrictionsSnapshot });
    assert.equal(JSON.stringify(current.buildAllowedTrainingContract(input)), JSON.stringify(old.buildAllowedTrainingContract(input)));
  }
  const contract = current.buildAllowedTrainingContract(contractFixture()).contract;
  for (const overrides of [{ contractVersion: 3 }, { allowedMovementIds: [] }, { allowedMovementIds: ['unknown'] },
    { allowedMovementIds: ['bench_press', 'bench_press'] }, { allowedMovementIds: ['bench_press'] },
    { allowedStructureIds: [] }, { allowedStructureIds: ['couplet'] }, { restrictionFiltering: [{}] },
    { rankedCandidates: [...contract.rankedCandidates].reverse() }, { stimulusId: 'unknown' }, { discipline: 'carrera' }]) {
    const forged = { ...contract, ...overrides };
    assert.equal(JSON.stringify(current.validateAllowedTrainingContract(forged)), JSON.stringify(old.validateAllowedTrainingContract(forged)));
  }
});

test('structure existence uses distinct cardinality and shares exact current format constraints', () => {
  for (const structure of Object.values(structures)) for (let size = 0; size <= 4; size++) {
    const ids = Array.from({ length: size }, (_, i) => `movement_${i}`);
    const feasible = semantics.isStructureSatisfiable(structure, ids);
    // Existence oracle: enumerate all nonempty subsets with uninterrupted doses.
    const possible = Array.from({ length: size }, (_, i) => i + 1).some(n =>
      semantics.validateStructureSemantics(structure, Array.from({ length: n }, () => ({ prescription: {} }))).length === 0);
    assert.equal(feasible, possible, `${structure.id}/${size}`);
  }
  assert.equal(semantics.isStructureSatisfiable(structures.couplet, ['a', 'a']), false);
  assert.equal(semantics.isStructureSatisfiable(structures.triplet, ['a', 'b']), false);
  assert.deepEqual(plain(semantics.validateStructureSemantics(structures.couplet, [{ prescription: {} }])), ['STRUCTURE_REQUIRES_TWO_MOVEMENTS']);
  assert.deepEqual(plain(semantics.validateStructureSemantics(structures.triplet, [{ prescription: {} }])), ['STRUCTURE_REQUIRES_THREE_MOVEMENTS']);
  for (const id of ['continuo_carrera', 'continuo_regenerativo', 'tempo_continuo']) {
    assert.equal(semantics.isStructureSatisfiable(structures[id], ['a']), true);
    for (const prescription of [{ sets: 2 }, { restSeconds: 1 }]) assert.deepEqual(
      plain(semantics.validateStructureSemantics(structures[id], [{ prescription }])), ['STRUCTURE_CONTINUOUS_INTERRUPTED']);
  }
});

test('nonempty pool is insufficient when all compatible structures require more distinct movements', () => {
  // Isolated hypothetical compatibility map; production catalogs/metadata remain untouched.
  const isolated = sportsRuntime();
  const mapping = isolated('workoutStructureLibrary').STRUCTURES_BY_STIMULUS;
  mapping.fuerza_maxima = ['couplet', 'triplet'];
  const input = inputFor('box', 'fuerza_maxima', { restrictionsSnapshot: snapshot(flags.slice(0, 3)) });
  const evaluate = isolated('trainingFeasibility').evaluateTrainingFeasibility;
  const contractApi = isolated('allowedTrainingContract');
  const result = evaluate(input);
  assert.deepEqual(plain(result.allowedMovementIds), ['bench_press']);
  assert.deepEqual(plain(result.allowedStructureIds), ['couplet', 'triplet']);
  assert.deepEqual(plain(result.satisfiableStructureIds), []);
  assert.equal(result.feasible, false);
  assert.deepEqual(plain(result.errors), ['STRUCTURE_SPACE_UNSATISFIABLE']);
  assert.deepEqual(plain(contractApi.buildAllowedTrainingContract(input)), { ok: false, errors: ['STRUCTURE_SPACE_UNSATISFIABLE'] });
  const forged = { ...current.buildAllowedTrainingContract(input).contract, allowedStructureIds: ['couplet', 'triplet'] };
  assert.deepEqual(plain(contractApi.validateAllowedTrainingContract(forged)), { ok: false, errors: ['STRUCTURE_SPACE_UNSATISFIABLE'] });
  mapping.fuerza_maxima.push('strength_sets');
  assert.equal(evaluate(input).feasible, true);
  assert.deepEqual(plain(evaluate(input).satisfiableStructureIds), ['strength_sets']);
  assert.equal(contractApi.buildAllowedTrainingContract(input).ok, true);
});

test('detailed validation retains exact results for all structures, cardinalities and continuous-dose violations', () => {
  const validator = load('structuredSession'), previous = baseline('structuredSession');
  for (const stimulus of Object.values(library.STIMULUS_LIBRARY)) {
    const contract = current.buildAllowedTrainingContract(inputFor(stimulus.discipline, stimulus.id)).contract;
    for (const structureId of Object.keys(structures)) for (const count of [1, 2, 3, 4]) for (const dose of [{ reps: 1 }, { reps: 1, sets: 2 }, { reps: 1, restSeconds: 1 }]) {
      const proposal = { stimulusId: stimulus.id, structureId, blocks: ['warmup', 'main', 'cooldown'].map(blockType => ({ blockType,
        movements: contract.allowedMovementIds.slice(0, blockType === 'main' ? count : 1).map(movementId => ({ movementId, prescription: dose })) })) };
      assert.equal(JSON.stringify(validator.validateSessionAgainstTrainingContract(contract, proposal)),
        JSON.stringify(previous.validateSessionAgainstTrainingContract(contract, proposal)), `${stimulus.id}/${structureId}/${count}`);
    }
  }
});

test('canonical context can be loaded once and reused by pure candidates; session adapter preserves reads and contract', async () => {
  const adapter = load('prepareSessionTrainingContract'), previous = baseline('prepareSessionTrainingContract');
  const tables = { athlete_training_sources: [], weekly_plan: [] };
  const profile = { modo_entrada: 'coach', categoria: 'box', distribucion_semanal: { box: { dias: ['martes', 'jueves', 'sabado'] } } };
  const request = { targetWeekStart: '2026-09-07', day: 'martes', discipline: 'box', stimulus: 'fuerza_maxima' };
  const db = fakeDatabase(tables), oldDb = fakeDatabase(tables);
  assert.equal(JSON.stringify(await adapter.prepareSessionTrainingContract(db, 'fixture', profile, request, snapshot())),
    JSON.stringify(await previous.prepareSessionTrainingContract(oldDb, 'fixture', profile, request, snapshot())));
  assert.deepEqual(db.calls, oldDb.calls);
  const contextDb = fakeDatabase(tables);
  const context = await adapter.prepareSessionTrainingContext(contextDb, 'fixture', profile, request, snapshot());
  assert.equal(context.ok, true);
  const calls = [...contextDb.calls];
  for (const day of ['martes', 'jueves', 'sabado']) for (const stimulus of ['fuerza_maxima', 'halterofilia_tecnica']) {
    const input = { ...context.input, targetDay: day, stimulus };
    assert.equal(core(input).feasible, current.buildAllowedTrainingContract(input).ok);
  }
  assert.deepEqual(contextDb.calls, calls);
});

test('timezone and inclusive expiration retain deployed behavior', () => {
  const restrictions = load('../athlete/getCanonicalRestrictions');
  assert.equal(restrictions.madridRestrictionDate(new Date('2026-09-06T22:30:00Z')), '2026-09-07');
  const note = { id: 'fixture', status: 'pending', constraint_level: 'reassessment', valid_until: '2026-09-06', prohibits_impact: true };
  assert.equal(project([], [note], '2026-09-06').active, true);
  assert.equal(project([], [note], '2026-09-07').active, false);
});

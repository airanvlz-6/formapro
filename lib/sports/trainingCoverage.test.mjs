import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, contractFixture, plain, fakeDatabase } from './trainingContractTestRuntime.mjs';
const load = sportsRuntime();
const { STIMULUS_LIBRARY, MOVEMENT_LIBRARY, MOVEMENT_RESTRICTION_EVIDENCE } = load('movementLibrary');
const { WORKOUT_STRUCTURE_LIBRARY, STRUCTURES_BY_STIMULUS } = load('workoutStructureLibrary');
const { buildAllowedTrainingContract: build, validateAllowedTrainingContract: validate } = load('allowedTrainingContract');
const { evaluateMovementRestrictions: evaluate, RESTRICTION_FLAGS } = load('movementRestrictionPolicy');
const { buildPrescriptionScope: scope, resolveProfileDisciplines } = load('prescriptionScope');
const { prepareSessionTrainingContract: prepare } = load('prepareSessionTrainingContract');
// Independent inventory from the pre-change audit, not computed from the policy under test.
const coverage = {
  fuerza_maxima: ['box', 9], hipertrofia: ['box', 9], halterofilia_tecnica: ['box', 13], halterofilia_soporte: ['box', 10],
  potencia: ['box', 33], gimnasticos: ['box', 28], capacidad_glucolitica: ['box', 37], capacidad_aerobica: ['box', 8],
  cadena_posterior: ['box', 8], fuerza_general: ['box', 46], tecnica: ['box', 7], coordinacion: ['box', 10], movilidad_tecnica: ['box', 1],
  recuperacion_activa: ['carrera', 2], base_aerobica: ['carrera', 3], umbral: ['carrera', 4], vo2max: ['carrera', 3],
  velocidad: ['carrera', 2], economia_carrera: ['carrera', 6], potencia_carrera: ['carrera', 5], resistencia_especifica: ['carrera', 1], fuerza_corredor: ['carrera', 8],
};
test('all and only 22 catalog stimuli have an explicit structure strategy', () => {
  assert.deepEqual(Object.keys(STIMULUS_LIBRARY).sort(), Object.keys(coverage).sort());
  assert.deepEqual(Object.keys(STRUCTURES_BY_STIMULUS).sort(), Object.keys(coverage).sort());
});
for (const [stimulus, [discipline, movementCount]] of Object.entries(coverage)) test(`${stimulus}: complete normal contract with real movements and compatible structures`, () => {
  const input = contractFixture({ discipline, stimulus }); input.exposureContext.report.disciplina = discipline;
  const r = build(input); assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.contract.allowedMovementIds.length, movementCount);
  assert.ok(r.contract.allowedStructureIds.length > 0);
  for (const id of r.contract.allowedStructureIds) {
    assert.equal(WORKOUT_STRUCTURE_LIBRARY[id].discipline, discipline);
    assert.equal(WORKOUT_STRUCTURE_LIBRARY[id].id, id);
    assert.ok(WORKOUT_STRUCTURE_LIBRARY[id].duracion_tipica_min[0] > 0);
  }
});
test('recovery, sprint, drills, power and runner strength have distinct meaningful formats', () => {
  const single = id => WORKOUT_STRUCTURE_LIBRARY[STRUCTURES_BY_STIMULUS[id][0]];
  assert.equal(single('recuperacion_activa').formato, 'continuous');
  assert.notEqual(single('recuperacion_activa').id, 'continuo_carrera');
  assert.equal(single('velocidad').stimulus_type, 'power'); assert.match(single('velocidad').descripcion, /recuperacion completa/);
  assert.equal(single('economia_carrera').formato, 'skill_practice');
  assert.equal(single('potencia_carrera').stimulus_type, 'power');
  assert.equal(single('fuerza_corredor').formato, 'strength_sets');
  for (const id of ['tecnica', 'coordinacion', 'gimnasticos']) assert.equal(single(id).stimulus_type, 'skill');
  assert.notEqual(single('movilidad_tecnica').id, single('tecnica').id);
  assert.equal(single('potencia').stimulus_type, 'power');
  assert.deepEqual(plain(STRUCTURES_BY_STIMULUS.umbral), ['intervalos_carrera', 'tempo_continuo']);
});
const source = (disciplina, owner) => ({ disciplina, owner, activo: true });
test('partial external evidence removes only its discipline from legacy Coach ownership', () => {
  const result = scope({ mode: 'planificacion', sources: [source('running', 'external')], profileDisciplines: ['CrossFit', 'running'] });
  assert.equal(result.ok, true); assert.deepEqual(plain(result.scope.managedDisciplines), ['box']); assert.deepEqual(plain(result.scope.externalDisciplines), ['carrera']);
});
test('partial forge evidence does not discard other explicit legacy disciplines', () => {
  const result = scope({ mode: 'coach', sources: [source('box', 'forge')], profileDisciplines: ['running', 'box'] });
  assert.equal(result.ok, true); assert.deepEqual(plain(result.scope.managedDisciplines), ['box', 'carrera']);
});
test('unrecognized specialty cannot override a known category; recognized evidence combines', () => {
  assert.deepEqual(plain(resolveProfileDisciplines({ especialidad: 'texto antiguo', categoria: 'carrera' })), ['carrera']);
  assert.deepEqual(plain(resolveProfileDisciplines({ especialidad: 'CrossFit', categoria: 'funcional', distribucion_semanal: '{"running":["martes"]}' })), ['box', 'carrera']);
  assert.deepEqual(plain(resolveProfileDisciplines({ especialidad: 'unknown', categoria: 'hibrido' })), []);
});
test('explicit conflicting sources reject; Focus ignores unrelated profile without widening delegation', () => {
  assert.equal(scope({ mode: 'coach', sources: [source('running', 'external'), source('carrera', 'forge')], profileDisciplines: ['box'] }).ok, false);
  for (const [managed, external, expected] of [['running', 'CrossFit', 'carrera'], ['box', 'running', 'box']]) {
    const r = scope({ mode: 'focus', sources: [source(managed, 'forge'), source(external, 'external')], profileDisciplines: ['box', 'carrera', 'fuerza'] });
    assert.equal(r.ok, true); assert.deepEqual(plain(r.scope.managedDisciplines), [expected]);
  }
  assert.equal(scope({ mode: 'focus', sources: [source('box', 'forge'), source('running', 'forge')] }).ok, false);
});
test('real server adapter combines legacy evidence with partial external records', async () => {
  const db = fakeDatabase({ athlete_training_sources: [source('running', 'external')], external_training_records: [], weekly_plan: [] });
  const profile = { modo_entrada: 'planificacion', especialidad: 'unknown', categoria: 'box', distribucion_semanal: { running: ['lunes'], box: ['martes'] } };
  const r = await prepare(db, 'u', profile, { targetWeekStart: '2026-08-31', day: 'martes', discipline: 'box', stimulus: 'gimnasticos' }, contractFixture().restrictionsSnapshot);
  assert.equal(r.ok, true, JSON.stringify(r)); assert.deepEqual(plain(r.contract.prescriptionScope.managedDisciplines), ['box']);
});
const incompatible = { prohibits_impact: 'box_jump', prohibits_jump: 'box_jump', prohibits_axial_load: 'back_squat', prohibits_deep_flexion: 'back_squat', prohibits_overhead_load: 'strict_press' };
for (const flag of Object.keys(RESTRICTION_FLAGS)) test(`${flag}: known incompatible excludes, supported alternative survives, unknown never permits`, () => {
  assert.equal(evaluate(MOVEMENT_LIBRARY[incompatible[flag]], [flag]).allowed, false);
  assert.ok(evaluate(MOVEMENT_LIBRARY[incompatible[flag]], [flag]).incompatible.includes(flag));
  assert.equal(evaluate(MOVEMENT_LIBRARY.bench_press, [flag]).allowed, true);
  const unknown = { ...MOVEMENT_LIBRARY.bench_press, id: 'not_reviewed' };
  assert.deepEqual(plain(evaluate(unknown, [flag]).unknown), [flag]);
  const input = contractFixture({ stimulus: 'fuerza_general' }); input.restrictionsSnapshot.restrictions = [{ movement: 'zona', [flag]: true }];
  const r = build(input); assert.equal(r.ok, true, JSON.stringify(r)); assert.ok(r.contract.allowedMovementIds.includes('plank'));
  for (const id of r.contract.allowedMovementIds) assert.equal(evaluate(MOVEMENT_LIBRARY[id], [flag]).allowed, true);
});
test('catalog evidence is explicit, reviewed per ID and does not contradict ordinal positives', () => {
  for (const [id, entry] of Object.entries(MOVEMENT_RESTRICTION_EVIDENCE)) {
    assert.ok(MOVEMENT_LIBRARY[id], id); assert.ok(entry.basis.length > 20);
    if (entry.properties.impact === false) assert.equal(MOVEMENT_LIBRARY[id].impact, 'bajo', id);
    if (entry.properties.axial_load === false) assert.notEqual(MOVEMENT_LIBRARY[id].axial_load, 'alto', id);
  }
  assert.equal(evaluate(MOVEMENT_LIBRARY.box_step_up, ['prohibits_jump']).allowed, true);
  assert.equal(evaluate(MOVEMENT_LIBRARY.box_step_up, ['prohibits_deep_flexion']).allowed, false);
});
test('combined restrictions retain known alternatives; audit report cannot be forged', () => {
  const f = contractFixture({ stimulus: 'fuerza_general' }); f.restrictionsSnapshot.restrictions = [{ movement: 'zona', ...Object.fromEntries(Object.keys(RESTRICTION_FLAGS).map(k => [k, true])) }];
  const r = build(f); assert.equal(r.ok, true); assert.ok(r.contract.allowedMovementIds.includes('plank'));
  const c = plain(r.contract); c.restrictionFiltering = []; assert.equal(validate(c).ok, false);
});
test('genuinely incompatible running pool and entirely unknown safety pool fail closed without fallback', () => {
  const running = contractFixture({ discipline: 'carrera', stimulus: 'base_aerobica' }); running.exposureContext.report.disciplina = 'carrera';
  running.restrictionsSnapshot.restrictions = [{ movement: 'zona', prohibits_impact: true }];
  const r = build(running); assert.equal(r.ok, false); assert.ok(r.errors.includes('MOVEMENT_POOL_EMPTY'));
  const technical = contractFixture({ stimulus: 'movilidad_tecnica' }); technical.restrictionsSnapshot.restrictions = [{ movement: 'zona', prohibits_deep_flexion: true }];
  assert.equal(build(technical).ok, false);
});
test('no-jump permits ordinary running but no-impact never uses low-impact running as a loophole', () => {
  const input = contractFixture({ discipline: 'carrera', stimulus: 'base_aerobica' }); input.exposureContext.report.disciplina = 'carrera';
  input.restrictionsSnapshot.restrictions = [{ movement: 'zona', prohibits_jump: true }];
  const r = build(input); assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.contract.allowedMovementIds.length, 3);
  input.stimulus = 'recuperacion_activa'; input.restrictionsSnapshot.restrictions = [{ movement: 'zona', prohibits_impact: true }];
  assert.equal(build(input).ok, false);
});

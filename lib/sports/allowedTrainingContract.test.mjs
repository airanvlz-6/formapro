import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain, contractFixture as fixture, fakeDatabase } from './trainingContractTestRuntime.mjs';
const load = sportsRuntime();
const { buildPrescriptionScope: scope, validatePrescriptionScope } = load('prescriptionScope');
const { buildAllowedTrainingContract: build, validateAllowedTrainingContract: validate, resolveTrainingStimulus } = load('allowedTrainingContract');
const { prepareSessionTrainingContract: prepare } = load('prepareSessionTrainingContract');
const { MOVEMENT_LIBRARY, getMovimientosPorEstimulo } = load('movementLibrary');
const { WORKOUT_STRUCTURE_LIBRARY } = load('workoutStructureLibrary');
const source = (disciplina, owner) => ({ disciplina, owner, activo: true, dias: ['martes'] });
const good = () => { const r = build(fixture()); assert.equal(r.ok, true, JSON.stringify(r)); return plain(r.contract); };
for (const mode of ['supervision', 'consulta']) test(`${mode} cannot build a prescription, retains external context`, () => {
  const s = scope({ mode, sources: [source('running', 'forge'), source('CrossFit', 'external')] });
  assert.equal(s.ok, true); assert.equal(s.scope.prescriptionAllowed, false); assert.deepEqual(plain(s.scope.managedDisciplines), []);
  assert.deepEqual(plain(s.scope.externalDisciplines), ['box', 'carrera']);
  const r = build(fixture({ prescriptionScope: s.scope })); assert.equal(r.ok, false); assert.ok(r.errors.includes('PRESCRIPTION_NOT_ALLOWED'));
});
for (const [managed, external, id, stimulus] of [['running', 'CrossFit', 'carrera', 'base_aerobica'], ['box', 'running', 'box', 'fuerza_maxima']]) {
  test(`Focus ${managed} owns exactly one discipline; external cannot be created/replaced/regenerated`, () => {
    const s = scope({ mode: 'focus', sources: [source(managed, 'forge'), source(external, 'external')] });
    assert.equal(s.ok, true); assert.deepEqual(plain(s.scope.managedDisciplines), [id]); assert.equal(s.scope.focusDiscipline, id);
    const input = fixture({ prescriptionScope: s.scope, discipline: id, stimulus }); input.exposureContext.report.disciplina = id;
    input.externalLoadContext.activities = [{ discipline: s.scope.externalDisciplines[0], days: ['lunes'] }];
    input.externalLoadContext.records = [{ fecha: '2026-08-31', disciplina: s.scope.externalDisciplines[0], duracion: 60, intensidad_percibida: 8 }];
    const before = structuredClone(input); const r = build(input); assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(plain(r.contract.externalLoadContext), input.externalLoadContext); assert.deepEqual(plain(input), plain(before));
    const rejected = build({ ...input, discipline: s.scope.externalDisciplines[0] }); assert.equal(rejected.ok, false);
    assert.ok(rejected.errors.includes('DISCIPLINE_OUTSIDE_MANAGED_SCOPE'));
    assert.deepEqual(plain(r.contract.prescriptionScope), plain(s.scope));
  });
}
test('Coach and persisted planificacion manage only explicit disciplines', () => {
  for (const mode of ['coach', 'planificacion']) {
    const s = scope({ mode, sources: [source('running', 'forge'), source('box', 'forge'), source('natacion', 'external')] });
    assert.equal(s.ok, true); assert.equal(s.scope.mode, 'coach'); assert.deepEqual(plain(s.scope.managedDisciplines), ['box', 'carrera']);
    for (const [discipline, stimulus] of [['box', 'fuerza_maxima'], ['carrera', 'base_aerobica']]) {
      const f = fixture({ prescriptionScope: s.scope, discipline, stimulus }); f.exposureContext.report.disciplina = discipline;
      assert.equal(build(f).ok, true);
    }
  }
});
test('missing modes, ambiguous ownership and multiple Focus owners never broaden scope', () => {
  for (const input of [{ sources: [] }, { mode: 'focus', sources: [] }, { mode: 'focus', sources: [source('box', 'forge'), source('running', 'forge')] },
    { mode: 'coach', sources: [source('running', 'forge'), source('carrera', 'external')] }]) assert.equal(scope(input).ok, false);
  assert.ok(validatePrescriptionScope({ mode: 'focus', prescriptionAllowed: true, managedDisciplines: ['box', 'carrera'], externalDisciplines: [], focusDiscipline: 'box' }).length);
});
test('inactive sources do not confer authority; unsupported discipline remains unsupported', () => {
  const s = scope({ mode: 'coach', sources: [{ ...source('box', 'forge'), activo: false }], profileDisciplines: ['natacion'] });
  assert.equal(s.ok, true); const r = build(fixture({ prescriptionScope: s.scope, discipline: 'natacion' }));
  assert.equal(r.ok, false); assert.ok(r.errors.includes('DISCIPLINE_UNSUPPORTED'));
});
test('movement universe is full deterministic catalog pool, separate from exposure ranking', () => {
  const input = fixture(); const firstId = getMovimientosPorEstimulo('fuerza_maxima', 'box')[0].id;
  input.exposureContext.report.exposiciones = [{ movementId: firstId, vecesUltimas4Semanas: 12, ultimaFecha: null, respuestasReportadas: [] }];
  const r = build(input); assert.equal(r.ok, true); assert.ok(r.contract.allowedMovementIds.length > 5);
  assert.deepEqual(plain(r.contract.allowedMovementIds), plain(getMovimientosPorEstimulo('fuerza_maxima', 'box').map(m => m.id).sort()));
  assert.equal(r.contract.rankedCandidates.at(-1).movementId, firstId); assert.ok(r.contract.allowedMovementIds.every(id => MOVEMENT_LIBRARY[id]));
});
test('structure catalog contributes discipline/stimulus compatible structured IDs', () => {
  const c = good(); assert.deepEqual(c.allowedStructureIds, ['strength_sets']); assert.ok(c.allowedStructureIds.every(id => WORKOUT_STRUCTURE_LIBRARY[id]));
  const technical = build(fixture({ stimulus: 'movilidad_tecnica' })); assert.equal(technical.ok, true);
  assert.deepEqual(plain(technical.contract.allowedStructureIds), ['movilidad_controlada']);
});
test('stimulus resolver uses only exact normalized identifiers, never fuzzy focus', () => {
  assert.equal(resolveTrainingStimulus('box', 'Fuerza máxima').status, 'resolved');
  for (const value of [undefined, '', 'fuerza maxima con snatch', 'Cargas', 'constructor', 'toString', 'base_aerobica']) assert.equal(resolveTrainingStimulus('box', value).status, 'unresolved');
  assert.equal(build(fixture({ stimulus: 'unknown' })).ok, false);
});
for (const [field, value, error] of [
  ['allowedMovementIds', ['inventado'], 'MOVEMENT_ID_UNKNOWN'], ['allowedStructureIds', ['inventado'], 'STRUCTURE_ID_UNKNOWN'],
  ['allowedMovementIds', [], 'MOVEMENT_POOL_EMPTY'], ['allowedStructureIds', [], 'STRUCTURE_POOL_EMPTY'],
  ['allowedMovementIds', ['back_squat', 'back_squat'], 'MOVEMENT_IDS_DUPLICATED'],
  ['allowedStructureIds', ['strength_sets', 'strength_sets'], 'STRUCTURE_IDS_DUPLICATED'],
  ['allowedMovementIds', ['rodaje_z2'], 'MOVEMENT_POOL_MISMATCH'], ['allowedStructureIds', ['continuo_carrera'], 'STRUCTURE_POOL_MISMATCH'],
  ['contractVersion', 999, 'CONTRACT_VERSION_INVALID'], ['targetWeekStart', '2026-09-01', 'TARGET_WEEK_INVALID'],
  ['targetDay', 'today', 'TARGET_DAY_INVALID']]) test(`reject malformed ${field}: ${error}`, () => {
    const c = good(); c[field] = value; const r = validate(c); assert.equal(r.ok, false); assert.ok(r.errors.includes(error), JSON.stringify(r));
  });
test('malformed runtime contracts fail explicitly', () => { for (const v of [null, {}, [], { prescriptionScope: null }]) assert.equal(validate(v).ok, false); });
test('area and exact movement restrictions remove IDs without changing caller data', () => {
  const f = fixture(); f.restrictionsSnapshot.areas = ['lumbar'];
  const r = build(f); assert.equal(r.ok, true); assert.ok(r.contract.allowedMovementIds.every(id => !MOVEMENT_LIBRARY[id].avoid_with?.includes('lumbar')));
  const g = fixture(); g.restrictionsSnapshot.restrictions = [{ movement: 'back_squat' }];
  const q = build(g); assert.equal(q.ok, true); assert.ok(!q.contract.allowedMovementIds.includes('back_squat'));
});
test('biomechanical restrictions retain known alternatives and exclude unknown candidates', () => {
  for (const flag of ['prohibits_impact', 'prohibits_jump', 'prohibits_axial_load', 'prohibits_deep_flexion', 'prohibits_overhead_load']) {
    const f = fixture(); f.restrictionsSnapshot.reassessments = [{ movement: 'rodilla', [flag]: true }];
    const r = build(f); assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(r.contract.allowedMovementIds.includes('bench_press'));
    assert.ok(!r.contract.allowedMovementIds.includes('yoke_carry'));
  }
});
test('availability, external ownership and exposure cannot be silently falsified', () => {
  const f = fixture({ availableDays: ['lunes'] }); assert.equal(build(f).ok, false);
  const c = good(); c.externalLoadContext.activities.push({ discipline: 'box', days: ['lunes'] }); assert.equal(validate(c).ok, false);
  const d = good(); d.exposureContext.report.exposiciones.push({ movementId: 'back_squat', vecesUltimas4Semanas: -1 }); assert.equal(validate(d).ok, false);
});
test('server adapter supports persisted Coach profile and exact stimulus', async () => {
  const db = fakeDatabase({ athlete_training_sources: [], weekly_plan: [] });
  const r = await prepare(db, 'u', { modo_entrada: 'planificacion', categoria: 'carrera' },
    { targetWeekStart: '2026-08-31', day: 'martes', discipline: 'running', stimulus: 'base_aerobica' }, fixture().restrictionsSnapshot);
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.contract.discipline, 'carrera');
});
test('server Focus context reads external load without granting external ownership', async () => {
  const db = fakeDatabase({ athlete_training_sources: [source('running', 'forge'), source('CrossFit', 'external')],
    external_training_records: [{ fecha: '2026-08-31', disciplina: 'CrossFit', duracion: 60 }], weekly_plan: [] });
  const r = await prepare(db, 'u', { modo_entrada: 'focus' }, { targetWeekStart: '2026-08-31', day: 'martes', discipline: 'running', stimulus: 'base_aerobica' }, fixture().restrictionsSnapshot);
  assert.equal(r.ok, true, JSON.stringify(r)); assert.deepEqual(plain(r.contract.prescriptionScope.managedDisciplines), ['carrera']);
  assert.equal(r.contract.externalLoadContext.records[0].disciplina, 'box');
});
test('server read failures never become empty permissive context', async () => {
  for (const table of ['athlete_training_sources', 'weekly_plan', 'external_training_records']) {
    const db = fakeDatabase({ athlete_training_sources: [source('running', 'forge'), source('box', 'external')], weekly_plan: [], external_training_records: [] }, table);
    const r = await prepare(db, 'u', { modo_entrada: 'focus' }, { targetWeekStart: '2026-08-31', day: 'martes', discipline: 'running', stimulus: 'base_aerobica' }, fixture().restrictionsSnapshot);
    assert.equal(r.ok, false);
  }
});
test('Focus missing delegated calendar rejects even with generic availability', async () => {
  const db = fakeDatabase({ athlete_training_sources: [{ ...source('running', 'forge'), dias: null }, source('box', 'external')] });
  const r = await prepare(db, 'u', { modo_entrada: 'focus', distribucion_semanal: { dias: ['martes'] } },
    { targetWeekStart: '2026-08-31', day: 'martes', discipline: 'running', stimulus: 'base_aerobica' }, fixture().restrictionsSnapshot);
  assert.equal(r.ok, false); assert.ok(r.errors.includes('FOCUS_AVAILABILITY_UNRESOLVED'));
});
test('Coach generic availability and Focus explicit persisted distribution are respected', async () => {
  for (const mode of ['planificacion', 'focus']) {
    const db = fakeDatabase({ athlete_training_sources: mode === 'focus' ? [{ ...source('running', 'forge'), dias: null }] : [], weekly_plan: [] });
    const dist = mode === 'focus' ? { Running: 'martes, jueves' } : { dias: ['martes', 'jueves'] };
    const profile = { modo_entrada: mode, categoria: 'carrera', distribucion_semanal: JSON.stringify(dist) };
    const request = { targetWeekStart: '2026-08-31', day: 'martes', discipline: 'running', stimulus: 'base_aerobica' };
    assert.equal((await prepare(db, 'u', profile, request, fixture().restrictionsSnapshot)).ok, true);
    const rejected = await prepare(db, 'u', profile, { ...request, day: 'viernes' }, fixture().restrictionsSnapshot);
    assert.equal(rejected.ok, false); assert.ok(rejected.errors.includes('DAY_NOT_AVAILABLE'));
  }
});
test('contract is detached from caller and malformed builder inputs return explicit errors', () => {
  const input = fixture(); const r = build(input); assert.equal(r.ok, true);
  input.prescriptionScope.managedDisciplines.length = 0;
  input.exposureContext.report.exposiciones.push({ movementId: 'fake' });
  assert.equal(validate(r.contract).ok, true);
  for (const bad of [null, {}, { prescriptionScope: null }]) assert.equal(build(bad).ok, false);
});
test('restricting every candidate produces an explicit empty-pool failure', () => {
  const input = fixture(); input.restrictionsSnapshot.restrictions = getMovimientosPorEstimulo('fuerza_maxima', 'box').map(m => ({ movement: m.id }));
  const r = build(input); assert.equal(r.ok, false); assert.ok(r.errors.includes('MOVEMENT_POOL_EMPTY'));
});

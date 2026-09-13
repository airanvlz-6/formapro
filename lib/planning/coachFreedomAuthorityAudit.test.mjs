import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, contractFixture, equippedProfileFixture, fakeDatabase, plain } from '../sports/trainingContractTestRuntime.mjs';

// Characterization only: synthetic facts, isolated module mutations, no production writes.
const adaptations = ['potencia', 'gimnasticos', 'fuerza_maxima', 'capacidad_glucolitica',
  'recuperacion_activa', 'halterofilia_tecnica', 'base_aerobica', 'tecnica'];
function fixture(load, goal = 'crossfit') {
  const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
  const profile = project({ objetivo_principal: { descripcion: goal }, especialidad: 'crossfit',
    perfil: equippedProfileFixture(), ciclo_actual: { bloque: 'deload' } });
  const days = plain(load('../planning/weeklyCalendar').calendarDays);
  const scope = contractFixture().prescriptionScope;
  const contexts = Object.fromEntries(scope.managedDisciplines.map(discipline => {
    const c = contractFixture({ discipline, targetWeekStart: '2026-09-14', availableDays: days });
    c.exposureContext.report.disciplina = discipline;
    return [discipline, c];
  }));
  return { targetWeekStart: '2026-09-14', prescriptionScope: scope, contexts,
    allowed: { box: days, carrera: days }, fixed: {}, completeNewWeek: true, maxExecutableDays: 6,
    daySufficiency: Object.fromEntries(days.map(day => [day, { box: profile.prescriptionSignals, carrera: profile.prescriptionSignals }])),
    strategy: load('../planning/canonicalWeekStrategy').buildCanonicalWeekStrategy(profile, scope, 6) };
}
const build = (load, input) => {
  const r = load('../planning/allowedWeeklyPlanContract').buildAllowedWeeklyPlanContract(input);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.contract;
};
const options = c => Object.values(c.dayOptions).flat();

test('all eight incident adaptations have catalog methods and reach Weekly with explicit permissive synthetic facts', () => {
  const load = sportsRuntime(), input = fixture(load), c = build(load, input);
  for (const id of adaptations) {
    assert.ok(load('goalTransferModel').TRANSFER_METHODS.some(m => m.adaptationId === id), id);
    assert.ok(options(c).some(o => o.intent?.adaptationId === id), id);
  }
});

test('removing a method in memory defers its adaptation although the unchanged movement/structure space is feasible', () => {
  const load = sportsRuntime(), methods = load('goalTransferModel').TRANSFER_METHODS;
  methods.splice(methods.findIndex(m => m.id === 'box_weightlifting'), 1);
  const input = fixture(load), c = build(load, input);
  assert.ok(input.strategy.adaptations.some(a => a.id === 'halterofilia_tecnica'));
  assert.ok(c.strategy.deferred.some(d => d.reference === 'adaptation:halterofilia_tecnica' && d.reason === 'no_feasible_managed_method'));
  assert.equal(options(c).some(o => o.intent?.adaptationId === 'halterofilia_tecnica'), false);
  const generic = load('trainingFeasibility').evaluateTrainingFeasibility({ ...input.contexts.box,
    targetDay: 'martes', stimulus: 'halterofilia_tecnica', intent: { kind: 'stimulus_only' } }, input.daySufficiency.martes.box);
  assert.equal(generic.feasible, true, JSON.stringify(generic));
  assert.ok(generic.intentMovementIds.length && generic.satisfiableStructureIds.length);
});

test('removing only a stimulus structure mapping in memory empties an otherwise feasible space', () => {
  const load = sportsRuntime(), input = fixture(load);
  const evaluate = () => load('trainingFeasibility').evaluateTrainingFeasibility({ ...input.contexts.box,
    targetDay: 'martes', stimulus: 'halterofilia_tecnica' }, input.daySufficiency.martes.box);
  assert.equal(evaluate().feasible, true);
  load('workoutStructureLibrary').STRUCTURES_BY_STIMULUS.halterofilia_tecnica = [];
  const result = evaluate();
  assert.equal(result.feasible, false);
  assert.ok(result.allowedMovementIds.length);
  assert.ok(result.errors.includes('STRUCTURE_POOL_EMPTY'));
});

test('unrecognized synthetic goal plus declared CrossFit preserves the same method and Weekly option set', () => {
  const load = sportsRuntime(), known = fixture(load), unsupported = fixture(load, 'synthetic unmapped sporting aspiration');
  assert.equal(unsupported.strategy.goal.id, 'crossfit');
  assert.deepEqual(plain(known.strategy.methods), plain(unsupported.strategy.methods));
  assert.deepEqual(plain(build(load, known).dayOptions), plain(build(load, unsupported).dayOptions));
});

test('historical preservation v1 protects future REST before the week; receipt replay retains that behavior', async () => {
  const load = sportsRuntime(), days = plain(load('../planning/weeklyCalendar').calendarDays);
  const rest = ['lunes', 'miercoles', 'viernes', 'domingo'];
  const snapshot = { sessions: days.map(dia => ({ dia, tipo: rest.includes(dia) ? 'descanso' : 'box', completada: false })) };
  const tables = { usuarios: { modo_entrada: 'coach', categoria: 'box', perfil: { ...equippedProfileFixture(), dias: 6 },
    workout_history: [], distribucion_semanal: { box: days, pista: [], carrera_larga: [] } },
    athlete_training_sources: [], athlete_state_events: [], athlete_coaching_notes: [], weekly_plan: [] };
  const prepare = today => load('../planning/prepareAllowedWeeklyPlanContract').loadWeeklyPlanningContext(fakeDatabase(tables), 'synthetic',
    { targetWeekStart: '2026-09-14', today, empezarHoy: true, snapshot, preservationVersion: 1 });
  const future = await prepare('2026-09-13');
  assert.equal(future.ok, true, JSON.stringify(future));
  assert.deepEqual(Object.keys(future.input.fixed), rest);
  assert.ok(Object.values(future.input.fixed).every(s => s.state === 'REST'));
  const current = await prepare('2026-09-14');
  assert.equal(current.ok, true, JSON.stringify(current));
  assert.deepEqual(Object.keys(current.input.fixed), []);
});

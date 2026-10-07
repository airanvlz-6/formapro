import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';

// FORGE BUILD 8C-A (correccion) — GOAL AUTHORITY (objetivo real) vs STRATEGY SUPPORT (estrategia especializada disponible).
// Una estrategia derivada de la especialidad NUNCA sustituye al objetivo declarado: es un respaldo de programacion explicito.
const load = sportsRuntime();
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const resolve = load('../athlete/strategyResolution').resolvePlanningStrategy;
const strategies = load('../planning/canonicalWeekStrategy');
const { humanWeeklyObjective } = load('humanCoachingProjection');
const row = (objective, patch = {}) => ({ especialidad: 'funcional_crossfit', objetivo_principal: objective === undefined ? null : { descripcion: objective }, perfil: {}, ...patch });
const scope = { mode: 'coach', prescriptionAllowed: true, managedDisciplines: ['box', 'carrera'], externalDisciplines: [] };
const CUSTOM = ['Aprobar las pruebas físicas de la oposición a Policía Nacional', 'Volver a jugar al pádel sin dolor', 'Cruzar los Pirineos a pie en verano', 'Mejorar mi salud general'];

test('13 GOAL: objetivo explicito + especialidad CrossFit => el objetivo declarado sigue siendo la meta; CrossFit es solo respaldo de programacion', () => {
  for (const objective of CUSTOM) {
    const r = resolve(project(row(objective)));
    assert.equal(r.goal.candidates[0].value, objective, 'el texto del objetivo no se reescribe');
    assert.equal(r.goalAuthority.origin, 'EXPLICIT_OBJECTIVE'); assert.equal(r.goalAuthority.objectiveRecognized, false);
    assert.equal(r.goalAuthority.recognizedGoalId, null); assert.equal(r.goal.canonicalGoalId, null);
    assert.equal(r.strategySupport, 'SPECIALTY_FALLBACK'); assert.equal(r.source, 'declared_sport');
    assert.deepEqual(plain(r.fallback), { kind: 'DECLARED_SPORT_FAMILY', strategyId: 'crossfit', basedOn: ['usuarios.especialidad'], reason: 'EXPLICIT_OBJECTIVE_NOT_SPECIALISED' });
  }
});
test('14 GOAL: sin objetivo la especialidad NO inventa meta (GOAL_MISSING); el respaldo de deporte solo existe para un objetivo declarado', () => {
  for (const especialidad of ['funcional_crossfit', 'carrera', 'hibrido_hyrox']) {
    const r = resolve(project(row(undefined, { especialidad })));
    assert.equal(r.status, 'GOAL_MISSING'); assert.equal(r.strategyId, null); assert.equal(r.goalAuthority.origin, 'NONE');
    assert.equal(r.strategySupport, 'NONE'); assert.equal(r.fallback, null);
  }
  // comportamiento previo conservado: objetivo declarado en Carrera => respaldo general explicito
  const running = resolve(project(row('Mi próxima carrera popular', { especialidad: 'carrera' })));
  assert.equal(running.strategyId, 'running_general'); assert.equal(running.source, 'general_declared_sport');
  assert.equal(running.strategySupport, 'GENERAL_FALLBACK'); assert.equal(running.fallback.kind, 'GENERAL_DECLARED_SPORT');
});
test('15 GOAL: objetivo personalizado no catalogado (sin palabras clave) NO se convierte en CrossFit', () => {
  for (const objective of CUSTOM) {
    const r = resolve(project(row(objective)));
    assert.notEqual(r.source, 'exact_primary_goal'); assert.equal(r.goalAuthority.recognizedGoalId, null);
    assert.equal(r.fallback.reason, 'EXPLICIT_OBJECTIVE_NOT_SPECIALISED');
    const week = strategies.buildCanonicalWeekStrategy(project(row(objective)), scope, 4);
    assert.equal(week.goal.fallback.strategyId, 'crossfit'); assert.equal(week.goal.fallback.kind, 'DECLARED_SPORT_FAMILY');
  }
  // sin familia de programacion para la especialidad: el objetivo se conserva y no se inventa estrategia
  const none = resolve(project(row(CUSTOM[0], { especialidad: 'hibrido_general' })));
  assert.equal(none.status, 'STRATEGY_UNSUPPORTED'); assert.equal(none.strategyId, null); assert.equal(none.fallback, null);
  assert.equal(none.goal.candidates[0].value, CUSTOM[0]); assert.equal(none.goalAuthority.origin, 'EXPLICIT_OBJECTIVE');
});
test('16 GOAL: objetivo catalogado conserva su comportamiento (exact_primary_goal, sin fallback), incluso con otra especialidad', () => {
  for (const [objective, especialidad, id] of [['half_marathon', 'funcional_crossfit', 'half_marathon'], ['crossfit', 'funcional_crossfit', 'crossfit'],
    ['10K', 'carrera', '10k'], ['fuerza_maxima', 'fuerza_powerlifting', 'max_strength']]) {
    const r = resolve(project(row(objective, { especialidad })));
    assert.equal(r.strategyId, id); assert.equal(r.source, 'exact_primary_goal'); assert.equal(r.strategySupport, 'EXACT_GOAL');
    assert.equal(r.fallback, null); assert.equal(r.goalAuthority.objectiveRecognized, true); assert.equal(r.goalAuthority.recognizedGoalId, id);
  }
});
test('19 GOAL: el planner recibe el objetivo explicito (fuente y texto ligados a la evidencia) y el respaldo viaja marcado', () => {
  const a = strategies.buildCanonicalWeekStrategy(project(row(CUSTOM[0])), scope, 4), b = strategies.buildCanonicalWeekStrategy(project(row(CUSTOM[1])), scope, 4);
  assert.ok(a.goal.sources.some(s => s.includes('objetivo_principal')), 'la fuente del objetivo declarado viaja en la estrategia');
  assert.ok(a.goal.sources.includes('usuarios.especialidad'));
  assert.notEqual(a.goal.evidenceDigest, b.goal.evidenceDigest, 'cambiar el objetivo cambia la evidencia del planner');
  assert.equal(a.goal.id, 'crossfit'); assert.ok(a.goal.fallback); assert.ok(a.diagnostics.some(d => d.code === 'STRATEGY_FALLBACK' && d.reason === 'EXPLICIT_OBJECTIVE_NOT_SPECIALISED'));
  const exact = strategies.buildCanonicalWeekStrategy(project(row('crossfit')), scope, 4);
  assert.equal(exact.goal.fallback, undefined); assert.ok(!exact.diagnostics.some(d => d.reason === 'EXPLICIT_OBJECTIVE_NOT_SPECIALISED'));
  const context = project(row(CUSTOM[0])); assert.equal(context.goals.primary.candidates[0].value, CUSTOM[0]);
});
test('20 GOAL: objetivo no soportado => respaldo explicito y trazable; el objetivo no se falsifica en la presentacion', () => {
  const week = strategies.buildCanonicalWeekStrategy(project(row(CUSTOM[0])), scope, 4);
  const withCoverage = { ...week, coverage: week.adaptations.map(a => ({ id: a.id, adaptationId: a.id })) };
  const human = humanWeeklyObjective(withCoverage), technical = strategies.renderWeekObjective(withCoverage);
  assert.ok(!/Preparación de CrossFit/.test(human)); assert.match(human, /Programación base de /); assert.match(human, /objetivo declarado aún no tiene una estrategia específica/);
  assert.match(technical, /programación base crossfit \(objetivo declarado sin estrategia específica\)/);
  const exact = strategies.buildCanonicalWeekStrategy(project(row('crossfit')), scope, 4);
  assert.match(humanWeeklyObjective({ ...exact, coverage: exact.adaptations.map(a => ({ id: a.id, adaptationId: a.id })) }), /^Preparación de /);
  const r = resolve(project(row(CUSTOM[0]))); assert.deepEqual(plain(r), JSON.parse(JSON.stringify(r)));
  assert.ok(!JSON.stringify(r.fallback).includes('Policía'), 'el respaldo no copia prosa del atleta');
});

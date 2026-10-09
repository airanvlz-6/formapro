import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';

// FORGE BUILD 8C-A (final) — el objetivo explicito conduce la planificacion (GOAL-DRIVEN).
// explicit objective -> goal requirements -> athlete profile + training context -> planning -> sessions
const load = sportsRuntime();
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const resolve = load('../athlete/strategyResolution').resolvePlanningStrategy;
const strategies = load('../planning/canonicalWeekStrategy');
const { GOAL_REQUIREMENTS_INSTRUCTION } = load('../planning/goalRequirements');
const OBJECTIVE = 'Preparar las pruebas físicas de Policía Nacional';
const row = (objective, patch = {}) => ({ especialidad: 'funcional_crossfit', objetivo_principal: { descripcion: objective }, perfil: {}, ...patch });
const scope = { mode: 'coach', prescriptionAllowed: true, managedDisciplines: ['box', 'carrera'], externalDisciplines: [] };
const week = (r, s = scope, days = 4) => strategies.buildCanonicalWeekStrategy(project(r), s, days);

test('G1 custom objective + CrossFit => la meta sigue siendo el objetivo declarado', () => {
  const w = week(row(OBJECTIVE));
  assert.equal(w.goalRequirements.objective.text, OBJECTIVE); assert.equal(w.goalRequirements.objective.authority, 'EXPLICIT_OBJECTIVE');
  assert.equal(w.goalRequirements.objective.recognizedGoalId, null); assert.ok(w.goalRequirements.objective.sources.some(s => s.includes('objetivo_principal')));
  assert.equal(resolve(project(row(OBJECTIVE))).goal.candidates[0].value, OBJECTIVE);
});
test('G2 la estrategia NO redefine la meta como CrossFit: CrossFit es base de programacion diagnosticada', () => {
  const w = week(row(OBJECTIVE));
  assert.equal(w.goalRequirements.mode, 'GOAL_DRIVEN'); assert.equal(w.goalRequirements.strategySupport, 'SPECIALTY_FALLBACK');
  assert.deepEqual(plain(w.goalRequirements.programmingBase), { strategyId: 'crossfit', kind: 'DECLARED_SPORT_FAMILY', reason: 'EXPLICIT_OBJECTIVE_NOT_SPECIALISED' });
  assert.notEqual(w.goalRequirements.objective.text.toLowerCase(), 'crossfit'); assert.equal(w.goalRequirements.objective.recognizedGoalId, null);
  assert.ok(w.goal.fallback && w.diagnostics.some(d => d.code === 'STRATEGY_FALLBACK'));
});
test('G3 custom objective + CrossFit + running => ambos son medios de entrenamiento utilizables', () => {
  const w = week(row(OBJECTIVE));
  assert.deepEqual(plain(w.goalRequirements.trainingMeans), { declaredSpecialty: 'funcional_crossfit', managedDisciplines: ['box', 'carrera'], externalDisciplines: [] });
  assert.ok(w.methods.some(m => m.startsWith('box_')) && w.methods.includes('running_base'), 'metodos de box y de carrera disponibles');
  const only = week(row(OBJECTIVE), { ...scope, managedDisciplines: ['box'], externalDisciplines: ['carrera'] });
  assert.deepEqual(plain(only.goalRequirements.trainingMeans.externalDisciplines), ['carrera']);
});
test('G4 objetivo sin estrategia exacta => existe camino goal-driven (admitido, con requisitos para el Coach), sin estrategia hard-coded por objetivo', () => {
  const r = resolve(project(row(OBJECTIVE)));
  assert.equal(r.status, 'STRATEGY_RESOLVED'); assert.equal(r.strategySupport, 'SPECIALTY_FALLBACK');
  const w = week(row(OBJECTIVE)); assert.equal(w.goalRequirements.mode, 'GOAL_DRIVEN');
  assert.match(GOAL_REQUIREMENTS_INSTRUCTION, /deriva de él sus requisitos/); assert.match(GOAL_REQUIREMENTS_INSTRUCTION, /no cambies ni contradigas objetivo/i);
  for (const file of ['lib/planning/openWeeklyCoachContract.ts', 'lib/planning/allowedWeeklyPlanContract.ts'])
    assert.ok(readFileSync(file, 'utf8').includes('GOAL_REQUIREMENTS_INSTRUCTION'), `${file} lo incluye en el prompt del Coach`);
  assert.ok(JSON.stringify(w).includes(OBJECTIVE), 'el objetivo viaja en strategy => WEEKLY_CONTRACT que recibe el Coach');
  assert.ok(!Object.keys(load('../sports/goalTransferModel').GOAL_DEFINITIONS).some(id => /polic|bombero|guardia|oposic/i.test(id)));
});
test('G5 objetivo exacto soportado => la estrategia especializada existente sigue funcionando', () => {
  for (const [objective, id] of [['half_marathon', 'half_marathon'], ['10K', '10k'], ['crossfit', 'crossfit']]) {
    const w = week(row(objective));
    assert.equal(w.goal.id, id); assert.equal(w.goalRequirements.mode, 'EXACT_STRATEGY'); assert.equal(w.goalRequirements.programmingBase, null);
    assert.equal(w.goal.fallback, undefined); assert.equal(w.goalRequirements.objective.recognizedGoalId, id);
  }
});
test('G9 el planner goal-driven recibe contexto de entrenamiento: dias, entorno y excepciones de material; el resto viaja por el contrato semanal existente', () => {
  const user = row(OBJECTIVE, { perfil: { prescription_signals: { 'equipment.remo': { state: 'unavailable', updatedAt: 'x' }, 'equipment.yoke': { state: 'available', updatedAt: 'x' } } } });
  const c = week(user, scope, 5).goalRequirements.trainingContext;
  assert.equal(c.weeklyDaysMax, 5); assert.deepEqual(plain(c.environment), { type: 'BOX', capabilityProfile: 'STANDARD_BOX', reason: 'discipline_default' });
  assert.deepEqual(plain(c.equipment), { explicitUnavailable: ['remo'], explicitAvailable: ['yoke'] });
  const w = week(user); assert.ok(w.goalRequirements.interpretation.immutable.includes('restrictions') && w.goalRequirements.interpretation.immutable.includes('prescriptionParameters'));
  assert.equal(w.goalRequirements.interpretation.by, 'COACH_LLM');
  // disponibilidad/duracion/restricciones/dosis: campos existentes del contrato semanal (no se duplican aqui)
  const planner = readFileSync('lib/planning/weeklyCoachingContext.ts', 'utf8');
  for (const field of ['timeBudget', 'restrictions', 'references', 'availability']) assert.ok(planner.includes(field), field);
});
test('G9b equipment=[] no inventa excepciones: ausencia != unavailable', () => {
  const c = week(row(OBJECTIVE)).goalRequirements.trainingContext;
  assert.deepEqual(plain(c.equipment), { explicitUnavailable: [], explicitAvailable: [] });
});
test('G10 sin implementacion especifica por palabras clave (Policia/Bombero/...): mismo comportamiento para cualquier objetivo no catalogado', () => {
  for (const file of ['lib/athlete/strategyResolution.ts', 'lib/athlete/goalResolution.ts', 'lib/planning/goalRequirements.ts', 'lib/sports/declaredSportStrategy.ts', 'lib/planning/canonicalWeekStrategy.ts'])
    assert.ok(!/polic[ií]a|bombero|guardia civil|oposici/i.test(readFileSync(file, 'utf8')), file);
  const shapes = ['Preparar el examen de bombero', 'Cruzar los Pirineos', 'Volver a jugar al padel', 'xyzzy plugh'].map(o => {
    const w = week(row(o)); return JSON.stringify({ mode: w.goalRequirements.mode, id: w.goal.id, base: w.goalRequirements.programmingBase, support: w.goalRequirements.strategySupport }); });
  assert.equal(new Set(shapes).size, 1);
});

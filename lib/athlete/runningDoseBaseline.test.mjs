import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain, fakeDatabase } from '../sports/trainingContractTestRuntime.mjs';
const load = sportsRuntime();
const { resolveRunningDoseBaseline: resolve } = load('../athlete/runningDoseBaseline');
const { projectRunningDoseBaseline: adapt } = load('../athlete/runningDoseEvidence');
const { projectAthletePrescriptionProfile: project } = load('../athlete/athletePrescriptionContext');
const today = '2026-09-09';
const baseline = (user = {}, plans = []) => plain(adapt(user, plans, project(user).running.references, today));
// Canonical resolver fixtures, NOT invented persisted fields or a production execution importer.
const actual = (metric = 'durationSeconds', value = 1800, identity = 'activity:a', date = today) => ({
  source: 'verified_execution', identity, date, kind: 'EXECUTED', metric, value, reliability: 'verified_actual' });
const run = (overrides = {}) => ({ dia: 'miercoles', tipo: 'carrera', completada: true,
  structuredPrescription: { objective: { intent: { kind: 'adaptation', methodId: 'running_threshold', adaptationId: 'umbral' } },
    duration: { minimumSeconds: 5400, maximumSeconds: 5400 }, proposal: { blocks: [{ blockType: 'main', movements: [{ prescription: { durationSeconds: 3600 } }] }] } }, ...overrides });
const plan = (sessions = [run()]) => [{ week_start: '2026-09-07', sessions }];
const r = facts => plain(resolve(today, facts));

test('A new athlete has no invented execution', () => {
  const b = baseline(); assert.equal(b.status, 'UNKNOWN'); assert.equal(b.windows['7'].executedDurationSeconds.value, null);
});
test('B availability alone remains UNKNOWN', () => assert.equal(baseline({ perfil: { duracion: 'Hasta 1h 30min' } }).status, 'UNKNOWN'));
test('C intermediate alone remains UNKNOWN', () => assert.equal(baseline({ perfil: { nivel: 'Intermedio (1-3 años)' } }).status, 'UNKNOWN'));
test('D declared 30km stays declared, with exact source and units', () => {
  const b = baseline({ perfil: { km_semana: 30 } }); assert.equal(b.status, 'PARTIAL');
  assert.equal(b.metrics.declaredWeeklyDistanceMeters[0].value, 30000);
  assert.equal(b.metrics.declaredWeeklyDistanceMeters[0].sourcePath, 'usuarios.perfil.km_semana');
  assert.equal(b.metrics.declaredWeeklyDistanceMeters[0].unit, 'm');
  assert.equal(b.windows['7'].executedDistanceMeters.value, null);
});
test('E canonical actual duration is factual, not a target', () => {
  const b = r([actual()]); assert.equal(b.status, 'PARTIAL'); assert.equal(b.windows['7'].executedDurationSeconds.value, 1800);
  assert.equal(b.coverage.completedRunningSessions, 1);
});
test('F canonical actual distance is factual', () => assert.equal(r([actual('distanceMeters', 5000)]).windows['7'].executedDistanceMeters.value, 5000));
test('G completed planned quantity does not become actual', () => {
  const b = baseline({}, plan()); assert.equal(b.coverage.completedRunningSessions, 1);
  assert.equal(b.windows['7'].executedDurationSeconds.value, null);
  assert.ok(b.diagnostics.includes('RUNNING_DOSE_EXECUTION_QUANTITY_MISSING'));
});
test('H uncompleted 90min plan contributes no executed dose', () => {
  const b = baseline({}, plan([run({ completada: false })])); assert.equal(b.status, 'UNKNOWN');
  assert.equal(b.coverage.completedRunningSessions, 0); assert.equal(b.evidence[0].kind, 'PLANNED_ONLY');
});
test('I sums, average and longest observed run; sufficient only describes identified sample', () => {
  const b = r([actual(), actual('distanceMeters', 5000), actual('durationSeconds', 3600, 'activity:b'), actual('distanceMeters', 10000, 'activity:b')]);
  assert.equal(b.status, 'SUFFICIENT'); assert.equal(b.windows['7'].executedDurationSeconds.value, 5400);
  assert.equal(b.windows['7'].executedDistanceMeters.value, 15000);
  assert.equal(b.metrics.longestRecentRunDurationSeconds.value, 3600);
  assert.equal(b.metrics.longestRecentRunDistanceMeters.value, 10000);
  assert.equal(b.metrics.recentAverageRunDurationSeconds.value, 2700);
  assert.equal(b.coverage.captureCompleteness, 'UNKNOWN');
});
test('J non-running is excluded by exact discipline identity', () => assert.equal(baseline({}, plan([run({ tipo: 'box' })])).coverage.completedRunningSessions, 0));
test('K future and old dates excluded, invalid dates never become today', () => {
  const b = r([actual('durationSeconds', 1800, 'a', '2026-09-10'), actual('durationSeconds', 1800, 'b', '2026-08-12'), actual('durationSeconds', 1800, 'c', '2026-02-30')]);
  assert.equal(b.status, 'UNKNOWN'); assert.equal(b.coverage.completedRunningSessions, 0);
});
test('L same canonical identity across sources counts once, retains provenance', () => {
  const occurrence = { ...actual('occurrence', 1), source: 'weekly_plan', reliability: 'completion_flag' };
  const b = r([actual(), occurrence, { ...occurrence, source: 'workout_history' }, actual()]);
  assert.equal(b.coverage.completedRunningSessions, 1); assert.equal(b.windows['7'].executedDurationSeconds.value, 1800);
  assert.ok(b.diagnostics.includes('RUNNING_DOSE_DUPLICATE_EVIDENCE_EXCLUDED'));
});
test('M unlinked history is excluded, no fuzzy join to same-date plan', () => {
  const b = baseline({ workout_history: [{ tipo: 'carrera', fecha: today, workout_id: '2026-09-07_miercoles', duracion: 90 }] }, plan());
  assert.equal(b.coverage.completedRunningSessions, 1); assert.equal(b.windows['7'].executedDurationSeconds.value, null);
  assert.ok(b.diagnostics.includes('RUNNING_DOSE_IDENTITY_AMBIGUOUS_EXCLUDED'));
});
test('N declared vs observed difference is not conflict', () => {
  const b = r([...baseline({ perfil: { km_semana: 25 } }).evidence, actual('distanceMeters', 45000)]);
  assert.equal(b.conflicts.length, 0); assert.equal(b.metrics.declaredWeeklyDistanceMeters[0].value, 25000);
  assert.equal(b.windows['7'].executedDistanceMeters.value, 45000);
});
test('O same activity contradictory actuals are excluded, never averaged', () => {
  const b = r([actual(), actual('durationSeconds', 3600)]); assert.equal(b.status, 'CONFLICT');
  assert.equal(b.windows['7'].executedDurationSeconds.value, null); assert.equal(b.conflicts[0].metric, 'durationSeconds');
});
test('P stable method association counts completed plan occurrence only', () => {
  const b = baseline({}, plan()); assert.equal(b.metrics.recentMethodExposure[0].methodId, 'running_threshold');
  assert.equal(b.metrics.recentMethodExposure[0].completedPlanOccurrences, 1);
});
test('Q historical title/text never determines method', () => {
  const b = baseline({}, plan([run({ structuredPrescription: null, titulo: 'running_threshold', descripcion_real: '60 minutos de umbral' })]));
  assert.deepEqual(b.metrics.recentMethodExposure, []);
});
test('R missing actual main quantity stays null', () => assert.equal(baseline({}, plan()).metrics.recentMethodExposure[0].executedMainWorkSeconds, null));
test('S readiness cannot rewrite facts', () => assert.deepEqual(baseline({ readiness: 'high' }, plan()), baseline({ readiness: 'low' }, plan())));
test('T restrictions cannot rewrite facts', () => assert.deepEqual(baseline({ restricciones: ['restricted'] }, plan()), baseline({}, plan())));
test('U 60 to 120min availability does not change baseline', () => assert.deepEqual(baseline({ perfil: { duracion: '60 min' } }, plan()), baseline({ perfil: { duracion: '120 min' } }, plan())));
test('V beginner to advanced does not change baseline', () => assert.deepEqual(baseline({ perfil: { nivel: 'Principiante' } }, plan()), baseline({ perfil: { nivel: 'Avanzado' } }, plan())));

test('Canary civil dates, inclusive 7/28 windows and stable ordering', () => {
  const facts = [actual('durationSeconds', 1200, 'a', '2026-09-02T23:30:00Z'), actual('distanceMeters', 1000, 'b', '2026-08-13')];
  const b = r(facts); assert.equal(b.windows['7'].completedRunningSessions, 1); assert.equal(b.windows['28'].completedRunningSessions, 2);
  assert.deepEqual(b, r([...facts].reverse())); assert.deepEqual(JSON.parse(JSON.stringify(b)), b);
  assert.throws(() => resolve('2026-02-30', []));
});
test('partial quantities expose known contributions without claiming complete total', () => {
  const b = r([actual(), actual('occurrence', 1, 'b')]);
  assert.equal(b.windows['7'].executedDurationSeconds.status, 'PARTIAL');
  assert.equal(b.windows['7'].executedDurationSeconds.value, 1800);
});
test('identity date conflict excludes whole activity', () => {
  const b = r([actual(), actual('distanceMeters', 5000, 'activity:a', '2026-09-08')]);
  assert.equal(b.status, 'CONFLICT'); assert.equal(b.coverage.completedRunningSessions, 0);
});
test('duplicate plan days without stable IDs remain ambiguous', () => {
  const b = baseline({}, plan([run(), run()])); assert.equal(b.coverage.completedRunningSessions, 0);
  assert.ok(b.diagnostics.includes('RUNNING_DOSE_IDENTITY_AMBIGUOUS_EXCLUDED'));
});
test('LLM stores, narratives, arbitrary raw quantities do not enter quantitative evidence', () => {
  const b = baseline({ datos_entrenamiento: { km_semana: 80 }, test_atleta: { informe: { km_semana: 90 } },
    volumen_relativo: 0.6, historial_marcas: [{ ejercicio: 'km_semana', valor: 100 }],
    workout_history: [{ tipo: 'carrera', fecha: today, duracion: 60, distancia: 10000, source: 'safety_net_deterministico' }] });
  assert.equal(b.metrics.declaredWeeklyDistanceMeters.length, 0); assert.equal(b.windows['7'].executedDurationSeconds.value, null);
  assert.equal(r([{ ...actual(), source: 'llm_summary' }]).evidence.length, 0);
});
test('declared ranges retain endpoints; dates are not silently refreshed', () => {
  const b = baseline({ perfil: { km_semana: '20-40km' }, test_atleta: { km_semana: '40-60km', fecha: '2025-01-01' } });
  assert.deepEqual(b.metrics.declaredWeeklyDistanceMeters[0].value, { min: 20000, max: 40000 });
  assert.equal(b.metrics.declaredWeeklyDistanceMeters.length, 1);
});
test('invalid numeric evidence, incompatible units and free-text method labels never become facts', () => {
  for (const value of [0, -1, NaN, Infinity]) assert.equal(r([actual('durationSeconds', value)]).evidence.length, 0);
  assert.equal(r([{ ...actual(), unit: 'm' }]).evidence.length, 0);
  assert.equal(r([{ ...actual(), plannedMethodId: 'clinical free text', description: 'private narrative' }]).metrics.recentMethodExposure.length, 0);
  assert.doesNotMatch(JSON.stringify(r([{ ...actual(), plannedMethodId: 'clinical free text', description: 'private narrative' }])), /clinical|private|description/);
});
test('server loader exposes baseline without extra reads; SessionDoseContext serialization unchanged', async () => {
  const user = { especialidad: 'carrera', perfil: { duracion: '90 min', km_semana: 30 } };
  const db = fakeDatabase({ usuarios: user, weekly_plan: plan() });
  const context = await load('../athlete/loadAthletePrescriptionContext').loadAthletePrescriptionContext(db, 'synthetic', { asOfDate: today });
  assert.equal(context.runningDoseBaseline.coverage.completedRunningSessions, 1);
  assert.equal(db.calls.filter(t => t === 'weekly_plan').length, 1);
  assert.ok(!db.calls.includes('external_training_records'));
  const build = load('sessionDoseContext').buildSessionDoseContext;
  const withBaseline = plain(build(context)); const without = { ...context }; delete without.runningDoseBaseline;
  assert.deepEqual(withBaseline, plain(build(without)));
  assert.ok(!JSON.stringify(withBaseline).includes('runningDoseBaseline'));
});

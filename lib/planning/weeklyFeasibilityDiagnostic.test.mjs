import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sportsRuntime, contractFixture, plain, fakeDatabase } from '../sports/trainingContractTestRuntime.mjs';
const events = [], load = sportsRuntime({ console: { info: (...args) => events.push(args) } });
const api = load('../planning/allowedWeeklyPlanContract'), diagnostic = load('../planning/weeklyFeasibilityDiagnostic');
const days = load('../planning/weeklyCalendar').calendarDays;
const library = load('movementLibrary').MOVEMENT_LIBRARY;
const metadata = { planningRunId: '6335fd6b-8a01-412c-affd-7c46a346f031', temporalDecision: null };
function fixture(blocked = false) {
  const scope = { mode: 'coach', prescriptionAllowed: true, managedDisciplines: ['box'], externalDisciplines: [] };
  const restrictions = load('../athlete/getCanonicalRestrictions').projectCanonicalRestrictions([], blocked
    ? Object.keys(library).map(movement => ({ movement, status: 'pending', constraint_level: 'hard' })) : [], '2026-09-08');
  const context = contractFixture({ prescriptionScope: scope, targetWeekStart: '2026-09-07', discipline: 'box',
    availableDays: ['martes'], restrictionsSnapshot: restrictions });
  const profile = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({ objetivo_principal: 'crossfit' });
  return { targetWeekStart: '2026-09-07', prescriptionScope: scope, maxExecutableDays: 6, completeNewWeek: false,
    allowed: { box: ['martes'] }, contexts: { box: context }, fixed: {},
    strategy: load('../planning/canonicalWeekStrategy').buildCanonicalWeekStrategy(profile, scope, 6) };
}
test('aggregate failure keeps its exact response and retains discarded movement-pool reasons once', () => {
  events.length = 0;
  const input = fixture(true), before = JSON.stringify(input), r = api.buildAllowedWeeklyPlanContract(input, metadata);
  assert.deepEqual(plain(r), { ok: false, code: 'WEEKLY_CONTRACT_UNSATISFIABLE', errors: ['NO_VALID_EXECUTABLE_REST_ARRANGEMENT'] });
  assert.equal(JSON.stringify(input), before); assert.equal(events.length, 1);
  const [name, d] = events[0]; assert.equal(name, 'WEEKLY_FEASIBILITY_REJECTION_DIAGNOSTIC');
  assert.equal(d.planningRunId, metadata.planningRunId); assert.equal(d.temporalDecision, null);
  assert.equal(d.rejectedIntents.length, 13); assert.equal(d.rejectionSummary.MOVEMENT_POOL_EMPTY, 13);
  assert.ok(d.rejectedIntents.every(r => r.day === 'martes' && r.methodId && r.errorCodes.includes('MOVEMENT_POOL_EMPTY')));
  assert.equal(d.calendar.find(d => d.day === 'martes').canTrain, false);
  assert.equal(d.calendar.find(d => d.day === 'martes').canRest, true);
});
test('successful contract and digest are identical to the pre-instrumentation golden, without logs', () => {
  events.length = 0;
  const input = fixture(), before = JSON.stringify(input), result = api.buildAllowedWeeklyPlanContract(input, metadata);
  assert.equal(result.ok, true); assert.equal(events.length, 0); assert.equal(JSON.stringify(input), before);
  // Captured by running the same input against allowedWeeklyPlanContract.ts at 6e29fd1.
  assert.equal(createHash('sha256').update(JSON.stringify(result)).digest('hex'), '7163f4b72babef8558ce699bbdca9549a9e5c442b6f4d2056d883e4228cf01fa');
  assert.deepEqual(plain(result), plain(api.buildAllowedWeeklyPlanContract(input, { planningRunId: metadata.planningRunId, temporalDecision: false })));
});
test('multiple rejection codes aggregate by rejected intent and exclude unknown prose codes', () => {
  const r = (codes) => diagnostic.projectRejectedWeeklyIntent('martes', 'box', { kind: 'adaptation', methodId: 'box_power', adaptationId: 'potencia', pattern: 'jump' },
    { feasible: false, errors: codes });
  const rows = [r(['MOVEMENT_POOL_EMPTY', 'STRUCTURE_POOL_EMPTY']), r(['INTENT_POOL_EMPTY']),
    r(['STRUCTURE_SPACE_UNSATISFIABLE', 'MOVEMENT_POOL_EMPTY', 'MOVEMENT_POOL_EMPTY', 'secret free text'])];
  const before = JSON.stringify(rows), d = diagnostic.buildWeeklyFeasibilityDiagnostic(fixture(), {}, rows, metadata);
  assert.deepEqual(plain(d.rejectionSummary), { MOVEMENT_POOL_EMPTY: 2, INTENT_POOL_EMPTY: 1, STRUCTURE_POOL_EMPTY: 1, STRUCTURE_SPACE_UNSATISFIABLE: 1 });
  assert.equal(JSON.stringify(rows), before); assert.ok(!JSON.stringify(d).includes('secret free text'));
});
test('explicit field and value allowlists reject secrets at every domain level without mutation', () => {
  const secret = { userId: 'SECRET', email: 'SECRET', description: 'SECRET', clinicalNote: 'SECRET', prompt: 'SECRET', token: 'SECRET' };
  const input = fixture(true); Object.assign(input, secret); Object.assign(input.strategy, secret);
  input.strategy.goal.sources = ['SECRET']; input.strategy.methods.push('SECRET');
  input.strategy.adaptations.push({ id: 'SECRET', requiredPattern: 'SECRET', ...secret });
  const restrictions = input.contexts.box.restrictionsSnapshot;
  Object.assign(restrictions, secret); restrictions.areas.push('SECRET');
  restrictions.restrictions.push({ movement: 'SECRET', prohibits_impact: true, ...secret });
  const calendar = { martes: [{ state: 'REST', ...secret }] };
  const rejected = [{ day: 'SECRET', discipline: 'SECRET', methodId: 'SECRET', adaptationId: 'SECRET', requiredPattern: 'SECRET',
    errorCodes: ['SECRET'], feasible: false, ...secret }];
  const before = JSON.stringify({ input, calendar, rejected });
  const d = diagnostic.buildWeeklyFeasibilityDiagnostic(input, calendar, rejected, { planningRunId: 'SECRET', ...secret });
  assert.equal(JSON.stringify({ input, calendar, rejected }), before);
  assert.ok(!JSON.stringify(d).includes('SECRET'));
  for (const key of Object.keys(secret)) assert.ok(!JSON.stringify(d).includes('"' + key + '"'));
  assert.equal(d.restrictionsProjection[0].entries.at(-1).movement, null);
  assert.equal(d.restrictionsProjection[0].entries.at(-1).prohibits_impact, true);
});
test('logging failure cannot replace an unsatisfiable result', () => {
  const throwing = sportsRuntime({ console: { info() { throw Error('LOGGER_FAILED'); } } })('../planning/allowedWeeklyPlanContract');
  assert.deepEqual(plain(throwing.buildAllowedWeeklyPlanContract(fixture(true), metadata)), plain(api.buildAllowedWeeklyPlanContract(fixture(true), metadata)));
});
test('projection failure is contained and emits no partial domain object', () => {
  events.length = 0;
  const input = fixture(); input.contexts.box.restrictionsSnapshot.areas = null;
  assert.doesNotThrow(() => diagnostic.emitWeeklyFeasibilityDiagnostic(input, {}, [], metadata));
  assert.equal(events.length, 0);
});
test('restriction movement uses the same exact normalization as feasibility, never free prose', () => {
  const input = fixture();
  input.contexts.box.restrictionsSnapshot.restrictions.push({ movement: 'Back Squat', prohibits_axial_load: true });
  const d = diagnostic.buildWeeklyFeasibilityDiagnostic(input, {}, [], metadata);
  assert.equal(d.restrictionsProjection[0].entries[0].movement, 'back_squat');
  assert.equal(input.contexts.box.restrictionsSnapshot.restrictions[0].movement, 'Back Squat');
});
test('other contract failures do not emit the aggregate rejection log', () => {
  events.length = 0;
  const input = fixture(); input.targetWeekStart = 'invalid';
  assert.equal(api.buildAllowedWeeklyPlanContract(input).ok, false); assert.equal(events.length, 0);
});

for (const temporalIntent of [undefined, true, false]) test(`preflight forwards run ID and actual temporal intent ${temporalIntent} without changing rejection DTO`, async () => {
  events.length = 0;
  const availability = { box: ['martes', 'jueves', 'viernes', 'sabado'], carrera: ['lunes', 'miercoles', 'domingo'] };
  // Controlled exclusions exercise instrumentation, not a claim about production restrictions.
  const tables = { usuarios: { modo_entrada: 'coach', categoria: 'funcional', especialidad: 'funcional_crossfit',
    objetivo_principal: 'Open CrossFit Games 2027 - estándares Masters', perfil: {}, workout_history: [], distribucion_semanal: availability },
    athlete_training_sources: Object.entries(availability).map(([disciplina, dias]) => ({ disciplina, dias, activo: true, owner: 'forge' })),
    athlete_coaching_notes: Object.keys(library).map(movement => ({ movement, status: 'pending', constraint_level: 'hard' })),
    athlete_state_events: [], weekly_plan: [], physiology_records: [], session_modification_events: [] };
  const db = fakeDatabase(tables), from = db.from.bind(db);
  db.from = table => { const q = from(table); q.update = q.insert = () => { throw Error('NO_WRITES'); };
    if (['weekly_plan', 'physiology_records'].includes(table)) q.maybeSingle = async () => ({ data: null, error: null }); return q; };
  const quiet = sportsRuntime({ console: { log() {}, warn() {}, info: (...args) => events.push(args) } });
  const before = JSON.stringify(tables);
  const r = await quiet('../planning/weeklyGenerationPreflight').resolveWeeklyGenerationPreflight(db, 'fixture', {
    targetWeekStart: '2026-09-07', today: '2026-09-08', snapshot: { sessions: days.map((dia, i) => ({ dia,
      tipo: ['carrera', 'box', 'descanso', 'box', 'carrera', 'box', 'descanso'][i] })) }, temporalIntent, planningRunId: metadata.planningRunId });
  assert.deepEqual(plain(r), { ok: false, code: 'WEEKLY_CONTRACT_UNSATISFIABLE', errors: ['NO_VALID_EXECUTABLE_REST_ARRANGEMENT'],
    availabilityStatus: 'VALID', canContinue: false, temporalDecision: null });
  const logs = events.filter(e => e[0] === 'WEEKLY_FEASIBILITY_REJECTION_DIAGNOSTIC');
  assert.equal(logs.length, 1); assert.equal(logs[0][1].planningRunId, metadata.planningRunId);
  assert.equal(logs[0][1].temporalDecision, temporalIntent ?? null);
  assert.equal(logs[0][1].rejectedIntents.length, temporalIntent === false ? 39 : 52);
  assert.equal(JSON.stringify(tables), before);
});

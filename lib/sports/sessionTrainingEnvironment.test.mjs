import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, fakeDatabase, plain, completeDoseFixture } from './trainingContractTestRuntime.mjs';
const load = sportsRuntime({ console: { log() {}, info() {}, warn() {} } });
const signals = load('../athlete/prescriptionSignals').projectPrescriptionSignals;
const sufficiency = load('prescriptionDataSufficiency').resolvePrescriptionDataSufficiency;
const thursday = { date: '2026-09-10', assignedDiscipline: 'box', confirmedAssignment: { date: '2026-09-10', discipline: 'box' } };
const project = (profile = {}, session = thursday) => signals(profile, session.date, session);
test('T1–T4 confirmed Thursday Box grants dumbbell and SkiErg without profile environment or question', () => {
  const s = project(); assert.equal(s.environment.environment, 'BOX'); assert.equal(s.environment.sessionEnvironmentSource, 'SESSION_ASSIGNMENT');
  for (const [equipment, movement] of [['mancuerna', 'db_deadlift'], ['ski_erg', 'ski_erg']]) {
    assert.equal(s.signals[`equipment.${equipment}`].state, 'available');
    const r = sufficiency(s, [], { movementId: movement, discipline: 'box' });
    assert.equal(r.status, 'sufficient'); assert.equal(r.questions.length, 0);
  }
});
test('T5 equipment overrides retain priority over session environment', () => {
  for (const profile of [{ prescription_signals: { 'equipment.ski_erg': { state: 'unavailable' } } },
    { prescription_access: { '2026-09-10': { 'equipment.ski_erg': { state: 'unavailable' } } } }]) {
    const s = project(profile); assert.equal(s.environment.environment, 'BOX');
    assert.equal(s.signals['equipment.ski_erg'].state, 'unavailable');
    assert.equal(sufficiency(s, [], { movementId: 'ski_erg', discipline: 'box' }).questions.length, 0);
  }
});
test('T6/T7 date override, explicit session, assignment, then habitual profile', () => {
  assert.equal(project({ lugar_entreno: 'HOME' }).environment.environment, 'BOX');
  const explicit = project({ lugar_entreno: 'BOX' }, { ...thursday, explicitSessionEnvironment: 'HOME' });
  assert.equal(explicit.environment.environment, 'HOME'); assert.equal(explicit.signals['equipment.mancuerna'].state, 'unknown');
  const date = project({ lugar_entreno: 'BOX', prescription_access: { '2026-09-10': { environment: 'HOME' } } }, { ...thursday, explicitSessionEnvironment: 'BOX' });
  assert.equal(date.environment.environment, 'HOME'); assert.equal(date.environment.sessionEnvironmentSource, 'DATE_OVERRIDE');
  assert.equal(project({ lugar_entreno: 'BOX', prescription_access: { '2026-09-11': { environment: 'HOME' } } }).environment.environment, 'BOX');
});
test('T8–T11 no specialty, goal, notes, unconfirmed request, other day or running leakage', () => {
  for (const session of [{ date: thursday.date, assignedDiscipline: 'box' }, { ...thursday, date: '2026-09-09', assignedDiscipline: 'carrera' },
    { ...thursday, confirmedAssignment: { date: '2026-09-11', discipline: 'box' } }]) {
    const s = project({ especialidad: 'funcional_crossfit', objetivo: 'CrossFit', notas_coach: 'Box', distribucion_semanal: { box: ['jueves'] } }, session);
    assert.equal(s.environment.environment, 'UNKNOWN'); assert.equal(s.signals['equipment.mancuerna'].state, 'unknown');
  }
});
test('unknown explicit override blocks fallback; inputs are not mutated', () => {
  const p = { lugar_entreno: 'BOX', prescription_access: { '2026-09-10': { environment: 'private free text' } } }, before = JSON.stringify(p);
  assert.equal(project(p).environment.environment, 'UNKNOWN'); assert.equal(JSON.stringify(p), before);
});

function database() {
  const tables = { usuarios: { modo_entrada: 'coach', especialidad: 'carrera', categoria: 'carrera', objetivo_principal: 'half_marathon',
    perfil: { dias: 6 }, workout_history: [], distribucion_semanal: { box: ['martes', 'jueves'], carrera: ['lunes', 'miercoles', 'viernes', 'sabado'] } },
    weekly_plan: [], athlete_training_sources: [], external_training_records: [], athlete_coaching_notes: [], athlete_state_events: [] };
  const db = fakeDatabase(tables), from = db.from.bind(db);
  db.from = table => { const q = from(table); q.update = q.insert = () => { throw Error('NO_DB_WRITES'); };
    if (table === 'weekly_plan') q.maybeSingle = async () => ({ data: null, error: null }); return q; };
  return { db, tables };
}
test('T12 real confirmation → preflight → signed cookie → Planner receipt → Thursday Builder environment', async () => {
  const { db, tables } = database();
  const confirmation = await load('chatAvailability').updateChatAvailability(db, 'fixture', 'Sigue siendo así');
  assert.equal(confirmation.ok, true); assert.equal(confirmation.responseKind, 'CONFIRM_EXISTING_AVAILABILITY');
  const request = { targetWeekStart: '2026-09-07', today: '2026-09-08', snapshot: null, confirmedAvailabilityDigest: confirmation.snapshotDigest };
  const preflight = await load('../planning/weeklyGenerationPreflight').resolveWeeklyGenerationPreflight(db, 'fixture', { ...request, temporalIntent: 'Próximo día disponible' });
  assert.equal(preflight.canContinue, true); assert.equal(preflight.temporalDecision.includeToday, false);
  const cookies = load('../planning/sessionEnvironmentConfirmation'), binding = { user: 'fixture', weekStart: request.targetWeekStart, generationToken: 'server-generation' };
  const cookie = cookies.issueEnvironmentConfirmation(binding, confirmation.snapshotDigest);
  const digest = cookies.readEnvironmentConfirmation(`${cookies.ENVIRONMENT_CONFIRMATION_COOKIE}=${cookie}`, binding);
  assert.equal(digest, confirmation.snapshotDigest);
  async function plan(confirmedAvailabilityDigest) {
    const r = await load('../planning/prepareAllowedWeeklyPlanContract').planBoundedWeek(db, 'fixture', { ...request, empezarHoy: false, confirmedAvailabilityDigest }, async prompt => {
      const c = JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1]);
      return JSON.stringify({ contractVersion: 1, contextDigest: c.contextDigest, selections: Object.entries(c.dayOptions).map(([day, options]) => ({ day,
        optionId: (day === 'jueves' ? options.find(o => o.stimulusId === 'cadena_posterior') : options.find(o => o.state === 'TRAIN'))?.optionId || options[0].optionId })) });
    }, binding.generationToken);
    assert.equal(r.ok, true, JSON.stringify(r)); return r.estructura;
  }
  const structure = await plan(digest), slot = structure.sessions.find(s => s.dia === 'jueves');
  let builderCalls = 0, captured;
  const result = await load('sessionAuthority').generateTrainingSession(db, 'fixture', { targetWeekStart: request.targetWeekStart, day: 'jueves', discipline: slot.tipo, stimulus: slot.stimulusId,
    weekly: { receipt: structure.calendarReceipt, generationToken: binding.generationToken, optionId: slot.optionId } }, async prompt => {
      builderCalls++; captured = JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nIntent canónico:')[0].split('\nContexto no autoritativo:')[0]);
      return JSON.stringify(completeDoseFixture(captured, { stimulusId: captured.stimulusId, structureId: captured.allowedStructureIds[0],
        blocks: ['warmup', 'main', 'cooldown'].map(blockType => ({ blockType,
          movements: [{ movementId: captured.allowedMovementIds[0], prescription: { reps: 5 } }] })) }));
    });
  assert.equal(builderCalls, 1); assert.notEqual(result.code, 'PRESCRIPTION_DATA_MISSING');
  assert.equal(captured.doseContext.sufficiency.environment.environment, 'BOX');
  assert.equal(captured.doseContext.sufficiency.environment.sessionEnvironmentSource, 'SESSION_ASSIGNMENT');
  assert.equal(captured.doseContext.sufficiency.signals['equipment.mancuerna'].state, 'available');
  assert.equal(result.ok, true, JSON.stringify(result));
  await load('sessionAuthority').assertFreshSessionRestrictions(db, 'fixture', request.targetWeekStart, result.sesion);
  const authority = load('../planning/weeklyCalendarAuthority');
  const missing = await plan(undefined);
  assert.equal((await authority.assertFreshWeeklyAuthority(db, 'fixture', request.targetWeekStart, missing.calendarReceipt, binding.generationToken)).availabilityConfirmed, false);
  // Confirmation becomes unusable if current distribution changes, even if a planner can compose a week.
  tables.usuarios.distribucion_semanal.box = ['jueves'];
  await assert.rejects(authority.assertFreshWeeklyAuthority(db, 'fixture', request.targetWeekStart, structure.calendarReceipt, binding.generationToken), /WEEKLY_CONTEXT_STALE/);
  await assert.rejects(load('sessionAuthority').assertFreshSessionRestrictions(db, 'fixture', request.targetWeekStart, result.sesion), /WEEKLY_CONTEXT_STALE/);
  assert.equal(plain(tables.usuarios.perfil).lugar_entreno, undefined);
});

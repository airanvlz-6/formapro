import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sportsRuntime, plain, compile } from '../sports/trainingContractTestRuntime.mjs';
const load = sportsRuntime();
const create = load('../auth/legacyContainment').projectLegacyCreate;
const chat = load('chatAvailability');
const calendar = load('../planning/weeklyCalendarAuthority');
const days = ['lunes', 'miercoles', 'viernes', 'domingo'];
const input = { codigo: 'fixture', modo_entrada: 'planificacion', categoria: 'carrera', especialidad: 'carrera',
  perfil: { dias: '4 días', dias_disponibles: days, duracion: 'Hasta 1h 30min', superficie: ['Asfalto / ciudad', 'Pista de atletismo'],
    distancia_objetivo: 'Media maratón (21K)', nivel: 'Intermedio (1-3 años)', dispositivo: 'Sí, reloj GPS con pulsómetro', lesiones: 'ninguna' },
  distribucion_semanal: JSON.stringify({ disponibilidad: days }) };
function db(profile) {
  const tables = { usuarios: [profile], athlete_training_sources: [], athlete_state_events: [], athlete_coaching_notes: [],
    weekly_plan: [], external_training_records: [] };
  return { tables, from(table) {
    let patch;
    const q = { select() { return q; }, eq() { return q; }, in() { return q; }, order() { return q; }, limit() { return q; }, range() { return q; },
      update(p) { patch = p; return q; }, execute(single = false) {
        if (patch) tables[table].forEach(r => Object.assign(r, plain(patch)));
        return Promise.resolve({ data: single ? tables[table]?.[0] ?? null : tables[table] || [], error: null });
      }, single() { return q.execute(true); }, maybeSingle() { return q.execute(true); }, then(y,n) { return q.execute().then(y,n); } };
    return q;
  } };
}
test('A: actual onboarding payload fails before writer repair and persists discipline days after', async () => {
  assert.equal((await chat.readAvailabilityConfirmation(db(input), 'fixture')).ok, false);
  const stored = create(input), database = db(stored);
  assert.deepEqual(JSON.parse(stored.distribucion_semanal), { carrera: days });
  assert.deepEqual(plain((await calendar.loadWeeklyCalendarContext(database, 'fixture')).allowed), { carrera: days });
  assert.deepEqual(stored.perfil, input.perfil);
});
test('C/D/G: habitual asks; explicit yes confirms current snapshot without changing duration or storage', async () => {
  const database = db(create(input)), before = JSON.stringify(database.tables);
  const question = await chat.readAvailabilityConfirmation(database, 'fixture');
  assert.equal(question.ok, true); assert.match(question.question, /¿Sigue siendo correcta/);
  assert.match(question.question, /lunes, miercoles, viernes, domingo/);
  const answer = await chat.updateChatAvailability(database, 'fixture', 'Sí', question.snapshotDigest);
  assert.equal(answer.responseKind, 'CONFIRM_EXISTING_AVAILABILITY');
  assert.equal(answer.ok, true); assert.equal(JSON.stringify(database.tables), before);
  const canonical = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile(database.tables.usuarios[0]);
  assert.equal(load('sessionDoseContext').buildSessionDoseContext(canonical).timeBudget.maximumSeconds, 5400);
});
test('E: existing correction grammar remains bounded; explicit discipline correction updates habitual', async () => {
  const database = db(create(input)), q = await chat.readAvailabilityConfirmation(database, 'fixture');
  const ambiguous = await chat.updateChatAvailability(database, 'fixture', 'Esta semana solo lunes, miércoles y domingo', q.snapshotDigest);
  assert.equal(ambiguous.ok, false); // Existing grammar requires discipline; no new override semantics.
  const result = await chat.updateChatAvailability(database, 'fixture', 'carrera solo lunes, miércoles y domingo', q.snapshotDigest);
  assert.equal(result.ok, true); assert.equal(result.responseKind, 'UPDATE_AVAILABILITY');
  assert.deepEqual(plain((await calendar.loadWeeklyCalendarContext(database, 'fixture')).allowed), { carrera: ['lunes','miercoles','domingo'] });
});
test('F/J: no data remains blocked; existing discipline-specific profile is unchanged', async () => {
  assert.equal((await chat.readAvailabilityConfirmation(db(create({ ...input, distribucion_semanal: undefined })), 'fixture')).ok, false);
  const existing = { ...input, distribucion_semanal: JSON.stringify({ carrera: days }) };
  assert.equal(create(existing).distribucion_semanal, existing.distribucion_semanal);
  assert.equal((await chat.readAvailabilityConfirmation(db(create(existing)), 'fixture')).ok, true);
});
test('no count/prose/ambiguous discipline/focus inference, and no Carrera special case', () => {
  for (const distribution of [{ disponibilidad: '4 días' }, { disponibilidad: ['festivo'] }, { disponibilidad: days, box: ['martes'] }]) {
    const value = { ...input, distribucion_semanal: JSON.stringify(distribution) };
    assert.equal(create(value).distribucion_semanal, value.distribucion_semanal);
  }
  for (const patch of [{ modo_entrada: 'focus' }, { categoria: 'box' }]) {
    const value = { ...input, ...patch }; assert.equal(create(value).distribucion_semanal, value.distribucion_semanal);
  }
  assert.deepEqual(JSON.parse(create({ ...input, categoria: 'funcional', especialidad: 'funcional_crossfit' }).distribucion_semanal), { box: days });
});
test('L: fresh DB read rejects changed confirmation snapshot', async () => {
  const database = db(create(input)), q = await chat.readAvailabilityConfirmation(database, 'fixture');
  database.tables.usuarios[0].distribucion_semanal = JSON.stringify({ carrera: ['lunes'] });
  const answer = await chat.updateChatAvailability(database, 'fixture', 'Sí', q.snapshotDigest);
  assert.equal(answer.code, 'AVAILABILITY_CONFIRMATION_STALE');
});
test('B/K: actual generation entry rereads after onboarding and asks before methodology agreement can generate', async () => {
  const source = ts.createSourceFile('FormaPro.tsx', readFileSync('app/FormaPro.tsx','utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let entry; function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(source) === 'dispararGeneracion') entry = n.initializer; ts.forEachChild(n,visit); } visit(source);
  const database = db(create(input)), messages = [], pending = [];
  const fn = vm.runInNewContext(compile(`const run=${entry.getText(source)};run;`), {
    weeklyTemporalIntentRef: { current: {} }, weeklyPlanningContinuationRef: { current: null }, availabilityConfirmationRef: { current: null },
    codigoUsuario: 'fixture', apiCall: async body => { assert.equal(body.action,'obtener_confirmacion_disponibilidad'); return chat.readAvailabilityConfirmation(database, body.codigo); },
    setEsperandoConfirmacionDisponibilidad: x => pending.push(x), setMensajes: f => messages.push(...f([])),
    setGenerandoSemana: () => assert.fail('must ask first'),
  });
  await fn('Estoy de acuerdo');
  assert.deepEqual(pending,[true]); assert.match(messages[0].content,/¿Sigue siendo correcta/);
  assert.equal(load('availabilityResponse').isExistingAvailabilityConfirmation('Estoy de acuerdo'), false);
});
test('I: future-week planning consumes persisted days with empezarHoy false', async () => {
  const result = await load('../planning/prepareAllowedWeeklyPlanContract').loadWeeklyPlanningContext(db(create(input)), 'fixture',
    { targetWeekStart: '2026-09-14', today: '2026-09-09', empezarHoy: false, snapshot: null });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(plain(result.input.allowed), { carrera: days });
});
test('H: writer preserves environment facts; only confirmed Box assignment grants session authority', () => {
  const stored = create(input), environment = load('sessionTrainingEnvironment').resolveSessionTrainingEnvironment;
  const unconfirmed = { date: '2026-09-14', assignedDiscipline: 'box' };
  assert.deepEqual(stored.perfil.superficie, input.perfil.superficie);
  assert.notEqual(environment(stored.perfil, unconfirmed).sessionEnvironmentSource, 'SESSION_ASSIGNMENT');
  const confirmed = environment(stored.perfil, { ...unconfirmed, confirmedAssignment: { date: unconfirmed.date, discipline: 'box' } });
  assert.equal(confirmed.sessionEnvironmentSource, 'SESSION_ASSIGNMENT');
  assert.equal(confirmed.environment, 'BOX');
});

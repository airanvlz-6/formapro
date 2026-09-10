import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';
const load = sportsRuntime();
const { projectAthletePrescriptionProfile: project, parseSessionTime: time } = load('../athlete/athletePrescriptionContext');
const { loadAthletePrescriptionContext: read } = load('../athlete/loadAthletePrescriptionContext');
export const hybrid = {
  modo_entrada: 'coach', categoria: 'hibrido', especialidad: 'hibrido_general',
  perfil: { objetivo_general: 'Mejorar squat + 10K', duracion: '45 min', fc_max: 190, lesiones: 'molestia declarada' },
  objetivo_principal: { descripcion: 'Mejorar squat + 10K' }, test_atleta: { back_squat: '140kg', fecha: '2026-09-01' },
  datos_entrenamiento: { z2_fc: '130–145' },
  athlete_development: [{ id: 'weakness-squat', indicador: 'back_squat', estado: 'activa', prioridad: 'alta',
    evidencias: ['Declaración del atleta'], ultima_revision: '2026-09-06' }],
  ciclo_actual: { bloque: 'acumulación', semana: 2, totalSemanas: 4, objetivo: 'Mejorar fuerza y carrera' },
};
test('goals coalesce compatible sources without losing provenance; contradictory goals remain unresolved', () => {
  const p = project(hybrid); assert.equal(p.goals.primary.reason, 'resolved'); assert.equal(p.goals.primary.candidates.length, 2);
  const c = project({ ...hybrid, objetivo_principal: { descripcion: 'Preparar un maratón' } });
  assert.equal(c.goals.primary.resolved, null); assert.equal(c.goals.primary.reason, 'conflict');
});
for (const [input, min, max, open] of [['45 min', null, 45, false], ['60–75 min', 60, 75, false],
  ['más de 90', 90, null, true], ['Hasta 1h 30min', null, 90, false], ['Más de 1 hora', 60, null, true], ['60 min', null, 60, false]]) {
  test(`time budget ${input}`, () => { const t = time(input); assert.equal(t.minMinutes, min); assert.equal(t.maxMinutes, max); assert.equal(t.openEnded, open); });
}
test('unknown, invalid and contradictory durations are explicit', () => {
  for (const value of ['sin dato', '75-60 min', '-45', 0, Infinity]) assert.equal(time(value), null);
  const p = project({ perfil: { duracion: '45 min', duracion_clase: '60 min' } }); assert.equal(p.sessionTimeBudget.reason, 'conflict');
  assert.equal(project({ perfil: { duracion: 'cuando pueda' } }).unparsed[0].reason, 'unknown_duration');
});
test('known questionnaire 1RM and aliases are canonical; ordinary stored weights are not inferred 1RM', () => {
  assert.equal(project(hybrid).strength.references[0].value.referenceType, '1rm');
  const p = project({ marcas_especificas: { 'sentadilla trasera': '140kg', clean_jerk: '80kg', deadlift_3rm: '180kg' },
    historial_marcas: [{ ejercicio: 'snatch', valor: '90kg', fecha: '2026-08-01' }] });
  assert.equal(p.strength.byMovement.back_squat.resolved.value.referenceType, 'unknown_rm');
  assert.equal(p.strength.byMovement.clean_and_jerk.resolved.value.movementId, 'clean_and_jerk');
  assert.equal(p.strength.byMovement.deadlift.resolved.value.referenceType, 'nrm');
  assert.equal(p.strength.byMovement.deadlift.resolved.value.repsIfKnown, 3);
  assert.equal(p.strength.byMovement.snatch.resolved.value.referenceType, 'unknown_rm');
});
test('NRM, explicit PR, unsupported units and ambiguous movements never become 1RM', () => {
  for (const [raw, type, reps] of [['3RM 120kg', 'nrm', 3], ['120kg 5RM', 'nrm', 5], ['PR 150kg', 'pr', null],
    [{ value: 140, unit: 'lb' }, 'non_comparable', null]]) {
    const r = project({ marcas_especificas: { back_squat: raw } }).strength.references[0];
    assert.equal(r.value.referenceType, type); assert.equal(r.value.repsIfKnown, reps);
  }
  const c = project({ marcas_especificas: { clean: '80kg' } }); assert.equal(c.strength.references[0].value.movementId, null);
});
test('three conflicting strength sources retain all candidates; maximum never wins', () => {
  const p = project({ test_atleta: { back_squat: 140 }, marcas_especificas: { back_squat: 150 },
    historial_marcas: [{ ejercicio: 'back_squat', valor: '155kg' }] });
  const r = p.strength.byMovement.back_squat; assert.equal(r.reason, 'conflict'); assert.equal(r.resolved, null); assert.equal(r.candidates.length, 3);
});
test('incompatible RM claims, missing historical units and running units cannot silently resolve', () => {
  const p = project({ datos_entrenamiento: { squat_1rm: '3RM 140kg', fc_maxima: { value: 190, unit: 'seconds' } },
    historial_marcas: [{ ejercicio: 'snatch', valor: 90 }] });
  assert.equal(p.strength.byMovement.back_squat.resolved, null);
  assert.equal(p.strength.byMovement.snatch.resolved, null);
  assert.equal(p.running.byMetric.maxHr, undefined);
});
test('known historical race results join running references; benchmark dates are not update dates', () => {
  const p = project({ historial_marcas: [{ ejercicio: '5K', valor: '24:30', fecha: '2026-09-01' },
    { ejercicio: 'back_squat', valor: '140kg', fecha: '2026-09-01' }] });
  assert.equal(p.running.byMetric['5k'].resolved.value.value, 1470);
  assert.equal(p.strength.references[0].value.dateIfKnown, '2026-09-01');
  assert.equal(p.strength.references[0].updatedAt, null);
});
test('known Z2 exposed, max HR alone does not synthesize zones; invalid pace remains unparsed', () => {
  const p = project(hybrid); assert.deepEqual(plain(p.running.byMetric.z2.resolved.value.value), { min: 130, max: 145 });
  const only = project({ perfil: { fc_max: 190 }, datos_entrenamiento: { ritmo_z2: '5:70' } });
  assert.deepEqual(Object.keys(only.running.byMetric), ['maxHr']); assert.equal(only.unparsed.length, 1);
  const pace = project({ test_atleta: { tiempo_5k: '24:30', ritmo_suave: '5:30 min/km' } });
  assert.equal(pace.running.byMetric['5k'].resolved.value.value, 1470); assert.equal(pace.running.byMetric.easyPace.resolved.value.value, 330);
});
test('weakness exact mapping uses library; ambiguous prose stays unknown; no id invented', () => {
  const p = project(hybrid); assert.equal(p.development[0].value.pattern, 'squat');
  const u = project({ athlete_development: [{ indicador: 'falta fuerza de piernas' }] }).development[0].value;
  assert.equal(u.movementId, null); assert.equal(u.pattern, null); assert.equal(u.discipline, null); assert.equal(u.id, null);
});
test('exact pattern alone does not invent a movement; contradictory mapping remains unknown', () => {
  const p = project({ athlete_development: [{ indicador: 'squat' }, { movementId: 'back_squat', pattern: 'hinge' }] });
  assert.equal(p.development[0].value.pattern, 'squat'); assert.equal(p.development[0].value.movementId, null);
  assert.equal(p.development[1].value.pattern, null); assert.equal(p.development[1].value.movementId, null);
  assert.equal(p.unparsed[0].reason, 'movement_pattern_conflict');
});
test('cycle integer strings normalize, invalid week stays unknown, text objective preserved', () => {
  const p = project({ ciclo_actual: { semana: '2', totalSemanas: '-4', objetivo: 'Fuerza y base' } });
  assert.equal(p.cycle.week.value, 2); assert.equal(p.cycle.totalWeeks.value, null);
  assert.equal(p.cycle.objective.value, 'Fuerza y base');
});
test('all critical normalized values retain source; projection does not mutate or alias source', () => {
  const input = structuredClone(hybrid), before = JSON.stringify(input), p = project(input);
  for (const e of [p.goals.primary.resolved, p.sessionTimeBudget.resolved, ...p.strength.references, ...p.running.references,
    ...p.development, ...Object.values(p.cycle)]) assert.match(e.source, /^usuarios\./);
  p.development[0].value.evidencias.push('changed'); assert.equal(JSON.stringify(input), before);
});

function database({ fail, user = hybrid } = {}) {
  const calls = [];
  const tables = { usuarios: user, weekly_plan: [{ week_start: '2026-08-31', sessions: [{ dia: 'martes', tipo: 'box',
    completada: true, titulo: 'Fuerza', descripcion_real: 'back squat', modificado: true, motivo_modificacion: 'tiempo' }] }],
    session_modification_events: [], athlete_state_events: [], athlete_coaching_notes: [], physiology_records: [], running_execution_records: [] };
  return { calls, from(table) {
    const call = { table, filters: [] }; calls.push(call);
    const q = { select(v) { call.select = v; return this; }, eq(...v) { call.filters.push(v); return this; },
      in() { return this; }, lt() { return this; }, lte() { return this; }, order() { return this; }, range() { return this; }, limit() { return this; },
      single() { return Promise.resolve({ data: tables[table], error: table === fail ? {} : null }); },
      maybeSingle() { return Promise.resolve({ data: table === 'physiology_records' ? null : tables[table], error: table === fail ? {} : null }); },
      then(yes, no) { return Promise.resolve({ data: tables[table], error: table === fail ? {} : null }).then(yes, no); } };
    return q;
  } };
}
test('full reader uses canonical physiology/restrictions, reads only, and exposes hybrid fixture', async () => {
  const db = database(), c = await read(db, 'fixture', { asOfDate: '2026-09-07' });
  assert.equal(c.sessionTimeBudget.resolved.value.maxMinutes, 45);
  assert.equal(c.strength.byMovement.back_squat.resolved.value.valueKg, 140);
  assert.equal(c.readiness.status, 'unknown'); assert.equal(c.restrictions.value.active, false);
  assert.equal(c.physiology.recovery.objective.completeness.available, 0);
  assert.equal(c.history.completedSessions[0].date, '2026-09-01');
  assert.equal(c.history.exposure.byDiscipline.box.exposiciones[0].movementId, 'back_squat');
  assert.equal(c.declaredLimitations.value, 'molestia declarada');
  for (const call of db.calls) assert.ok(call.filters.some(f => f[1] === 'fixture'), call.table);
});
for (const table of ['usuarios', 'weekly_plan', 'session_modification_events', 'athlete_state_events', 'athlete_coaching_notes', 'physiology_records', 'running_execution_records'])
  test(`read failure never becomes empty context: ${table}`, async () => {
    await assert.rejects(() => read(database({ fail: table }), 'fixture', { asOfDate: '2026-09-07' }));
  });
test('prepared context cannot cross identity/date; invalid input reads nothing', async () => {
  const db = database();
  await assert.rejects(() => read(db, 'fixture', { asOfDate: '2026-02-30' }));
  await assert.rejects(() => read(db, 'fixture', { asOfDate: '2026-09-07', readiness: { userCodigo: 'other', effectiveDate: '2026-09-07' } }));
  assert.equal(db.calls.length, 0);
});
test('prepared readiness is carried unchanged with completeness, no new score calculation', async () => {
  const result = { score: null, estado: 'BUILDING_BASELINE', dataCompleteness: 0, missingSignals: ['hrv', 'rhr', 'duracionSueno'] };
  const c = await read(database(), 'fixture', { asOfDate: '2026-09-07', readiness: {
    userCodigo: 'fixture', effectiveDate: '2026-09-07', source: 'canonical_readiness_engine', result } });
  assert.deepEqual(plain(c.readiness.result), result);
});
test('prepared recovery reuses canonical reads and rejects foreign identity', async () => {
  const c = await read(database(), 'fixture', { asOfDate: '2026-09-07' });
  const db = database();
  await read(db, 'fixture', { asOfDate: '2026-09-07', recovery: c.physiology.recovery });
  assert.equal(db.calls.filter(c => c.table === 'physiology_records').length, 0);
  await assert.rejects(() => read(db, 'other', { asOfDate: '2026-09-07', recovery: c.physiology.recovery }));
});

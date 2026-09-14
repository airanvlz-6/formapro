import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, contractFixture, equippedProfileFixture, fakeDatabase, plain } from '../sports/trainingContractTestRuntime.mjs';

const week = '2026-09-14', today = '2026-09-13';
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [today + 'T12:00:00Z'])); } static now() { return Date.parse(today + 'T12:00:00Z'); } }
const runtime = (events=[]) => sportsRuntime({ Date: FixedDate, console: { log() {}, info(...args) {events.push(args);}, warn() {}, error() {} } });
const intent = { kind: 'open_coach', version: 1, discipline: 'box', adaptationId: 'upper_body_control', stimulusId: 'technical_push_density',
  pattern: 'horizontal_push', role: 'PRIMARY', method: { kind: 'coach_defined', label: 'Controlled pushing practice' } };
function proposal(c, movementId = 'bench_press') {
  return { schemaVersion: 2, stimulusId: c.stimulusId, structureId: 'strength_sets', explanation: 'Trabajo controlado con dosis elegida para el contexto.',
    blocks: [{ blockType: 'main', movements: [{ movementId, prescription: { sets: 3, reps: 5, restSeconds: 90, intensity: { kind: 'rpe', value: 6 } } }] }] };
}
function session(load, profile = equippedProfileFixture(), notes = []) {
  const athlete = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({ perfil: profile });
  const doseContext = load('sessionDoseContext').buildSessionDoseContext(athlete, intent, null, [], true, 'coach');
  const restrictions = load('../athlete/getCanonicalRestrictions').projectCanonicalRestrictions([], notes, today);
  const r = load('allowedTrainingContract').buildAllowedTrainingContract(contractFixture({ targetWeekStart: week, intent,
    stimulus: intent.stimulusId, doseContext, restrictionsSnapshot: restrictions }));
  assert.equal(r.ok, true, JSON.stringify(r)); return r.contract;
}
const validate = (load, c, p = proposal(c)) => load('structuredSession').validateSessionAgainstTrainingContract(c, p);

test('open method, adaptation and stimulus without catalog rows admit concrete RPE design', () => {
  const load = runtime(), c = session(load);
  assert.equal(c.contractVersion, 4);
  assert.equal(load('goalTransferModel').TRANSFER_METHODS.some(m => m.adaptationId === intent.adaptationId), false);
  assert.equal(validate(load, c).ok, true);
  const legacy = { ...c, contractVersion: 3 };
  assert.equal(validate(load, legacy).ok, false, 'cannot reinterpret old contract version');
});
test('missing structure mapping and missing suitable_for never veto concrete open design', () => {
  const load = runtime(); load('workoutStructureLibrary').STRUCTURES_BY_STIMULUS[intent.stimulusId] = [];
  const c = session(load); assert.equal(validate(load, c).ok, true);
  const p = proposal(c); p.structureId = 'opaque_format';
  assert.equal(validate(load, c, p).ok, false, 'unresolved structure still rejects');
});
for (const state of ['unavailable', 'unknown']) test(`required equipment ${state} preserves known absence without equating UNKNOWN to absence`, () => {
  const load = runtime(), profile = equippedProfileFixture();
  profile.prescription_signals['equipment.barra'] = { state, updatedAt: today };
  const c = session(load, profile), result = validate(load, c);
  assert.equal(result.ok, state === 'unknown', JSON.stringify(result));
  if (!result.ok) assert.ok(result.violations.some(e => e.startsWith('FACTUAL_REQUIREMENT_UNAVAILABLE:')), JSON.stringify(result));
});
test('missing 1RM blocks percentage but leaves RPE design valid', () => {
  const load = runtime(), c = session(load), p = proposal(c);
  p.blocks[0].movements[0].prescription.intensity = { kind: 'percent_1rm', referenceId: '1rm:bench_press', value: 70 };
  assert.equal(validate(load, c, p).ok, false);
  assert.equal(validate(load, c).ok, true);
});
test('known incompatible and unknown biomechanics are distinct hard outcomes', () => {
  const load = runtime(), c = session(load, equippedProfileFixture(), [{ id: 'restriction', status: 'pending', constraint_level: 'reassessment', prohibits_axial_load: true }]);
  const library = load('movementLibrary');
  library.MOVEMENT_RESTRICTION_EVIDENCE.bench_press.properties.axial_load = true;
  assert.ok(validate(load, c).violations.some(e => e.startsWith('MOVEMENT_RESTRICTED:')));
  delete library.MOVEMENT_RESTRICTION_EVIDENCE.bench_press.properties.axial_load;
  const result = validate(load, c);
  assert.ok(result.violations.some(e => e.startsWith('UNKNOWN_SAFETY:')), JSON.stringify(result));
  assert.equal(result.violations.some(e => e.startsWith('MOVEMENT_RESTRICTED:')), false);
});
test('generated movement outside literal catalog resolves and remains reference-incompatible', () => {
  const load = runtime(), c = session(load); c.generatedMovementAuthority = plain(load('movementVariants').GENERATED_MOVEMENT_AUTHORITY);
  const p = proposal(c), entry = p.blocks[0].movements[0];
  entry.movementId = 'generated:tempo_press';
  entry.variant = { version: 1, canonicalFamily: 'bench_press', displayName: 'Tempo 3-1-1-0 bench press', modifiers: { tempo: [3,1,1,0] } };
  entry.prescription.tempo = [3,1,1,0];
  assert.equal(validate(load, c, p).ok, true);
  entry.variant.canonicalFamily = 'unresolved_family';
  assert.equal(validate(load, c, p).ok, false);
});

function database(load, snapshot = null) {
  const days = plain(load('../planning/weeklyCalendar').calendarDays);
  const tables = { usuarios: { modo_entrada: 'coach', categoria: 'box', especialidad: 'crossfit', objetivo_principal: { descripcion: 'crossfit' },
    ciclo_actual: { bloque: 'acumulacion', semana: 1, totalSemanas: 4, planningWeekStart: week, blockId: 'synthetic' },
    perfil: { ...equippedProfileFixture(), dias: 6, duracion: '60 min' }, workout_history: [], distribucion_semanal: { box: days, pista: [], carrera_larga: [] } },
    athlete_training_sources: [], athlete_state_events: [], athlete_coaching_notes: [], weekly_plan: [] };
  const db = fakeDatabase(tables), from = db.from.bind(db);
  db.from = table => { const q = from(table); if (table === 'weekly_plan') q.maybeSingle = async () => ({ data: snapshot, error: null }); return q; };
  return { db, tables, days };
}

test('Step 2 logs the actual six-day Coach decision without private labels or quota side effects', async()=>{
  const events=[],load=runtime(events),{db,days}=database(load);
  const run='06202e59-bc99-4f73-93a7-f8c3d79f421c';
  const r=await load('../planning/prepareAllowedWeeklyPlanContract').planBoundedWeek(db,'synthetic',{
    targetWeekStart:week,today,empezarHoy:true,snapshot:null,openCoachVersion:1,planningRunId:run,
  },async prompt=>{
    const c=JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1]);
    return JSON.stringify({contractVersion:2,contextDigest:c.contextDigest,selections:days.map((day,i)=>({day,state:i<6?'TRAIN':'REST',
      decision:{role:'PRIMARY',reason:'private rationale'},...(i<6?{intent:{...intent,method:{kind:'coach_defined',label:'private label'}}}:{})}))});
  });
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.estructura.sessions.filter(s=>s.state==='TRAIN').length,6);
  const step=events.find(e=>e[0]==='ORCHESTRATOR Paso 2 — Weekly Coach')[1];
  assert.equal(step.planningRunId,run);assert.equal(step.trainDays,6);assert.equal(step.restDays,1);
  assert.equal(step.intents.filter(i=>i.pattern==='horizontal_push').length,6);
  assert.doesNotMatch(JSON.stringify(step),/private|synthetic/);
  const broken=load('../planning/planningDiagnostics').weeklyCoachStepDiagnostic(2,{},'private run identifier');assert.equal(broken.planningRunId,null);
});
test('future REST is reconsiderable, past/completed/external/explicit preserve and temporary unavailable remain factual', async () => {
  const load = runtime(), snapshot = { sessions: [{ dia: 'lunes', tipo: 'descanso', completada: false }, { dia: 'miercoles', tipo: 'descanso' }] };
  const { db, tables } = database(load, snapshot), api = load('../planning/prepareAllowedWeeklyPlanContract');
  const request = { targetWeekStart: week, today, empezarHoy: true, snapshot, openCoachVersion: 1 };
  let r = await api.loadWeeklyPlanningContext(db, 'synthetic', request);
  assert.equal(r.ok, true); assert.deepEqual(Object.keys(r.input.fixed), []);
  r = await api.loadWeeklyPlanningContext(db, 'synthetic', { ...request, preserveDays: ['miercoles'] });
  assert.equal(r.input.fixed.miercoles.protectionReason, 'EXPLICIT_SCOPE_PRESERVE');
  r = await api.loadWeeklyPlanningContext(db, 'synthetic', { ...request, today: '2026-09-15' });
  assert.equal(r.input.fixed.lunes.protectionReason, 'PAST');
  tables.usuarios.perfil.prescription_access = { [week]: { availability: 'unavailable' } };
  r = await api.loadWeeklyPlanningContext(db, 'synthetic', request);
  assert.equal(r.input.fixed.lunes.protectionReason, 'UNAVAILABLE');
  const cal = load('../planning/weeklyCalendar');
  assert.equal(cal.calendarProtectionReason({ completada: true }), 'COMPLETED');
  assert.equal(cal.calendarProtectionReason({ tipo: 'external_blocked' }), 'EXTERNAL');
  snapshot.sessions[0].completada = true;
  r = await api.loadWeeklyPlanningContext(db, 'synthetic', request);
  assert.ok(r.errors.includes('FUTURE_COMPLETION_NOT_ALLOWED'));
});

test('real Weekly -> Session v4 -> signed save chain retains sibling context and freshness', async () => {
  const events=[],load = runtime(events), { db, tables, days } = database(load);
  const r = await load('../planning/prepareAllowedWeeklyPlanContract').planBoundedWeek(db, 'synthetic', {
    targetWeekStart: week, today, empezarHoy: true, snapshot: null, strategyVersion: 1, coherenceVersion: 1, openCoachVersion: 1,
  }, async prompt => {
    const c = JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1]);
    return JSON.stringify({ contractVersion: 2, contextDigest: c.contextDigest, selections: days.map(day => ({ day,
      state: ['martes','jueves'].includes(day) ? 'TRAIN' : 'REST', decision: { role: 'PRIMARY', reason: 'Elección contextual.' },
      ...(['martes','jueves'].includes(day) ? { intent } : {}) })) });
  }, 'synthetic-token');
  assert.equal(r.ok, true, JSON.stringify(r));
  const step=events.filter(e=>e[0]==='ORCHESTRATOR Paso 2 \u2014 Weekly Coach');
  assert.equal(step.length,1);assert.equal(step[0][1].contractVersion,2);assert.equal(step[0][1].trainDays,2);assert.equal(step[0][1].restDays,5);
  const receipt = r.estructura.calendarReceipt, sessions = [], contexts = [];
  for (const slot of r.estructura.sessions.filter(s => s.state === 'TRAIN')) {
    const result = await load('sessionAuthority').generateTrainingSession(db, 'synthetic', { targetWeekStart: week, day: slot.dia,
      discipline: slot.tipo, stimulus: slot.stimulusId, intent: slot.intent, state: slot.state, acceptedCurrentWeek: sessions,
      weekly: { receipt, generationToken: 'synthetic-token', optionId: slot.optionId, claims: slot } }, async prompt => {
      const c = JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nIntent canónico:')[0].split('\nContexto no autoritativo:')[0]);
      contexts.push(prompt); return JSON.stringify(proposal(c));
    });
    assert.equal(result.ok, true, JSON.stringify(result)); sessions.push(result.sesion);
    assert.equal(result.trainingContract.contractVersion, 4);
  }
  assert.match(contexts[1], /bench_press/);
  const proof = JSON.parse(Buffer.from(sessions[1].sessionReceipt.split('.')[0], 'base64url'));
  assert.ok(proof.weekly.priorSessions.martes);
  const rows = r.estructura.sessions.map(s => sessions.find(x => x.dia === s.dia) ?? load('sessionAuthority').admitSessionContent({ dia: s.dia, tipo: 'descanso' }, 'synthetic', week));
  const admitted = await load('../planning/weeklyCalendarAuthority').assertWeeklyCalendar(db, 'synthetic', week, rows, receipt, { requireV2: true, sessionEvidence: sessions });
  let reviews = 0;
  const review = await load('../planning/enforceWholeWeek').enforceWholeWeek('synthetic', week, rows, sessions, receipt, admitted, async prompt => {
    reviews++; assert.match(prompt, /WHOLE_WEEK_COACH_RECONSIDERATION/);
    return JSON.stringify({ decision: 'KEEP', rationale: 'Repetición deliberada de una exposición controlada.', days: [] });
  });
  assert.equal(review.ok, true, JSON.stringify(review)); assert.equal(reviews, 1);
  assert.equal(review.orchestration.reconsideration.count, 1);
  tables.usuarios.perfil.prescription_signals['equipment.barra'] = { state: 'unavailable', updatedAt: today };
  await assert.rejects(load('../planning/weeklyCalendarAuthority').assertFreshWeeklyAuthority(db, 'synthetic', week, receipt), /STALE/);
});

test('open design rejects hard time overflow but allows sporting pattern uncertainty', () => {
  const load = runtime(), c = session(load, { ...equippedProfileFixture(), duracion: '10 min' });
  const p = proposal(c); p.blocks[0].movements[0].prescription.sets = 50;
  assert.ok(validate(load, c, p).violations.includes('SESSION_BUDGET_EXCEEDED'));
  const uncertain=validate(load,c,proposal(c,'goblet_squat'));assert.equal(uncertain.ok,true,JSON.stringify(uncertain));
});
test('weekly proposals cannot claim safety facts or escape availability and scope', async () => {
  const load = runtime(), { db, days } = database(load);
  const prepared = await load('../planning/prepareAllowedWeeklyPlanContract').prepareAllowedWeeklyPlanContract(db, 'synthetic', {
    targetWeekStart: week, today, empezarHoy: true, snapshot: null, openCoachVersion: 1,
  });
  assert.equal(prepared.ok, true);
  const c = prepared.contract;
  const p = { contractVersion: 2, contextDigest: c.contextDigest, selections: days.map(day => ({ day, state: day === 'martes' ? 'TRAIN' : 'REST',
    decision: { role: 'PRIMARY', reason: 'Contexto sintético.' }, ...(day === 'martes' ? { intent: structuredClone(intent) } : {}) })) };
  const resolve = () => load('../planning/allowedWeeklyPlanContract').validateWeeklySelection(c, p);
  assert.equal(resolve().ok, true);
  p.selections[1].intent.safeForKnee = true;
  assert.equal(resolve().ok, false);
  delete p.selections[1].intent.safeForKnee;
  p.selections[1].intent.discipline = 'external';
  assert.ok(resolve().errors.includes('DISCIPLINE_OUTSIDE_MANAGED_SCOPE'));
  p.selections[1].intent.discipline = 'box'; c.openFacts.allowed.box = [];
  assert.ok(resolve().errors.includes('DAY_NOT_AVAILABLE'));
});

test('explicit all-REST regeneration is a signed coaching decision, not empty enumeration', async () => {
  const load = runtime(), days = plain(load('../planning/weeklyCalendar').calendarDays);
  const snapshot = { id: 'synthetic-plan', user_codigo: 'synthetic', week_start: week, revision: 1,
    sessions: days.map(dia => ({ dia, tipo: 'descanso', completada: false })) };
  const { db } = database(load, snapshot);
  const result = await load('../planning/prepareAllowedWeeklyPlanContract').planBoundedWeek(db, 'synthetic', {
    targetWeekStart: week, today, empezarHoy: true, snapshot, openCoachVersion: 1,
  }, async prompt => {
    const c = JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1]);
    assert.equal(c.frequencyPolicy.minExecutableDays, 0);
    const allTrain = { contractVersion: 2, contextDigest: c.contextDigest, selections: days.map(day => ({ day, state: 'TRAIN', intent,
      decision: { role: 'PRIMARY', reason: 'La frecuencia es una elección del Coach.' } })) };
    assert.equal(load('../planning/allowedWeeklyPlanContract').validateWeeklySelection(c, allTrain).ok, true, 'no artificial six-day cap');
    return JSON.stringify({ contractVersion: 2, contextDigest: c.contextDigest, selections: days.map(day => ({ day, state: 'REST',
      decision: { role: 'RECOVERY', reason: 'Descanso elegido explícitamente tras revisar el contexto.' } })) });
  }, 'rest-token');
  assert.equal(result.ok, true, JSON.stringify(result));
  const receipt = result.estructura.calendarReceipt;
  const rows = days.map(dia => load('sessionAuthority').admitSessionContent({ dia, tipo: 'descanso' }, 'synthetic', week));
  await load('../planning/weeklyCalendarAuthority').assertWeeklyCalendar(db, 'synthetic', week, rows, receipt, { requireV2: true });
  assert.equal(load('../planning/weeklyCalendarAuthority').weeklySaveAdmission(receipt, 'synthetic', week, rows).outcome, null);
});

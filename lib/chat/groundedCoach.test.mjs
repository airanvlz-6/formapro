import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain, equippedProfileFixture, contractFixture, completeDoseFixture } from '../sports/trainingContractTestRuntime.mjs';
import { readFileSync } from 'node:fs';
import { longitudinalHistory, longitudinalReports, crossDomainReports } from './longitudinalFixtures.mjs';
const today = '2026-09-14';
class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [today + 'T12:00:00Z'])); } static now() { return Date.parse(today + 'T12:00:00Z'); } }
const events = [];
const load = sportsRuntime({ Date: TestDate, console: { info: (...a) => events.push(a), log() {}, warn() {} }, process: { env: {
  SUPABASE_SERVICE_ROLE_KEY: 'isolated-sports-test-key', FORGE_CHAT_COACH_DIAGNOSTICS: '1' } } });
const chat = load('../chat/groundedCoach'), states = load('../chat/chatStateChange'), dates = load('temporaryTrainingAccess');
const knee = { active: true, state: { estado: 'restricted', body_area: 'rodilla', reason_description: 'Rodilla derecha, MRI pendiente' },
  restrictions: [{ movement: 'rodilla', constraint_level: 'hard' }] };
const facts = { restrictions: knee, event: { status: 'pending' }, delayedResponse: 'UNKNOWN', references: [],
  priorEvidence: { backSquat: { kg: 110, reps: 5, sets: 3, immediate: 'tolerated', laterReaction: 'not_reported' }, highHangSnatchPull: { response: 'discomfort' } },
  execution: { powerSnatch: { maximumKg: 60, immediate: 'no_pain_reported', delayed: 'UNKNOWN' }, hr: { average: 149, maximum: 173 } } };
const userReport = 'Hoy hice power snatch hasta 60 kg sin dolor. C2B y T2B fáciles. Bike/Ski: FC media 149 y máxima 173.';
const response = (f = facts) => ({ answer: 'Esa exposición aporta una señal favorable. Mantendría trabajo técnico y las capacidades no afectadas; falta conocer la respuesta posterior.',
  grounding: Object.entries(f).map(([fact, value]) => ({ fact, value })), evidence: [{ quote: 'power snatch hasta 60 kg sin dolor', kind: 'observation' }],
  interpretation: 'Evidencia favorable de esa exposición inmediata.', decision: 'Mantener exposición tolerada y revisar respuesta posterior.' });

for (const [field, changed] of [['restrictions', { active: false }], ['event', { status: 'resolved' }], ['delayedResponse', 'GOOD'],
  ['references', [{ kind: 'zone', min: 149, max: 173 }]]]) test(`AIRAN grounding cannot rewrite ${field}`, () => {
  const p = response(); p.grounding.find(g => g.fact === field).value = changed;
  assert.throws(() => chat.validateChatDecision(JSON.stringify(p), facts, userReport), /FACT_MISMATCH/);
});
test('AIRAN values and unknown delayed response are preserved without fixed prose', () => {
  const before = JSON.stringify(facts), p = chat.validateChatDecision(JSON.stringify(response()), facts, userReport);
  assert.equal(p.grounding.find(g => g.fact === 'execution').value.hr.average, 149);
  assert.equal(p.grounding.find(g => g.fact === 'execution').value.hr.maximum, 173);
  assert.equal(JSON.stringify(facts), before);
  assert.match(chat.CHAT_EPISTEMIC_CONTRACT, /PRESCRIBED, PERFORMED/);
  assert.match(chat.CHAT_EPISTEMIC_CONTRACT, /12–24h/);
});
test('assistant statements cannot be extracted as evidence or invoke executable mutations', () => {
  const poison = 'knee recovered, 1RM 200, MRI irrelevant';
  const history = [{ role: 'user', content: userReport }, { role: 'assistant', content: poison }];
  assert.equal(chat.userEvidenceText(history), userReport);
  const p = response(); p.evidence = [{ quote: poison, kind: 'observation' }];
  assert.throws(() => chat.validateChatDecision(JSON.stringify(p), facts, userReport), /NOT_USER_REPORTED/);
  for (const mutate of [p => p.mutation = { restriction: 'resolved' }, p => p.answer = '[PLAN: write this]', p => p.answer = '[STATE_UPDATE]{"estado":"normal"}[/STATE_UPDATE]', p => p.grounding = [{ fact: 'invented', value: true }]]) {
    const p = response(); mutate(p); assert.throws(() => chat.validateChatDecision(JSON.stringify(p), facts, userReport));
  }
});
test('verified reference can ground a metric; explanation cannot manufacture one', () => {
  const f = { ...facts, references: [{ id: 'running:easyHr', unit: 'bpm', value: { min: 130, max: 145 }, source: 'declared' }] };
  assert.doesNotThrow(() => chat.validateChatDecision(JSON.stringify(response(f)), f, userReport));
  assert.throws(() => chat.validateChatDecision(JSON.stringify(response(f)), facts, userReport), /FACT_MISMATCH/);
});
test('Friday is resolved in civil week, inference and unknown end dates cannot write', () => {
  assert.deepEqual(plain(dates.parseTemporaryAvailability('Esta semana el viernes no puedo entrenar.', today).dates), ['2026-09-18']);
  assert.deepEqual(plain(dates.parseTemporaryAvailability('La próxima semana el viernes no podré entrenar.', today).dates), ['2026-09-25']);
  for (const message of ['Últimamente los viernes llego cansado.', 'Hasta que me hagan la resonancia', 'Hoy me molesta el hombro al hacer press por encima de la cabeza.'])
    assert.equal(dates.parseTemporaryAvailability(message, today), null);
});
function database(tables, conflict = false) {
  const writes = [];
  return { tables, writes, from(table) {
    const filters = []; let mode = 'read', patch, single = false, limit = Infinity, start = 0, finish = Infinity;
    const q = { select() { return q; }, eq(k, v) { filters.push(row => typeof row[k] === 'object' && typeof v === 'string' ? JSON.stringify(row[k]) === v : row[k] === v); return q; },
      is(k, v) { filters.push(row => v === null ? row[k] == null : row[k] === v); return q; },
      in(k, values) { filters.push(row => values.includes(row[k])); return q; },
      gte(k, v) { filters.push(row => row[k] >= v); return q; }, lte(k, v) { filters.push(row => row[k] <= v); return q; },
      lt(k, v) { filters.push(row => row[k] < v); return q; }, order() { return q; }, or() { return q; },
      limit(n) { limit = n; return q; }, range(a, b) { start = a; finish = b + 1; return q; },
      single() { single = true; return q; }, maybeSingle() { single = true; return q; },
      update(p) { mode = 'update'; patch = p; return q; },
      then(resolve, reject) { try {
        const rows = (tables[table] || []).filter(r => filters.every(f => f(r))).slice(start, finish).slice(0, limit);
        if (mode === 'update') { writes.push({ table, patch }); if (conflict) return Promise.resolve({ data: [], error: null }).then(resolve, reject); rows.forEach(r => Object.assign(r, structuredClone(patch))); }
        return Promise.resolve({ data: structuredClone(single ? rows[0] ?? null : rows), error: null }).then(resolve, reject);
      } catch (e) { return Promise.reject(e).then(resolve, reject); } } };
    return q;
  } };
}
function fixture() {
  const user = { codigo: 'u', modo_entrada: 'planificacion', categoria: 'box', especialidad: 'crossfit', objetivo_principal: 'crossfit',
    ciclo_actual: { bloque: 'deload', semana: 2 }, distribucion_semanal: JSON.stringify({ box: ['lunes', 'viernes'] }),
    perfil: { ...equippedProfileFixture(), dias: '2', duracion: '60 min' }, historial: [], workout_history: [] };
  const intent = { kind: 'main_pattern', pattern: 'squat' }, canonical = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile(user);
  const doseContext = load('sessionDoseContext').buildSessionDoseContext(canonical, intent, null, [], true, 'coach');
  const c = load('allowedTrainingContract').buildAllowedTrainingContract(contractFixture({ intent, doseContext })).contract;
  const p = { schemaVersion: 2, stimulusId: c.stimulusId, structureId: 'strength_sets', blocks: [{ blockType: 'main', movements: [{ movementId: 'back_squat', prescription: { sets: 3, reps: 5, restSeconds: 120, intensity: { kind: 'rpe', value: 6 } } }] }] };
  const strength = load('structuredSession').renderContractSession(c, p);
  const sessions = load('../planning/weeklyCalendar').calendarDays.map((day, i) => ({ ...(i === 0 || i === 4 ? strength : {
    tipo: 'descanso', titulo: 'Descanso', descripcion: 'Descanso', por_que: 'Descanso' }), dia: day,
    session_id: `00000000-0000-4000-8000-00000000000${i}`, ...(i === 0 ? { completada: true, descripcion_real: 'Trabajo realizado' } : {}) }));
  return database({ usuarios: [user], weekly_plan: [{ id: 'plan', user_codigo: 'u', week_start: today, revision: 1, sessions }], athlete_training_sources: [] });
}
test('temporary mutation is CAS-bound, idempotent and never changes habitual Friday', async () => {
  const db = fixture(), before = db.tables.usuarios[0].distribucion_semanal;
  const a = await states.applyChatStateChange(db, 'u', 'Esta semana el viernes no puedo entrenar.', today);
  assert.equal(a.status, 'committed');
  assert.equal((await states.applyChatStateChange(db, 'u', 'Esta semana el viernes no puedo entrenar.', today)).status, 'already_applied');
  assert.equal(db.writes.length, 1); assert.equal(db.tables.usuarios[0].distribucion_semanal, before);
  const profile = db.tables.usuarios[0].perfil;
  assert.deepEqual(plain(dates.availableDaysAtWeek(profile, today, ['lunes', 'viernes'])), ['lunes']);
  assert.deepEqual(plain(dates.availableDaysAtWeek(profile, '2026-09-21', ['lunes', 'viernes'])), ['lunes', 'viernes']);
  await assert.rejects(() => states.applyChatStateChange(database(fixture().tables, true), 'u', 'Esta semana el viernes no puedo entrenar.', today), /CHANGED_RETRY/);
});
test('context converges across Chat, Weekly and Session after authorized date change', async () => {
  const db = fixture(); await states.applyChatStateChange(db, 'u', 'Esta semana el viernes no puedo entrenar.', today);
  const context = await chat.loadChatGrounding(db, 'u', today);
  assert.equal(context.facts.availability.dateAccess['2026-09-18'].availability, 'unavailable');
  const weekly = await load('../planning/weeklyCalendarAuthority').loadWeeklyCalendarContext(db, 'u', today);
  assert.deepEqual(plain(weekly.allowed.box), ['lunes']);
  const session = await load('prepareSessionTrainingContract').prepareSessionTrainingContext(db, 'u', db.tables.usuarios[0],
    { targetWeekStart: today, day: 'viernes', discipline: 'box', stimulus: 'fuerza_maxima' }, context.facts.restrictions);
  assert.equal(session.ok, true); assert.ok(!session.input.availableDays.includes('viernes'));
});
test('impact excludes completed, past and external sessions', () => {
  const db = fixture(), plans = db.tables.weekly_plan;
  assert.deepEqual(plain(states.affectedFuturePlans(plans, ['2026-09-14', '2026-09-18'], today, ['box'])).map(p => p.day), ['viernes']);
  plans[0].sessions[4].tipo = 'external_blocked';
  assert.equal(states.affectedFuturePlans(plans, ['2026-09-18'], today, ['box']).length, 0);
});
test('vacation with equipment/20kg limit is explicitly unsupported, never fabricated or permanent', async () => {
  const db = fixture(), before = JSON.stringify(db.tables);
  const result = await states.applyChatStateChange(db, 'u', 'La próxima semana estaré de vacaciones de lunes a domingo. No tendré box. Puedo correr y el hotel tiene mancuernas hasta 20kg, banco y bicicleta estática.', today);
  assert.equal(result.status, 'no_supported_mutation'); assert.equal(JSON.stringify(db.tables), before);
});
test('real adaptation uses Weekly Coach and validated CAS while retaining unrelated session IDs', async () => {
  const db = fixture(), before = structuredClone(db.tables.weekly_plan[0].sessions);
  await states.applyChatStateChange(db, 'u', 'Esta semana el viernes no puedo entrenar.', today);
  const impact = states.affectedFuturePlans(db.tables.weekly_plan, ['2026-09-18'], today, ['box']); let calls = 0;
  const result = await load('../chat/adaptChatPlan').adaptChatPlan(db, 'u', today, impact, async prompt => {
    calls++;
    if (prompt.includes('AFECTADOS:')) return JSON.stringify({ reassessDays: ['viernes'], reason: 'Retirar solo la exposición incompatible con disponibilidad.' });
    const marker = 'CONTRACT:\n', start = prompt.indexOf(marker);
    assert.ok(start >= 0, prompt.slice(0, 180));
    const tail = prompt.slice(start + marker.length); let depth = 0, end = 0, quoted = false, escape = false;
    for (; end < tail.length; end++) { const ch = tail[end]; if (escape) { escape = false; continue; } if (ch === '\\' && quoted) { escape = true; continue; } if (ch === '"') quoted = !quoted; if (!quoted) { if (ch === '{') depth++; if (ch === '}' && --depth === 0) { end++; break; } } }
    const c = JSON.parse(tail.slice(0, end));
    return JSON.stringify({ contractVersion: 2, contextDigest: c.contextDigest, selections: Object.entries(c.dayOptions).map(([day, options]) =>
      options[0].protected ? { day, optionId: options[0].optionId } : { day, state:'REST', decision: { role: 'RECOVERY', reason: 'Conservar lo no afectado.' } }) });
  });
  assert.equal(result.status, 'adapted', JSON.stringify(result)); assert.ok(calls >= 2);
  assert.equal(db.tables.weekly_plan[0].sessions[4].tipo, 'unavailable');
  for (let i = 0; i < 7; i++) if (i !== 4) assert.deepEqual(db.tables.weekly_plan[0].sessions[i], before[i]);
  assert.equal(db.tables.weekly_plan[0].revision, 2);
});
test('web and mobile route through shared backend, legacy extraction excludes assistant', () => {
  const route = readFileSync('app/api/chat/route.ts', 'utf8'), client = readFileSync('app/FormaPro.tsx', 'utf8');
  const mobile = route.slice(route.indexOf('if (action === "enviar_mensaje_coach")'), route.indexOf('// Rate limiting:'));
  assert.match(mobile, /groundedReply\(mensaje\)/); assert.doesNotMatch(mobile, /mobile\/buildPrompt/);
  assert.match(client, /coachGrounding:true,coachMessage:texto/);
  assert.match(route, /userEvidenceText\(profilePatch.historial.slice\(-6\)\)/);
});

test('Coach may redistribute to an available future day through real Session Coach dose authority', async () => {
  const db = fixture(), before = structuredClone(db.tables.weekly_plan[0].sessions);
  db.tables.usuarios[0].distribucion_semanal = { box: ['lunes', 'viernes', 'sabado'] };
  await states.applyChatStateChange(db, 'u', 'Esta semana el viernes no puedo entrenar.', today);
  let built = 0;
  const result = await load('../chat/adaptChatPlan').adaptChatPlan(db, 'u', today, [{ weekStart: today, day: 'viernes' }], async prompt => {
    if (prompt.includes('AFECTADOS:')) return JSON.stringify({ reassessDays: ['viernes', 'sabado'], reason: 'Trasladar la exposición a un día disponible sin tocar lo realizado.' });
    if (prompt.includes('WEEKLY_CONTRACT:\n')) {
      const c = JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1].split('\nPropuesta rechazada:')[0]);
      return JSON.stringify({ contractVersion: 2, contextDigest: c.contextDigest, selections: Object.entries(c.dayOptions).map(([day, options]) => {
        if(options[0].protected) return {day,optionId:options[0].optionId};
        return { day, state:day==='sabado'?'TRAIN':'REST', decision: { role: day === 'sabado' ? 'PRIMARY' : 'RECOVERY', reason: 'Mantener una exposición de fuerza dentro de las capacidades disponibles.' },
          ...(day==='sabado'?{intent:{kind:'open_coach',version:1,discipline:'box',adaptationId:'fuerza_maxima',stimulusId:'fuerza_maxima',pattern:'horizontal_push',role:'PRIMARY',method:{kind:'coach_defined',label:'Controlled pushing'}}}:{}) };
      }) });
    }
    built++;
    const c = JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nIntent canónico:')[0].split('\nContexto no autoritativo:')[0]);
    return JSON.stringify(completeDoseFixture(c, { stimulusId: c.stimulusId, structureId: 'strength_sets',
      blocks: ['warmup', 'main'].map(blockType => ({ blockType, movements: [{ movementId: 'bench_press', prescription: { reps: 5 } }] })) }));
  });
  assert.equal(result.status, 'adapted', JSON.stringify(result)); assert.ok(built > 0);
  assert.equal(db.tables.weekly_plan[0].sessions[4].tipo, 'unavailable');
  assert.ok(db.tables.weekly_plan[0].sessions[5].structuredPrescription);
  for (let i = 0; i < 7; i++) if (![4, 5].includes(i)) assert.deepEqual(db.tables.weekly_plan[0].sessions[i], before[i]);
});
test('conversational extraction cannot write objective, availability, reference or block facts', () => {
  const result = chat.conversationalMemoryOnly({ datos_entrenamiento: { snatch_1rm: 60 }, nueva_marca: 'snatch:60kg',
    objetivo_principal: { descripcion: 'invented' }, fin_bloque: { resultado: 'cumplido' }, distribucion_semanal: { box: ['viernes'] }, notas: 'Contextual note' });
  for (const key of ['datos_entrenamiento', 'nueva_marca', 'objetivo_principal', 'fin_bloque', 'distribucion_semanal']) assert.equal(result[key], null);
  assert.equal(result.notas, 'Contextual note');
});
test('semantic review rejects contradictory prose despite structurally correct grounding, then retries', async () => {
  const context = { facts: { ...facts, today, plan: [], readiness: { status: 'unknown' } }, conversation: [] }; let proposals = 0, reviews = 0;
  const result = await chat.answerGroundedChat(context, userReport, async system => {
    if (system.startsWith('GROUNDING_REVIEW')) return JSON.stringify(++reviews === 1 ? { supported: false, unsupportedClaims: ['CANONICAL_STATE_CONTRADICTION'] } : { supported: true, unsupportedClaims: [] });
    const p = response(context.facts); if (++proposals === 1) p.answer = 'La restricción ha desaparecido y ya no hay nada pendiente.';
    return JSON.stringify(p);
  });
  assert.equal(proposals, 2); assert.equal(reviews, 2); assert.notEqual(result.answer, 'La restricción ha desaparecido y ya no hay nada pendiente.');
});
test('subsequent Chat sees unchanged restriction, stored assistant answer is only conversation', async () => {
  const db = fixture(); db.tables.athlete_state_events = [{ id: 'knee', user_codigo: 'u', activo: true, estado: 'restricted', body_area: 'rodilla', reason_description: 'MRI pendiente' }];
  const coach = load('../chat/runChatCoach');
  const before = JSON.stringify(db.tables.athlete_state_events);
  const out = await coach.runChatCoach(db, 'u', userReport, async (system, messages) => {
    if (system.startsWith('GROUNDING_REVIEW')) return JSON.stringify({ supported: true, unsupportedClaims: [] });
    const f = JSON.parse(system.split('FACTS (lectura autoritativa):\n')[1].split('\nAUTHORIZED_ACTION_RESULTS:')[0]);
    assert.equal(f.restrictions.active, true);
    const p = response(); p.grounding = [{ fact: 'restrictions', value: f.restrictions }]; return JSON.stringify(p);
  }, today);
  assert.equal(out.historySaved, true); assert.equal(JSON.stringify(db.tables.athlete_state_events), before);
  const next = await chat.loadChatGrounding(db, 'u', today);
  assert.equal(next.facts.restrictions.active, true); assert.equal(next.conversation.at(-1).role, 'assistant');
  assert.ok(!chat.userEvidenceText(next.conversation).includes('señal favorable'));
});
test('pain report does not disappear: retained as human conversation without diagnosis or permanent ban', async () => {
  const db = fixture(), message = 'Hoy me molesta el hombro al hacer press por encima de la cabeza.';
  const out = await load('../chat/runChatCoach').runChatCoach(db, 'u', message, async system => {
    if (system.startsWith('GROUNDING_REVIEW')) return JSON.stringify({ supported: true, unsupportedClaims: [] });
    const f = JSON.parse(system.split('FACTS (lectura autoritativa):\n')[1].split('\nAUTHORIZED_ACTION_RESULTS:')[0]);
    assert.match(system, /clinical_restriction/);
    assert.equal(f.coachingKnowledge[0].kind,'discomfort_observation');
    return JSON.stringify({ answer: 'Revisaría la exposición que provoca la molestia y mantendría capacidades no afectadas. El cambio de restricción requiere el flujo de revisión; no lo he guardado desde este mensaje.',
      grounding: [{ fact: 'restrictions', value: f.restrictions }], evidence: [{ quote: message, kind: 'observation' }], interpretation: 'Molestia reportada en una exposición concreta.', decision: 'Revisar exposición y siguiente respuesta.' });
  }, today);
  assert.equal(out.mutation.status, 'no_supported_mutation'); assert.equal(db.tables.usuarios[0].historial.at(-2).content, message);
  assert.equal(db.writes.some(w => w.table === 'athlete_state_events'), false);
});

test('athlete resource report -> persistent fact -> next Coach context and factual admission', async()=>{
  const db=fixture(),knowledge=load('../chat/athleteCoachingKnowledge');
  const message='No pude hacerlo porque no tengo trineo.';
  const result=await knowledge.persistCoachingKnowledge(db,'u',message,today);
  assert.equal(result.status,'committed');
  const stored=db.tables.usuarios[0].perfil;
  assert.equal(stored.prescription_signals['equipment.sled'].state,'unavailable');
  assert.equal(stored.coaching_knowledge[0].source,'athlete_report');
  assert.equal((await knowledge.persistCoachingKnowledge(db,'u',message,today)).status,'already_applied');
  const next=await chat.loadChatGrounding(db,'u',today);
  assert.equal(next.facts.equipmentCapabilities.signals['equipment.sled'].state,'unavailable');
  assert.equal(next.facts.coachingKnowledge[0].subject,'sled');
  assert.ok(next.facts.coachingKnowledge[0].quote.includes('no tengo trineo'));
  const intent={kind:'open_coach',version:1,discipline:'box',adaptationId:'practice',stimulusId:'practice',pattern:'carry',role:'PRIMARY',method:{kind:'coach_defined',label:'Practice'}};
  const dc=load('sessionDoseContext').buildSessionDoseContext(next.athlete,intent,null,[],true,'coach');
  const c=load('allowedTrainingContract').buildAllowedTrainingContract(contractFixture({intent,stimulus:'practice',doseContext:dc})).contract;
  const p={schemaVersion:2,stimulusId:'practice',structureId:'Coach format',blocks:[{blockType:'main',movements:[{movementId:'sled_push',prescription:{doseInstruction:'3 carries cortos'}}]}]};
  assert.ok(load('structuredSession').validateSessionAgainstTrainingContract(c,p).violations.some(v=>v.includes('equipment.sled')));
});

test('specific RMU inability stays specific, without a blanket gymnastics prohibition',async()=>{
  const db=fixture();
  await load('../chat/athleteCoachingKnowledge').persistCoachingKnowledge(db,'u','No puedo hacer ring muscle-ups todavía.',today);
  const next=await chat.loadChatGrounding(db,'u',today);
  assert.equal(next.facts.equipmentCapabilities.signals['skill.movement.ring_muscle_up'].state,'unavailable');
  assert.equal(next.facts.equipmentCapabilities.signals['skill.box.advanced'].state,'available');
});

test('unknown resources and transient context remain dated reusable knowledge without invented catalog signals',async()=>{
  const db=fixture(),k=load('../chat/athleteCoachingKnowledge');
  await k.persistCoachingKnowledge(db,'u','No tengo aparato especial. Hoy no tengo remo.',today);
  const p=db.tables.usuarios[0].perfil;
  assert.equal(p.coaching_knowledge.length,2);assert.equal(p.coaching_knowledge[1].scope,'dated_observation');
  assert.equal(p.prescription_signals['equipment.remo'].state,'available');
  assert.equal(p.prescription_signals['equipment.aparato_especial'],undefined);
});

test('knowledge CAS conflict and wrong owner cannot pretend persistence succeeded',async()=>{
  const k=load('../chat/athleteCoachingKnowledge');
  await assert.rejects(()=>k.persistCoachingKnowledge(database(fixture().tables,true),'u','No tengo remo.',today),/CAS_CONFLICT/);
  await assert.rejects(()=>k.persistCoachingKnowledge(fixture(),'another-user','No tengo remo.',today),/READ_FAILED/);
  for(const text of ['Si tuviera que viajar no tengo remo','El coach me dijo: no tengo remo','Ayer no tengo remo'])assert.equal(k.extractCoachingFacts(text,today).length,0);
});

test('later athlete acquisition replaces an absence and discomfort negation never creates a pain fact',async()=>{
  const db=fixture(),k=load('../chat/athleteCoachingKnowledge');
  await k.persistCoachingKnowledge(db,'u','No tengo remo.',today);
  await k.persistCoachingKnowledge(db,'u','Ya tengo remo.',today);
  const p=db.tables.usuarios[0].perfil;
  assert.equal(p.prescription_signals['equipment.remo'].state,'available');
  assert.equal(p.coaching_knowledge[0].supersededBy,p.coaching_knowledge[1].id);
  await k.persistCoachingKnowledge(db,'u','No tengo remo.',today);
  assert.equal(db.tables.usuarios[0].perfil.prescription_signals['equipment.remo'].state,'unavailable');
  assert.equal((await k.persistCoachingKnowledge(db,'u','No tengo remo.',today)).status,'already_applied');
  for(const text of ['No me duele la rodilla.','¿No tengo remo?','El Coach dice "no tengo remo"'])assert.equal(k.extractCoachingFacts(text,today).length,0);
  assert.equal(k.extractCoachingFacts('No tengo constructor.',today)[0].subject,'constructor');
});

// These doubles test pipeline preservation/provenance, not the semantic quality of a live model.
const coachingText = 'Revisaría esta exposición en relación con lo anterior antes de decidir la siguiente.';
function completionFor(report, { evidence = true, verify = true, answer = coachingText, invalidMetadata = false, inspect } = {}) {
  return async (system, messages) => {
    if (system.startsWith('GROUNDING_REVIEW')) return JSON.stringify({ supported: true, unsupportedClaims: [] });
    if (system.startsWith('LEARNING_REVIEW')) return verify === 'throw' ? Promise.reject(new Error('provider failed'))
      : JSON.stringify({ quotes: verify ? JSON.parse(messages[0].content).candidates : [] });
    inspect?.(system, messages);
    const f = JSON.parse(system.split('FACTS (lectura autoritativa):\n')[1].split('\nAUTHORIZED_ACTION_RESULTS:')[0]);
    return JSON.stringify({ answer, grounding: [{ fact: 'restrictions', value: invalidMetadata ? 'invented' : f.restrictions }],
      evidence: evidence ? [{ quote: report, kind: 'observation' }] : [], interpretation: 'Evidencia de una exposición.', decision: 'Revisar próxima exposición.' });
  };
}

test('A: useful coaching without requested mutation returns with no profile/plan writes', async () => {
  const db = fixture(), report = '¿Cómo relacionas este entrenamiento con mi objetivo?';
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, completionFor(report, { evidence: false }), today);
  assert.equal(r.answer, coachingText);
  assert.equal(r.pipeline.mutationAttempted, false);
  assert.ok(db.writes.every(w => Object.keys(w.patch).every(k => k === 'historial')));
});

test('B: verified candidate persists dated exact evidence without changing capability/reference/state', async () => {
  const db = fixture(), before = structuredClone(db.tables.usuarios[0].perfil.prescription_signals), report = crossDomainReports[1];
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, completionFor(report), today);
  assert.equal(r.answer, coachingText); assert.equal(r.pipeline.verifiedFactCount, 1);
  const fact = db.tables.usuarios[0].perfil.coaching_knowledge[0];
  assert.equal(fact.quote, report); assert.equal(fact.source, 'athlete_report');
  assert.equal(fact.effectiveDate, today); assert.equal(fact.scope, 'dated_observation');
  assert.deepEqual(db.tables.usuarios[0].perfil.prescription_signals, before);
  const next = await chat.loadChatGrounding(db, 'u', today, report);
  assert.equal(next.facts.coachingKnowledge[0].quote, report);
});

for (const verify of [false, 'throw']) test('C: rejected/failed fact verification preserves coaching: ' + verify, async () => {
  const db = fixture(), report = crossDomainReports[2];
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, completionFor(report, { verify }), today);
  assert.equal(r.answer, coachingText); assert.equal(r.pipeline.verifiedFactCount, 0);
  assert.equal(r.pipeline.rejectedFactCount, 1);
  assert.equal(db.tables.usuarios[0].perfil.coaching_knowledge, undefined);
  assert.equal(r.pipeline.fallbackReason, null);
});

test('C: invalid structured extraction cannot replace independently supported coaching', async () => {
  const db = fixture(), report = crossDomainReports[2];
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, completionFor(report, { invalidMetadata: true }), today);
  assert.equal(r.answer, coachingText); assert.equal(r.pipeline.verifiedFactCount, 0);
  assert.equal(db.tables.usuarios[0].perfil.coaching_knowledge, undefined);
});

test('C: plain coaching without a JSON extraction envelope is reviewed and preserved', async () => {
  const ctx = await chat.loadChatGrounding(fixture(), 'u', today);
  const r = await chat.answerGroundedChat(ctx, '¿Qué harías después?', async system => system.startsWith('GROUNDING_REVIEW')
    ? JSON.stringify({ supported: true, unsupportedClaims: [] }) : coachingText);
  assert.equal(r.answer, coachingText); assert.equal(r.extractionVerified, false);
});

test('D: CAS conflict in knowledge and history is observable but never replaces answer', async () => {
  const db = database(fixture().tables, true), report = 'No tengo GHD.';
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, completionFor(report, { evidence: false }), today);
  assert.equal(r.answer, coachingText); assert.equal(r.knowledge.status, 'unverified');
  assert.equal(r.historySaved, false); assert.equal(r.pipeline.fallbackReason, null);
  assert.ok(r.pipeline.failures.includes('knowledge')); assert.ok(r.pipeline.failures.includes('history'));
  assert.equal(db.tables.usuarios[0].perfil.coaching_knowledge, undefined);
});

test('D: throwing learning/history persistence preserves answer and reports both failures', async () => {
  const db = fixture(), original = db.from;
  db.from = table => { const q = original(table); q.update = () => { throw new Error('private db error'); }; return q; };
  const report = crossDomainReports[2];
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, completionFor(report), today);
  assert.equal(r.answer, coachingText); assert.equal(r.pipeline.verifiedFactCount, 0);
  assert.equal(r.pipeline.fallbackReason, null);
  assert.ok(r.pipeline.failures.includes('learning_persistence')); assert.ok(r.pipeline.failures.includes('history'));
  assert.ok(!JSON.stringify(r.pipeline).includes('private db error'));
});

test('D: failed availability preserves coaching and availability never auto-regenerates the week', async () => {
  const report = 'Esta semana el viernes no puedo entrenar.';
  const conflict = database(fixture().tables, true);
  const first = await load('../chat/runChatCoach').runChatCoach(conflict, 'u', report, completionFor(report, { evidence: false }), today);
  assert.equal(first.answer, coachingText); assert.equal(first.mutation.status, 'unverified');
  const isolated = sportsRuntime({}, (path, exports) => path.replaceAll('\\', '/').endsWith('/chat/adaptChatPlan.ts')
    ? { ...exports, adaptChatPlan: async () => { throw new Error('injected adaptation preparation failure'); } } : exports);
  const r = await isolated('../chat/runChatCoach').runChatCoach(fixture(), 'u', report, completionFor(report, { evidence: false }), today);
  assert.equal(r.answer, coachingText); assert.equal(r.mutation.status, 'committed');
  assert.equal(r.adaptation.status, 'coach_decision_pending'); assert.ok(!r.pipeline.failures.includes('adaptation'));
});

test('readback ambiguity does not claim success or replay the same declaration in learning', async () => {
  let calls = 0;
  const isolated = sportsRuntime({}, (path, exports) => path.replaceAll('\\', '/').endsWith('/chat/athleteCoachingKnowledge.ts')
    ? { ...exports, persistCoachingKnowledge: async () => { calls++; throw new Error('COACHING_KNOWLEDGE_READBACK_FAILED'); } } : exports);
  const report = 'No tengo GHD';
  const r = await isolated('../chat/runChatCoach').runChatCoach(fixture(), 'u', report, completionFor(report), today);
  assert.equal(calls, 1); assert.equal(r.answer, coachingText); assert.equal(r.knowledge.status, 'unverified');
});

test('E: useful clarification survives as natural coaching with no mutation prerequisite', async () => {
  const db = fixture(), report = 'Hoy el snatch se sintió raro.';
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report,
    completionFor(report, { evidence: false, answer: '¿En qué fase lo notaste y qué sensación apareció? Eso ayudaría a ajustar la siguiente exposición.' }), today);
  assert.match(r.answer, /\?/); assert.equal(r.pipeline.mutationAttempted, false);
});

test('missing grounding continues from report with explicit unknowns, never fabricated memory', async () => {
  const db = fixture(), original = db.from;
  db.from = table => { const q = original(table); if (table === 'weekly_plan') q.then = (resolve, reject) => Promise.reject(new Error('unavailable')).then(resolve, reject); return q; };
  const report = longitudinalReports[0];
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, completionFor(report, {
    inspect(system) { assert.match(system, /contextStatus":"UNKNOWN/); assert.match(system, /Solo dispones del reporte actual/); }
  }), today);
  assert.equal(r.answer, coachingText); assert.equal(r.groundingLoaded, false);
  assert.equal(r.pipeline.mutationAttempted, false); assert.equal(r.pipeline.fallbackReason, null);
});

test('longitudinal report and 48h follow-up retain relevant sources without clinical state mutation', async () => {
  const db = fixture();
  db.tables.usuarios[0].historial = [...longitudinalHistory, ...Array.from({ length: 7 }, (_, i) => ({ role: 'user', content: 'Detalle de agenda ' + i }))];
  db.tables.usuarios[0].workout_history = [{ fecha: '2026-09-10', notas: 'Trabajo de fuerza tolerado' }];
  db.tables.athlete_state_events = [{ id: 'restriction', user_codigo: 'u', activo: true, estado: 'restricted', body_area: 'rodilla', reason_description: 'Síntomas previos' }];
  const stateBefore = structuredClone(db.tables.athlete_state_events);
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', longitudinalReports[0], completionFor(longitudinalReports[0], {
    inspect(system) {
      const f = JSON.parse(system.split('FACTS (lectura autoritativa):\n')[1].split('\nAUTHORIZED_ACTION_RESULTS:')[0]);
      assert.ok(f.longitudinal.entries.some(e => e.value.includes('He reducido la carrera')));
      assert.ok(f.longitudinal.entries.some(e => e.source === 'usuarios.workout_history'));
      assert.equal(f.restrictions.active, true);
    }
  }), today);
  assert.equal(r.answer, coachingText);
  await load('../chat/runChatCoach').runChatCoach(db, 'u', longitudinalReports[1], completionFor(longitudinalReports[1], {
    inspect(system, messages) {
      assert.ok(system.includes(longitudinalReports[0]));
      assert.ok(messages.at(-1).content.includes('48 horas'));
      assert.match(system, /no vuelvas a pedirla sin motivo/);
    }
  }), today);
  assert.deepEqual(db.tables.athlete_state_events, stateBefore);
  assert.equal(db.tables.usuarios[0].perfil.coaching_knowledge.filter(k => k.kind === 'reported_observation').length, 2);
});

for (const report of crossDomainReports) test('cross-domain provenance and reusable context: ' + report, async () => {
  const db = fixture(), before = structuredClone(db.tables.weekly_plan);
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, completionFor(report), today);
  assert.equal(r.answer, coachingText); assert.equal(r.pipeline.fallbackReason, null);
  const known = db.tables.usuarios[0].perfil.coaching_knowledge;
  assert.ok(known.length > 0);
  assert.ok(known.every(f => f.source === 'athlete_report' && f.effectiveDate === today && report.includes(f.quote)));
  assert.deepEqual(plain(db.tables.weekly_plan), plain(before));
  assert.equal(db.tables.athlete_state_events, undefined);
  const next = await chat.loadChatGrounding(db, 'u', today, report);
  assert.ok(next.facts.coachingKnowledge.some(f => report.includes(f.quote)));
});

test('longitudinal projection bounds text, identifies omitted rows and never re-labels assistant evidence', () => {
  const project = load('../chat/longitudinalContext').projectChatLongitudinal;
  const p = project({ historial: [{ role: 'assistant', content: 'Recovered' }, { role: 'user', content: '48 horas sin reacción' }],
    workout_history: Array.from({ length: 60 }, () => ({ fecha: '2026-09-01', notas: 'x'.repeat(6000) })) }, {}, '48 horas', today);
  assert.ok(p.entries.length <= 18); assert.equal(p.truncated, true);
  assert.ok(p.entries.every(e => e.value.length <= 1800));
  assert.equal(p.entries.find(e => e.value === 'Recovered').kind, 'COACH_INTERPRETATION');
  assert.equal(p.entries.find(e => e.value === '48 horas sin reacción').date, null);
});

test('metadata failure cannot bypass semantic rejection of unsupported coaching', async () => {
  const ctx = await chat.loadChatGrounding(fixture(), 'u', today);
  let count = 0;
  await assert.rejects(() => chat.answerGroundedChat(ctx, 'Reporte.', async system => {
    if (system.startsWith('GROUNDING_REVIEW')) return JSON.stringify({ supported: false, unsupportedClaims: ['invented clinical recovery'] });
    count++; return JSON.stringify({ answer: 'Ya estás clínicamente recuperado.' });
  }), /CHAT_PROSE_UNGROUNDED/);
  assert.equal(count, 2);
});

test('pipeline diagnostics contain only counts, flags and bounded status categories', () => {
  const rows = events.filter(e => e[0] === 'CHAT_COACHING_PIPELINE').map(e => JSON.parse(e[1]));
  assert.ok(rows.length > 0);
  const keys = ['runId', 'groundingLoaded', 'relevantHistoryCount', 'activeRestrictionCount', 'candidateFactCount', 'verifiedFactCount',
    'rejectedFactCount', 'coachingResponseProduced', 'mutationAttempted', 'mutationSucceeded', 'historySaved', 'fallbackReason', 'failures'];
  assert.ok(rows.every(r => Object.keys(r).every(k => keys.includes(k))));
  assert.ok(rows.some(r => r.coachingResponseProduced && r.failures.length && r.fallbackReason === null));
});

test('grounded client bypasses static classifier output and legacy prose mutation', () => {
  const client = readFileSync('app/FormaPro.tsx', 'utf8');
  assert.doesNotMatch(client, /if\(resContexto\?\.modoRespuesta==="STATIC"/);
  assert.match(client, /const respText=data.grounded \? respTextRaw2 : await procesarTags/);
  assert.match(client, /const respText=data.grounded \? respTextValidado : await procesarTags/);
});

function activeFixture() {
  const db = fixture();
  Object.assign(db.tables.usuarios[0], { categoria: 'hibrido', especialidad: 'crossfit', modo_entrada: 'planificacion' });
  db.tables.athlete_training_sources = ['box', 'carrera'].map(disciplina => ({ user_codigo: 'u', disciplina, owner: 'forge', activo: true, dias: ['lunes', 'viernes'] }));
  Object.assign(db.tables.weekly_plan[0].sessions[0], { completada: false, titulo: 'Plan base 75 min', descripcion: '6x800 de carrera', tipo: 'carrera', duracion_min: 75 });
  delete db.tables.weekly_plan[0].sessions[0].titulo_real; delete db.tables.weekly_plan[0].sessions[0].descripcion_real;
  return db;
}
const sessionId = '00000000-0000-4000-8000-000000000000';
function alternative({ date = today, id = sessionId, movement = 'bike', seconds = 1800, state = 'TRAIN' } = {}) {
  return { kind: 'adapt_session', date, sessionId: id, reason: 'Ajustar la exposición al contexto declarado.', state, discipline: 'box',
    intent: { kind: 'open_coach', version: 1, discipline: 'box', adaptationId: 'aerobic', stimulusId: 'aerobic', pattern: 'cyclic', role: 'SUPPORTING',
      method: { kind: 'coach_defined', label: 'Trabajo tolerable' } },
    proposal: { schemaVersion: 2, stimulusId: 'aerobic', structureId: 'Continuo libre', blocks: [{ blockType: 'main', movements: [
      { movementId: movement, prescription: { durationSeconds: seconds, doseInstruction: 'Mantén un esfuerzo cómodo, RPE 3-4.' } }
    ] }] } };
}
function actionCompletion(report, actions, { actionSupported = true, learning = true } = {}) {
  const base = completionFor(report, { verify: learning });
  return async (system, messages) => {
    if (system.startsWith('CHAT_ACTION_REVIEW')) return JSON.stringify({ supported: actionSupported });
    const raw = await base(system, messages);
    if (system.startsWith('GROUNDING_REVIEW') || system.startsWith('LEARNING_REVIEW')) return raw;
    return JSON.stringify({ ...JSON.parse(raw), actions });
  };
}

for (const [name, report] of [
  ['A time', 'Hoy solo tengo 35 min.'],
  ['B temporary discomfort', 'Hoy noto una molestia y no quiero correr.'],
  ['C external load', 'Hoy en el box hicimos sentadilla pesada y estoy muy cargado.'],
  ['E equipment', 'No tengo GHD.'],
]) test('active Coach ' + name + ': alternative uses real v4 admission and preserves original atomically', async () => {
  const db = activeFixture(), before = plain(db.tables.weekly_plan[0]), a = alternative();
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, actionCompletion(report, [a]), today);
  assert.equal(r.actions[0].status, 'committed', JSON.stringify(r.actions));
  const current = db.tables.weekly_plan[0].sessions[0];
  assert.equal(current.structuredPrescription.executionPolicy, 'coach-executable-v1');
  assert.equal(current.chatPrescriptionHistory[0].original.descripcion, '6x800 de carrera');
  assert.equal(current.chatPrescriptionHistory[0].original.duracion_min, 75);
  assert.equal(current.duracion_min, null);
  assert.equal(current.chatPrescriptionHistory[0].source, 'coach_chat');
  assert.ok(current.chatPrescriptionHistory[0].createdAt);
  assert.equal(current.session_id, sessionId); assert.equal(current.completada, false);
  assert.equal(current.tipo, 'box'); assert.equal(db.tables.weekly_plan[0].revision, before.revision + 1);
  assert.deepEqual(plain(db.tables.weekly_plan[0].sessions.slice(1)), before.sessions.slice(1));
  assert.equal(db.tables.athlete_state_events, undefined);
  assert.ok(r.answer.includes('Mi Plan')); assert.ok(r.actions[0].session.descripcion.length > 20);
});

test('D performance improvement is evidence, never deterministic progression or regeneration', async () => {
  const db = activeFixture(), before = plain(db.tables.weekly_plan), report = 'Todo se sintió muy fácil hoy.';
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, actionCompletion(report, []), today);
  assert.deepEqual(plain(db.tables.weekly_plan), before); assert.deepEqual(plain(r.actions), []);
});

test('F planned -> adapted -> performed -> delayed response -> next Weekly reading has no phantom intervals', async () => {
  const db = activeFixture(), report = 'Hoy no quiero correr, prefiero otra exposición.';
  await load('../chat/runChatCoach').runChatCoach(db, 'u', report, actionCompletion(report, [alternative({ seconds: 2400 })]), today);
  const performed = 'He completado 42 min de bike, sin molestias durante ni después.';
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', performed, actionCompletion(performed, [{
    kind: 'record_performed', date: today, sessionId, discipline: 'box', quote: performed, responseQuotes: ['sin molestias durante ni después']
  }]), today);
  assert.equal(r.actions[0].status, 'committed', JSON.stringify(r.actions));
  const followup = 'A las 48 horas sigo sin reacción.';
  const delayed = await load('../chat/runChatCoach').runChatCoach(db, 'u', followup, actionCompletion(followup, [{
    kind: 'record_response', date: today, sessionId, quote: followup
  }]), '2026-09-16');
  assert.equal(delayed.actions[0].status, 'committed', JSON.stringify(delayed.actions));
  const next = await chat.loadChatGrounding(db, 'u', '2026-09-21', 'Planifica con lo realmente realizado.');
  const row = next.athlete.history.prescriptions.find(p => p.sessionId === sessionId);
  assert.equal(row.prescriptionLineage.original.descripcion, '6x800 de carrera');
  assert.equal(row.prescription.discipline, 'box');
  assert.ok(row.execution.description.includes('42 min de bike'));
  assert.equal(row.reportedExecution.observations[0].kind, 'PERFORMED');
  assert.equal(row.reportedExecution.observations[1].kind, 'RESPONSE');
  assert.equal(row.reportedExecution.observations[0].prescriptionId, row.prescriptionLineage.adaptations[0].id);
  assert.equal(next.athlete.runningDoseBaseline.evidence.some(e => e.source === 'weekly_plan' && e.kind === 'EXECUTED'), false);
  assert.equal(next.athlete.history.completedSessions[0].type, 'box');
  // This is the exact history projection consumed by buildWeeklyCoachingContext.
  const wc = load('../planning/weeklyCoachingContext').buildWeeklyCoachingContext(
    { targetWeekStart: '2026-09-21', contexts: {}, allowed: {}, fixed: {} },
    { dayOptions: {}, strategy: null }, next.athlete, null, '2026-09-21',
    { blockOutcomes: { status: 'available', rows: [] }, notes: { status: 'available', rows: [] } }, null);
  const history = wc.past.prescriptionHistory.items.find(p => p.sessionId === sessionId);
  assert.ok(history.execution.description.includes('42 min de bike'));
  assert.equal(history.prescriptionLineage.original.descripcion, '6x800 de carrera');
});

test('G valid executable prescription survives candidate-learning persistence failure', async () => {
  const db = activeFixture(), original = db.from;
  db.from = table => { const q = original(table), update = q.update; q.update = patch => {
    if (table === 'usuarios' && patch.perfil) throw new Error('injected learning failure'); return update(patch);
  }; return q; };
  const report = 'Hoy solo tengo 35 min.';
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, actionCompletion(report, [alternative()]), today);
  assert.equal(r.actions[0].status, 'committed', JSON.stringify(r.actions));
  assert.ok(r.answer.includes(r.actions[0].session.descripcion));
  assert.ok(r.pipeline.failures.includes('learning_persistence')); assert.equal(r.pipeline.fallbackReason, null);
});

test('CAS failure keeps valid executable alternative visible without claiming saved', async () => {
  const db = database(activeFixture().tables, true), report = 'Hoy solo tengo 35 min.';
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, actionCompletion(report, [alternative()]), today);
  assert.notEqual(r.actions[0].status, 'committed');
  assert.ok(r.actions[0].session, JSON.stringify(r.actions));
  assert.ok(r.answer.includes('guardado en Mi Plan no está confirmado'));
  assert.equal(db.tables.weekly_plan[0].sessions[0].chatPrescriptionHistory, undefined);
});

test('explicit 35 minute ceiling rejects 90 minutes using existing factual admission', async () => {
  const db = activeFixture(), before = plain(db.tables.weekly_plan), report = 'Hoy solo tengo 35 min.';
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, actionCompletion(report, [alternative({ seconds: 5400 })]), today);
  assert.equal(r.actions[0].status, 'rejected'); assert.equal(r.actions[0].session, undefined);
  assert.deepEqual(plain(db.tables.weekly_plan), before);
});

test('unknown movement and unquantified instructions do not veto executable alternative', async () => {
  const db = activeFixture(), report = 'Quiero una alternativa técnica hoy.';
  const a = alternative({ movement: 'patron_creado_por_coach' });
  a.proposal.blocks[0].movements[0].prescription = { doseInstruction: 'Haz tres pasadas técnicas cortas, con pausa libre para recuperar control.' };
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, actionCompletion(report, [a]), today);
  assert.equal(r.actions[0].status, 'committed', JSON.stringify(r.actions));
});

test('factual action review rejects explicit no-running contradiction without blocking coaching', async () => {
  const db = activeFixture(), before = plain(db.tables.weekly_plan), report = 'Hoy no puedo correr.';
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report,
    actionCompletion(report, [alternative({ movement: 'run' })], { actionSupported: false }), today);
  assert.equal(r.actions[0].status, 'rejected'); assert.ok(r.answer.startsWith(coachingText));
  assert.deepEqual(plain(db.tables.weekly_plan), before);
});

test('REST is a Coach decision and never generated from a pain classifier', async () => {
  const db = activeFixture(), report = 'Necesito revisar el entrenamiento de hoy.';
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, actionCompletion(report, [alternative({ state: 'REST' })]), today);
  assert.equal(r.actions[0].status, 'committed', JSON.stringify(r.actions));
  assert.equal(db.tables.weekly_plan[0].sessions[0].tipo, 'descanso');
  assert.equal(db.tables.weekly_plan[0].sessions[0].chatPrescriptionHistory[0].original.tipo, 'carrera');
});

test('completed/past prescription cannot be replaced and external report cannot auto-complete it', async () => {
  const db = activeFixture(); db.tables.weekly_plan[0].sessions[0].completada = true;
  const before = plain(db.tables.weekly_plan), report = 'Me fue bien ayer.';
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, actionCompletion(report, [alternative()]), today);
  assert.equal(r.actions[0].status, 'rejected'); assert.deepEqual(plain(db.tables.weekly_plan), before);
});

test('Coach can adapt selected future sessions while preserving the remainder and original chains', async () => {
  const db = activeFixture(), before = plain(db.tables.weekly_plan[0].sessions), report = 'Revisa hoy y el viernes con esta nueva información.';
  const actions = [alternative(), alternative({ date: '2026-09-18', id: before[4].session_id })];
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, actionCompletion(report, actions), today);
  assert.ok(r.actions.every(a => a.status === 'committed'), JSON.stringify(r.actions));
  for (let i = 0; i < 7; i++) if (![0, 4].includes(i)) assert.deepEqual(plain(db.tables.weekly_plan[0].sessions[i]), before[i]);
});

test('explicit GHD negative blocks a GHD prescription through real shared factual admission', async () => {
  const db = activeFixture(), before = plain(db.tables.weekly_plan), report = 'No tengo GHD.';
  const a = alternative({ movement: 'gh_situp' }); a.intent.pattern = 'core_flexion';
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, actionCompletion(report, [a]), today);
  assert.equal(r.actions[0].status, 'rejected'); assert.equal(r.actions[0].session, undefined);
  assert.equal(db.tables.usuarios[0].perfil.prescription_signals['equipment.ghd'].state, 'unavailable');
  assert.deepEqual(plain(db.tables.weekly_plan), before);
});

test('ownership prevents Chat overwriting an externally owned session', async () => {
  const db = activeFixture(); db.tables.weekly_plan[0].sessions[0].owner = 'external';
  const before = plain(db.tables.weekly_plan), report = 'Cambia la sesión de hoy.';
  const r = await load('../chat/runChatCoach').runChatCoach(db, 'u', report, actionCompletion(report, [alternative()]), today);
  assert.equal(r.actions[0].code, 'CHAT_ACTION_SCOPE_READ_ONLY'); assert.deepEqual(plain(db.tables.weekly_plan), before);
});

test('retrying the same completed report does not add execution or rewrite lineage', async () => {
  const db = activeFixture(), report = 'He completado 42 min de bike.';
  const action = { kind: 'record_performed', date: today, sessionId, discipline: 'box', quote: report, responseQuotes: [] };
  const coach = load('../chat/runChatCoach');
  await coach.runChatCoach(db, 'u', report, actionCompletion(report, [action]), today);
  const revision = db.tables.weekly_plan[0].revision;
  const r = await coach.runChatCoach(db, 'u', report, actionCompletion(report, [action]), today);
  assert.equal(r.actions[0].status, 'already_applied'); assert.equal(db.tables.weekly_plan[0].revision, revision);
  assert.equal(db.tables.weekly_plan[0].sessions[0].chatExecutionEvidence.length, 1);
  const context = await chat.loadChatGrounding(db, 'u', today);
  // Even without an adaptation, actual bike must not become a phantom running occurrence.
  assert.equal(context.athlete.runningDoseBaseline.evidence.some(e => e.kind === 'EXECUTED' && e.source === 'weekly_plan'), false);
});

test('grounded client does not run legacy memory extraction or overwrite server conversation', () => {
  const client = readFileSync('app/FormaPro.tsx', 'utf8');
  assert.match(client, /if\(!data.grounded\) extractarMemoria\(\)/);
  assert.match(client, /if\(!data.grounded\) apiCall\(\{action:"actualizar_usuario",codigo:codigoUsuario,datos:\{historial:histFinal\}/);
});

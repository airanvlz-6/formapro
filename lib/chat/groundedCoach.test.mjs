import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain, equippedProfileFixture, contractFixture, completeDoseFixture } from '../sports/trainingContractTestRuntime.mjs';
import { readFileSync } from 'node:fs';
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
    return JSON.stringify({ contractVersion: 1, contextDigest: c.contextDigest, selections: Object.entries(c.dayOptions).map(([day, options]) => ({ day, optionId: options[0].optionId, decision: { role: 'RECOVERY', reason: 'Conservar lo no afectado.' } })) });
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
      return JSON.stringify({ contractVersion: 1, contextDigest: c.contextDigest, selections: Object.entries(c.dayOptions).map(([day, options]) => {
        const option = day === 'sabado' ? options.find(o => o.state === 'TRAIN' && o.stimulusId === 'fuerza_maxima') : options[0];
        assert.ok(option, JSON.stringify(options));
        return { day, optionId: option.optionId, decision: { role: day === 'sabado' ? 'PRIMARY' : 'RECOVERY', reason: 'Mantener una exposición de fuerza dentro de las capacidades disponibles.' } };
      }) });
    }
    built++;
    const c = JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nIntent canónico:')[0].split('\nContexto no autoritativo:')[0]);
    return JSON.stringify(completeDoseFixture(c, { stimulusId: c.stimulusId, structureId: c.allowedStructureIds[0],
      blocks: ['warmup', 'main'].map(blockType => ({ blockType, movements: [{ movementId: c.allowedMovementIds[0], prescription: { reps: 5 } }] })) }));
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
    assert.match(system, /pain_restriction/);
    return JSON.stringify({ answer: 'Revisaría la exposición que provoca la molestia y mantendría capacidades no afectadas. El cambio de restricción requiere el flujo de revisión; no lo he guardado desde este mensaje.',
      grounding: [{ fact: 'restrictions', value: f.restrictions }], evidence: [{ quote: message, kind: 'observation' }], interpretation: 'Molestia reportada en una exposición concreta.', decision: 'Revisar exposición y siguiente respuesta.' });
  }, today);
  assert.equal(out.mutation.status, 'no_supported_mutation'); assert.equal(db.tables.usuarios[0].historial.at(-2).content, message);
  assert.equal(db.writes.some(w => w.table === 'athlete_state_events'), false);
});

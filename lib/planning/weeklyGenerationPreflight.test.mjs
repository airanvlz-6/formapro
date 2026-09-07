import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sportsRuntime, fakeDatabase, equippedProfileFixture, plain, compile } from '../sports/trainingContractTestRuntime.mjs';
const load = sportsRuntime(), api = load('../planning/weeklyGenerationPreflight');
const request = { targetWeekStart: '2026-09-07', today: '2026-09-07', snapshot: null };
function database(overrides = {}, failTable) {
  const tables = { usuarios: { modo_entrada: 'coach', categoria: 'hibrido', especialidad: 'hibrido_general',
    objetivo_principal: 'crossfit', perfil: { ...equippedProfileFixture(), dias: 5 }, workout_history: [],
    distribucion_semanal: { carrera: ['lunes', 'miercoles', 'sabado'], box: ['martes', 'jueves'] }, ...overrides },
    athlete_training_sources: [{ disciplina: 'box', owner: 'forge', activo: true, dias: ['martes', 'jueves'] },
      { disciplina: 'carrera', owner: 'forge', activo: true, dias: ['lunes', 'miercoles', 'sabado'] }],
    weekly_plan: [], physiology_records: [], session_modification_events: [], athlete_coaching_notes: [], athlete_state_events: [] };
  const db = fakeDatabase(tables, failTable), from = db.from.bind(db); db.tables = tables;
  db.from = table => { const q = from(table); q.update = q.insert = () => { throw Error('NO_WRITES'); };
    if (['weekly_plan', 'physiology_records'].includes(table)) q.maybeSingle = async () => ({ data: null, error: null }); return q; };
  return db;
}
const run = (db = database(), patch = {}) => api.resolveWeeklyGenerationPreflight(db, 'fixture', { ...request, ...patch });
test('valid habitual availability is reused without any write or ownership mutation', async () => {
  const db = database(), before = JSON.stringify(db.tables), r = await run(db, { targetWeekStart: '2026-09-14' });
  assert.equal(r.availabilityStatus, 'VALID'); assert.equal(r.canContinue, true); assert.equal(r.preflightRequirement, undefined);
  assert.deepEqual(plain(r.availability), db.tables.usuarios.distribucion_semanal); assert.equal(JSON.stringify(db.tables), before);
});
for (const [name, value, expected] of [['missing', null, 'MISSING'], ['invalid JSON', '{', 'INVALID'], ['array', [], 'INVALID']]) {
  test(`${name} availability requires resolution`, async () => {
    const r = await run(database({ distribucion_semanal: value }));
    assert.equal(r.canContinue, false); assert.equal(r.availabilityStatus, expected); assert.equal(r.preflightRequirement.kind, 'availability');
  });
}
test('invalid source day never becomes automatically valid', async () => {
  const db = database(); db.tables.athlete_training_sources[0].dias = ['noday'];
  const r = await run(db); assert.equal(r.availabilityStatus, 'INVALID'); assert.equal(r.canContinue, false);
});
for (const table of ['usuarios', 'athlete_training_sources']) test(`${table} read failure stops generation without asking to replace known data`, async () => {
  const r = await run(database({}, table)); assert.equal(r.availabilityStatus, 'READ_ERROR'); assert.equal(r.canContinue, false);
  assert.equal(r.preflightRequirement, undefined);
});
test('future week derives includeToday without question', async () => {
  const r = await run(database(), { targetWeekStart: '2026-09-14' });
  assert.equal(r.canContinue, true); assert.equal(r.temporalDecision.reason, 'today_outside_target_week');
});
test('today unavailable derives without question', async () => {
  const r = await run(database(), { today: '2026-09-11' }); assert.equal(r.canContinue, true);
  assert.equal(r.temporalDecision.reason, 'no_admissible_new_train_today');
});
for (const session of [{ dia: 'lunes', tipo: 'carrera', completada: true }, { dia: 'lunes', tipo: 'descanso' }, { dia: 'lunes', tipo: 'sin_registrar' }]) {
  test(`protected today ${JSON.stringify(session)} does not ask`, async () => {
    const r = await run(database(), { snapshot: { sessions: [session] } });
    assert.equal(r.canContinue, true, JSON.stringify(r)); assert.equal(r.preflightRequirement, undefined);
  });
}
for (const [value, expected] of [['incluir hoy', true], ['excluir hoy', false], ['desde mañana', false],
  ['Genera mi semana desde hoy', true], ['planifica mi semana sin hoy', false], [true, true], [false, false]]) {
  test(`explicit temporal intent ${value} is retained without question`, async () => {
    const r = await run(database(), { temporalIntent: value }); assert.equal(r.canContinue, true, JSON.stringify(r));
    assert.equal(r.temporalDecision.includeToday, expected); assert.equal(r.temporalDecision.reason, 'explicit_intent');
  });
}
test('new feasible TRAIN today requires a genuine include/exclude decision', async () => {
  const r = await run(); assert.equal(r.canContinue, false); assert.equal(r.preflightRequirement.kind, 'temporal'); assert.equal(r.temporalDecision, null);
});
for (const text of ['quizás', 'sí, pero no sé', 'lo que tú veas', 'hoy o mañana', 'sí, no']) test(`ambiguous temporal reply ${text} never becomes false`, async () => {
  assert.equal(api.parseIncludeToday(text), null); const r = await run(database(), { temporalIntent: text });
  assert.equal(r.canContinue, false); assert.equal(r.temporalDecision, null);
});
test('TRAIN option outside the weekly count budget is not a real temporal choice', () => {
  const days = load('../planning/weeklyCalendar').calendarDays;
  const c = { dayOptions: Object.fromEntries(days.map(day => [day, [{ state: 'REST' }]])), frequencyPolicy: { minExecutableDays: 1, maxExecutableDays: 1, requireGenuineRest: true } };
  c.dayOptions.lunes.push({ state: 'TRAIN' }); c.dayOptions.martes = [{ state: 'TRAIN', protected: true }];
  assert.equal(api.admitsNewTrainToday(c, 'lunes'), false);
});
test('resolved goal never prompts again; conflicting authority still blocks', async () => {
  const r = await run(database(), { targetWeekStart: '2026-09-14' }); assert.equal(r.goalRequirement, undefined); assert.equal(r.canContinue, true);
  const db = database(); db.tables.usuarios.perfil.objetivo_principal = 'half_marathon';
  const conflict = await run(db); assert.equal(conflict.canContinue, false); assert.equal(conflict.goalRequirement.resolution.status, 'GOAL_CONFLICT');
});
for (const mode of ['coach', 'focus', 'supervision']) test(`${mode} scope remains authoritative`, async () => {
  const db = database({ modo_entrada: mode }); if (mode === 'focus') db.tables.athlete_training_sources[0].owner = 'external';
  const before = JSON.stringify(db.tables), r = await run(db, { targetWeekStart: '2026-09-14' });
  assert.equal(r.canContinue, mode !== 'supervision', JSON.stringify(r)); assert.equal(JSON.stringify(db.tables), before);
  if (mode === 'supervision') assert.equal(r.code, 'CALENDAR_SCOPE_INVALID');
});

const ui = readFileSync('app/FormaPro.tsx', 'utf8'), ast = ts.createSourceFile('FormaPro.tsx', ui, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(node, predicate) { return predicate(node) ? node : ts.forEachChild(node, child => find(child, predicate)); }
const chat = find(ast, n => ts.isIfStatement(n) && n.expression.getText(ast) === 'resContexto?.debeDispararOrchestrator');
const button = find(ast, n => ts.isArrowFunction(n) && n.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)
  && n.body.getText(ast).includes('const resClose=await apiCall') && !n.body.getText(ast).includes('useState'));
for (const [name, body] of [['chat', chat.thenStatement.getText(ast)], ['button', button.body.getText(ast)]]) {
  test(`${name} delegates to shared preflight entry with no availability question`, async () => {
    let calls = 0;
    const execute = vm.runInNewContext(compile(`async function run() ${body}; run;`), {
      modoEntrada: 'coach', codigoUsuario: 'fixture', texto: 'Genera mi semana', setMostrarBotonNuevaSemana() {}, setCargando() {},
      apiCall: async () => ({ ok: true, closed: true }), dispararGeneracion: async () => { calls++; },
      availabilityQuestion: () => { throw Error('REDUNDANT_QUESTION'); },
    });
    await execute(); assert.equal(calls, 1);
  });
}
test('real orchestrator calls shared preflight before Analyzer and stops on an unresolved temporal choice', async () => {
  const declaration = find(ast, n => ts.isVariableDeclaration(n) && n.name.getText(ast) === 'orquestarGeneracionSemana');
  const calls = [];
  const execute = vm.runInNewContext(compile(`const run=${declaration.initializer.getText(ast)};run;`), {
    codigoUsuario: 'fixture', console: { log() {} }, apiCall: async body => {
      calls.push(body.action);
      if (body.action === 'preparar_generacion_semana') return { ok: true, generation: { currentWeek: '2026-09-07', nextWeek: '2026-09-14', token: 'token' } };
      if (body.action === 'check_week_closure') return { ok: true, yaCerrada: false };
      if (body.action === 'preflight_generacion_semana') return { canContinue: false, preflightRequirement: { kind: 'temporal' } };
      throw Error('NO_ANALYZER_OR_PLANNER');
    },
  });
  const r = await execute(); assert.equal(r.preflightRequirement.kind, 'temporal');
  assert.deepEqual(calls, ['preparar_generacion_semana', 'check_week_closure', 'preflight_generacion_semana']);
});

test('availability clarification preserves the original temporal request for the shared preflight', async () => {
  const branch = find(ast, n => ts.isIfStatement(n) && n.expression.getText(ast) === 'esperandoConfirmacionDisponibilidad && codigoUsuario');
  let forwarded;
  const run = vm.runInNewContext(compile(`async function run() ${branch.thenStatement.getText(ast)}; run;`), {
    codigoUsuario: 'fixture', texto: 'carrera lunes y box martes', availabilityConfirmationRef: { current: null },
    weeklyTemporalIntentRef: { current: { text: 'Genera mi semana desde hoy', answeringQuestion: false } }, requestCoachOwnership: () => null,
    apiCall: async () => ({ ok: true, distribucion: '{}' }), setDistribucionSemanal() {}, setEsperandoConfirmacionDisponibilidad() {}, setCargando() {},
    dispararGeneracion: async intent => { forwarded = intent; },
  });
  await run(); assert.equal(forwarded, 'Genera mi semana desde hoy');
});
test('yes to generation is not permission to train today', async () => {
  const r = await run(database(), { temporalIntent: 'sí' });
  assert.equal(r.canContinue, false); assert.equal(r.temporalDecision, null);
});
test('yes/no to the identified temporal question resolve include/exclude', async () => {
  for (const [temporalIntent, includeToday] of [['sí', true], ['no', false]]) {
    const r = await run(database(), { temporalIntent, temporalReply: true });
    assert.equal(r.canContinue, true); assert.equal(r.temporalDecision.includeToday, includeToday);
  }
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compile = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function findAll(root, predicate) {
  const result = [];
  function visit(n) { if (predicate(n)) result.push(n); ts.forEachChild(n, visit); }
  visit(root); return result;
}
const route = ts.createSourceFile('route.ts', readFileSync(new URL('../../app/api/chat/route.ts', import.meta.url), 'utf8'), 99, true);
const web = ts.createSourceFile('FormaPro.tsx', readFileSync(new URL('../../app/FormaPro.tsx', import.meta.url), 'utf8'), 99, true, ts.ScriptKind.TSX);
const branch = action => findAll(route, n => ts.isIfStatement(n) && n.expression.getText(route) === `action === "${action}"`)[0].thenStatement;
const optionalHelpers = ['detectarCelebraciones', 'ejecutarDiscoveryEngine', 'ejecutarAthleteResponseEngine']
  .map(name => findAll(route, n => ts.isFunctionDeclaration(n) && n.name?.text === name)[0].getText(route)).join('\n');
const cache = new Map();
function load(name) {
  assert.ok(['weekClosure', 'recordCompletion', 'planMutation', 'planMutationValidators', 'planMutationTypes'].includes(name));
  if (cache.has(name)) return cache.get(name);
  const module = { exports: {} };
  vm.runInNewContext(compile(readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8')), {
    module, exports: module.exports, structuredClone, Intl, require: p => load(p.replace('./', '')),
  });
  cache.set(name, module.exports); return module.exports;
}
const { projectWeekClosure, weeklyFacts } = load('weekClosure');
const { resolveCompletionDate } = load('recordCompletion');
const { validatePlanMutation } = load('planMutation');
const plain = v => JSON.parse(JSON.stringify(v));
const week = '2026-08-31';
const time = '2026-09-05T22:30:00.000Z'; // Sunday Madrid, still Saturday UTC.
function fixture() {
  return { user_codigo: 'audit', week_start: week, resumen_semana: 'Old', updated_at: 'before',
    block_name: 'Base', extra: { preserved: true }, sessions: [
      { dia: 'LÚNES', tipo: 'Descanso activo', titulo: 'Rest', descripcion: 'Rest prescription',
        completada: false, titulo_real: 'Keep', descripcion_real: 'Keep real', internal: { keep: 1 } },
      { dia: 'martes', tipo: 'fuerza', titulo: 'Done', descripcion: 'Done prescription', completada: true, debilidad_relacionada: 'weak' },
      { dia: 'sábado', tipo: 'box', titulo: 'Pending', descripcion: 'Pending prescription', completada: false },
      { dia: 'domingo', tipo: 'DESCANSO', titulo: 'Today rest', descripcion: 'Today rest', completada: false },
    ] };
}
const summary = { objetivo_semanal: 'Base', resultado: 'parcial', fatiga: 'media', recuperacion: 'regular', adaptaciones_conseguidas: [], pendiente: ['Continue'] };
async function run(action = 'close_week', options = {}) {
  const plan = Object.hasOwn(options, 'plan') ? options.plan : fixture();
  const before = structuredClone(plan);
  const writes = [], events = [], queries = [], inputs = [], prompts = [];
  class AuditDate extends Date { constructor(...args) { super(...(args.length ? args : [options.time ?? time])); } }
  const supabase = { from(table) {
    let op = 'read', payload, selection, single = false;
    const filters = {};
    const query = {
      select(v) { selection = v; return query; }, eq(k, v) { filters[k] = v; return query; },
      order() { return query; }, limit() { return query; }, ilike(k, v) { filters[k] = v; return query; },
      insert(v) { op = 'insert'; payload = v; return query; }, upsert(v) { op = 'upsert'; payload = v; return query; },
      update(v) { op = 'update'; payload = v; return query; },
      single() { single = true; return query; }, maybeSingle() { single = true; return query; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        const key = `${table}:${op}`;
        const specific = `${key}:${selection}`;
        events.push(key); queries.push({ table, op, selection, filters: { ...filters } });
        if (op !== 'read') writes.push({ table, op, payload: structuredClone(payload), filters: { ...filters } });
        if ([key, specific].includes(options.throwAt)) throw new Error(key);
        if ([key, specific].includes(options.errorAt)) return { data: null, error: { message: key } };
        if ([key, specific].includes(options.noRowAt)) return { data: null, error: null };
        let data;
        if (op !== 'read') data = { id: 'written', codigo: 'audit', user_codigo: 'audit', week_start: week, ...payload,
          ...(options.wrongIdentityAt === key ? { codigo: 'other', user_codigo: 'other' } : {}) };
        else if (table === 'weekly_plan') data = plan;
        else if (table === 'week_closure_log') data = options.closed ? { id: 'closed' } : null;
        else if (table === 'usuarios') data = {
          modo_entrada: 'planificacion', ciclo_actual: { bloque: 'Base', semana: options.lastWeek ? 4 : 1, totalSemanas: 4 },
          athlete_development: [{ nombre_visible: 'weak', progreso: 30, estado: 'activa' }], historial_fisiologico: [], analisis_bloques: [], aprendizajes_atleta: [],
          workout_history: options.optionalData ? Array.from({ length: 10 }, () => ({ fecha: time, tipo: 'box', notas: 'Real' })) : [],
        };
        else if (table === 'athlete_events') data = single ? (options.insightExisting ? { data: {} } : null) : [];
        else if (table === 'weakness_exposure') data = null;
        else data = [];
        return { data, error: null };
      }).then(resolve, reject); },
    }; return query;
  } };
  const execute = vm.runInNewContext(compile(`${optionalHelpers}\nasync function execute() ${branch(action).getText(route)}\nexecute;`), {
    datos: Object.hasOwn(options, 'datos') ? options.datos : { week_start: week, resumen: 'New summary', adherencia: '999/999' },
    codigo: options.codigo ?? 'audit', apiKey: 'test', supabase, Date: AuditDate,
    resolveCompletionDate, projectWeekClosure, weeklyFacts, console: { log() {}, error() {} },
    NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) },
    validatePlanMutation: async input => {
      events.push('gate'); inputs.push(structuredClone(input));
      if (options.gateStatus) return { status: options.gateStatus, violations: [] };
      const result = await validatePlanMutation(input);
      return options.returnedCandidate && result.status === 'ready_for_commit'
        ? { ...result, candidate: options.returnedCandidate(result.candidate) } : result;
    },
    fetch: async (_url, init) => {
      const prompt = JSON.parse(init.body).messages[0].content; prompts.push(prompt);
      const kind = prompt.includes('resumen ESTRUCTURADO') ? 'summary' : prompt.includes('Athlete Response Engine') ? 'knowledge'
        : prompt.includes('Discovery Engine') ? 'discovery' : 'insight';
      return { ok: options.llmFailure !== kind, json: async () => ({ content: [{ text: kind === 'summary'
        ? JSON.stringify(options.invalidSummary ? {} : summary) : kind === 'knowledge'
          ? JSON.stringify({ hay_patron: true, patron: 'Real pattern', puntos_evidencia: 4 }) : kind === 'discovery'
            ? JSON.stringify({ hay_patron: true, descubrimiento: 'Discovery', puntos_evidencia: 4 }) : 'Narrative' }] }) };
    },
  });
  const response = plain(await execute()); assert.deepEqual(plan, before, 'existing plan is immutable');
  return { response, writes, events, queries, inputs, prompts };
}
const planWrites = r => r.writes.filter(w => w.table === 'weekly_plan');
const logWrites = r => r.writes.filter(w => w.table === 'week_closure_log');

test('W7 projects the complete plan, changes only a past rest flag, and gates before all writes', async () => {
  const r = await run(); assert.equal(r.response.body.closed, true);
  const expected = fixture(); expected.sessions[0].completada = true;
  assert.deepEqual(plain(r.inputs[0].candidate), expected);
  assert.deepEqual(plain(r.inputs[0].context.existingPlan), fixture());
  assert.deepEqual(plain(r.inputs[0].command), { operationType: 'complete_past_rest_days', source: 'week_close',
    target: { userCodigo: 'audit', weekStart: week }, proposal: { asOfDate: '2026-09-06' } });
  assert.deepEqual(plain(r.inputs[0].changeSet), { operationType: 'complete_past_rest_days', affectedDays: ['LÚNES'], changedFields: ['sessions.0.completada'] });
  assert.equal(r.queries.find(q => q.table === 'weekly_plan').selection, '*');
  assert.ok(r.events.indexOf('gate') < r.events.indexOf('weekly_plan:update'));
  assert.deepEqual(plain(planWrites(r)[0].payload), { sessions: expected.sessions });
  assert.equal(r.response.body.restsCompleted, 1);
  assert.equal(r.events.at(-1), 'week_closure_log:insert');
});

test('unknown rest and duplicate relevant day reject with zero writes/effects', async () => {
  const unknown = fixture(); unknown.sessions[0].dia = 'unknown';
  const duplicate = fixture(); duplicate.sessions.push({ ...duplicate.sessions[1], dia: 'lunes' });
  for (const [plan, error] of [[unknown, 'UNKNOWN_REST_DAY'], [duplicate, 'AMBIGUOUS_REST_DAY']]) {
    const r = await run('close_week', { plan }); assert.equal(r.response.body.error, error);
    assert.equal(r.writes.length, 0); assert.equal(r.inputs.length, 0); assert.equal(r.prompts.length, 0);
  }
});

test('not eligible has zero writes/gate/derivatives; rest classification agrees with check', async () => {
  const r = await run('close_week', { time: '2026-09-04T12:00:00Z' });
  assert.equal(r.response.body.closed, false); assert.equal(r.writes.length, 0); assert.equal(r.inputs.length, 0); assert.equal(r.prompts.length, 0);
  const plan = fixture(); plan.sessions[2].completada = true;
  for (const action of ['close_week', 'check_week_closure']) {
    const eligible = await run(action, { plan, time: '2026-09-04T12:00:00Z' });
    assert.equal(eligible.response.body[action === 'close_week' ? 'closed' : 'ready'], true);
  }
});

test('today rest stays pending, and no-change closure performs no artificial plan write', async () => {
  const plan = fixture(); plan.sessions[0].completada = true;
  const r = await run('close_week', { plan });
  assert.equal(r.response.body.closed, true); assert.equal(r.response.body.restsCompleted, 0);
  assert.equal(planWrites(r).length, 0); assert.equal(r.inputs.length, 0);
});

test('strict weekly facts and both LLM contexts separate completed from pending', async () => {
  const plan = fixture(); plan.sessions[2].completada = 'true';
  const r = await run('close_week', { plan });
  assert.equal(r.response.body.sesionesCompletadas, 1); assert.equal(r.response.body.adherenciaPorcentaje, 50);
  for (const prompt of r.prompts.slice(0, 2)) {
    const completedPart = prompt.split('SESIONES COMPLETADAS ESTA SEMANA:')[1].split('SESIONES PENDIENTES:')[0];
    assert.ok(completedPart.includes('Done')); assert.ok(!completedPart.includes('Pending'));
    assert.ok(prompt.split('SESIONES PENDIENTES:')[1].includes('Pending')); assert.ok(prompt.includes('1/2'));
  }
  assert.equal(r.writes.find(w => w.table === 'block_week_summary').payload.adherencia_real, 50);
});

test('prior Insight never short-circuits W7; only closure log authorizes alreadyClosed', async () => {
  const prior = await run('close_week', { insightExisting: true }); assert.equal(prior.response.body.closed, true); assert.equal(logWrites(prior).length, 1);
  assert.ok(!prior.queries.some(q => q.table === 'athlete_events' && q.filters.title));
  for (const action of ['close_week', 'check_week_closure']) {
    const closed = await run(action, { closed: true }); assert.equal(closed.response.body.alreadyClosed, true); assert.equal(closed.writes.length, 0);
    const failed = await run(action, { errorAt: 'week_closure_log:read' });
    assert.equal(failed.response.body.ok, false); assert.equal(failed.writes.length, 0);
  }
});

test('read errors, absent plan and identity mismatch are distinct before mutations', async () => {
  const read = await run('close_week', { errorAt: 'weekly_plan:read' }); assert.equal(read.response.status, 500);
  const missing = await run('close_week', { plan: null }); assert.equal(missing.response.status, 404);
  const plan = fixture(); plan.user_codigo = 'other';
  assert.equal((await run('close_week', { plan })).response.body.error, 'CLOSURE_PLAN_IDENTITY_MISMATCH');
  assert.equal((await run('check_week_closure', { errorAt: 'weekly_plan:read' })).response.body.ok, false);
});

test('W7 gate and plan persistence failures stop all derivatives/log writes', async () => {
  for (const options of [{ gateStatus: 'rejected' }, { gateStatus: 'failed' }, { errorAt: 'weekly_plan:update' },
    { noRowAt: 'weekly_plan:update' }, { wrongIdentityAt: 'weekly_plan:update' }]) {
    const r = await run('close_week', options); assert.equal(r.response.body.ok, false);
    assert.ok(r.writes.every(w => w.table === 'weekly_plan')); assert.equal(r.prompts.length, 0);
  }
});

test('W7 persists the gate-returned candidate and derives facts from that confirmed state', async () => {
  const r = await run('close_week', { returnedCandidate: candidate => ({ ...candidate, sessions: candidate.sessions.map((s, i) => i === 2 ? { ...s, completada: true } : s) }) });
  assert.equal(planWrites(r)[0].payload.sessions[2].completada, true); assert.equal(r.response.body.sesionesCompletadas, 2);
});

test('required derivative error/no row/throw prevents log and reports partial stage', async () => {
  for (const [key, stage] of [['block_week_summary:upsert', 'block_week_summary'], ['weakness_exposure:upsert', 'weakness_exposure'], ['usuarios:update', 'analisis_bloques']]) {
    for (const failure of ['errorAt', 'noRowAt', 'throwAt']) {
      const r = await run('close_week', { lastWeek: true, [failure]: key });
      assert.equal(r.response.status, 200); assert.equal(r.response.body.partial, true); assert.equal(r.response.body.closed, false);
      assert.equal(r.response.body.planPersisted, true); assert.equal(r.response.body.stage, stage); assert.equal(logWrites(r).length, 0);
    }
  }
  for (const options of [{ invalidSummary: true }, { llmFailure: 'summary' }]) {
    const r = await run('close_week', options); assert.equal(r.response.body.partial, true); assert.equal(logWrites(r).length, 0);
  }
});

test('effects that do not apply are not required; failed final log never claims closure', async () => {
  const plan = fixture(); delete plan.sessions[1].debilidad_relacionada;
  const r = await run('close_week', { plan, errorAt: 'usuarios:read:athlete_development' });
  assert.equal(r.response.body.closed, true); assert.ok(!r.writes.some(w => w.table === 'weakness_exposure' || w.op === 'update' && w.table === 'usuarios'));
  for (const failure of ['errorAt', 'noRowAt', 'wrongIdentityAt', 'throwAt']) {
    const failed = await run('close_week', { [failure]: 'week_closure_log:insert' });
    assert.equal(failed.response.body.closed, false); assert.equal(failed.response.body.partial, true); assert.equal(failed.response.body.stage, 'week_closure_log');
  }
});

test('optional Insight failures expose warnings with accurate generation flag', async () => {
  for (const options of [{ llmFailure: 'insight' }, { errorAt: 'athlete_events:insert' }, { noRowAt: 'athlete_events:insert' }]) {
    const r = await run('close_week', options); assert.equal(r.response.body.closed, true);
    assert.equal(r.response.body.insightGenerado, false); assert.ok(r.response.body.warnings.length);
  }
});

test('real optional discovery/knowledge helpers report failed inserts as warnings', async () => {
  for (const [key, warning] of [['forge_discoveries:insert', 'DISCOVERY_WRITE_FAILED'], ['athlete_knowledge_points:insert', 'KNOWLEDGE_WRITE_FAILED']]) {
    const r = await run('close_week', { optionalData: true, errorAt: key });
    assert.equal(r.response.body.closed, true); assert.ok(r.response.body.warnings.includes(warning));
  }
});

test('W8 validates payload, canonical Monday date, and plan read/identity', async () => {
  for (const datos of [{}, { week_start: '2026-02-30', resumen: 'x' }, { week_start: '2026-09-01', resumen: 'x' },
    { week_start: week, resumen: {} }, { week_start: week, resumen: ' ' }, { week_start: week, resumen: 'x', adherencia: {} }]) {
    const r = await run('guardar_resumen_semana', { datos }); assert.equal(r.response.body.ok, false); assert.equal(r.writes.length, 0);
  }
  assert.equal((await run('guardar_resumen_semana', { errorAt: 'weekly_plan:read' })).response.status, 500);
  assert.equal((await run('guardar_resumen_semana', { plan: null })).response.status, 404);
});

test('W8 gates a complete candidate changing only summary; Coach adherence is not a canonical metric', async () => {
  const r = await run('guardar_resumen_semana');
  assert.deepEqual(plain(r.inputs[0].candidate), { ...fixture(), resumen_semana: 'New summary' });
  assert.equal(r.inputs[0].command.operationType, 'set_week_summary'); assert.equal(r.inputs[0].command.source, 'week_summary');
  assert.deepEqual(plain(r.inputs[0].changeSet), { operationType: 'set_week_summary', affectedDays: [], changedFields: ['resumen_semana'] });
  assert.deepEqual(plain(planWrites(r)[0].payload), { resumen_semana: 'New summary' });
  assert.equal(r.writes.find(w => w.table === 'athlete_events').payload.data.adherencia, '1/2');
  assert.equal(logWrites(r).length, 0);
});

test('W8 same summary is no-op without artificial plan write or duplicate Insight', async () => {
  const r = await run('guardar_resumen_semana', { datos: { week_start: week, resumen: 'Old' } });
  assert.equal(r.response.body.noOp, true); assert.equal(r.writes.length, 0); assert.equal(r.inputs.length, 0);
});

test('W8 uses returned candidate; rejected/failed/write/zero-row/identity failures cannot emit Insight', async () => {
  const r = await run('guardar_resumen_semana', { returnedCandidate: candidate => ({ ...candidate, resumen_semana: 'Authorized' }) });
  assert.equal(planWrites(r)[0].payload.resumen_semana, 'Authorized');
  for (const options of [{ gateStatus: 'rejected' }, { gateStatus: 'failed' }, { errorAt: 'weekly_plan:update' },
    { noRowAt: 'weekly_plan:update' }, { wrongIdentityAt: 'weekly_plan:update' }]) {
    const failed = await run('guardar_resumen_semana', options); assert.equal(failed.response.body.ok, false);
    assert.ok(failed.writes.every(w => w.table === 'weekly_plan'));
  }
});

test('W8 Insight failure leaves summary success with warning and no false Insight success', async () => {
  const r = await run('guardar_resumen_semana', { errorAt: 'athlete_events:insert' });
  assert.equal(r.response.body.ok, true); assert.equal(r.response.body.summarySaved, true);
  assert.equal(r.response.body.insightGenerado, false); assert.ok(r.response.body.warnings.includes('SUMMARY_INSIGHT_WRITE_FAILED'));
});

test('summary consumer requires saved result and deterministic check before enabling banner', async () => {
  const call = findAll(web, n => ts.isCallExpression(n) && n.expression.getText(web) === 'procesarTag'
    && n.arguments[0]?.getText(web) === '"[RESUMEN_SEMANA:"')[0];
  for (const [saved, ready, expected] of [[false, true, false], [true, false, false], [true, true, true]]) {
    const calls = []; let enabled = false;
    const callback = vm.runInNewContext(compile(`const callback = ${call.arguments[2].getText(web)};\ncallback;`), {
      codigoUsuario: 'audit', apiCall: async body => { calls.push(body.action); return body.action === 'guardar_resumen_semana'
        ? { ok: saved, summarySaved: saved } : { ok: true, ready, canGenerateNextWeek: true }; },
      setMostrarBotonNuevaSemana: v => { enabled = v; },
    });
    await callback({}); assert.equal(enabled, expected); assert.equal(calls.length, saved ? 2 : 1);
  }
});

test('real close button advances only on explicit complete closure, never partial or closed:false', async () => {
  let handler = findAll(web, n => ts.isCallExpression(n) && n.expression.getText(web) === 'apiCall'
    && n.arguments[0]?.getText(web).includes('action:"close_week"'))[0];
  while (!ts.isArrowFunction(handler)) handler = handler.parent;
  for (const result of [{ ok: false, partial: true, closed: false, planPersisted: true }, { ok: true, closed: false },
    { semanaCompleta: true }, { ok: true, closed: true }, { ok: true, closed: true, alreadyClosed: true }]) {
    let advance = false;
    const click = vm.runInNewContext(compile(`const click = ${handler.getText(web)};\nclick;`), {
      codigoUsuario: 'audit', modoEntrada: 'planificacion', distribucionSemanal: {}, apiCall: async () => result,
      setMostrarBotonNuevaSemana() {}, cargarPlanSemanal() {}, setMensajes() {},
      setEsperandoConfirmacionDisponibilidad: v => { advance = v; },
    });
    await click(); assert.equal(advance, result.ok === true && result.closed === true && !result.partial);
  }
});

test('real apiCall receives known closure partial HTTP 200 without retry', async () => {
  const r = await run('close_week', { errorAt: 'block_week_summary:upsert' }); assert.equal(r.response.status, 200);
  const declaration = findAll(web, n => ts.isVariableDeclaration(n) && n.name.getText(web) === 'apiCall')[0];
  let requests = 0;
  const apiCall = vm.runInNewContext(compile(`const apiCall = ${declaration.initializer.getText(web)};\napiCall;`), {
    fetch: async () => { requests++; return { ok: true, json: async () => r.response.body }; },
    setTimeout: () => assert.fail('partial must not retry'),
  });
  assert.equal((await apiCall({ action: 'close_week' })).partial, true); assert.equal(requests, 1);
});

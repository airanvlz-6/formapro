import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
function findAll(root, predicate) {
  const result = [];
  function visit(n) { if (predicate(n)) result.push(n); ts.forEachChild(n, visit); }
  visit(root); return result;
}
const routeText = readFileSync(new URL('../../app/api/chat/route.ts', import.meta.url), 'utf8');
const route = ts.createSourceFile('route.ts', routeText, ts.ScriptTarget.Latest, true);
const webText = readFileSync(new URL('../../app/FormaPro.tsx', import.meta.url), 'utf8');
const web = ts.createSourceFile('FormaPro.tsx', webText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const branchFor = action => findAll(route, n => ts.isIfStatement(n) && n.expression.getText(route) === `action === "${action}"`)[0].thenStatement;
const fixedTime = '2026-09-06T22:30:00.000Z'; // Monday in Madrid, Sunday in UTC.
class AuditDate extends Date { constructor(...args) { super(...(args.length ? args : [fixedTime])); } }
const cache = new Map();
function load(name) {
  assert.ok(['recordCompletion', 'planMutation', 'planMutationValidators', 'planMutationTypes'].includes(name));
  if (cache.has(name)) return cache.get(name);
  const module = { exports: {} };
  const source = readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8');
  vm.runInNewContext(compile(source), { module, exports: module.exports, structuredClone, Date: AuditDate, Intl,
    require: path => load(path.replace('./', '')) });
  cache.set(name, module.exports); return module.exports;
}
const { recordPlanCompletion, resolveCompletionDate } = load('recordCompletion');
const { validatePlanMutation } = load('planMutation');
const plain = value => JSON.parse(JSON.stringify(value));
const evidence = () => ({ source: 'explicit_completion', userCodigo: 'audit', fecha: fixedTime,
  title: 'Fuerza realizada', description: 'Hice tres series' });
const planFixture = () => ({ user_codigo: 'audit', week_start: '2026-09-07', block_name: 'Base',
  extra: { retained: true }, updated_at: 'before', confidence: 80, sessions: [
    { dia: 'LÚNES', tipo: 'fuerza', titulo: 'Prescription', descripcion: 'Original prescription',
      por_que: 'Purpose', completada: false, internal: { keep: 1 }, modificado: true },
    { dia: 'martes', tipo: 'descanso', titulo: 'Rest', descripcion: 'Rest', completada: true },
  ] });
const extracted = () => ({ es_reporte_entreno: true, tipo: evidence().title, notas: evidence().description, sensacion: null });

function harness(options = {}) {
  const plan = Object.hasOwn(options, 'plan') ? options.plan : planFixture();
  const history = options.history ?? [];
  const before = structuredClone({ plan, history });
  const writes = [], events = [], queries = [], inputs = [], adapterCalls = [];
  const supabase = { from(table) {
    let op = 'read', payload, selection;
    const filters = {};
    const q = {
      select(value) { selection = value; return q; }, eq(k, v) { filters[k] = v; return q; },
      update(value) { op = 'update'; payload = value; return q; },
      insert(value) { op = 'insert'; payload = value; return q; }, single() { return q; }, maybeSingle() { return q; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        const key = `${table}:${op}`;
        events.push(key); queries.push({ table, op, selection, filters: { ...filters } });
        if (op !== 'read') writes.push({ table, payload: structuredClone(payload), filters: { ...filters } });
        if (options.throwAt === key) throw new Error(key);
        if (options.errorAt === key) return { data: null, error: { message: key } };
        if (options.noRowAt === key) return { data: null, error: null };
        let data;
        if (table === 'weekly_plan') data = op === 'read' ? plan : {
          user_codigo: options.wrongPlanUser ? 'other' : 'audit', week_start: options.wrongWeek ? 'other' : '2026-09-07' };
        else if (table === 'usuarios') data = op === 'read' ? { workout_history: history, primera_sesion_at: null }
          : { codigo: options.wrongHistoryUser ? 'other' : 'audit' };
        else data = { id: 'event1' };
        return { data, error: null };
      }).then(resolve, reject); },
    }; return q;
  } };
  const adapter = async (db, input) => {
    adapterCalls.push(structuredClone(input));
    return recordPlanCompletion(db, input, async value => {
      events.push('gate'); inputs.push(structuredClone(value));
      if (options.gateStatus) return { status: options.gateStatus, violations: [] };
      const result = await validatePlanMutation(value);
      return options.returnedCandidate && result.status === 'ready_for_commit'
        ? { ...result, candidate: options.returnedCandidate(result.candidate) } : result;
    });
  };
  const verifyUnchanged = () => assert.deepEqual({ plan, history }, before);
  return { supabase, adapter, writes, events, queries, inputs, adapterCalls, verifyUnchanged };
}
async function runAdapter(options = {}) {
  const h = harness(options);
  const result = plain(await h.adapter(h.supabase, { ...evidence(), ...options.evidence }));
  h.verifyUnchanged(); return { ...h, result };
}
async function runRoute(action, options = {}) {
  const h = harness(options);
  const emitter = findAll(route, n => ts.isFunctionDeclaration(n) && n.name?.text === 'emitirEventoForge')[0];
  const execute = vm.runInNewContext(compile(`${emitter.getText(route)}\nasync function execute() ${branchFor(action).getText(route)}\nexecute;`), {
    datos: Object.hasOwn(options, 'datos') ? options.datos : action === 'verificar_sesion_completada_deterministico'
      ? { mensaje: 'He terminado tres series de fuerza' }
      : { fecha: fixedTime, sesion: { tipo: evidence().title, notas: evidence().description, fecha: fixedTime } },
    codigo: Object.hasOwn(options, 'codigo') ? options.codigo : 'audit', apiKey: 'test',
    supabase: h.supabase, recordPlanCompletion: h.adapter, resolveCompletionDate, Date: AuditDate,
    NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) },
    console: { log() {}, error() {} },
    fetch: async () => ({ ok: true, json: async () => ({ content: [{ text: JSON.stringify(
      Object.hasOwn(options, 'extracted') ? options.extracted : extracted()) }] }) }),
  });
  const response = plain(await execute()); h.verifyUnchanged(); return { ...h, response };
}
const planWrites = r => r.writes.filter(w => w.table === 'weekly_plan');

test('Madrid civil dates and explicit-offset timestamps resolve independently of process timezone', () => {
  for (const value of [fixedTime, '2026-09-07', '2026-09-07T00:30:00+02:00']) {
    assert.deepEqual(plain(resolveCompletionDate(value)), { date: '2026-09-07', weekStart: '2026-09-07', day: 'lunes' });
  }
  assert.equal(resolveCompletionDate('2026-01-04T23:30:00Z').day, 'lunes');
  assert.equal(resolveCompletionDate('2026-03-29T00:30:00Z').date, '2026-03-29');
  for (const value of ['', null, {}, '2026-02-30', '2026-09-07T00:30:00', '2026-09-07T24:30:00Z']) assert.equal(resolveCompletionDate(value), null);
});

test('W5/W6 use the same adapter with distinct fixed sources and no weekly_plan access in either branch', async () => {
  for (const [action, source] of [['marcar_sesion_completada', 'explicit_completion'],
    ['verificar_sesion_completada_deterministico', 'deterministic_completion']]) {
    const r = await runRoute(action);
    assert.equal(r.adapterCalls.length, 1); assert.equal(r.adapterCalls[0].source, source);
    assert.equal(r.response.body.planCompleted, true);
    const planAccess = findAll(branchFor(action), n => ts.isCallExpression(n)
      && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'from'
      && ts.isStringLiteral(n.arguments[0]) && n.arguments[0].text === 'weekly_plan');
    assert.equal(planAccess.length, 0);
  }
});

test('invalid explicit evidence/date/envelope rejects without any plan write', async () => {
  for (const override of [{ userCodigo: '' }, { title: [] }, { title: ' ' }, { description: null },
    { description: '' }, { fecha: '2026-02-30' }, { source: 'coach_completion' }]) {
    const r = await runAdapter({ evidence: override }); assert.equal(r.result.ok, false); assert.equal(r.events.length, 0);
  }
  for (const datos of [null, {}, { sesion: [] }, { fecha: fixedTime, sesion: { tipo: 1, notas: {} } }]) {
    const r = await runRoute('marcar_sesion_completada', { datos });
    assert.equal(r.response.body.ok, false); assert.equal(r.writes.length, 0);
  }
});

test('W6 requires literal true and usable typed fields; truthy values/arrays cannot write', async () => {
  for (const value of ['true', 'false', 1, [], {}, null, false]) {
    const r = await runRoute('verificar_sesion_completada_deterministico', { extracted: { ...extracted(), es_reporte_entreno: value } });
    assert.equal(r.writes.length, 0); assert.equal(r.adapterCalls.length, 0);
  }
  for (const value of [[], [extracted()], null, { ...extracted(), tipo: 3 }, { ...extracted(), notas: {} },
    { ...extracted(), notas: '' }, { ...extracted(), sensacion: ['buena'] }, { ...extracted(), sensacion: 'inventada' }]) {
    const r = await runRoute('verificar_sesion_completada_deterministico', { extracted: value });
    assert.equal(r.writes.length, 0);
  }
});

test('no plan/no target/rest are history-only; ambiguous target rejects without plan writes', async () => {
  const missing = planFixture(); missing.sessions[0].dia = 'miércoles';
  const rest = planFixture(); rest.sessions[0].tipo = 'Descanso activo';
  for (const [plan, status] of [[null, 'no_plan'], [missing, 'no_target'], [rest, 'rest_target']]) {
    const r = await runAdapter({ plan }); assert.equal(r.result.historyOnly, true);
    assert.equal(r.result.planCompleted, false); assert.equal(r.result.status, status); assert.equal(r.writes.length, 0);
    const automatic = await runRoute('verificar_sesion_completada_deterministico', { plan });
    assert.equal(automatic.response.body.historyRecorded, true); assert.equal(automatic.response.body.historyOnly, true);
    assert.equal(planWrites(automatic).length, 0);
  }
  const duplicate = planFixture(); duplicate.sessions.push({ ...duplicate.sessions[0], dia: 'lunes' });
  const r = await runAdapter({ plan: duplicate }); assert.equal(r.result.error, 'AMBIGUOUS_COMPLETION_TARGET'); assert.equal(r.writes.length, 0);
});

test('first completion keeps full plan/prescription/internal fields and gates before write', async () => {
  const r = await runAdapter();
  const expected = planFixture(); Object.assign(expected.sessions[0], { completada: true,
    titulo_real: evidence().title, descripcion_real: evidence().description }); expected.updated_at = fixedTime;
  assert.deepEqual(plain(r.inputs[0].candidate), expected);
  assert.deepEqual(plain(r.inputs[0].context.existingPlan), planFixture());
  assert.deepEqual(r.events, ['weekly_plan:read', 'gate', 'weekly_plan:update']);
  assert.equal(r.queries[0].selection, '*');
  assert.deepEqual(plain(r.inputs[0].command), { operationType: 'record_completion', source: 'explicit_completion',
    target: { userCodigo: 'audit', weekStart: '2026-09-07', day: 'LÚNES' }, proposal: { title: evidence().title, description: evidence().description } });
  assert.deepEqual(plain(r.inputs[0].changeSet), { operationType: 'record_completion', affectedDays: ['LÚNES'],
    changedFields: ['sessions.0.completada', 'sessions.0.titulo_real', 'sessions.0.descripcion_real', 'updated_at'] });
});

test('same execution is no-op for both sources; automatic conflicts never overwrite; explicit correction does', async () => {
  const plan = planFixture(); Object.assign(plan.sessions[0], { completada: true, titulo_real: evidence().title, descripcion_real: evidence().description });
  for (const source of ['explicit_completion', 'deterministic_completion']) {
    const r = await runAdapter({ plan, evidence: { source } });
    assert.equal(r.result.alreadyCompleted, true); assert.equal(r.result.status, 'already_completed_noop');
    assert.equal(r.writes.length, 0); assert.equal(r.inputs.length, 0);
  }
  const automatic = await runAdapter({ plan, evidence: { source: 'deterministic_completion', description: 'More' } });
  assert.equal(automatic.result.error, 'already_completed_conflict'); assert.equal(automatic.writes.length, 0);
  const explicit = await runAdapter({ plan, evidence: { description: 'Corrected' } });
  assert.equal(explicit.result.corrected, true); assert.equal(explicit.inputs[0].candidate.sessions[0].completada, true);
  assert.equal(explicit.inputs[0].candidate.sessions[0].descripcion, plan.sessions[0].descripcion);
  assert.ok(!explicit.inputs[0].changeSet.changedFields.includes('sessions.0.completada'));
});

test('gate rejected/failed rejects without plan writes and untouched invalid sessions are validated', async () => {
  for (const gateStatus of ['rejected', 'failed']) {
    const r = await runAdapter({ gateStatus }); assert.equal(r.result.ok, false); assert.equal(r.writes.length, 0);
  }
  const plan = planFixture(); plan.sessions[1].descripcion = null;
  assert.equal((await runAdapter({ plan })).result.error, 'PLAN_MUTATION_REJECTED');
});

test('write uses only candidate returned by gate, checking row, user/week and errors', async () => {
  const r = await runAdapter({ returnedCandidate: candidate => ({ ...candidate, updated_at: 'authorized',
    sessions: candidate.sessions.map(s => ({ ...s, descripcion_real: 'authorized' })) }) });
  assert.equal(r.writes[0].payload.updated_at, 'authorized');
  assert.ok(r.writes[0].payload.sessions.every(s => s.descripcion_real === 'authorized'));
  assert.deepEqual(r.writes[0].filters, { user_codigo: 'audit', week_start: '2026-09-07' });
  for (const options of [{ errorAt: 'weekly_plan:update' }, { noRowAt: 'weekly_plan:update' },
    { wrongPlanUser: true }, { wrongWeek: true }, { throwAt: 'weekly_plan:update' }, { errorAt: 'weekly_plan:read' }]) {
    assert.equal((await runAdapter(options)).result.ok, false);
  }
});

test('W6 enriches with controlled fields, retaining workout_id/duration/analysis/other metadata', async () => {
  const original = { workout_id: 'keep', tipo: evidence().title, fecha: fixedTime, notas: 'Earlier',
    duracion: 42, analisis: 'Analysis', sensacion: 'mala', source: 'original', custom: { kept: true } };
  const r = await runRoute('verificar_sesion_completada_deterministico', { history: [original],
    extracted: { ...extracted(), workout_id: 'evil', duracion: 999, arbitrary: 'discard' } });
  const saved = r.writes[0].payload.workout_history;
  assert.equal(saved.length, 1);
  assert.deepEqual(plain(saved[0]), { ...original, notas: `Earlier ${evidence().description}` });
  assert.equal(r.response.body.historyRecorded, true); assert.equal(r.adapterCalls[0].fecha, fixedTime);
});

test('identical W6 notes are not deliberately appended twice', async () => {
  const original = { tipo: evidence().title, fecha: fixedTime, notas: evidence().description, workout_id: 'keep' };
  const r = await runRoute('verificar_sesion_completada_deterministico', { history: [original] });
  assert.equal(r.writes[0].payload.workout_history[0].notas, original.notas);
});

test('both history writers reject read/write errors and unconfirmed rows, never proceeding to plan/event', async () => {
  for (const action of ['registrar_sesion', 'verificar_sesion_completada_deterministico']) {
    for (const options of [{ errorAt: 'usuarios:read' }, { noRowAt: 'usuarios:read' },
      { errorAt: 'usuarios:update' }, { noRowAt: 'usuarios:update' }, { wrongHistoryUser: true }, { history: {} }]) {
      const r = await runRoute(action, options);
      assert.equal(r.response.body.ok, false); assert.equal(r.response.body.historyRecorded, false);
      assert.equal(r.adapterCalls.length, 0); assert.ok(!r.events.includes('forge_events:insert'));
      if (options.errorAt === 'usuarios:read' || options.noRowAt === 'usuarios:read') assert.equal(r.writes.length, 0);
    }
  }
});

test('registrar_sesion persists history/activation before event, exposing event failures as warnings', async () => {
  const r = await runRoute('registrar_sesion');
  assert.deepEqual(r.events, ['usuarios:read', 'usuarios:update', 'forge_events:insert']);
  assert.equal(r.writes[0].payload.primera_sesion_at, fixedTime);
  assert.equal(r.writes[0].payload.workout_history[0].workout_id, '2026-09-07_lunes');
  assert.equal(r.response.body.historyRecorded, true); assert.equal(r.response.body.planCompleted, false);
  for (const option of ['errorAt', 'throwAt']) {
    const failed = await runRoute('registrar_sesion', { [option]: 'forge_events:insert' });
    assert.equal(failed.response.body.ok, true); assert.equal(failed.response.body.historyRecorded, true);
    assert.deepEqual(failed.response.body.warnings, ['WORKOUT_EVENT_FAILED']); assert.equal(failed.response.status, 200);
  }
});

test('W6 history success + gate/target/persistence failure is explicit partial HTTP 200', async () => {
  const completed = planFixture(); Object.assign(completed.sessions[0], { completada: true, titulo_real: 'Other', descripcion_real: 'Other' });
  for (const options of [{ gateStatus: 'rejected' }, { gateStatus: 'failed' }, { errorAt: 'weekly_plan:update' },
    { noRowAt: 'weekly_plan:update' }, { errorAt: 'weekly_plan:read' }, { plan: completed }]) {
    const r = await runRoute('verificar_sesion_completada_deterministico', options);
    assert.equal(r.response.body.ok, false); assert.equal(r.response.body.partial, true);
    assert.equal(r.response.body.historyRecorded, true); assert.equal(r.response.status, 200);
  }
});

const apiCalls = action => findAll(web, n => ts.isCallExpression(n) && n.expression.getText(web) === 'apiCall'
  && n.arguments[0]?.getText(web).includes(`action:"${action}"`));
async function runButton(historyResult, planResult, second = false) {
  let handler = apiCalls(second ? 'registrar_sesion' : 'marcar_sesion_completada')[second ? 1 : 0];
  while (!ts.isArrowFunction(handler)) handler = handler.parent;
  const calls = [], messages = []; let cleared = false;
  const click = vm.runInNewContext(compile(`const click = ${handler.getText(web)};\nclick;`), {
    codigoUsuario: 'audit', sesionPendiente: { tipo: 'Fuerza', notas: 'Real', fecha: fixedTime, workout_id: 'id' },
    apiCall: async body => { calls.push(body.action); return body.action === 'registrar_sesion' ? historyResult : planResult; },
    setMensajes: fn => { messages.push(...fn([]).map(m => m.content)); },
    setSesionPendiente: () => { cleared = true; }, cargarPlanSemanal() {}, setSesionParaCompartir() {},
  });
  await click(); return { calls, messages, cleared };
}
test('real W5 button stops on history failure and presents history+plan failure as partial', async () => {
  const failed = await runButton({ ok: false, historyRecorded: false }, {});
  assert.deepEqual(failed.calls, ['registrar_sesion']); assert.equal(failed.cleared, false);
  const partial = await runButton({ ok: true, historyRecorded: true }, { ok: false });
  assert.deepEqual(partial.calls, ['registrar_sesion', 'marcar_sesion_completada']);
  assert.ok(partial.messages.some(m => m.includes('Registro parcial')));
  for (const completion of [{ ok: true, planCompleted: true }, { ok: true, historyOnly: true },
    { ok: true, corrected: true, planCompleted: true }, { ok: true, alreadyCompleted: true, planCompleted: true }]) {
    const success = await runButton({ ok: true, historyRecorded: true, esPrimeraSesion: true }, completion);
    assert.equal(success.cleared, true); assert.ok(!success.messages.some(m => m.includes('Registro parcial')));
  }
});

test('second session stays history-only and checks registration success', async () => {
  const r = await runButton({ ok: true, historyRecorded: true }, {}, true);
  assert.deepEqual(r.calls, ['registrar_sesion']); assert.ok(r.messages.some(m => m.includes('solo en el historial')));
  assert.equal((await runButton({ ok: false }, {}, true)).cleared, false);
});

test('real apiCall does not retry known partial W6 or W5 plan failures after history', async () => {
  const declaration = findAll(web, n => ts.isVariableDeclaration(n) && n.name.getText(web) === 'apiCall')[0];
  for (const action of ['marcar_sesion_completada', 'verificar_sesion_completada_deterministico']) {
    const r = await runRoute(action, { errorAt: 'weekly_plan:update' }); assert.equal(r.response.status, 200);
    let requests = 0;
    const apiCall = vm.runInNewContext(compile(`const apiCall = ${declaration.initializer.getText(web)};\napiCall;`), {
      fetch: async () => { requests++; return { ok: true, json: async () => r.response.body }; },
      setTimeout: () => assert.fail('must not retry known partial/domain outcome'),
    });
    assert.equal((await apiCall({ action })).ok, false); assert.equal(requests, 1);
  }
});

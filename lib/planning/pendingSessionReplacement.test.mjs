import { planningTestRuntime, withPlanIdentity, validateTestCandidate } from './planningTestRuntime.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function findAll(root, predicate) {
  const matches = [];
  function visit(node) { if (predicate(node)) matches.push(node); ts.forEachChild(node, visit); }
  visit(root);
  return matches;
}
const routeText = readFileSync(new URL('../../app/api/chat/route.ts', import.meta.url), 'utf8');
const route = ts.createSourceFile('route.ts', routeText, ts.ScriptTarget.Latest, true);
const webText = readFileSync(new URL('../../app/FormaPro.tsx', import.meta.url), 'utf8');
const web = ts.createSourceFile('FormaPro.tsx', webText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const branchFor = action => findAll(route, n => ts.isIfStatement(n)
  && n.expression.getText(route) === `action === "${action}"`)[0].thenStatement;
const branch = branchFor('confirmar_pending_action');
const compile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
const executable = compile(`async function execute() ${branch.getText(route)}`);
const loadCore = planningTestRuntime();
const validate = loadCore('planMutation').validatePlanMutation;
const { mutatePlanWithCAS, planPersistenceFailure } = loadCore('planPersistence');
const plain = value => JSON.parse(JSON.stringify(value));
const fixedTime = '2026-09-04T12:00:00.000Z';
class AuditDate extends Date { constructor(...args) { super(...(args.length ? args : [fixedTime])); } }
const week = '2026-08-31';
function fixture() {
  return withPlanIdentity({ user_codigo: 'audit', week_start: week, confidence: 80, updated_at: 'original',
    block_name: 'Base', week_number: 2, extra: { retained: true }, sessions: [
      { dia: 'miércoles', tipo: 'box', titulo: 'Original', descripcion: 'Original prescription',
        por_que: 'Purpose', debilidad_relacionada: 'old', completada: null,
        titulo_real: 'Reported', descripcion_real: 'Actual', internal: { keep: [1, 2] } },
      { dia: 'jueves', tipo: 'rest', titulo: 'Rest', descripcion: 'Rest', completada: true },
    ] });
}
function pending() {
  return { id: 'p1', user_codigo: 'audit', estado: 'pendiente', tipo: 'modificar_sesion', accion: {
    week_start: week, dia: 'MIERCOLES', tipo: 'adaptado', titulo: 'New', descripcion: 'New prescription',
    motivo: 'Requested', modification_event_pendiente: {
      original_tipo: 'box', original_titulo: 'Original', original_descripcion: 'Original prescription',
    }, source: 'untrusted', pendingId: 'injected', completada: true, arbitrary: 'discard',
  } };
}
async function run(options = {}) {
  const plan = Object.hasOwn(options, 'plan') ? options.plan : fixture();
  const records = options.records ?? [pending()];
  const before = structuredClone({ plan, records });
  const events = [], writes = [], queries = [];
  let input;
  const supabase = { from(table) {
    let operation = 'read', payload, selection;
    const filters = {};
    const query = {
      select(fields) { selection = fields; return query; },
      eq(key, value) { filters[key] = value; return query; },
      insert(value) { operation = 'insert'; payload = value; return query; },
      update(value) { operation = 'update'; payload = value; return query; },
      single() { return query; }, maybeSingle() { return query; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        const key = `${table}:${operation}`;
        events.push(key); queries.push({ table, operation, selection, filters: { ...filters } });
        if (operation !== 'read') writes.push({ table, operation, payload: structuredClone(payload), filters: { ...filters } });
        if (options.throwAt === key) throw new Error(key);
        if (options.errorAt === key) return { data: null, error: { code: '23514', message: key }, status: 400 };
        if (options.noRowAt === key) return { data: null, error: null };
        let data;
        if (table === 'pending_actions' && operation === 'read') {
          data = records.find(r => Object.entries(filters).every(([k, v]) => r[k] === v)) ?? null;
        } else if (table === 'weekly_plan' && operation === 'read') data = plan;
        else if (table === 'athlete_state_events' && operation === 'read') {
          data = Object.hasOwn(options, 'state') ? options.state : { id: 'state1', estado: 'normal' };
        } else if (table === 'weekly_plan') data = options.wrongPlanIdentity
          ? { user_codigo: 'other', week_start: week } : { id: plan.id, revision: payload.revision, user_codigo: 'audit', week_start: week };
        else if (table === 'pending_actions') data = options.wrongPendingIdentity
          ? { id: 'other', user_codigo: 'audit', estado: 'ejecutado' }
          : { id: 'p1', user_codigo: 'audit', estado: 'ejecutado' };
        else data = { id: 'written' };
        return { data, error: null };
      }).then(resolve, reject); },
    };
    return query;
  } };
  const execute = vm.runInNewContext(`${executable}\nexecute`, {
    pendingId: Object.hasOwn(options, 'pendingId') ? options.pendingId : 'p1', codigo: 'audit',
    supabase, Date: AuditDate, console: { log() {}, error() {} },
    NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) },
    mutatePlanWithCAS, planPersistenceFailure,
    validatePlanMutation: async value => {
      events.push('gate'); input = value;
      if (options.gateStatus) return { status: options.gateStatus, violations: [] };
      return validateTestCandidate(validate, value, options.returnedCandidate);
    },
  });
  const response = plain(await execute());
  assert.deepEqual({ plan, records }, before, 'canonical inputs must not be mutated');
  return { response, events, writes, queries, input: input && structuredClone(input) };
}
const assertRejected = (r, error) => {
  assert.equal(r.response.body.ok, false);
  assert.equal(r.response.body.error, error);
  assert.equal(r.writes.length, 0);
};

test('requires a nonempty pendingId before querying; no latest fallback in actual branch', async () => {
  for (const pendingId of [undefined, null, '', ' ', 7]) {
    const r = await run({ pendingId });
    assertRejected(r, 'PENDING_ID_REQUIRED'); assert.equal(r.queries.length, 0);
  }
  const methods = findAll(branch, n => ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression))
    .map(n => n.expression.name.text);
  assert.ok(!methods.includes('order') && !methods.includes('limit'));
});

test('exact pending and user filters prevent executing a different/newer proposal', async () => {
  for (const records of [[], [{ ...pending(), id: 'p2' }], [{ ...pending(), user_codigo: 'other' }]]) {
    const r = await run({ records }); assertRejected(r, 'PENDING_NOT_FOUND');
    assert.deepEqual(r.queries[0].filters, { user_codigo: 'audit', id: 'p1' });
  }
  const r = await run({ records: [{ ...pending(), id: 'p2' }, pending()] });
  assert.equal(r.response.body.ejecutado, true);
  assert.equal(r.input.command.confirmation.pendingId, 'p1');
});

test('distinguishes DB errors, wrong state/type, and invalid payload before plan read', async () => {
  assertRejected(await run({ errorAt: 'pending_actions:read' }), 'PENDING_READ_FAILED');
  for (const [field, value, error] of [['estado', 'ejecutado', 'PENDING_INVALID_STATE'],
    ['estado', 'expirado', 'PENDING_INVALID_STATE'], ['tipo', 'other', 'PENDING_INVALID_TYPE']]) {
    const p = pending(); p[field] = value;
    const r = await run({ records: [p] }); assertRejected(r, error); assert.equal(r.queries.length, 1);
  }
  for (const field of ['week_start', 'dia', 'tipo', 'titulo', 'descripcion', 'por_que', 'motivo', 'debilidad_relacionada']) {
    const p = pending(); p.accion[field] = {};
    const r = await run({ records: [p] }); assertRejected(r, 'PENDING_INVALID_PAYLOAD'); assert.equal(r.queries.length, 1);
  }
  for (const accion of [null, [], 'bad', {}]) assertRejected(await run({ records: [{ ...pending(), accion }] }), 'PENDING_INVALID_PAYLOAD');
});

test('validates consumed auxiliary fields, permits unused metadata without copying it', async () => {
  for (const field of ['reason_code', 'trigger_type', 'original_tipo', 'original_titulo', 'original_descripcion', 'body_area', 'affected_exercise', 'que_evitar']) {
    const p = pending(); p.accion.modification_event_pendiente[field] = {};
    const r = await run({ records: [p] }); assertRejected(r, 'PENDING_INVALID_EVENT_PAYLOAD'); assert.equal(r.queries.length, 1);
  }
  const p = pending(); p.accion.modification_event_pendiente = [];
  assertRejected(await run({ records: [p] }), 'PENDING_INVALID_EVENT_PAYLOAD');
});

test('canonical plan read is complete and distinguishes missing/error/invalid sessions', async () => {
  assertRejected(await run({ errorAt: 'weekly_plan:read' }), 'PLAN_READ_FAILED');
  assertRejected(await run({ plan: null }), 'PLAN_NOT_FOUND');
  assertRejected(await run({ plan: { ...fixture(), sessions: null } }), 'PLAN_INVALID_SESSIONS');
  assert.equal((await run()).queries[1].selection, '*');
});

test('exactly one normalized day is required; zero/multiple/completed reject before writes', async () => {
  const missing = fixture(); missing.sessions[0].dia = 'lunes';
  assertRejected(await run({ plan: missing }), 'SESSION_NOT_FOUND');
  const duplicate = fixture(); duplicate.sessions.push({ ...duplicate.sessions[0], dia: 'MIERCOLES' });
  assertRejected(await run({ plan: duplicate }), 'SESSION_AMBIGUOUS');
  const completed = fixture(); completed.sessions[0].completada = true;
  assertRejected(await run({ plan: completed }), 'SESSION_COMPLETED');
  assert.equal((await run()).response.body.ejecutado, true);
});

test('complete original snapshot must match; absence/incompleteness is legacy admission, not freshness proof', async () => {
  for (const field of ['original_tipo', 'original_titulo', 'original_descripcion']) {
    const p = pending(); p.accion.modification_event_pendiente[field] = 'changed';
    assertRejected(await run({ records: [p] }), 'PENDING_STALE');
  }
  for (const snapshot of [undefined, {}, { original_tipo: 'changed' }]) {
    const p = pending(); p.accion.modification_event_pendiente = snapshot;
    assert.equal((await run({ records: [p] })).response.body.ejecutado, true);
  }
  assert.match(branch.getText(route), /NO garantiza vigencia ni sustituye revision\/CAS/);
});

test('full candidate preserves week metadata, order, other sessions and exact execution state', async () => {
  for (const completion of [null, undefined, false]) {
    const plan = fixture();
    if (completion === undefined) delete plan.sessions[0].completada;
    else plan.sessions[0].completada = completion;
    const r = await run({ plan });
    const expected = structuredClone(plan);
    Object.assign(expected.sessions[0], { tipo: 'adaptado', titulo: 'New', descripcion: 'New prescription',
      por_que: 'Requested', debilidad_relacionada: null, modificado: true,
      motivo_modificacion: 'Requested', modificado_at: fixedTime });
    assert.deepEqual(r.input.candidate, expected);
    assert.deepEqual(r.input.context.existingPlan, plan);
    assert.deepEqual(r.writes[0].payload, { sessions: expected.sessions, revision: 6 });
    assert.equal(Object.hasOwn(r.input.candidate.sessions[0], 'completada'), completion !== undefined);
  }
});

test('replacement command/context/changeSet are explicit; only typed prescription from pending', async () => {
  const r = await run();
  assert.deepEqual(plain(r.input.command), { operationType: 'replace_session', source: 'pending_confirmation', expectedRevision: 5,
    target: { userCodigo: 'audit', weekStart: week, day: 'miércoles' },
    proposal: { session: { tipo: 'adaptado', titulo: 'New', descripcion: 'New prescription', por_que: 'Requested', debilidad_relacionada: null }, reason: 'Requested' },
    confirmation: { pendingId: 'p1', confirmed: true } });
  assert.deepEqual(plain(r.input.context.pending), { id: 'p1', status: 'pendiente' });
  assert.equal(r.input.context.normalizedWeekStart, week);
  assert.deepEqual(plain(r.input.changeSet), { operationType: 'replace_session', affectedDays: ['miércoles'],
    changedFields: ['tipo', 'titulo', 'descripcion', 'por_que', 'debilidad_relacionada', 'modificado', 'motivo_modificacion', 'modificado_at'].map(k => `sessions.0.${k}`) });
  for (const key of ['source', 'pendingId', 'modification_event_pendiente', 'arbitrary']) assert.ok(!(key in r.input.candidate.sessions[0]));
});

test('legacy prescription fallbacks remain typed', async () => {
  const p = pending(); p.accion.por_que = 'Technical'; p.accion.debilidad_relacionada = 'weakness';
  let r = await run({ records: [p] });
  assert.equal(r.input.candidate.sessions[0].por_que, 'Technical');
  assert.equal(r.input.candidate.sessions[0].debilidad_relacionada, 'weakness');
  delete p.accion.por_que; delete p.accion.motivo;
  r = await run({ records: [p] }); assert.equal(r.input.candidate.sessions[0].por_que, 'Purpose');
});

test('gate precedes every write, rejected/failed have zero writes; validates whole plan', async () => {
  for (const gateStatus of ['rejected', 'failed']) {
    const r = await run({ gateStatus });
    assertRejected(r, gateStatus === 'rejected' ? 'PLAN_MUTATION_REJECTED' : 'PLAN_MUTATION_VALIDATION_FAILED');
  }
  const invalidOther = fixture(); invalidOther.sessions[1].titulo = 5;
  assertRejected(await run({ plan: invalidOther }), 'PLAN_MUTATION_REJECTED');
  assert.deepEqual((await run()).events, ['pending_actions:read', 'weekly_plan:read', 'gate',
    'weekly_plan:update', 'weekly_plan_events:insert', 'session_modification_events:insert', 'pending_actions:update']);
});

test('persists only gate-returned candidate, never reapplies pending after gate', async () => {
  const r = await run({ returnedCandidate: candidate => ({ ...candidate,
    sessions: candidate.sessions.map(s => ({ ...s, titulo: 'Authorized by test gate' })) }) });
  assert.ok(r.writes[0].payload.sessions.every(s => s.titulo === 'Authorized by test gate'));
});

test('weekly_plan failure or unconfirmed identity stops effects and pending resolution', async () => {
  for (const options of [{ errorAt: 'weekly_plan:update' }, { noRowAt: 'weekly_plan:update' },
    { wrongPlanIdentity: true }, { throwAt: 'weekly_plan:update' }]) {
    const r = await run(options); assert.equal(r.response.body.ok, false);
    assert.deepEqual(r.writes.map(w => w.table), ['weekly_plan']);
  }
});

test('ledger failures (DB/no row/throw) are partial, never global success or pending resolution', async () => {
  for (const failure of ['errorAt', 'noRowAt', 'throwAt']) {
    const r = await run({ [failure]: 'session_modification_events:insert' });
    assert.equal(r.response.body.partial, true); assert.equal(r.response.body.ok, false);
    assert.equal(r.response.body.stage, 'session_modification_events');
    assert.equal(r.response.body.planPersisted, true);
    assert.ok(!r.writes.some(w => w.table === 'pending_actions'));
  }
});

function restrictedPending() {
  const p = pending(); Object.assign(p.accion.modification_event_pendiente,
    { reason_code: 'rodilla_dolor', body_area: 'rodilla', que_evitar: 'Saltos' }); return p;
}
test('conditional operational effects retain order, constraints and 21-day expiry semantics', async () => {
  const r = await run({ records: [restrictedPending()] });
  assert.equal(r.response.body.ok, true);
  assert.deepEqual(r.writes.map(w => `${w.table}:${w.operation}`), ['weekly_plan:update', 'weekly_plan_events:insert',
    'session_modification_events:insert', 'athlete_state_events:update', 'athlete_state_events:insert',
    'athlete_coaching_notes:insert', 'pending_actions:update']);
  const note = r.writes.find(w => w.table === 'athlete_coaching_notes').payload;
  assert.equal(note.constraint_level, 'hard'); assert.equal(note.valid_until, '2026-09-25');
  assert.equal(note.prohibits_impact, true); assert.equal(note.prohibits_jump, true);
  assert.equal(note.prohibits_deep_flexion, true); assert.equal(note.prohibits_overhead_load, false);
});

test('every conditional operational failure reports its stage and stops pending resolution', async () => {
  for (const [key, stage] of [['athlete_state_events:read', 'athlete_state_read'],
    ['athlete_state_events:update', 'athlete_state_deactivate'], ['athlete_state_events:insert', 'athlete_state_insert'],
    ['athlete_coaching_notes:insert', 'athlete_coaching_notes']]) {
    for (const failure of ['errorAt', 'throwAt', ...(key.endsWith(':read') ? [] : ['noRowAt'])]) {
      const r = await run({ records: [restrictedPending()], [failure]: key });
      assert.equal(r.response.body.ok, false); assert.equal(r.response.body.partial, true);
      assert.equal(r.response.body.stage, stage);
      assert.ok(!r.writes.some(w => w.table === 'pending_actions'));
    }
  }
});

test('existing restricted state skips transition; absent state inserts without deactivation', async () => {
  for (const state of [null, { id: 'state1', estado: 'restricted' }]) {
    const r = await run({ records: [restrictedPending()], state });
    assert.equal(r.response.body.ok, true);
    const operations = r.writes.filter(w => w.table === 'athlete_state_events').map(w => w.operation);
    assert.deepEqual(operations, state ? [] : ['insert']);
  }
});

test('audit event is best-effort: error/throw exposes warning but does not block success', async () => {
  for (const failure of ['errorAt', 'throwAt']) {
    const r = await run({ [failure]: 'weekly_plan_events:insert' });
    assert.equal(r.response.body.ok, true); assert.equal(r.response.body.ejecutado, true);
    assert.deepEqual(r.response.body.warnings, ['WEEKLY_PLAN_EVENT_FAILED']);
  }
});

test('pending resolution uses exact ID/user/still-pending, checks row and returns partial on failure', async () => {
  for (const options of [{ errorAt: 'pending_actions:update' }, { noRowAt: 'pending_actions:update' },
    { wrongPendingIdentity: true }, { throwAt: 'pending_actions:update' }]) {
    const r = await run(options);
    assert.equal(r.response.body.ok, false); assert.equal(r.response.body.partial, true);
    assert.equal(r.response.body.stage, 'pending_resolution');
    assert.deepEqual(r.writes.at(-1).filters, { user_codigo: 'audit', id: 'p1', estado: 'pendiente' });
  }
  const r = await run();
  assert.deepEqual(r.response.body, { ok: true, ejecutado: true, tipo: 'modificar_sesion', warnings: [], revision: 6 });
});

const actionCalls = (root, action) => findAll(root, n => ts.isCallExpression(n)
  && n.expression.getText(web) === 'apiCall' && n.arguments[0]?.getText(web).includes(`action:"${action}"`));
test('both actual frontend confirmation callers send state pendingId; button guards missing identity', async () => {
  const calls = actionCalls(web, 'confirmar_pending_action'); assert.equal(calls.length, 2);
  for (const call of calls) {
    const prop = call.arguments[0].properties.find(p => p.name?.getText(web) === 'pendingId');
    assert.equal(prop.initializer.getText(web), 'modificacionPendienteConfirmar.pendingId');
  }
  let handler = calls[1]; while (!ts.isArrowFunction(handler)) handler = handler.parent;
  let requests = 0;
  const execute = vm.runInNewContext(compile(`const execute = ${handler.getText(web)};\nexecute;`), {
    modificacionPendienteConfirmar: { pendingId: '' }, apiCall: async () => { requests++; },
  });
  await execute(); assert.equal(requests, 0);
});

test('text confirmation cannot call backend without known ID; with ID it sends that proposal', async () => {
  const call = actionCalls(web, 'confirmar_pending_action')[0];
  let conditional = call; while (!ts.isIfStatement(conditional)) conditional = conditional.parent;
  for (const proposal of [null, {}, { pendingId: '' }, { pendingId: 'p1' }]) {
    const requests = [];
    vm.runInNewContext(compile(conditional.getText(web)), { esConfirmacionSimple: true, codigoUsuario: 'audit',
      modificacionPendienteConfirmar: proposal, apiCall: async body => { requests.push(plain(body)); return {}; } });
    assert.equal(requests.length, proposal?.pendingId ? 1 : 0);
    if (requests.length) assert.equal(requests[0].pendingId, 'p1');
  }
});

test('restoration returns the real ID and frontend retains it without placeholder', () => {
  const restore = branchFor('obtener_pending_action_activo').getText(route);
  assert.match(restore, /pendingId: pendienteActivo\.id/);
  const setters = findAll(web, n => ts.isCallExpression(n) && n.expression.getText(web) === 'setModificacionPendienteConfirmar');
  assert.ok(setters.some(n => n.getText(web).includes('pendingId:resPending.pendingId')));
  assert.ok(!setters.some(n => n.getText(web).includes('"restaurado"')));
  for (const [action, response] of [['guardar_pending_action', 'resPending'],
    ['detectar_propuesta_sesion', 'resPropuesta'], ['verificar_modificacion_sesion_deterministico', 'resSafety']]) {
    const call = actionCalls(web, action)[0];
    let callback = call; while (!ts.isArrowFunction(callback)) callback = callback.parent;
    assert.match(callback.getText(web), new RegExp(`pendingId:${response}\\.pendingId`));
  }
  assert.match(branchFor('detectar_propuesta_sesion').getText(route), /pendingId: propuestaCreada\.id/);
});

test('real apiCall consumes known partial HTTP 200 exactly once without transport retry', async () => {
  const partial = (await run({ errorAt: 'session_modification_events:insert' })).response;
  assert.equal(partial.status, 200); assert.equal(partial.body.partial, true);
  const declaration = findAll(web, n => ts.isVariableDeclaration(n) && n.name.getText(web) === 'apiCall')[0];
  let requests = 0;
  const apiCall = vm.runInNewContext(compile(`const apiCall = ${declaration.initializer.getText(web)};\napiCall;`), {
    fetch: async () => { requests++; return { ok: true, json: async () => partial.body }; },
    setTimeout: () => assert.fail('known partial must not retry'),
  });
  const result = await apiCall({ action: 'confirmar_pending_action', codigo: 'audit', pendingId: 'p1' });
  assert.equal(result.partial, true); assert.equal(result.ok, false); assert.equal(requests, 1);
});

for (const [option, status, code] of [['noRowAt', 'conflict', 'PLAN_REVISION_CONFLICT'], ['errorAt', 'error', 'PLAN_PERSISTENCE_ERROR'], ['throwAt', 'unknown', 'PLAN_PERSISTENCE_UNKNOWN']]) {
  test(`B1 pending ${status}: no resolution, effects or replay`, async () => {
    const r = await run({ [option]: 'weekly_plan:update' });
    assert.equal(r.response.status, 200); assert.equal(r.response.body.error, code);
    assert.equal(r.response.body.persistenceStatus, status); assert.equal(r.response.body.pendingResolved, false);
    assert.equal(r.response.body.retryable, false); assert.equal(r.writes.length, 1);
    assert.deepEqual(r.writes[0].filters, { id: 'plan-1', user_codigo: 'audit', revision: 5 });
    assert.equal(r.writes[0].payload.revision, 6);
  });
}
test('B1 pending ignores supplied session identity and preserves snapshot IDs', async () => {
  const p = pending(); p.accion.session_id = 'attacker-id';
  const r = await run({ records: [p] });
  assert.equal(r.response.body.ok, true);
  assert.deepEqual(r.writes[0].payload.sessions.map(s => s.session_id), fixture().sessions.map(s => s.session_id));
});
test('B1 pending identical prescription is a no-op and stays unresolved', async () => {
  const p = pending(), s = fixture().sessions[0];
  Object.assign(p.accion, { tipo: s.tipo, titulo: s.titulo, descripcion: s.descripcion,
    por_que: s.por_que, debilidad_relacionada: s.debilidad_relacionada });
  const r = await run({ records: [p] });
  assert.deepEqual(r.response.body, { ok: true, ejecutado: false, noOp: true, pendingResolved: false });
  assert.equal(r.writes.length, 0); assert.equal(r.input, undefined);
});

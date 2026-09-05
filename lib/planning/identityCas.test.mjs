import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as crypto from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

// Real TypeScript modules compiled in memory. The only native dependency is crypto.
const cache = new Map();
const names = ['planMutation', 'planValidationPipeline', 'planMutationValidators', 'prescriptionIdentity', 'planPersistence'];
function load(name) {
  assert.ok(names.includes(name), name);
  if (cache.has(name)) return cache.get(name);
  const module = { exports: {} }; cache.set(name, module.exports);
  const js = ts.transpileModule(readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, structuredClone,
    require: path => path === 'node:crypto' ? crypto : load(path.replace('./', '')) });
  return module.exports;
}
const { createPrescriptionSessionId, preparePrescriptionSessions } = load('prescriptionIdentity');
const { isPrescriptionSessionId } = load('planMutationValidators');
const { validatePlanMutation } = load('planMutation');
const { createPlan, mutatePlanWithCAS } = load('planPersistence');
const plain = value => JSON.parse(JSON.stringify(value));
const content = (dia = 'lunes') => ({ dia, tipo: 'fuerza', titulo: 'Prescribed', descripcion: 'Content' });
const existing = () => ({ id: 'plan-1', user_codigo: 'athlete', week_start: '2026-09-07', revision: 5,
  sessions: [ { ...content(), session_id: createPrescriptionSessionId(), internal: { retained: true } },
    { ...content('martes'), session_id: createPrescriptionSessionId() } ],
  created_at: 'old', arbitrary: 'never write', resumen_semana: 'old summary' });
function input(operationType = 'patch_session') {
  const snapshot = existing();
  const candidate = structuredClone(snapshot);
  candidate.sessions[0].titulo = 'Changed';
  const target = { userCodigo: snapshot.user_codigo, weekStart: snapshot.week_start, day: 'lunes' };
  let proposal = { changes: { titulo: 'Changed' } };
  if (operationType === 'replace_session') proposal = { session: { ...content(), titulo: 'Changed' } };
  if (operationType === 'record_completion') {
    candidate.sessions = structuredClone(snapshot.sessions);
    candidate.sessions[0].completada = true;
    proposal = { title: 'Completed', description: 'Reported' };
  }
  if (operationType === 'complete_past_rest_days') {
    snapshot.sessions[0].tipo = 'descanso'; candidate.sessions = structuredClone(snapshot.sessions);
    candidate.sessions[0].completada = true; proposal = { asOfDate: '2026-09-09' };
  }
  if (operationType === 'set_week_summary') {
    candidate.sessions = structuredClone(snapshot.sessions); candidate.resumen_semana = 'new summary';
    proposal = { summary: 'new summary' };
  }
  return { command: { operationType, source: 'direct_session_update', target, expectedRevision: 5, proposal },
    candidate, context: { existingPlan: snapshot },
    changeSet: { operationType, affectedDays: ['lunes'], changedFields: ['sessions'] } };
}
function createInput() {
  const { sessions, identityProof } = preparePrescriptionSessions([{ kind: 'new', session: content() }]);
  const candidate = { week_start: '2026-09-07', revision: 1, sessions };
  return { command: { operationType: 'create_week', source: 'weekly_orchestrator',
    target: { userCodigo: 'athlete', weekStart: candidate.week_start }, proposal: candidate },
    candidate, context: { identityProof },
    changeSet: { operationType: 'create_week', affectedDays: ['lunes'], changedFields: ['sessions'] } };
}
async function receipt(value = input()) {
  const result = await validatePlanMutation(value);
  assert.equal(result.status, 'ready_for_commit', JSON.stringify(result));
  return result.mutation;
}
async function rejected(value, code) {
  const result = await validatePlanMutation(value);
  assert.equal(result.status, 'rejected', JSON.stringify(result));
  assert.equal(result.candidate, null); assert.equal(result.mutation, undefined);
  if (code) assert.ok(result.violations.some(issue => issue.code === code), JSON.stringify(result));
}

test('UUID helper: valid, distinct server IDs', () => {
  const first = createPrescriptionSessionId(), second = createPrescriptionSessionId();
  assert.ok(isPrescriptionSessionId(first)); assert.ok(isPrescriptionSessionId(second)); assert.notEqual(first, second);
});
test('new input UUID is replaced, never accepted as identity authority', async () => {
  const supplied = createPrescriptionSessionId();
  const prepared = preparePrescriptionSessions([{ kind: 'new', session: { ...content(), session_id: supplied } }]);
  assert.notEqual(prepared.sessions[0].session_id, supplied);
  const value = createInput();
  value.candidate.sessions = [{ ...content(), session_id: supplied }];
  await rejected(value, 'UNACCREDITED_PRESCRIPTION_IDENTITY');
});
for (const [label, id] of [['absent', undefined], ['empty', ''], ['invalid', 'not-uuid']]) {
  test(`candidate ID ${label} rejects`, async () => {
    const value = input(); value.candidate.sessions[0].session_id = id;
    if (id === undefined) delete value.candidate.sessions[0].session_id;
    await rejected(value, 'INVALID_SESSION_ID');
  });
}
for (const session of [null, 'session', [], 42]) test(`non-object session ${JSON.stringify(session)} rejects`, async () => {
  const value = input(); value.candidate.sessions[0] = session;
  await rejected(value, 'INVALID_SESSION_ID');
});
test('duplicate and case-equivalent UUIDs reject', async () => {
  for (const upper of [false, true]) {
    const value = input(); value.candidate.sessions[1].session_id = upper
      ? value.candidate.sessions[0].session_id.toUpperCase() : value.candidate.sessions[0].session_id;
    await rejected(value, 'INVALID_SESSION_ID');
  }
});
test('candidate and snapshot reject non-JSON mutable metadata and sparse arrays', async () => {
  for (const data of [new Date(), new Map(), Infinity, undefined]) {
    const value = input(); value.candidate.metadata = data;
    await rejected(value, 'NON_JSON_PLAN_DATA');
  }
  const sparse = input(); delete sparse.candidate.sessions[1]; await rejected(sparse, 'NON_JSON_PLAN_DATA');
});
test('create requires opaque proof; JSON/clone proofs and changed content cannot forge provenance', async () => {
  await receipt(createInput());
  for (const proof of [undefined, {}, structuredClone(createInput().context.identityProof)]) {
    const value = createInput(); value.context.identityProof = proof;
    await rejected(value, 'UNACCREDITED_PRESCRIPTION_IDENTITY');
  }
  const value = createInput(); value.candidate.sessions = structuredClone(value.candidate.sessions);
  value.candidate.sessions[0].descripcion = 'tampered';
  await rejected(value, 'UNACCREDITED_PRESCRIPTION_IDENTITY');
});
for (const [label, revision] of [['absent', undefined], ['zero', 0], ['negative', -1], ['decimal', 1.1],
  ['NaN', NaN], ['unsafe', Number.MAX_SAFE_INTEGER + 1], ['string', '5'], ['infinity', Infinity], ['mismatch', 4]]) {
  test(`expectedRevision ${label} rejects`, async () => {
    const value = input(); value.command.expectedRevision = revision;
    await rejected(value);
  });
}
test('revision valid passes; missing/invalid snapshot, changed candidate and overflow reject', async () => {
  await receipt();
  for (const revision of [0, 4, '5', NaN]) {
    const value = input(); value.context.existingPlan.revision = revision; await rejected(value);
  }
  const missing = input(); delete missing.context.existingPlan; await rejected(missing, 'MISSING_PLAN_SNAPSHOT');
  const changed = input(); changed.candidate.revision = 6; await rejected(changed, 'CANDIDATE_REVISION_CHANGED');
  const overflow = input(); overflow.command.expectedRevision = overflow.candidate.revision
    = overflow.context.existingPlan.revision = Number.MAX_SAFE_INTEGER;
  await rejected(overflow, 'REVISION_OVERFLOW');
});
for (const op of ['patch_session', 'replace_session', 'record_completion', 'complete_past_rest_days']) {
  test(`${op} preserves identities and rejects target ID change`, async () => {
    const value = input(op); const before = structuredClone(value);
    await receipt(value); assert.deepEqual(value, before);
    value.candidate.sessions[0].session_id = createPrescriptionSessionId();
    await rejected(value, 'PRESCRIPTION_IDENTITY_CHANGED');
  });
}
test('unchanged target cannot hide reassignment, insertion, deletion or reorder of other identities', async () => {
  for (const modify of [sessions => sessions.reverse(), sessions => sessions.pop(),
    sessions => sessions.push({ ...content('jueves'), session_id: createPrescriptionSessionId() }),
    sessions => { sessions[1].session_id = createPrescriptionSessionId(); }]) {
    const value = input(); modify(value.candidate.sessions); await rejected(value, 'PRESCRIPTION_IDENTITY_CHANGED');
  }
});
test('summary preserves all session content including metadata', async () => {
  await receipt(input('set_week_summary'));
  for (const field of ['titulo', 'descripcion', 'internal', 'session_id']) {
    const value = input('set_week_summary'); value.candidate.sessions[0][field] = 'changed'; await rejected(value);
  }
});
test('create rejects non-initial revision, plan identity and expectedRevision', async () => {
  for (const mutate of [v => { v.candidate.revision = 2; }, v => { v.candidate.id = 'other'; },
    v => { v.candidate.user_codigo = 'other'; }, v => { v.command.expectedRevision = 1; },
    v => { v.context.existingPlan = existing(); }]) {
    const value = createInput(); mutate(value); await rejected(value);
  }
});
test('snapshot and candidate identity cannot target another plan/user/week', async () => {
  for (const key of ['id', 'user_codigo', 'week_start']) {
    const value = input(); value.candidate[key] = 'other'; await rejected(value);
  }
  const value = input(); value.command.target.userCodigo = 'other'; await rejected(value, 'PLAN_IDENTITY_MISMATCH');
});
function regeneration() {
  const snapshot = existing(); snapshot.sessions[0].completada = true;
  const prepared = preparePrescriptionSessions([
    { kind: 'survivor', snapshotIndex: 0 }, { kind: 'new', session: snapshot.sessions[1] },
  ], snapshot);
  const candidate = { ...snapshot, sessions: prepared.sessions };
  return { command: { operationType: 'regenerate_week', source: 'weekly_orchestrator', expectedRevision: snapshot.revision,
    target: { userCodigo: snapshot.user_codigo, weekStart: snapshot.week_start }, proposal: candidate },
    candidate, context: { existingPlan: snapshot, identityProof: prepared.identityProof },
    changeSet: { operationType: 'regenerate_week', affectedDays: ['martes'], changedFields: ['sessions'] } };
}
test('regeneration: explicit survivor retained, rebuilt identical day/content gets NEW identity', async () => {
  const value = regeneration(); await receipt(value);
  assert.equal(value.candidate.sessions[0].session_id, value.context.existingPlan.sessions[0].session_id);
  assert.notEqual(value.candidate.sessions[1].session_id, value.context.existingPlan.sessions[1].session_id);
  assert.deepEqual(plain(value.candidate.sessions[0]), value.context.existingPlan.sessions[0]);
});
test('regeneration rejects tampered survivor/new identity/snapshot and omitted completed prescription', async () => {
  for (const index of [0, 1]) {
    const value = regeneration(); value.candidate.sessions = structuredClone(value.candidate.sessions);
    value.candidate.sessions[index].session_id = createPrescriptionSessionId();
    await rejected(value, 'UNACCREDITED_PRESCRIPTION_IDENTITY');
  }
  const changed = regeneration(); changed.context.existingPlan.sessions[1].titulo = 'snapshot changed';
  await rejected(changed, 'UNACCREDITED_PRESCRIPTION_IDENTITY');
  const omitted = regeneration(); const prepared = preparePrescriptionSessions([
    { kind: 'new', session: content() }], omitted.context.existingPlan);
  omitted.candidate.sessions = prepared.sessions; omitted.context.identityProof = prepared.identityProof;
  await rejected(omitted, 'COMPLETED_PRESCRIPTION_NOT_PRESERVED');
});
test('survivor helper rejects missing, out-of-range, duplicate and invalid snapshot identity', () => {
  assert.throws(() => preparePrescriptionSessions([{ kind: 'survivor', snapshotIndex: 0 }]));
  for (const index of [-1, 2, 0.1]) assert.throws(() => preparePrescriptionSessions([{ kind: 'survivor', snapshotIndex: index }], existing()));
  assert.throws(() => preparePrescriptionSessions([{ kind: 'survivor', snapshotIndex: 0 }, { kind: 'survivor', snapshotIndex: 0 }], existing()));
  const invalid = existing(); invalid.sessions[0].session_id = 'invalid';
  assert.throws(() => preparePrescriptionSessions([{ kind: 'survivor', snapshotIndex: 0 }], invalid));
});

// Real Supabase SDK, fake fetch transport: exercise PATCH/INSERT, query encoding,
// .select/.maybeSingle and wrapped transport errors, without any DB/network access.
function database({ body, status = 200, throws = false } = {}) {
  const calls = [];
  const db = createClient('https://example.invalid', 'not-a-real-key', { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, init) => {
      calls.push({ url: new URL(url), method: init.method, payload: JSON.parse(init.body), headers: new Headers(init.headers) });
      if (throws) throw new TypeError('fetch failed');
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    } } });
  return { db, calls };
}
const row = (revision = 6) => ({ id: 'plan-1', user_codigo: 'athlete', week_start: '2026-09-07', revision });
test('create uses INSERT revision 1, no upsert resolution, confirms exact row', async () => {
  const { db, calls } = database({ body: [row(1)], status: 201 });
  const result = await createPlan(db, await receipt(createInput()));
  assert.deepEqual(plain(result), { status: 'committed', planId: 'plan-1', revision: 1 });
  assert.equal(calls.length, 1); assert.equal(calls[0].method, 'POST'); assert.equal(calls[0].payload.revision, 1);
  assert.equal(calls[0].url.searchParams.has('on_conflict'), false);
  assert.doesNotMatch(calls[0].headers.get('prefer'), /resolution=/);
});
test('create unique conflict never falls back to overwrite', async () => {
  const { db, calls } = database({ body: { code: '23505', message: 'unique violation' }, status: 409 });
  const result = await createPlan(db, await receipt(createInput()));
  assert.equal(result.status, 'conflict'); assert.equal(result.reason, 'unique_constraint'); assert.equal(calls.length, 1);
});
test('CAS uses exact id/user/revision filters and expected+1, with confirmed identity', async () => {
  const { db, calls } = database({ body: [row()] });
  const result = await mutatePlanWithCAS(db, await receipt());
  assert.deepEqual(plain(result), { status: 'committed', planId: 'plan-1', revision: 6 });
  assert.equal(calls.length, 1); const call = calls[0]; assert.equal(call.method, 'PATCH');
  assert.equal(call.payload.revision, 6);
  assert.deepEqual(Object.fromEntries(call.url.searchParams), { id: 'eq.plan-1', user_codigo: 'eq.athlete', revision: 'eq.5',
    select: 'id,user_codigo,week_start,revision' });
});
test('CAS zero rows is precondition conflict with no retry/read/fallback', async () => {
  const { db, calls } = database({ body: [] });
  const result = await mutatePlanWithCAS(db, await receipt());
  assert.deepEqual(plain(result), { status: 'conflict', reason: 'precondition' }); assert.equal(calls.length, 1);
});
test('all existing operation projections write exactly snapshot revision + 1', async () => {
  for (const value of [regeneration(), ...['patch_session', 'replace_session', 'record_completion',
    'complete_past_rest_days', 'set_week_summary'].map(input)]) {
    const { db, calls } = database({ body: [row()] });
    assert.equal((await mutatePlanWithCAS(db, await receipt(value))).status, 'committed');
    assert.equal(calls.length, 1); assert.equal(calls[0].payload.revision, 6);
    assert.equal('id' in calls[0].payload, false); assert.equal('created_at' in calls[0].payload, false);
  }
});
for (const [label, response, expected] of [
  ['constraint', { body: { code: '23514', message: 'CHECK' }, status: 400 }, 'error'],
  ['permission', { body: { code: '42501', message: 'denied' }, status: 403 }, 'error'],
  ['cancelled DB statement', { body: { code: '57014', message: 'cancelled' }, status: 500 }, 'error'],
  ['gateway', { body: { message: 'gateway' }, status: 504 }, 'unknown'],
  ['connection', { body: { code: '08006', message: 'connection' }, status: 500 }, 'unknown'],
  ['wrapped fetch failure', { throws: true }, 'unknown'],
  ['multiple rows', { body: [row(), row()] }, 'unknown'],
  ['wrong revision', { body: [row(7)] }, 'unknown'],
  ['wrong plan', { body: [{ ...row(), id: 'other' }] }, 'unknown'],
  ['wrong user', { body: [{ ...row(), user_codigo: 'other' }] }, 'unknown'],
  ['wrong week', { body: [{ ...row(), week_start: 'other' }] }, 'unknown'],
]) test(`SDK ${label} => ${expected}, never retries`, async () => {
  const { db, calls } = database(response);
  assert.equal((await mutatePlanWithCAS(db, await receipt())).status, expected); assert.equal(calls.length, 1);
});
test('unclassified thrown exception remains UNKNOWN', async () => {
  let calls = 0;
  const db = { from() { calls++; throw new Error('unclassified'); } };
  assert.equal((await mutatePlanWithCAS(db, await receipt())).status, 'unknown'); assert.equal(calls, 1);
});
test('create no returned row is UNKNOWN, never committed', async () => {
  const { db, calls } = database({ body: [] });
  assert.equal((await createPlan(db, await receipt(createInput()))).status, 'unknown'); assert.equal(calls.length, 1);
});
test('whitelist drops id/created_at/derived/arbitrary fields and summary sends no sessions', async () => {
  for (const op of ['patch_session', 'replace_session', 'record_completion', 'complete_past_rest_days', 'set_week_summary']) {
    const value = input(op); value.candidate.derived = 'ignore'; value.candidate.created_at = 'ignore';
    const { db, calls } = database({ body: [row()] });
    await mutatePlanWithCAS(db, await receipt(value)); const payload = calls[0].payload;
    for (const field of ['id', 'user_codigo', 'week_start', 'created_at', 'derived', 'arbitrary']) assert.equal(field in payload, false);
    if (op === 'set_week_summary') assert.deepEqual(payload, { resumen_semana: 'new summary', revision: 6 });
  }
  const value = createInput(); Object.assign(value.candidate, { created_at: 'ignore', derived: 'ignore' });
  const { db, calls } = database({ body: [row(1)] }); await createPlan(db, await receipt(value));
  for (const field of ['id', 'created_at', 'derived']) assert.equal(field in calls[0].payload, false);
});
test('legacy/rejected/forged/cloned receipts and wrong operation cannot reach DB', async () => {
  const { db, calls } = database({ body: [row()] });
  const valid = await receipt();
  for (const fake of [{}, structuredClone(valid), { ...valid }, await load('planValidationPipeline').runPlanValidationPipeline(input())]) {
    assert.equal((await mutatePlanWithCAS(db, fake)).status, 'error');
  }
  assert.equal((await createPlan(db, valid)).status, 'error');
  assert.equal((await mutatePlanWithCAS(db, await receipt(createInput()))).status, 'error');
  assert.equal(calls.length, 0);
});
test('receipt and candidate are immutable and detached from caller after validation', async () => {
  const value = input(); const valid = await receipt(value);
  value.command.expectedRevision = 100; value.candidate.sessions[0].titulo = 'tampered';
  assert.throws(() => { valid.candidate.sessions[0].titulo = 'tampered'; });
  const { db, calls } = database({ body: [row()] }); await mutatePlanWithCAS(db, valid);
  assert.equal(calls[0].payload.revision, 6); assert.equal(calls[0].payload.sessions[0].titulo, 'Changed');
});
test('strict gate retains warning/rejection/failure/isolation semantics and cannot disable mandatory validators', async () => {
  const custom = (validate, extra = {}) => ({ id: 'test', version: '1', critical: true,
    operationTypes: ['patch_session'], validate, ...extra });
  const issue = severity => ({ code: 'TEST', validatorId: 'test', severity, message: 'Test' });
  assert.equal((await validatePlanMutation(input(), [custom(() => [issue('warning')])])).status, 'ready_for_commit');
  assert.equal((await validatePlanMutation(input(), [custom(() => [issue('hard')])])).status, 'rejected');
  assert.equal((await validatePlanMutation(input(), [custom(() => { throw new Error(); })])).status, 'failed');
  assert.equal((await validatePlanMutation(input(), [custom(() => undefined)])).status, 'failed');
  assert.equal((await validatePlanMutation(input(), [custom(() => [], { id: 'prescription_revision' })])).status, 'failed');
});
test('B2 architecture: frontend stays outside persistence adapter; weekly UPSERT absent', () => {
  for (const file of ['../../app/FormaPro.tsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from ['"][^'"]*planPersistence['"]/);
  }
  const route = readFileSync(new URL('../../app/api/chat/route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(route, /legacyPlanMutation/);
  assert.doesNotMatch(route, /from\("weekly_plan"\)\.upsert\(/);
  for (const name of ['planPersistence', 'planMutation', 'prescriptionIdentity']) {
    const source = readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /training_executions|prescription_execution_relations|training_execution_audit/);
  }
});

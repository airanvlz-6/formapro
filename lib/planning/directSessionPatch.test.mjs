import { planningTestRuntime, withPlanIdentity, validateTestCandidate } from './planningTestRuntime.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function find(root, predicate) {
  if (predicate(root)) return root;
  let found;
  ts.forEachChild(root, child => { if (!found) found = find(child, predicate); });
  return found;
}
const source = readFileSync(new URL('../../app/api/chat/route.ts', import.meta.url), 'utf8');
const route = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
const branch = find(route, n => ts.isIfStatement(n)
  && n.expression.getText(route) === 'action === "actualizar_sesion_plan"');
assert.ok(branch && ts.isBlock(branch.thenStatement));
const executable = ts.transpileModule(`async function execute() ${branch.thenStatement.getText(route)}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const loadCore = planningTestRuntime();
const validate = loadCore('planMutation').validatePlanMutation;
const { mutatePlanWithCAS, planPersistenceFailure } = loadCore('planPersistence');
const plain = value => JSON.parse(JSON.stringify(value));
const fixedTime = '2026-09-04T12:00:00.000Z';
class AuditDate extends Date { constructor(...args) { super(...(args.length ? args : [fixedTime])); } }
const week = '2026-08-31';
function fixture() {
  return withPlanIdentity({ user_codigo: 'audit', week_start: week, week_number: 2, total_weeks_block: 4,
    block_name: 'Base', week_objective: 'Maintain', status: 'active', confidence: 73,
    resumen_semana: 'Summary', adherence: '1/3', extra: { retained: true }, updated_at: 'before',
    sessions: [
      { dia: 'lunes', tipo: 'box', titulo: 'Old', descripcion: 'Original', por_que: 'Purpose',
        completada: false, titulo_real: 'Reported', descripcion_real: 'Actual',
        internal: { keep: [1, 2] }, disciplina: 'crossfit', modificado: false },
      { dia: 'martes', tipo: 'descanso', titulo: 'Rest', descripcion: 'Rest', completada: true },
    ] });
}
async function run(options = {}) {
  const plan = options.plan === undefined ? fixture() : options.plan;
  const before = structuredClone(plan);
  const datos = Object.hasOwn(options, 'datos') ? options.datos
    : { dia: 'lunes', cambios: { titulo: 'New' }, motivo: 'Requested' };
  const events = [], writes = [];
  let input;
  const supabase = { from(table) {
    assert.equal(table, 'weekly_plan');
    let payload, selection;
    const filters = {};
    const query = {
      select(fields) { selection = fields; return query; },
      eq(key, value) { filters[key] = value; return query; },
      update(value) { payload = value; return query; },
      async maybeSingle() {
        if (payload) {
          assert.deepEqual(filters, { id: plan.id, user_codigo: 'audit', revision: plan.revision });
          assert.equal(selection, 'id,user_codigo,week_start,revision');
          events.push('write'); writes.push(plain(payload));
          if (options.throwWrite) throw new Error('transport failed');
          return { data: options.unconfirmed ? null : options.wrongTarget
            ? { user_codigo: 'other', week_start: week } : { id: plan.id, revision: payload.revision, user_codigo: 'audit', week_start: week },
          error: options.writeError ? { code: '23514', message: 'write failed' } : null, status: options.writeError ? 400 : 200 };
        }
        assert.deepEqual(filters, { user_codigo: 'audit', week_start: week });
        assert.equal(selection, '*'); events.push('read');
        return { data: plan, error: options.readError ? { message: 'read failed' } : null };
      },
    };
    return query;
  } };
  const execute = vm.runInNewContext(`${executable}\nexecute`, {
    datos, codigo: 'audit', supabase, Date: AuditDate, Object,
    NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) },
    mutatePlanWithCAS, planPersistenceFailure,
    validatePlanMutation: async value => {
      events.push('gate'); input = value;
      if (options.gateStatus) return { status: options.gateStatus, violations: [] };
      return validateTestCandidate(validate, value, options.returnedCandidate);
    },
  });
  const response = await execute();
  assert.deepEqual(plan, before, 'existing plan must not be mutated in memory');
  return { response, events, writes, input: input && plain(input), before };
}

test('valid patch preserves full candidate, exact identity, execution and all other metadata', async () => {
  const r = await run();
  assert.equal(r.response.body.ok, true);
  assert.deepEqual(r.events, ['read', 'gate', 'write']);
  const expected = fixture();
  expected.sessions[0] = { ...expected.sessions[0], titulo: 'New', modificado: true,
    motivo_modificacion: 'Requested', modificado_at: fixedTime };
  expected.updated_at = fixedTime;
  assert.deepEqual(r.input.candidate, expected);
  assert.deepEqual(r.input.context.existingPlan, r.before);
  assert.deepEqual(r.input.command, { source: 'direct_session_update', operationType: 'patch_session', expectedRevision: 5,
    target: { userCodigo: 'audit', weekStart: week, day: 'lunes' },
    proposal: { changes: { titulo: 'New' }, reason: 'Requested' } });
  assert.deepEqual(r.input.changeSet, { operationType: 'patch_session', affectedDays: ['lunes'],
    changedFields: ['sessions.0.titulo', 'sessions.0.modificado', 'sessions.0.motivo_modificacion',
      'sessions.0.modificado_at', 'updated_at'] });
  assert.deepEqual(r.writes, [{ sessions: expected.sessions, updated_at: fixedTime, confidence: 73, revision: 6 }]);
});

test('invalid envelope, field types and empty patches stop before reading or writing', async () => {
  const base = { dia: 'lunes', cambios: { titulo: 'New' } };
  for (const datos of [null, [], 'bad', {}, { ...base, dia: '' }, { ...base, dia: '  ' },
    { ...base, dia: 1 }, { ...base, cambios: null }, { ...base, cambios: [] },
    { ...base, cambios: new Date() }, { ...base, cambios: {} }, { ...base, motivo: null },
    { ...base, motivo: 1 }, ...['tipo', 'titulo', 'descripcion', 'por_que', 'debilidad_relacionada']
      .map(key => ({ ...base, cambios: { [key]: 42 } })),
    ...['tipo', 'titulo', 'descripcion', 'por_que'].map(key => ({ ...base, cambios: { [key]: null } }))]) {
    const r = await run({ datos });
    assert.equal(r.response.status, 400);
    assert.deepEqual(r.events, []);
  }
});

test('every non-prescription key rejects the entire request, even alongside a valid change', async () => {
  for (const key of ['unknown', 'dia', 'completada', 'titulo_real', 'descripcion_real',
    'modificado', 'motivo_modificacion', 'modificado_at', 'id', 'session_id', 'revision', 'workout_id', 'disciplina',
    'gestionado_por', 'calentamiento', 'bloque_principal', 'vuelta_calma', 'confidence', '__proto__']) {
    const r = await run({ datos: { dia: 'lunes', cambios: { titulo: 'New', [key]: 'forbidden' } } });
    assert.equal(r.response.status, 400, key);
    assert.deepEqual(r.events, []);
  }
});

test('all prescription types follow the existing contract, including nullable weakness', async () => {
  const cambios = { tipo: 'carrera', titulo: '', descripcion: 'New content', por_que: '', debilidad_relacionada: null };
  const r = await run({ datos: { dia: 'lunes', cambios } });
  assert.equal(r.response.body.ok, true);
  for (const [key, value] of Object.entries(cambios)) assert.equal(r.writes[0].sessions[0][key], value);
  assert.equal(r.writes[0].sessions[0].motivo_modificacion, '');
});

test('confidence rejects coercion and non-finite values; preserves absence/null and clamps numbers', async () => {
  for (const confidence of ['80', NaN, Infinity, -Infinity, {}, [], true]) {
    const r = await run({ datos: { dia: 'lunes', cambios: { titulo: 'New' }, confidence } });
    assert.equal(r.response.status, 400); assert.deepEqual(r.events, []);
  }
  for (const [confidence, expected] of [[undefined, 73], [null, 73], [-5, 0], [125, 100], [42, 42]]) {
    const r = await run({ datos: { dia: 'lunes', cambios: { titulo: 'New' }, confidence } });
    assert.equal(r.response.body.ok, true);
    assert.equal(r.input.candidate.confidence, expected);
    assert.equal(r.writes[0].confidence, expected);
    assert.equal(Object.hasOwn(r.input.command.proposal, 'confidence'), typeof confidence === 'number');
    assert.equal(r.input.changeSet.changedFields.includes('confidence'), expected !== 73);
  }
});

test('read error and missing plan are distinct and never reach the gate', async () => {
  for (const [options, status] of [[{ readError: true }, 500], [{ plan: null }, 404]]) {
    const r = await run(options);
    assert.equal(r.response.status, status); assert.deepEqual(r.events, ['read']);
  }
});

test('zero matches, duplicate days, completed target and invalid sessions reject without writes', async () => {
  const duplicate = fixture(); duplicate.sessions.push({ ...duplicate.sessions[0] });
  const completed = fixture(); completed.sessions[0].completada = true;
  const invalid = fixture(); invalid.sessions = null;
  for (const [options, status] of [
    [{ datos: { dia: 'Lunes', cambios: { titulo: 'New' } } }, 404],
    [{ plan: duplicate }, 409], [{ plan: completed }, 409], [{ plan: invalid }, 422],
  ]) {
    const r = await run(options);
    assert.equal(r.response.status, status); assert.deepEqual(r.events, ['read']);
  }
});

test('unchanged prescription cannot become a confidence-only update', async () => {
  const r = await run({ datos: { dia: 'lunes', cambios: { titulo: 'Old' }, confidence: 10 } });
  assert.equal(r.response.status, 400); assert.deepEqual(r.events, ['read']);
});

test('supplied week is ignored and day accents are not normalized', async () => {
  assert.equal((await run({ datos: { dia: 'lunes', cambios: { titulo: 'New' }, week_start: '2000-01-01' } })).response.body.ok, true);
  const plan = fixture(); plan.sessions[0].dia = 'miércoles';
  const r = await run({ plan, datos: { dia: 'miercoles', cambios: { titulo: 'New' } } });
  assert.equal(r.response.status, 404); assert.deepEqual(r.writes, []);
});

test('rejected and failed gate outcomes cannot write', async () => {
  for (const [gateStatus, status] of [['rejected', 422], ['failed', 500]]) {
    const r = await run({ gateStatus });
    assert.equal(r.response.status, status); assert.deepEqual(r.events, ['read', 'gate']);
  }
});

test('real gate validates untouched sessions in the complete candidate', async () => {
  const plan = fixture(); plan.sessions[1].descripcion = 42;
  const r = await run({ plan });
  assert.equal(r.response.status, 422); assert.deepEqual(r.events, ['read', 'gate']);
});

test('persistence uses the returned candidate, never reapplies payload or candidate DB identity', async () => {
  const r = await run({ returnedCandidate: c => ({ ...c,
    confidence: 12, updated_at: 'gate-time',
    sessions: c.sessions.map((s, i) => i ? s : { ...s, titulo: 'Gate result' }) }) });
  assert.equal(r.response.body.ok, true);
  assert.equal(r.writes[0].sessions[0].titulo, 'Gate result');
  assert.equal(r.writes[0].updated_at, 'gate-time');
  assert.equal(r.writes[0].confidence, 12);
  assert.deepEqual(Object.keys(r.writes[0]).sort(), ['confidence', 'revision', 'sessions', 'updated_at']);
});

test('write errors, absent returned row and wrong target cannot report success', async () => {
  for (const [options, code] of [[{ writeError: true }, 'PLAN_PERSISTENCE_ERROR'], [{ unconfirmed: true }, 'PLAN_REVISION_CONFLICT'], [{ wrongTarget: true }, 'PLAN_PERSISTENCE_UNKNOWN']]) {
    const r = await run(options);
    assert.equal(r.response.status, 200); assert.equal(r.response.body.error, code); assert.notEqual(r.response.body.ok, true);
    assert.deepEqual(r.events, ['read', 'gate', 'write']);
  }
});

test('post-gate section contains no patch spread or read of cambios', () => {
  const statements = branch.thenStatement.statements;
  const gateIndex = statements.findIndex(s => find(s, n => ts.isCallExpression(n)
    && ts.isIdentifier(n.expression) && n.expression.text === 'validatePlanMutation'));
  assert.ok(gateIndex >= 0);
  for (const statement of statements.slice(gateIndex + 1)) {
    assert.equal(find(statement, n => ts.isIdentifier(n) && ['cambios', 'cambiosPrescripcion'].includes(n.text)), undefined);
  }
});
test('B1 direct patch transport uncertainty is terminal and preserves identity', async () => {
  const r = await run({ throwWrite: true });
  assert.equal(r.response.status, 200); assert.equal(r.response.body.error, 'PLAN_PERSISTENCE_UNKNOWN');
  assert.equal(r.response.body.ok, false); assert.equal(r.response.body.retryable, false);
  assert.equal(r.writes.length, 1); assert.equal(r.writes[0].revision, 6);
  assert.deepEqual(r.writes[0].sessions.map(s => s.session_id), r.before.sessions.map(s => s.session_id));
});

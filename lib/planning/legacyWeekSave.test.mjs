import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual production statements, extracted by AST. No duplicate save algorithm.
function parse(path, kind = ts.ScriptKind.TS) {
  const text = readFileSync(new URL(path, import.meta.url), 'utf8');
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
}
function find(root, predicate) {
  if (predicate(root)) return root;
  let found;
  ts.forEachChild(root, child => { if (!found) found = find(child, predicate); });
  return found;
}
function executable(body, globals) {
  const js = ts.transpileModule(`async function execute() { ${body} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return vm.runInNewContext(`${js}\nexecute`, { console: { log() {}, error() {} }, Date, ...globals });
}
const route = parse('../../app/api/chat/route.ts');
const action = find(route, node => ts.isIfStatement(node)
  && node.expression.getText(route) === 'action === "guardar_plan_semana"');
assert.ok(action && ts.isBlock(action.thenStatement));
const actionBody = action.thenStatement.statements.map(node => node.getText(route)).join('\n');

const frontend = parse('../../app/FormaPro.tsx', ts.ScriptKind.TSX);
const orchestrator = find(frontend, node => ts.isVariableDeclaration(node)
  && node.name.getText(frontend) === 'orquestarGeneracionSemana');
const statements = orchestrator.initializer.body.statements;
const firstSave = statements.findIndex(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(d => d.name.getText(frontend) === 'resultadoGuardado'));
assert.ok(firstSave >= 0);
const frontendBody = statements.slice(firstSave).map(node => node.getText(frontend)).join('\n');

const cache = new Map();
function loadCore(name) {
  assert.ok(['planMutation', 'planMutationValidators', 'planMutationTypes'].includes(name));
  if (cache.has(name)) return cache.get(name);
  const source = readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const output = { exports: {} };
  vm.runInNewContext(js, { module: output, exports: output.exports, structuredClone,
    require: path => loadCore(path.replace('./', '')) });
  cache.set(name, output.exports);
  return output.exports;
}
const realValidate = loadCore('planMutation').validatePlanMutation;

function nextWeek() {
  const date = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }) + 'T12:00:00');
  date.setDate(date.getDate() - (date.getDay() || 7) + 8);
  return date.toISOString().split('T')[0];
}
async function backend(options = {}) {
  const operations = [];
  let validationInput;
  const plan = { week_start: nextWeek(), week_number: 4, total_weeks_block: 4,
    block_name: 'Next', sessions: [{ dia: 'lunes', tipo: 'box', titulo: 'Original',
      descripcion: 'Training details', custom_metadata: { retained: true } }] };
  const supabase = { from(table) {
    let method = 'select';
    let payload;
    const query = {
      select() { return query; }, eq() { return query; }, gte() { return query; },
      in() { return query; }, or() { return query; }, single() { return query; }, maybeSingle() { return query; },
      upsert(value) { method = 'upsert'; payload = value; return query; },
      insert(value) { method = 'insert'; payload = value; return query; },
      update(value) { method = 'update'; payload = value; return query; },
      then(resolve, reject) {
        let result;
        if (method !== 'select') {
          operations.push({ table, method, payload });
          result = { error: table === 'weekly_plan' && options.upsertError ? { message: 'upsert failed' } : null };
        } else if (table === 'usuarios') {
          result = { data: { modo_entrada: 'planificacion', ciclo_actual: { semana: 4, totalSemanas: 4, bloque: 'Old' }, workout_history: [] } };
        } else if (table === 'weekly_plan') {
          result = { data: options.existing ? plan : null, error: options.lookupError ? { message: 'lookup failed' } : null };
        } else if (table === 'athlete_coaching_notes') result = { data: [] };
        else result = { count: 0 };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  } };
  const execute = executable(actionBody, {
    supabase, codigo: 'test', datos: { plan },
    NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) },
    buildFocusContext: async () => ({ esModoFocus: false, disciplinasExternas: [] }),
    validatePlanMutation: async input => {
      operations.push({ gate: true });
      validationInput = input;
      if (options.gateStatus) return { status: options.gateStatus, violations: [] };
      const result = await realValidate(input);
      if (options.returnedTitle) return { ...result, candidate: { ...result.candidate,
        sessions: [{ ...result.candidate.sessions[0], titulo: options.returnedTitle }] } };
      return result;
    },
  });
  const response = await execute();
  return { response, operations, validationInput };
}
const writes = result => result.operations.filter(item => item.table);

test('A: absent plan selects create_week', async () => {
  const result = await backend();
  assert.equal(result.validationInput.command.operationType, 'create_week');
  assert.equal(result.validationInput.command.source, 'legacy_week_save');
});
test('B: existing plan selects regenerate_week', async () => {
  assert.equal((await backend({ existing: true })).validationInput.command.operationType, 'regenerate_week');
});
test('C: lookup error stops before gate or writes', async () => {
  const result = await backend({ lookupError: true });
  assert.equal(result.response.status, 500);
  assert.equal(result.validationInput, undefined);
  assert.equal(writes(result).length, 0);
});
for (const [label, status, http, reason] of [
  ['D', 'rejected', 422, 'PLAN_MUTATION_REJECTED'],
  ['E', 'failed', 500, 'PLAN_MUTATION_VALIDATION_FAILED'],
]) test(`${label}: ${status} causes zero application writes`, async () => {
  const result = await backend({ gateStatus: status });
  assert.equal(result.response.status, http);
  assert.equal(result.response.body.reason, reason);
  assert.equal(writes(result).length, 0);
});
test('F: upsert failure prevents all deferred effects', async () => {
  const result = await backend({ upsertError: true });
  assert.equal(result.response.status, 500);
  assert.deepEqual(writes(result).map(item => item.table), ['weekly_plan']);
});
test('G: upsert uses returned candidate and preserves session metadata', async () => {
  const result = await backend({ returnedTitle: 'Validated' });
  const saved = writes(result)[0].payload;
  assert.equal(saved.sessions[0].titulo, 'Validated');
  assert.equal(saved.sessions[0].custom_metadata.retained, true);
  assert.equal(saved.user_codigo, 'test');
  assert.equal(saved.confidence, 100);
});
test('H: gate and successful upsert precede outcome, cycle, log and event', async () => {
  const result = await backend();
  assert.equal(result.operations[0].gate, true);
  assert.deepEqual(writes(result).map(item => item.table), [
    'weekly_plan', 'block_outcomes', 'usuarios', 'weekly_plan_generation_log', 'weekly_plan_events',
  ]);
  assert.equal(writes(result)[2].payload.ciclo_actual.semana, 1);
  assert.equal(result.response.status, 200);
  assert.equal(result.response.body.ok, true);
});

async function runFrontend(responses) {
  const calls = [];
  let reloads = 0;
  const planCompleto = { week_start: nextWeek() };
  const execute = executable(frontendBody, {
    planCompleto, codigoUsuario: 'test',
    cargarPlanSemanal: () => { reloads++; },
    apiCall: async request => { calls.push(request.action); return responses.shift(); },
  });
  const result = await execute();
  return { result, calls, reloads, planCompleto };
}
test('I: first save without strict ok prevents verification and returns null', async () => {
  for (const response of [{ error: 'rejected' }, { ok: false }, { ok: 'true' }, undefined]) {
    const result = await runFrontend([response, { valido: true }]);
    assert.equal(result.result, null);
    assert.deepEqual(result.calls, ['guardar_plan_semana']);
    assert.equal(result.reloads, 1);
  }
});
test('J: successful first save allows verification', async () => {
  const result = await runFrontend([{ ok: true }, { valido: true }]);
  assert.deepEqual(result.calls, ['guardar_plan_semana', 'verificar_persistencia_plan']);
  assert.equal(result.result, result.planCompleto);
});
test('K: failed second save prevents second verification', async () => {
  const result = await runFrontend([{ ok: true }, { valido: false }, { error: 'rejected' }, { valido: true }]);
  assert.equal(result.result, null);
  assert.deepEqual(result.calls, ['guardar_plan_semana', 'verificar_persistencia_plan', 'guardar_plan_semana']);
  assert.equal(result.reloads, 1);
});
test('L: successful explicit retry retains final plan and reload', async () => {
  const result = await runFrontend([{ ok: true }, { valido: false }, { ok: true }, { valido: true }]);
  assert.equal(result.result, result.planCompleto);
  assert.equal(result.reloads, 1);
  assert.deepEqual(result.calls, ['guardar_plan_semana', 'verificar_persistencia_plan', 'guardar_plan_semana', 'verificar_persistencia_plan']);
});

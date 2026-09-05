import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Existing TypeScript compiler + Node's test runner; no emitted files or new dependency.
const modules = new Map();
const allowed = ['planValidationPipeline', 'planMutationTypes', 'planMutationValidators'];
function load(name) {
  assert.ok(allowed.includes(name), `Unexpected dependency: ${name}`);
  if (modules.has(name)) return modules.get(name);
  const source = readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const compiledModule = { exports: {} };
  // No fetch, process, Supabase client or unrestricted require in this environment.
  vm.runInNewContext(outputText, {
    module: compiledModule, exports: compiledModule.exports, structuredClone,
    require: specifier => {
      assert.ok(specifier.startsWith('./'));
      return load(specifier.slice(2));
    },
  }, { filename: `${name}.ts` });
  modules.set(name, compiledModule.exports);
  return compiledModule.exports;
}
const { runPlanValidationPipeline: validatePlanMutation } = load('planValidationPipeline');

function input() {
  const candidate = { week_start: '2026-09-07', sessions: [
    { dia: 'lunes', tipo: 'descanso', titulo: 'Descanso', descripcion: 'Recuperacion' },
  ] };
  return {
    command: { source: 'weekly_orchestrator', operationType: 'create_week',
      target: { userCodigo: 'test', weekStart: candidate.week_start }, proposal: candidate },
    context: {}, candidate,
    changeSet: { operationType: 'create_week', affectedDays: ['lunes'], changedFields: ['sessions'] },
  };
}
function validator(validate, extra = {}) {
  return { id: 'test', version: '1', critical: true, operationTypes: ['create_week'], validate, ...extra };
}
const issue = severity => ({ code: 'TEST', validatorId: 'test', severity, message: 'Test issue' });

test('A: valid candidate is ready, never committed', async () => {
  const result = await validatePlanMutation(input());
  assert.equal(result.status, 'ready_for_commit');
  assert.equal(result.valid, true);
  assert.ok(Object.isFrozen(result.candidate));
  assert.equal('commit' in result, false);
});
test('B: hard violation rejects', async () => {
  const result = await validatePlanMutation(input(), [validator(() => [issue('hard')])]);
  assert.equal(result.status, 'rejected');
  assert.equal(result.candidate, null);
  assert.equal(result.metadata.validatorExecutions[1].status, 'failed');
});
test('C: warning allows readiness and is retained', async () => {
  const result = await validatePlanMutation(input(), [validator(() => [issue('warning')])]);
  assert.equal(result.status, 'ready_for_commit');
  assert.equal(result.warnings.length, 1);
});
test('D: critical exception fails closed', async () => {
  const result = await validatePlanMutation(input(), [validator(async () => { throw new Error('failure'); })]);
  assert.equal(result.status, 'failed');
  assert.equal(result.valid, false);
  assert.equal(result.metadata.validatorExecutions[1].status, 'error');
});
test('E: inapplicable validator is recorded and never executed', async () => {
  let called = false;
  const result = await validatePlanMutation(input(), [validator(() => { called = true; return []; },
    { operationTypes: ['set_week_summary'] })]);
  assert.equal(called, false);
  assert.equal(result.metadata.validatorExecutions[1].status, 'not_applicable');
});
test('F/G: core dependencies are local; no database or LLM access primitives', () => {
  for (const name of allowed) {
    const source = readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8');
    const ast = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isImportDeclaration(node)) {
        assert.ok(['./planMutationTypes', './planMutationValidators'].includes(node.moduleSpecifier.text));
      }
      if (ts.isCallExpression(node)) {
        assert.ok(!['fetch', 'require', 'import', 'eval'].includes(node.expression.getText(ast)));
        if (ts.isPropertyAccessExpression(node.expression)) {
          assert.ok(!['from', 'rpc', 'insert', 'update', 'upsert', 'delete'].includes(node.expression.name.text));
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
});
test('missing critical context fails; empty restriction list is available context', async () => {
  const check = validator(() => [], { requiredContext: ['restrictions'] });
  assert.equal((await validatePlanMutation(input(), [check])).status, 'failed');
  const complete = input();
  complete.context.restrictions = [];
  assert.equal((await validatePlanMutation(complete, [check])).status, 'ready_for_commit');
});
test('noncritical error remains error, with warning', async () => {
  const result = await validatePlanMutation(input(), [validator(() => { throw new Error(); }, { critical: false })]);
  assert.equal(result.status, 'ready_for_commit');
  assert.equal(result.metadata.validatorExecutions[1].status, 'error');
  assert.equal(result.warnings.length, 1);
});
test('validator cannot mutate candidate or caller context', async () => {
  const original = input();
  const before = structuredClone(original);
  const result = await validatePlanMutation(original, [validator(({ candidate }) => {
    candidate.sessions[0].titulo = 'changed';
    return [];
  })]);
  assert.equal(result.status, 'failed');
  assert.deepEqual(original, before);
});
test('invalid validator output fails closed', async () => {
  assert.equal((await validatePlanMutation(input(), [validator(() => undefined)])).status, 'failed');
});
test('candidate for another week rejects', async () => {
  const value = input();
  value.candidate = { ...value.candidate, week_start: '2026-09-14' };
  assert.equal((await validatePlanMutation(value)).status, 'rejected');
});
test('duplicate validator registration fails closed', async () => {
  const check = validator(() => []);
  assert.equal((await validatePlanMutation(input(), [check, check])).status, 'failed');
});

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { planningTestRuntime } from './planningTestRuntime.mjs';
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const route = ts.createSourceFile('route.ts', read('../../app/api/chat/route.ts'), 99, true);
function find(root, predicate) {
  const result = [];
  function visit(n) { if (predicate(n)) result.push(n); ts.forEachChild(n, visit); }
  visit(root); return result;
}
const branch = action => find(route, n => ts.isIfStatement(n) && n.expression.getText(route) === `action === "${action}"`)[0].thenStatement;
for (const action of ['actualizar_sesion_plan', 'confirmar_pending_action', 'close_week', 'guardar_resumen_semana']) {
  test(`B1 architecture ${action}: strict receipt and common CAS only`, () => {
    const source = branch(action).getText(route);
    assert.match(source, /await validatePlanMutation\(/);
    assert.match(source, /expectedRevision: /);
    assert.match(source, /await mutatePlanWithCAS\(supabase, validationResult.mutation\)/);
    assert.doesNotMatch(source, /validateLegacyPlanMutation/);
    assert.doesNotMatch(source, /from\("weekly_plan"\)\s*\.(update|upsert|insert|delete)\(/);
  });
}
test('B1 architecture completion shares strict adapter; weekly save converges to strict INSERT/CAS', () => {
  const completion = read('./recordCompletion.ts');
  assert.match(completion, /from '.\/planMutation'/);
  assert.match(completion, /mutatePlanWithCAS\(supabase, validationResult.mutation\)/);
  assert.doesNotMatch(completion, /legacyPlanMutation|from\('weekly_plan'\)\s*\.(update|upsert|insert|delete)\(/);
  const weekly = branch('guardar_plan_semana').getText(route);
  assert.match(weekly, /await validatePlanMutation\(/);
  assert.doesNotMatch(weekly, /from\("weekly_plan"\).upsert\(/);
  assert.match(weekly, /mutatePlanWithCAS/); assert.match(weekly, /createPlan/);
});
const web = ts.createSourceFile('FormaPro.tsx', read('../../app/FormaPro.tsx'), 99, true, ts.ScriptKind.TSX);
const api = find(web, n => ts.isVariableDeclaration(n) && n.name.getText(web) === 'apiCall')[0].initializer.getText(web);
const { planPersistenceFailure } = planningTestRuntime()('planPersistence');
for (const status of ['conflict', 'error', 'unknown']) {
  test(`real frontend apiCall delivers ${status} HTTP 200 once without replay`, async () => {
    let calls = 0;
    const body = planPersistenceFailure({ status, reason: 'precondition', error: { code: 'TEST', message: 'test' } });
    const code = ts.transpileModule(`const apiCall = ${api}; apiCall;`, { compilerOptions: { target: 99, module: 1 } }).outputText;
    const apiCall = vm.runInNewContext(code, {
      fetch: async () => { calls++; return { ok: true, status: 200, json: async () => body }; },
      setTimeout: () => { throw new Error('Unexpected retry'); }, abortControllerRef: { current: null },
    });
    assert.equal(await apiCall({ action: 'test' }), body);
    assert.equal(calls, 1); assert.equal(body.ok, false); assert.equal(body.retryable, false);
    if (status === 'unknown') assert.match(body.message, /No se puede confirmar/);
  });
}

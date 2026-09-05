import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

/** Actual modules, one receipt registry per harness; no network or emitted files. */
export function planningTestRuntime(globals = {}) {
  const cache = new Map();
  function load(name) {
    assert.ok(['planMutation', 'planValidationPipeline', 'planMutationValidators', 'planMutationTypes',
      'planPersistence', 'prescriptionIdentity', 'recordCompletion', 'weekClosure', 'weeklyGeneration', 'prepareWeeklyCandidate'].includes(name), name);
    if (cache.has(name)) return cache.get(name);
    const module = { exports: {} }; cache.set(name, module.exports);
    const source = readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(js, { module, exports: module.exports, structuredClone, Intl, ...globals,
      require: path => path === 'node:crypto' ? crypto : load(path.replace('./', '')) });
    return module.exports;
  }
  return load;
}

/** Fixtures model the deployed identity/revision columns; never repairs runtime input. */
export function withPlanIdentity(plan) {
  return { ...plan, id: 'plan-1', revision: 5,
    sessions: plan.sessions.map((session, index) => ({ ...session,
      session_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` })) };
}

/** A test gate transforming content must issue a new STRICT receipt, not forge one. */
export async function validateTestCandidate(validate, input, transform) {
  const result = await validate(input);
  return transform && result.status === 'ready_for_commit'
    ? validate({ ...input, candidate: transform(result.candidate) }) : result;
}

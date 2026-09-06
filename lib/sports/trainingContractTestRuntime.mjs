import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const nativeRequire = createRequire(import.meta.url);
export const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
export const plain = value => JSON.parse(JSON.stringify(value));
export function sportsRuntime(globals = {}) {
  const cache = new Map();
  function load(file) {
    const path = resolve(file);
    if (cache.has(path)) return cache.get(path);
    const module = { exports: {} }; cache.set(path, module.exports);
    vm.runInNewContext(compile(readFileSync(path, 'utf8')), { module, exports: module.exports, structuredClone, Buffer,
      process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'isolated-sports-test-key' } }, ...globals,
      require: name => { if (name === 'node:crypto') return nativeRequire(name);
        if (!name.startsWith('.')) throw new Error(`Unexpected dependency: ${name}`); return load(resolve(dirname(path), name + '.ts')); } });
    return module.exports;
  }
  return name => load(`lib/sports/${name}.ts`);
}
export function contractFixture(overrides = {}) {
  return { prescriptionScope: { mode: 'coach', prescriptionAllowed: true, managedDisciplines: ['box', 'carrera'], externalDisciplines: [] },
    targetWeekStart: '2026-08-31', targetDay: 'martes', discipline: 'box', stimulus: 'fuerza_maxima',
    restrictionsSnapshot: { asOfDate: '2026-09-01', state: null, areas: [], restrictions: [], reassessments: [], active: false },
    externalLoadContext: { source: 'server_training_sources_and_records', policy: 'read_only_context', activities: [], records: [] },
    exposureContext: { source: 'legacy_completed_weekly_rows', report: { disciplina: 'box', exposiciones: [], estimulosSubexpuestos: [], estimulosSobreexpuestos: [] }, limitations: [] },
    availableDays: null, source: 'weekly_session_builder', ...overrides };
}
export function fakeDatabase(tables, failTable) {
  const calls = [];
  return { calls, from(table) {
    calls.push(table);
    const response = () => ({ data: tables[table] ?? [], error: table === failTable ? { message: 'read failed' } : null });
    return { select() { return this; }, eq() { return this; }, in() { return this; }, range() { return this; }, order() { return this; }, limit() { return this; },
      single: async () => response(), maybeSingle: async () => response(), then: (yes, no) => Promise.resolve(response()).then(yes, no) };
  } };
}

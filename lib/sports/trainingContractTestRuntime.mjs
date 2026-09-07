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
    return { select() { return this; }, eq() { return this; }, in() { return this; }, lt() { return this; }, lte() { return this; }, range() { return this; }, order() { return this; }, limit() { return this; },
      single: async () => response(), maybeSingle: async () => table === 'physiology_records' ? { data: null, error: response().error } : response(), then: (yes, no) => Promise.resolve(response()).then(yes, no) };
  } };
}

/** Explicit all-access athlete for authority/transport tests; sufficiency tests use unknown profiles. */
let equipmentSignalIds;
export function equippedProfileFixture() {
  const ids = equipmentSignalIds ??= sportsRuntime()('../athlete/prescriptionSignals').signalIds;
  return { prescription_signals: Object.fromEntries(ids.map(id => [id, { state: 'available', updatedAt: '2026-09-01' }])) };
}

/** Complete dose fixture for integration tests that exercise authority rather than sport programming. */
let doseLibraries;
export function completeDoseFixture(c, p) {
  if (c.contractVersion !== 3) return p;
  doseLibraries ??= sportsRuntime();
  const library = doseLibraries('movementLibrary').MOVEMENT_LIBRARY;
  const format = doseLibraries('workoutStructureLibrary').WORKOUT_STRUCTURE_LIBRARY[p.structureId]?.formato;
  const formatDose = ['amrap', 'density', 'death_by'].includes(format) ? { durationSeconds: 720 }
    : ['emom', 'e2mom'].includes(format) ? { durationSeconds: 720, intervalSeconds: format === 'emom' ? 60 : 120, workSeconds: 40, restSeconds: format === 'emom' ? 20 : 80 }
    : format === 'complex' ? { rounds: 4, restSeconds: 120 }
    : c.discipline === 'box' && ['for_time', 'rounds', 'couplet', 'triplet', 'chipper', 'ladder'].includes(format) ? { rounds: 5, timeCapSeconds: 1080 } : null;
  return { ...p, schemaVersion: 2, blocks: p.blocks.filter(b => b.blockType !== 'cooldown').map(b => ({ ...b,
    ...(b.blockType === 'main' && formatDose ? { formatDose } : {}),
    movements: b.movements.map(m => ({ ...m, prescription: b.blockType === 'warmup'
      ? { durationSeconds: 120, intensity: { kind: 'rpe', value: 3 } }
      : ['run', 'cyclic'].includes(library[m.movementId]?.movement_pattern)
        ? { durationSeconds: 600, intensity: { kind: 'rpe', value: 4 }, ...(format === 'intervals' ? { sets: 3, restSeconds: 120 } : {}) }
        : { sets: 4, ...(library[m.movementId]?.dose_basis === 'duration' ? { durationSeconds: 30 } : { reps: 5 }), intensity: { kind: 'rpe', value: 7 }, restSeconds: 120 } })) })) };
}

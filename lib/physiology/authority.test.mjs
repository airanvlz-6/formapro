import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const cache = new Map();
function load(path) {
  path = resolve(root, path);
  if (cache.has(path)) return cache.get(path);
  const module = { exports: {} }; cache.set(path, module.exports);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ? load(resolve(dirname(path), name + '.ts')) : require(name), module, module.exports);
  return module.exports;
}
const authority = load('lib/physiology/authority.ts');
const adapters = load('lib/physiology/adapters.ts');
const parser = load('lib/sports/sleepMetricsParser.ts');
const { admitPhysiology, writePhysiology, stripGenericPhysiology, physiologyToday } = authority;
const observe = (patch, source = 'device_measurement') => ({ operation: 'observe', source, patch, fecha: physiologyToday(), userCodigo: 'TEST' });
const correction = (expected, value) => ({ operation: 'correct', source: 'confirmed_correction', signal: 'hrv_ms',
  expectedCurrentValue: expected, newValue: value, fecha: physiologyToday(), userCodigo: 'TEST' });

/** Stateful RPC contract mock. This is NOT a PostgreSQL/concurrency test. */
function database() {
  const state = new Map(), calls = [], writes = [];
  let tick = 0;
  const db = { state, calls, writes, legacy: {}, failRpc: false, failMirror: false, failUser: false,
    user: { codigo: 'TEST', estado_fisiologico: { fatiga_aguda: 12 }, historial_fisiologico: [] },
    async rpc(name, args) {
      calls.push({ name, args });
      if (db.failRpc) return { error: { message: 'offline' } };
      const old = state.get(args.p_signal);
      let status;
      if (args.p_operation === 'correct' && (!old || old.value !== args.p_expected_current_value)) status = 'conflict';
      else if (old?.value === args.p_value) status = 'no_op';
      else if (args.p_operation === 'correct') status = 'accepted_correction';
      else status = old ? 'conflict' : 'accepted';
      if (['accepted', 'accepted_correction'].includes(status)) state.set(args.p_signal, {
        value: args.p_value, source: args.p_source, ingested_at: new Date(Date.UTC(2026, 8, 4, 12, 0, ++tick)).toISOString(),
      });
      return { data: { signal: args.p_signal, status, current: state.get(args.p_signal), ...(status === 'conflict' ? { error: 'conflict' } : {}) } };
    },
    from(table) {
      let values;
      const filters = [];
      const q = {
        update(v) { values = v; writes.push({ table, values: structuredClone(v), filters }); return q; },
        eq(...v) { filters.push(v); return q; }, select() { return q; },
        async single() { return { data: db.failUser ? null : structuredClone(db.user), error: db.failUser ? {} : null }; },
        then(ok, bad) {
          if (values && table === 'physiology_records' && !db.failMirror) Object.assign(db.legacy, values);
          if (values && table === 'usuarios' && !db.failUser) Object.assign(db.user, values);
          return Promise.resolve({ data: [{ codigo: 'TEST', user_codigo: 'TEST' }], error: db.failMirror || (table === 'usuarios' && db.failUser) ? {} : null }).then(ok, bad);
        },
      }; return q;
    },
  }; return db;
}

test('absent signal reaches RPC and accepted source/ingestion come from RPC', async () => {
  const db = database(); const r = await admitPhysiology(db, observe({ hrv_ms: 52 }));
  assert.equal(r.results[0].status, 'accepted'); assert.equal(r.canonicalCommitted, true);
  assert.equal(r.results[0].current.source, 'device_measurement');
  assert.ok(r.results[0].current.ingested_at); assert.equal(db.calls[0].name, 'admit_canonical_physiology_signal');
  assert.equal('p_ingested_at' in db.calls[0].args, false); assert.equal(db.writes.length, 0);
});
for (const source of ['device_measurement', 'llm_conversation_extraction']) {
  test(`same value ${source} is no_op preserving original metadata`, async () => {
    const db = database(); await admitPhysiology(db, observe({ hrv_ms: 52 })); const old = structuredClone(db.state.get('hrv_ms'));
    const r = await admitPhysiology(db, observe({ hrv_ms: 52 }, source));
    assert.equal(r.results[0].status, 'no_op'); assert.deepEqual(db.state.get('hrv_ms'), old);
  });
}
for (const [first, second] of [['device_measurement', 'device_measurement'], ['device_measurement', 'llm_vision_extraction'],
  ['llm_conversation_extraction', 'device_measurement'], ['deterministic_extraction', 'explicit_user_report']]) {
  test(`different value ${first} -> ${second} conflicts without mutation`, async () => {
    const db = database(); await admitPhysiology(db, observe({ hrv_ms: 52 }, first)); const old = structuredClone(db.state.get('hrv_ms'));
    const r = await admitPhysiology(db, observe({ hrv_ms: 60 }, second));
    assert.equal(r.error, 'conflict'); assert.deepEqual(db.state.get('hrv_ms'), old);
  });
}
test('valid correction, stale correction and ordinary overwrite of correction', async () => {
  const db = database(); await admitPhysiology(db, observe({ hrv_ms: 52, sleep_score: 80 }));
  const sleep = structuredClone(db.state.get('sleep_score'));
  assert.equal((await admitPhysiology(db, correction(52, 60))).results[0].status, 'accepted_correction');
  const corrected = structuredClone(db.state.get('hrv_ms'));
  assert.equal(corrected.source, 'confirmed_correction');
  assert.equal((await admitPhysiology(db, correction(52, 60))).results[0].status, 'conflict');
  assert.equal((await admitPhysiology(db, observe({ hrv_ms: 70 }))).results[0].status, 'conflict');
  assert.deepEqual(db.state.get('hrv_ms'), corrected); assert.deepEqual(db.state.get('sleep_score'), sleep);
});
test('invalid source/envelope, client timestamps, null, unknown fields and semantic values reject before RPC', async () => {
  for (const cmd of [observe({ hrv_ms: 1 }, 'unknown'), observe({ hrv_ms: 1 }, 'confirmed_correction'),
    { ...observe({ hrv_ms: 1 }), ingested_at: 'fake' }, { ...observe({ hrv_ms: 1 }), fecha: '2026-02-30' },
    observe({ hrv_ms: null }), observe({ hrv_ms: NaN }), observe({ resting_hr_bpm: 0 }), observe({ sleep_score: 101 }),
    observe({ sleep_duration_minutes: 1.5 }), observe({ sleep_duration_minutes: -1 }), observe({ other: 10 })]) {
    const db = database(); assert.equal((await admitPhysiology(db, cmd)).error, 'invalid_input'); assert.equal(db.calls.length, 0);
  }
});
test('omission preserves existing signals; independent accepted/conflicted/rejected results', async () => {
  const db = database(); await admitPhysiology(db, observe({ hrv_ms: 52, sleep_score: 80 }));
  const old = structuredClone([...db.state]);
  const r = await admitPhysiology(db, observe({ hrv_ms: 53, sleep_duration_minutes: 420, resting_hr_bpm: null }));
  assert.deepEqual(r.results.map(x => x.status), ['conflict', 'accepted', 'rejected']);
  assert.deepEqual(db.state.get('hrv_ms'), old[0][1]); assert.deepEqual(db.state.get('sleep_score'), old[1][1]);
  assert.equal(db.state.get('sleep_duration_minutes').value, 420);
});
test('RPC errors/throws/malformed response stay db_error, with no mirrors', async () => {
  for (const rpc of [async () => ({ error: {} }), async () => { throw Error('offline'); }, async () => ({ data: { status: 'accepted' } })]) {
    const db = database(); db.rpc = rpc;
    const r = await writePhysiology(db, observe({ hrv_ms: 52 }));
    assert.equal(r.error, 'db_error'); assert.equal(r.ok, false); assert.equal(db.writes.length, 0);
  }
});
test('canonical partial commit is retained when another RPC fails', async () => {
  const db = database(), rpc = db.rpc;
  db.rpc = (name, args) => args.p_signal === 'sleep_score' ? Promise.resolve({ error: {} }) : rpc(name, args);
  const r = await admitPhysiology(db, observe({ hrv_ms: 52, sleep_score: 80 }));
  assert.equal(r.canonicalCommitted, true); assert.equal(r.error, 'db_error'); assert.equal(db.state.get('hrv_ms').value, 52);
});
test('legacy mirror only approved compatible fields; conflicts never mirror; duration has no mirror', async () => {
  const db = database(); const r = await writePhysiology(db, observe({ hrv_ms: 52, resting_hr_bpm: 45, sleep_score: 80, sleep_duration_minutes: 600 }));
  assert.equal(r.ok, true);
  assert.deepEqual(db.writes.filter(w => w.table === 'physiology_records').map(w => w.values), [{ hrv: 52 }, { rhr: 45 }, { sueno: 80 }]);
  assert.ok(db.writes[0].filters.some(([key]) => key === 'hrv_ingested_at'));
  assert.equal(db.user.estado_fisiologico.fatiga_aguda, 12); assert.equal(db.user.estado_fisiologico.sueno, 80);
  const count = db.writes.length;
  await writePhysiology(db, observe({ hrv_ms: 53, sleep_score: 90 })); assert.equal(db.writes.length, count);
});
for (const legacyValue of [null, 40]) {
  test(`no_op reconciles ${legacyValue === null ? 'missing' : 'stale'} mirrors without changing canonical metadata`, async () => {
    const db = database(); await admitPhysiology(db, observe({ hrv_ms: 65 }));
    db.legacy.hrv = legacyValue;
    db.user.estado_fisiologico.hrv = legacyValue;
    db.user.historial_fisiologico = [{ fecha: physiologyToday(), hrv: legacyValue }];
    const canonical = structuredClone([...db.state]);
    const result = await writePhysiology(db, observe({ hrv_ms: 65 }, 'llm_conversation_extraction'));
    assert.equal(result.results[0].status, 'no_op'); assert.equal(result.canonicalCommitted, false);
    assert.equal(result.ok, true); assert.equal(db.legacy.hrv, 65);
    assert.equal(db.user.estado_fisiologico.hrv, 65); assert.equal(db.user.historial_fisiologico[0].hrv, 65);
    assert.deepEqual([...db.state], canonical);
    const write = db.writes.find(w => w.table === 'physiology_records');
    assert.deepEqual(write.values, { hrv: 65 });
    assert.ok(write.filters.some(([k, v]) => k === 'hrv_source' && v === 'device_measurement'));
    assert.ok(write.filters.some(([k, v]) => k === 'hrv_ingested_at' && v === canonical[0][1].ingested_at));
  });
}
test('sleep duration no_op never writes legacy sueno or user mirrors', async () => {
  const db = database(); await admitPhysiology(db, observe({ sleep_duration_minutes: 450 })); db.legacy.sueno = 80;
  const canonical = structuredClone([...db.state]);
  const result = await writePhysiology(db, observe({ sleep_duration_minutes: 450 }));
  assert.equal(result.results[0].status, 'no_op'); assert.equal(db.writes.length, 0);
  assert.equal(db.legacy.sueno, 80); assert.deepEqual([...db.state], canonical);
});
for (const failure of ['failMirror', 'failUser']) {
  test(`no_op reconciliation ${failure} reports legacy failure without changing canonical outcome`, async () => {
    const db = database(); await admitPhysiology(db, observe({ hrv_ms: 65 }));
    const canonical = structuredClone([...db.state]); db[failure] = true;
    const result = await writePhysiology(db, observe({ hrv_ms: 65 }));
    assert.equal(result.results[0].status, 'no_op'); assert.equal(result.canonicalCommitted, false);
    assert.equal(result.error, 'partial_legacy_failure'); assert.equal(result.ok, false);
    assert.deepEqual([...db.state], canonical);
  });
}
test('no_op with missing, mismatched or invalid canonical metadata cannot reconcile', async () => {
  for (const current of [undefined, { value: 66, source: 'device_measurement', ingested_at: '2026-09-04T12:00:00Z' },
    { value: 65, source: 'unknown', ingested_at: '2026-09-04T12:00:00Z' },
    { value: 65, source: 'device_measurement', ingested_at: 'invalid' }]) {
    const db = database(); db.rpc = async () => ({ data: { signal: 'hrv_ms', status: 'no_op', current } });
    assert.equal((await writePhysiology(db, observe({ hrv_ms: 65 }))).error, 'db_error');
    assert.equal(db.writes.length, 0);
  }
});
test('mirror failure is partial_legacy_failure after canonical commit', async () => {
  const db = database(); db.failMirror = true;
  const r = await writePhysiology(db, observe({ hrv_ms: 52 }));
  assert.equal(r.error, 'partial_legacy_failure'); assert.equal(r.canonicalCommitted, true); assert.equal(db.state.get('hrv_ms').value, 52);
});
test('observation entry rejects correction/null; mixed conflict and mirror failure remain explicit', async () => {
  const db = database();
  assert.equal((await writePhysiology(db, null)).error, 'invalid_input');
  assert.equal((await writePhysiology(db, correction(52, 60))).error, 'invalid_input');
  assert.equal(db.calls.length, 0);
  await admitPhysiology(db, observe({ hrv_ms: 52 })); db.failMirror = true;
  const result = await writePhysiology(db, observe({ hrv_ms: 60, sleep_score: 80 }));
  assert.equal(result.error, 'partial_legacy_failure');
  assert.deepEqual(result.results.map(r => r.status), ['conflict', 'accepted']);
});
test('HealthKit hours -> minutes without cap/score; unverified HRV/RHR omitted', () => {
  assert.deepEqual(adapters.healthKitPatch({ suenoHoras: 10.25, hrv: 60, rhr: 45 }), { sleep_duration_minutes: 615 });
  for (const value of [-1, '8', null, Infinity]) assert.deepEqual(adapters.healthKitPatch({ suenoHoras: value }), {});
});
test('literal parser separates units, resting versus minimum/average, duration versus score', () => {
  assert.deepEqual(adapters.parseCanonicalReport('HRV 60ms, FC reposo 48 bpm, dormí 7 horas 30 minutos, puntuación sueño 80/100'),
    { hrv_ms: 60, resting_hr_bpm: 48, sleep_score: 80, sleep_duration_minutes: 450 });
  assert.deepEqual(adapters.parseCanonicalReport('HRV 60; frecuencia cardiaca media 48 bpm; FC mínima 40 bpm'), {});
  assert.equal(parser.parseSleepMetrics('métricas de sueño frecuencia cardiaca media 48 bpm').rhr, null);
  assert.deepEqual(adapters.conversationalPatch('ayer HRV 60ms', { hrv: 60 }), {});
  assert.deepEqual(adapters.conversationalPatch('HRV 60ms', { hrv: 61 }), {});
  assert.deepEqual(adapters.parseCanonicalReport('puntuación sueño 8/10'), {});
  assert.deepEqual(adapters.manualPatch('HRV 888ms'), {});
  assert.deepEqual(adapters.manualPatch('lunes HRV 60ms'), {});
});
test('historical report requires literal date/value evidence; visual confidence remains admission-only', () => {
  assert.deepEqual(adapters.historicalPatch({ fecha: '2026-09-01', hrv: 60 }, '2026-09-01 HRV 60ms'), { hrv_ms: 60 });
  assert.deepEqual(adapters.historicalPatch({ fecha: '2026-09-01', sueno: 80 }, 'dormí bien'), {});
  assert.deepEqual(adapters.imagePatch({ hrv: 60, hrv_unit: 'ms', hrv_confianza: .9, rhr: 45, rhr_kind: 'minimum', rhr_confianza: .99,
    duracion_horas: 9, duracion_confianza: .9, sueno: 85, sueno_scale: 100, sueno_confianza: .5 }), { hrv_ms: 60, sleep_duration_minutes: 540 });
});
test('generic sanitizer discards observations/history/metadata while preserving legitimate unrelated input', () => {
  const datos = { estado_fisiologico: { hrv: 999, resting_hr_bpm: 1, fatiga_aguda: 12 }, historial_fisiologico: [{}],
    hrv_ms: 999, hrv_source: 'confirmed_correction', hrv_ingested_at: 'fake', notas_coach: 'keep' };
  assert.deepEqual(stripGenericPhysiology(datos), { fatiga_aguda: 12 }); assert.deepEqual(datos, { notas_coach: 'keep' });
});

const routeText = readFileSync(resolve(root, 'app/api/chat/route.ts'), 'utf8');
const route = ts.createSourceFile('route.ts', routeText, ts.ScriptTarget.Latest, true);
function find(node, predicate) { if (predicate(node)) return node; let found; ts.forEachChild(node, child => { found ??= find(child, predicate); }); return found; }
function branch(action) {
  const n = find(route, n => ts.isIfStatement(n) && n.expression.getText(route) === `action === "${action}"`);
  assert.ok(n, action); return n.thenStatement.getText(route);
}
for (const action of ['actualizar_usuario', 'extraer_metricas_imagen', 'verificar_metricas_sueno_deterministico', 'registrar_metrica_pasada', 'sincronizar_healthkit_real']) {
  test(`real ${action} calls shared authority and has no direct physiology table writer`, () => {
    const text = branch(action); assert.match(text, /await writePhysiology\(/);
    assert.doesNotMatch(text, /from\(["']physiology_records["']\)/);
    assert.doesNotMatch(text, /admit_canonical_physiology_signal/);
  });
}
function executeBranch(action, extra) {
  const source = `async function run() ${branch(action)}; return run();`;
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { ...authority, ...adapters, ...extra, NextResponse: { json: (body, options) => ({ body, options }) } };
  return new Function(...Object.keys(context), compiled)(...Object.values(context));
}
test('real HealthKit branch reports RPC failure as unsuccessful sync, never touches id', async () => {
  assert.doesNotMatch(branch('sincronizar_healthkit_real'), /\bid\b|suenoScore|\/\s*8/);
  const db = database(); db.failRpc = true;
  const result = await executeBranch('sincronizar_healthkit_real', { supabase: db, codigo: 'TEST', datos: { suenoHoras: 8 } });
  assert.equal(result.body.sincronizado, false); assert.equal(result.body.ok, false); assert.equal(result.body.error, 'db_error');
});
test('real manual and historical writers use fixed sources, literal evidence and shared persistence', async () => {
  const db = database();
  const manual = await executeBranch('verificar_metricas_sueno_deterministico', { supabase: db, codigo: 'TEST',
    parseSleepMetrics: parser.parseSleepMetrics, datos: { mensaje: 'FC reposo 48 bpm', source: 'confirmed_correction' } });
  assert.equal(manual.body.ok, true); assert.equal(db.calls[0].args.p_source, 'deterministic_extraction');
  assert.equal(db.calls[0].args.p_signal, 'resting_hr_bpm');
  const historical = await executeBranch('registrar_metrica_pasada', { supabase: db, codigo: 'TEST', datos: {
    fecha: '2026-09-01', hrv: 60, mensajeUsuario: '01/09/2026 HRV 60ms', operation: 'correct' } });
  assert.equal(historical.body.ok, true); assert.equal(db.calls[1].args.p_source, 'llm_conversation_extraction');
  assert.equal(db.calls[1].args.p_operation, 'observe'); assert.equal(db.calls[1].args.p_fecha, '2026-09-01');
});
test('real visual writer returns conflict without overwriting a device measurement', async () => {
  const db = database(); await admitPhysiology(db, observe({ hrv_ms: 52 }));
  const response = await executeBranch('extraer_metricas_imagen', { supabase: db, codigo: 'TEST', apiKey: 'test',
    datos: { imagenBase64: 'test' }, fetch: async () => ({ json: async () => ({ content: [{ text: JSON.stringify({
      hrv: 60, hrv_unit: 'ms', hrv_confianza: .99, sueno: null, rhr: null, duracion_horas: null,
    }) }] }) }) });
  assert.equal(response.body.error, 'conflict'); assert.deepEqual(response.body.guardadoAutomatico, {});
  assert.equal(db.calls[1].args.p_source, 'llm_vision_extraction'); assert.equal(db.state.get('hrv_ms').value, 52);
  assert.equal(db.writes.length, 0);
});
test('real conversational writer cannot hide canonical RPC failure as successful physiology', async () => {
  const db = database(); db.failRpc = true;
  const response = await executeBranch('actualizar_usuario', { supabase: db, codigo: 'TEST', apiKey: 'test',
    datos: { historial: [{ role: 'user', content: 'HRV 60ms' }] },
    forgeEventAggregator: async () => ({ eventType: 'sleep', mensajesDelEvento: ['HRV 60ms'] }),
    validateExtraction: load('lib/validators/extractionRules.ts').validateExtraction,
    marcarEventoComoExtraido: async () => {},
    fetch: async () => ({ json: async () => ({ content: [{ text: JSON.stringify({ estado_fisiologico: { hrv: 60 } }) }] }) }),
  });
  assert.equal(db.calls[0].args.p_source, 'llm_conversation_extraction');
  assert.equal(response.body.ok, false); assert.equal(response.body.error, 'db_error');
});
test('real generic action cannot write provided observations; contextual merge retains stored observations', async () => {
  const db = database(); db.user.estado_fisiologico.hrv = 52;
  const response = await executeBranch('actualizar_usuario', { supabase: db, codigo: 'TEST', datos: {
    estado_fisiologico: { hrv: 999, fatiga_aguda: 20 }, historial_fisiologico: [{ hrv: 999 }], notas_coach: 'keep' } });
  assert.equal(response.body.ok, true); assert.equal(db.user.estado_fisiologico.hrv, 52);
  assert.equal(db.user.estado_fisiologico.fatiga_aguda, 20); assert.deepEqual(db.user.historial_fisiologico, []);
  assert.equal(db.calls.length, 0);
});
test('authority is the sole RPC caller; correction has no route exposure; frontend only forwards context', () => {
  const source = readFileSync(resolve(root, 'lib/physiology/authority.ts'), 'utf8');
  assert.equal(source.match(/db\.rpc\(/g)?.length, 1); assert.doesNotMatch(routeText, /admit_canonical_physiology_signal|operation:\s*["']correct/);
  assert.doesNotMatch(source, /\.upsert\(|\.insert\(/);
  const frontend = readFileSync(resolve(root, 'app/FormaPro.tsx'), 'utf8');
  assert.match(frontend, /nuevaMemoria\.estado_fisiologico=subjectiveContext/);
  assert.doesNotMatch(frontend, /nuevaMemoria\.estado_fisiologico=nuevoEstado/);
});

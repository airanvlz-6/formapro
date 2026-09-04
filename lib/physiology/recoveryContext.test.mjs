import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const modules = new Map();
let activeDb;
function load(path) {
  path = resolve(root, path);
  if (modules.has(path)) return modules.get(path);
  const module = { exports: {} }; modules.set(path, module.exports);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (name === '@supabase/supabase-js') return { createClient: () => ({ from: (...args) => activeDb.from(...args) }) };
    assert.ok(name.startsWith('.')); return load(resolve(dirname(path), name + '.ts'));
  }, module, module.exports);
  return module.exports;
}
const { prepareRecoveryContext: prepare, RecoveryReadError, assertRecoveryIdentity } = load('lib/physiology/recoveryContext.ts');
const today = '2026-09-04';
const date = days => new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10);
const fields = [['hrv_ms', 'hrv'], ['resting_hr_bpm', 'resting_hr'], ['sleep_duration_minutes', 'sleep_duration'], ['sleep_score', 'sleep_score']];
function row(days = 0, values = [60, 50, 420, 99]) {
  const r = { user_codigo: 'TEST', fecha: date(days), hrv: 999, rhr: 999, sueno: 1 };
  fields.forEach(([field, stem], i) => {
    r[field] = values[i] ?? null;
    r[stem + '_source'] = r[field] === null ? null : 'device_measurement';
    r[stem + '_ingested_at'] = r[field] === null ? null : '2026-09-04T12:00:00Z';
  }); return r;
}
const history = (n = 28) => Array.from({ length: n }, (_, i) => row(i + 1));
function database(rows, options = {}) {
  const calls = [];
  return { calls, from(table) {
    const query = { table, filters: [], count: 1000 }; calls.push(query);
    const q = { select(columns) { query.columns = columns; return q; },
      eq(k, v) { query.filters.push([k, '=', v]); return q; },
      lte(k, v) { query.filters.push([k, '<=', v]); return q; },
      gte(k, v) { query.filters.push([k, '>=', v]); return q; },
      order() { return q; }, limit(n) { query.count = n; return q; } };
    const result = single => {
      if (table !== 'physiology_records') return { data: table === 'usuarios' ? { perfil: { dias: '4' }, workout_history: [], modo_entrada: options.mode ?? 'planificacion', estado_fisiologico: { hrv: 999, sueno: 1, rhr: 999, fatiga_aguda: 3, tendencia: 'cansado' } }
        : table === 'readiness_checkins' ? { readiness_score: 3 } : single ? { sessions: [] } : [], error: null };
      const isHistory = !query.filters.some(([k, op]) => k === 'fecha' && op === '=');
      if (options.error === (isHistory ? 'history' : 'today')) return { data: null, error: { message: 'offline' } };
      if (options.invalid === (isHistory ? 'history' : 'today')) return { data: {}, error: null };
      const matches = rows.filter(r => query.filters.every(([k, op, v]) => op === '=' ? r[k] === v : op === '<=' ? r[k] <= v : r[k] >= v))
        .sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, Math.min(query.count, options.pageCap ?? 1000));
      return { data: single ? matches[0] ?? null : matches, error: null };
    };
    q.single = q.maybeSingle = async () => result(true);
    q.then = (ok, bad) => Promise.resolve(result(false)).then(ok, bad);
    return q;
  } };
}
const run = (rows, options) => prepare(database(rows, options), 'TEST', today);
const knowledge = load('lib/knowledge/athleteKnowledge.ts');

test('exact current canonical values override legacy; four signals have independent metadata', async () => {
  const r = await run([row()]);
  assert.equal(r.objective.effectiveDate, today);
  assert.deepEqual([r.objective.hrv.value, r.objective.restingHr.value, r.objective.sleepDuration.value, r.objective.sleepScore.value], [60, 50, 420, 99]);
  assert.equal(r.hrv, 60); assert.equal(r.sueno, 99);
  assert.equal(r.objective.hrv.status, 'available');
});
test('subjective fatigue/trend survive separately without becoming objective evidence', async () => {
  const r = await run([]);
  assert.equal(r.subjective.acuteFatigue, 3); assert.equal(r.subjective.trend, 'cansado');
  assert.equal(r.subjective.effectiveDate, null);
  for (const key of ['hrv', 'restingHr', 'sleepDuration', 'sleepScore']) assert.equal(r.objective[key].status, 'missing');
  assert.equal(r.hrv, null); assert.equal(r.sueno, null);
});
test('yesterday never supplies current; historical trend can exist without today', async () => {
  const r = await run([row(1), row(4), row(8)]);
  assert.equal(r.objective.rowPresent, false); assert.equal(r.objective.hrv.value, null);
  assert.equal(r.trends.hrv.status, 'available');
  assert.deepEqual(r.trends.hrv.observations.map(p => p.effectiveDate), [date(8), date(4), date(1)]);
});
test('partial current and invalid single signal leave the other canonical signals intact', async () => {
  const r = await run([{ ...row(0, [60, null, 420, 99]), hrv_source: 'bad_source' }]);
  assert.equal(r.objective.hrv.status, 'invalid'); assert.equal(r.hrv, null);
  assert.equal(r.objective.restingHr.status, 'missing'); assert.equal(r.objective.sleepDuration.value, 420);
});
test('score present never fabricates duration; duration present never fabricates score', async () => {
  const scoreOnly = await run([row(0, [null, null, null, 90])]);
  assert.equal(scoreOnly.objective.sleepDuration.status, 'missing'); assert.equal(scoreOnly.sueno, 90);
  const durationOnly = await run([row(0, [null, null, 480])]);
  assert.equal(durationOnly.objective.sleepScore.status, 'missing'); assert.equal(durationOnly.sueno, null);
});
test('trend uses latest three valid HRV observations, skips invalid/missing, retains gaps and zero', async () => {
  const r = await run([row(0, [40]), row(1, [null]), { ...row(3), hrv_ms: -1 }, row(6, [20]), row(12, [0]), row(20, [500])], { pageCap: 2 });
  assert.deepEqual(r.trends.hrv.observations, [{ effectiveDate: date(12), value: 0 }, { effectiveDate: date(6), value: 20 }, { effectiveDate: today, value: 40 }]);
  assert.equal(r.trends.hrv.direction, 'ascendente');
  assert.deepEqual(r.trends.sleep, { status: 'unavailable', reason: 'legacy_sleep_semantics_ambiguous' });
});
for (const [values, direction] of [[[60, 50, 40], 'descendente'], [[40, 60, 50], 'estable'], [[60, 60, 60], 'ascendente']]) {
  test(`preserves existing monotonic trend including tie precedence: ${values}`, async () => {
    const r = await run(values.map((v, i) => row(2 - i, [v])));
    assert.equal(r.trends.hrv.direction, direction);
  });
}
test('zero/one observation is explicitly insufficient; two suffice as before', async () => {
  for (const rows of [[], [row()]]) {
    const r = await run(rows); assert.equal(r.trends.hrv.status, 'insufficient'); assert.equal(r.trends.hrv.direction, null);
  }
  assert.equal((await run([row(), row(7)])).trends.hrv.status, 'available');
});
for (const stage of ['today', 'history']) for (const kind of ['error', 'invalid']) {
  test(`${stage} ${kind} propagates identifiable failure instead of normal recovery`, async () => {
    await assert.rejects(run([row()], { [kind]: stage }), e => e instanceof RecoveryReadError && e.failure.error === (kind === 'error' ? 'db_error' : 'invalid_response'));
  });
}
test('knowledge accepts shared context without rereading physiology, checks identity', async () => {
  const r = await run([row()]); activeDb = database([]);
  assert.strictEqual(await knowledge.getRecoveryStatus('TEST', r), r);
  assert.strictEqual((await knowledge.buildAthleteKnowledge('TEST', r)).recovery, r);
  assert.equal(activeDb.calls.some(c => c.table === 'physiology_records'), false);
  await assert.rejects(knowledge.getRecoveryStatus('OTHER', r), /identity_mismatch/);
  assert.throws(() => assertRecoveryIdentity(r, 'TEST', date(1)), /identity_mismatch/);
});
test('HISTORIAL_FISIOLOGICO exposes real dated history separately from current snapshot', async () => {
  // Standalone knowledge defaults to actual Madrid today; historical fixtures remain explicitly dated.
  activeDb = database([row(1), row(5)]);
  const r = await knowledge.knowledgeRouter('TEST', 'HISTORIAL_FISIOLOGICO');
  assert.equal(r.tipo, 'estado_recuperacion'); assert.equal(r.history.ok, true);
  assert.deepEqual(r.history.snapshots.map(s => s.effectiveDate), [date(1), date(5)]);
  assert.equal(r.valor.objective.rowPresent, false);
});

const route = ts.createSourceFile('route.ts', readFileSync(resolve(root, 'app/api/chat/route.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
function find(predicate) {
  let found;
  function visit(node) { if (predicate(node)) found = node; ts.forEachChild(node, visit); }
  visit(route); assert.ok(found); return found;
}
const contextNode = find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'generarEstadoCanonico');
const briefingNode = find(n => ts.isIfStatement(n) && n.expression.getText(route) === 'action === "obtener_daily_briefing"');
function execute(source, bindings, tail) {
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(bindings), code + '\n' + tail)(...Object.values(bindings));
}
function context(db, prepared) {
  return execute(contextNode.getText(route), { prepareRecoveryContext: prepare, assertRecoveryIdentity,
    getCanonicalRestrictions: async () => ({ state: null, restrictions: [] }) }, 'return generarEstadoCanonico;')(db, 'TEST', undefined, prepared);
}
test('actual canonical context reuses current projection with no legacy query', async () => {
  // Production context uses the real Madrid date; use that same date for shared preparation.
  const madrid = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  const db = database([]); const shared = await prepare(db, 'TEST', madrid); db.calls.length = 0;
  const result = await context(db, shared);
  assert.strictEqual(result.recovery, shared); assert.equal(result.ultimo_registro_fisiologico, null);
  assert.equal(db.calls.some(c => c.table === 'physiology_records'), false);
});
for (const mode of ['supervision', 'consulta', 'planificacion']) {
  test(`actual ${mode} briefing shares preparation; preserves partial physiology`, async () => {
    const db = database([row(0, [null, 50, null, 85])], { mode });
    let shared; let contextCalls = 0; let knowledgeCalls = 0;
    const result = await execute(`async function run() ${briefingNode.thenStatement.getText(route)}`, {
      supabase: db, codigo: 'TEST', physiologyToday: () => today,
      prepareRecoveryContext: async (...args) => shared = await prepare(...args),
      generarEstadoCanonico: async (_db, _code, _restrictions, r) => { contextCalls++; assert.strictEqual(r, shared); return { dia_semana_hoy: 'viernes', sesion_hoy: null }; },
      buildAthleteKnowledge: async (_code, r) => { knowledgeCalls++; assert.strictEqual(r, shared); return { recovery: r }; },
      calcularNivelConocimientoReal: async () => 1,
      NextResponse: { json: body => body },
    }, 'return run();');
    assert.strictEqual(result.briefing.recuperacion, shared);
    assert.equal(shared.objective.hrv.status, 'missing'); assert.equal(shared.objective.restingHr.value, 50);
    assert.equal(shared.objective.sleepDuration.status, 'missing'); assert.equal(shared.sueno, 85);
    assert.equal(contextCalls, mode === 'planificacion' ? 1 : 0); assert.equal(knowledgeCalls, contextCalls);
    assert.equal(db.calls.filter(c => c.table === 'physiology_records' && c.filters.some(([key, op]) => key === 'fecha' && op === '=')).length, 1);
  });
}
test('HTTP boundary translates only recovery failures and rethrows unrelated errors', async () => {
  const node = find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'POST');
  const source = node.getText(route).replace('export ', '');
  for (const error of ['db_error', 'invalid_response', 'invalid_input']) {
    const r = await execute(source, { RecoveryReadError, handlePost: async () => { throw new RecoveryReadError({ ok: false, error, reason: 'test' }); }, NextResponse: { json: (body, init) => ({ body, ...init }) } }, 'return POST({});');
    assert.equal(r.status, error === 'invalid_input' ? 400 : 503); assert.equal(r.body.error, error);
  }
  await assert.rejects(execute(source, { RecoveryReadError, handlePost: async () => { throw Error('unrelated'); } }, 'return POST({});'), /unrelated/);
});
test('static bypass audit of migrated bodies and shared projection', () => {
  for (const source of [contextNode.getText(route), briefingNode.getText(route), readFileSync(resolve(root, 'lib/knowledge/athleteKnowledge.ts'), 'utf8')]) {
    assert.doesNotMatch(source, /from\(["']physiology_records["']\)|estado_fisiologico|historial_fisiologico/);
  }
  const helper = readFileSync(resolve(root, 'lib/physiology/recoveryContext.ts'), 'utf8');
  assert.doesNotMatch(helper, /state\??\.(hrv|rhr|sueno)\b|from\(["']physiology_records["']\)/);
  assert.match(helper, /state\?\.fatiga_aguda/); assert.match(helper, /state\?\.tendencia/);
});

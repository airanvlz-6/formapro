import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const rootPath = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const text = readFileSync(resolve(rootPath, 'app/api/chat/route.ts'), 'utf8');
const root = ts.createSourceFile('route.ts', text, ts.ScriptTarget.Latest, true);
function find(predicate) { let result; function visit(node) { if (!result && predicate(node)) result = node; ts.forEachChild(node, visit); } visit(root); assert.ok(result); return result; }
const fn = name => find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
const branch = action => find(n => ts.isIfStatement(n) && n.expression.getText(root) === `action === "${action}"`).thenStatement;
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function executable(node, bindings, name) {
  return new Function(...Object.keys(bindings), compile(node.getText(root)) + `; return ${name};`)(...Object.values(bindings));
}
const available = value => ({ status: 'available', value });
const missing = { status: 'missing', value: null };
const snapshot = (date, values = [60, 50, 420, 80]) => ({ effectiveDate: date,
  hrv: values[0] === null ? missing : available(values[0]), restingHr: values[1] === null ? missing : available(values[1]),
  sleepDuration: values[2] === null ? missing : available(values[2]), sleepScore: values[3] === null ? missing : available(values[3]) });
const project = executable(fn('canonicalPhysiologyForAnalytics'), {}, 'canonicalPhysiologyForAnalytics');
const physiology = [snapshot('2026-09-04', [61, null, 430, 82]), snapshot('2026-09-01', [null, 49, null, 70])];

function queryDb(user, other = {}) {
  const calls = [];
  return { calls, from(table) { calls.push(table); const q = { select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; },
    single: async () => table === 'usuarios' ? ({ data: user, error: null }) : ({ data: other[table] || [], error: null }),
    insert() { return q; }, then(ok, bad) { return Promise.resolve({ data: other[table] || [], error: null }).then(ok, bad); } }; return q; } };
}

for (const [name, user, expectedLimit, errorPrefix] of [
  ['ejecutarAthleteResponseEngine', { workout_history: Array.from({ length: 10 }, (_, i) => ({ fecha: `2026-08-${10 + i}`, tipo: 'run' })) }, 40, 'KNOWLEDGE'],
  ['ejecutarDiscoveryEngine', { workout_history: [{}, {}, {}] }, 30, 'DISCOVERY'],
]) {
  test(`${name} supplies explicit canonical fields in DESC order and no legacy fallback`, async () => {
    let historyOptions, body;
    const db = queryDb(user);
    const run = executable(fn(name), { getCanonicalPhysiologyHistory: async (_db, _user, options) => { historyOptions = options; return { ok: true, snapshots: physiology }; },
      physiologyToday: () => '2026-09-04', canonicalPhysiologyForAnalytics: project,
      fetch: async (_url, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ content: [{ text: '{"hay_patron":false}' }] }) }; }, console }, name);
    const result = await run(db, 'key', 'TEST'); assert.equal(result.generado, false);
    assert.equal(historyOptions.limit, expectedLimit); assert.equal(historyOptions.asOfDate, '2026-09-04');
    const prompt = body.messages[0].content;
    assert.ok(prompt.indexOf('2026-09-04') < prompt.indexOf('2026-09-01'));
    for (const field of ['hrv_ms', 'resting_hr_bpm', 'sleep_duration_minutes', 'sleep_score', 'signal_statuses']) assert.match(prompt, new RegExp(field));
    assert.doesNotMatch(fn(name).getText(root), /historial_fisiologico|\.slice\(-(?:30|40)\).*fisio/);
    const failed = executable(fn(name), { getCanonicalPhysiologyHistory: async () => ({ ok: false, error: 'db_error', reason: 'offline' }),
      physiologyToday: () => '2026-09-04', canonicalPhysiologyForAnalytics: project }, name);
    assert.deepEqual(await failed(queryDb(user), 'key', 'TEST'), { generado: false, error: `${errorPrefix}_DB_ERROR` });
  });
}
test('Discovery keeps partial signals separate and never emits ambiguous sleep field', () => {
  const projected = physiology.map(project);
  assert.deepEqual(projected[0], { date: '2026-09-04', hrv_ms: 61, resting_hr_bpm: null, sleep_duration_minutes: 430, sleep_score: 82,
    signal_statuses: { hrv_ms: 'available', resting_hr_bpm: 'missing', sleep_duration_minutes: 'available', sleep_score: 'available' } });
  assert.equal(Object.hasOwn(projected[0], 'sleep'), false);
});
test('celebrations use five canonical valid HRV observations in chronological order and preserve trend rule', async () => {
  let supplied = [40, 42, 45, 44, 50];
  const run = executable(fn('detectarCelebraciones'), { latestCanonicalHrv: async () => supplied, physiologyToday: () => '2026-09-04' }, 'detectarCelebraciones');
  const db = queryDb({ workout_history: [] }, { athlete_events: [] });
  let result = await run(db, 'TEST'); assert.equal(result.find(c => c.tipo === 'recuperacion')?.mensaje.includes('40ms → 50ms'), true);
  supplied = [40, 42, 45, 50]; result = await run(db, 'TEST'); assert.equal(result.some(c => c.tipo === 'recuperacion'), false);
  supplied = [50, 45, 40, 35, 30]; result = await run(db, 'TEST'); assert.equal(result.some(c => c.tipo === 'recuperacion'), false);
  assert.doesNotMatch(fn('detectarCelebraciones').getText(root), /historial_fisiologico|fisioHistory/);
});
test('canonical HRV selector pages through missing/invalid gaps and returns latest five chronologically', async () => {
  const pages = [[snapshot('2026-09-04', [10]), snapshot('2026-09-03', [null])], [snapshot('2026-09-02', [20]), snapshot('2026-09-01', [30])],
    [snapshot('2026-08-30', [40]), snapshot('2026-08-20', [50]), snapshot('2026-08-10', [60])]];
  const options = []; const latest = executable(fn('latestCanonicalHrv'), {
    getCanonicalPhysiologyHistory: async (_db, _user, o) => { options.push(o); return { ok: true, snapshots: pages.shift() || [] }; },
  }, 'latestCanonicalHrv');
  assert.deepEqual(await latest({}, 'TEST', 5, '2026-09-04'), [50, 40, 30, 20, 10]);
  assert.deepEqual(options.map(o => o.toDate), ['2026-09-04', '2026-09-02', '2026-08-31']);
  assert.equal(await executable(fn('latestCanonicalHrv'), { getCanonicalPhysiologyHistory: async () => ({ ok: false, error: 'db_error' }) }, 'latestCanonicalHrv')({}, 'T', 5, '2026-09-04'), null);
});
test('weekly close uses inclusive civil week bounds and explicit canonical fields only for the existing Insight stage', () => {
  const body = branch('close_week').getText(root);
  assert.match(body, /weekStartCierre.*\+ 6 \* 86400000/);
  assert.match(body, /fromDate: weekStartCierre, toDate: weekEndCierre, limit: 7/);
  assert.match(body, /histFisioSemana = physiologyWeek\.snapshots\.map\(canonicalPhysiologyForAnalytics\)/);
  assert.doesNotMatch(body, /historial_fisiologico|\.slice\(-7\)/);
  assert.ok(body.indexOf('validatePlanMutation') < body.indexOf('getCanonicalPhysiologyHistory'));
  const start = '2026-08-31'; const end = new Date(Date.parse(`${start}T00:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10);
  assert.equal(end, '2026-09-06');
});
test('proactive greeting dead physiology selection is removed', () => {
  const body = branch('obtener_saludo_proactivo').getText(root);
  assert.match(body, /select\("ultima_visita"\)/); assert.doesNotMatch(body, /historial_fisiologico/);
});
test('migrated sports analytics contain no objective legacy reader', () => {
  for (const node of [fn('detectarCelebraciones'), fn('ejecutarAthleteResponseEngine'), fn('ejecutarDiscoveryEngine'), branch('close_week')]) {
    assert.doesNotMatch(node.getText(root), /historial_fisiologico|estado_fisiologico\?\.(hrv|rhr|sueno)|from\("physiology_records"\)/);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const modules = new Map();
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function load(path) {
  path = resolve(root, path);
  if (modules.has(path)) return modules.get(path);
  const module = { exports: {} }; modules.set(path, module.exports);
  new Function('require', 'module', 'exports', compile(readFileSync(path, 'utf8')))(name => {
    assert.ok(name.startsWith('.'), 'Reader must not load a network client');
    return load(resolve(dirname(path), name + '.ts'));
  }, module, module.exports);
  return module.exports;
}
const { getCanonicalPhysiologyHistory } = load('lib/physiology/getCanonicalPhysiology.ts');

const routeText = readFileSync(resolve(root, 'app/api/chat/route.ts'), 'utf8');
const route = ts.createSourceFile('route.ts', routeText, ts.ScriptTarget.Latest, true);
function findBranch(action) {
  let value;
  (function visit(n) { if (!value && ts.isIfStatement(n) && n.expression.getText(route) === `action === "${action}"`) value = n.thenStatement; ts.forEachChild(n, visit); })(route);
  assert.ok(value); return value;
}
const branch = findBranch('obtener_physiology_records_recientes');
const TODAY = '2026-09-04';

const groups = [['hrv_ms', 'hrv', 62], ['resting_hr_bpm', 'resting_hr', 48], ['sleep_duration_minutes', 'sleep_duration', 430], ['sleep_score', 'sleep_score', 85]];
const row = fecha => { const r = { user_codigo: 'TEST', fecha };
  for (const [f, stem, v] of groups) { r[f] = v; r[`${stem}_source`] = 'device_measurement'; r[`${stem}_ingested_at`] = '2026-09-04T10:00:00Z'; } return r; };
const ALL = ['2026-09-04', '2026-09-03', '2026-08-31', '2026-08-15', '2026-08-01', '2026-07-31'].map(row);

/** Read-only fake: only from().select().eq().lte().gte().order().limit() exist, so any write/rpc would throw. */
function fakeDb() {
  const calls = [];
  const db = { calls, from(table) {
    const q = { table, filters: [], order: null, limitN: null };
    calls.push(q);
    const chain = { select() { return chain; }, eq(c, v) { q.filters.push(['eq', c, v]); return chain; },
      lte(c, v) { q.filters.push(['lte', c, v]); return chain; }, gte(c, v) { q.filters.push(['gte', c, v]); return chain; },
      order(c, o) { q.order = [c, o]; return chain; },
      limit(n) { q.limitN = n; const lte = q.filters.find(f => f[0] === 'lte')?.[2], gte = q.filters.find(f => f[0] === 'gte')?.[2];
        const data = ALL.filter(r => (!lte || r.fecha <= lte) && (!gte || r.fecha >= gte)).slice(0, n);
        return Promise.resolve({ data, error: null }); } };
    return chain; } };
  return db;
}
const call = (datos, db = fakeDb()) => new Function('codigo', 'datos', 'supabase', 'physiologyToday', 'getCanonicalPhysiologyHistory', 'NextResponse',
  compile(`async function execute() ${branch.getText(route)}`) + '; return execute;')('TEST', datos, db, () => TODAY, getCanonicalPhysiologyHistory,
  { json: (body, init) => ({ body, status: init?.status ?? 200 }) })().then(r => ({ ...r, db }));

test('legacy call without parameters keeps the exact contract (7 most recent up to today, no range key)', async () => {
  for (const datos of [undefined, null, {}, { unrelated: 1 }, 'x', []]) {
    const r = await call(datos);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body), ['ok', 'effectiveDate', 'order', 'records']);
    assert.equal(r.body.order, 'desc'); assert.equal(r.body.effectiveDate, TODAY);
    assert.deepEqual(r.body.records.map(x => x.effectiveDate), ALL.map(x => x.fecha));
    assert.equal(r.db.calls[0].limitN, 7);
    assert.deepEqual(r.db.calls[0].filters, [['eq', 'user_codigo', 'TEST'], ['lte', 'fecha', TODAY]]);
  }
});
test('fromDate/toDate select an inclusive range, descending, same record shape', async () => {
  const legacy = await call(undefined);
  const r = await call({ fromDate: '2026-08-01', toDate: '2026-08-31' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.records.map(x => x.effectiveDate), ['2026-08-31', '2026-08-15', '2026-08-01']);
  assert.deepEqual(Object.keys(r.body.records[0]), Object.keys(legacy.body.records[0]));
  assert.deepEqual(r.body.range, { fromDate: '2026-08-01', toDate: '2026-08-31', limit: 100 });
  assert.deepEqual(r.db.calls[0].filters, [['eq', 'user_codigo', 'TEST'], ['lte', 'fecha', '2026-08-31'], ['gte', 'fecha', '2026-08-01']]);
});
test('a range without limit is not silently cut to 7; toDate defaults to today, fromDate alone is allowed', async () => {
  const r = await call({ fromDate: '2026-07-01' });
  assert.equal(r.body.records.length, 6); assert.equal(r.db.calls[0].limitN, 100);
  assert.equal(r.body.range.toDate, TODAY);
});
test('limit is respected (most recent N) and the safe 1..1000 bounds apply', async () => {
  const two = await call({ limit: 2 });
  assert.deepEqual(two.body.records.map(x => x.effectiveDate), ['2026-09-04', '2026-09-03']); assert.equal(two.db.calls[0].limitN, 2);
  assert.equal((await call({ limit: 1000 })).status, 200);
  for (const limit of [0, 1001, -1, 1.5, '5', null, NaN]) { const r = await call({ limit }); assert.equal(r.status, 400, String(limit)); assert.equal(r.body.error, 'invalid_input'); }
});
test('invalid dates and inverted ranges are rejected with a controlled 400 and no query', async () => {
  const cases = [{ fromDate: '2026-02-30' }, { toDate: '2026-13-01' }, { fromDate: '08/01/2026' }, { toDate: '' }, { fromDate: null },
    { fromDate: 20260801 }, { fromDate: '2026-09-02', toDate: '2026-09-01' }];
  for (const datos of cases) {
    const r = await call(datos);
    assert.equal(r.status, 400, JSON.stringify(datos)); assert.equal(r.body.ok, false); assert.equal(r.body.error, 'invalid_input');
    assert.equal(r.db.calls.length, 0);
  }
});
test('fromDate equal to toDate is valid (single day)', async () => {
  const r = await call({ fromDate: '2026-08-15', toDate: '2026-08-15' });
  assert.equal(r.status, 200); assert.deepEqual(r.body.records.map(x => x.effectiveDate), ['2026-08-15']);
});
test('the action stays read-only: one physiology_records read, no writes, no HealthKit or legacy usage', async () => {
  const r = await call({ fromDate: '2026-08-01', toDate: '2026-08-31', limit: 10 });
  assert.equal(r.db.calls.length, 1); assert.equal(r.db.calls[0].table, 'physiology_records');
  const text = branch.getText(route);
  assert.doesNotMatch(text, /writePhysiology|admit|healthKit|historial_fisiologico|\.insert\(|\.update\(|\.upsert\(|\.rpc\(|weekly_plan/);
  assert.match(text, /getCanonicalPhysiologyHistory/);
  const hk = findBranch('sincronizar_healthkit_real').getText(route);
  assert.match(hk, /syncHealthKit/); assert.doesNotMatch(hk, /fromDate|rangeRequested/);
});

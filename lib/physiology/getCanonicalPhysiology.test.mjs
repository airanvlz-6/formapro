import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const modules = new Map();
function load(path) {
  path = resolve(root, path);
  if (modules.has(path)) return modules.get(path);
  const module = { exports: {} }; modules.set(path, module.exports);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(name.startsWith('.'), 'Reader must not load a network client');
    return load(resolve(dirname(path), name + '.ts'));
  }, module, module.exports);
  return module.exports;
}
const { getCanonicalPhysiology: daily, getCanonicalPhysiologyHistory: history } = load('lib/physiology/getCanonicalPhysiology.ts');
const asOfDate = '2026-09-04';
const options = { asOfDate };
const groups = [['hrv_ms', 'hrv', 'hrv', 62], ['resting_hr_bpm', 'resting_hr', 'restingHr', 48],
  ['sleep_duration_minutes', 'sleep_duration', 'sleepDuration', 430], ['sleep_score', 'sleep_score', 'sleepScore', 85]];
function row(fecha = asOfDate, full = true) {
  const r = { user_codigo: 'TEST', fecha };
  for (const [field, stem, , value] of groups) {
    r[field] = full ? value : null;
    r[`${stem}_source`] = full ? 'device_measurement' : null;
    r[`${stem}_ingested_at`] = full ? '2026-09-04T10:12:30.123456+00:00' : null;
  }
  return r;
}
/** Query-shape/response tests with a read-only fake; no real DB access. */
function database(data, error = null) {
  const calls = [];
  const db = { calls, throwRead: false,
    from(...args) {
      calls.push(['from', ...args]);
      const q = {};
      for (const method of ['select', 'eq', 'lte', 'gte', 'order', 'limit']) q[method] = (...args) => { calls.push([method, ...args]); return q; };
      q.maybeSingle = async () => { calls.push(['maybeSingle']); if (db.throwRead) throw Error('offline'); return { data, error }; };
      q.then = (ok, bad) => (db.throwRead ? Promise.reject(Error('offline')) : Promise.resolve({ data, error })).then(ok, bad);
      return q;
    },
  }; return db;
}

test('full daily snapshot exposes all canonical values and metadata, without renaming units', async () => {
  const raw = row(); const result = await daily(database(raw), 'TEST', options);
  assert.equal(result.ok, true);
  for (const [field, stem, name, value] of groups) assert.deepEqual(result.snapshot[name], {
    status: 'available', value, source: raw[`${stem}_source`], ingestedAt: raw[`${stem}_ingested_at`],
  });
  assert.deepEqual(result.snapshot.completeness, { total: 4, available: 4, missing: 0, invalid: 0, percentAvailable: 100 });
  assert.equal(result.snapshot.effectiveDate, asOfDate); assert.equal(result.snapshot.isToday, true); assert.equal(result.snapshot.ageDays, 0);
});
test('partial row preserves available signals; null triplets are missing', async () => {
  const raw = { ...row(), resting_hr_bpm: null, resting_hr_source: null, resting_hr_ingested_at: null,
    sleep_score: null, sleep_score_source: null, sleep_score_ingested_at: null };
  const { snapshot } = await daily(database(raw), 'TEST', options);
  assert.equal(snapshot.rowPresent, true); assert.equal(snapshot.hrv.status, 'available'); assert.equal(snapshot.sleepDuration.value, 430);
  assert.equal(snapshot.restingHr.status, 'missing'); assert.equal(snapshot.sleepScore.status, 'missing');
  assert.deepEqual(snapshot.completeness, { total: 4, available: 2, missing: 2, invalid: 0, percentAvailable: 50 });
});
test('no row is a missing snapshot for the requested date, distinct from an empty existing row', async () => {
  const absent = await daily(database(null), 'TEST', options);
  const empty = await daily(database(row(asOfDate, false)), 'TEST', options);
  assert.equal(absent.snapshot.rowPresent, false); assert.equal(empty.snapshot.rowPresent, true);
  assert.equal(absent.snapshot.effectiveDate, asOfDate); assert.equal(absent.snapshot.completeness.missing, 4);
});
test('exact user/date predicates; previous day cannot be returned as today', async () => {
  const db = database(row('2026-09-03'));
  const result = await daily(db, 'TEST', options);
  assert.equal(result.error, 'invalid_response'); assert.equal('snapshot' in result, false);
  assert.ok(db.calls.some(c => c[0] === 'eq' && c[1] === 'user_codigo' && c[2] === 'TEST'));
  assert.ok(db.calls.some(c => c[0] === 'eq' && c[1] === 'fecha' && c[2] === asOfDate));
  assert.equal(db.calls.some(c => c[0] === 'limit' || c[0] === 'order'), false);
});
test('historical daily snapshot reports its actual civil age; future date is not today', async () => {
  const result = await daily(database(row('2026-09-01')), 'TEST', { asOfDate, effectiveDate: '2026-09-01' });
  assert.equal(result.snapshot.ageDays, 3); assert.equal(result.snapshot.isToday, false);
  const future = await daily(database(row('2026-09-05')), 'TEST', { asOfDate, effectiveDate: '2026-09-05' });
  assert.equal(future.snapshot.ageDays, -1); assert.equal(future.snapshot.isToday, false);
});
test('civil age is stable across Madrid daylight saving changes', async () => {
  for (const [date, reference] of [['2026-03-28', '2026-03-30'], ['2026-10-24', '2026-10-26']]) {
    const result = await daily(database(row(date)), 'TEST', { effectiveDate: date, asOfDate: reference });
    assert.equal(result.snapshot.ageDays, 2);
  }
});
for (const method of [daily, history]) {
  test(`${method.name}: DB error and thrown read cannot become empty success`, async () => {
    assert.equal((await method(database(null, { message: 'denied' }), 'TEST', options)).error, 'db_error');
    const db = database(null); db.throwRead = true;
    assert.equal((await method(db, 'TEST', options)).error, 'db_error');
  });
  test(`${method.name}: invalid options fail without a query`, async () => {
    for (const input of [null, [], { asOfDate: '2026-02-30' }, { asOfDate: '2026-09-04T00:00:00Z' }, { legacyFallback: true }]) {
      const db = database(null); assert.equal((await method(db, 'TEST', input)).error, 'invalid_input'); assert.equal(db.calls.length, 0);
    }
    assert.equal((await method(database(null), '', options)).error, 'invalid_input');
  });
}
for (const [field, , name] of groups) {
  test(`${field}: invalid numeric values stay isolated to that signal`, async () => {
    const invalids = ['62', NaN, Infinity, -1, ...(field === 'resting_hr_bpm' ? [0] : []),
      ...(field === 'sleep_duration_minutes' ? [2.5] : []), ...(field === 'sleep_score' ? [101] : [])];
    for (const value of invalids) {
      const result = await daily(database({ ...row(), [field]: value }), 'TEST', options);
      assert.equal(result.ok, true); assert.equal(result.snapshot[name].status, 'invalid'); assert.equal(result.snapshot[name].value, null);
      assert.equal(result.snapshot.completeness.available, 3); assert.equal(result.snapshot.completeness.invalid, 1);
    }
  });
}
test('semantic zero values and decimals are preserved, not repaired or replaced', async () => {
  const result = await daily(database({ ...row(), hrv_ms: 0, resting_hr_bpm: 48.5, sleep_duration_minutes: 0, sleep_score: 0 }), 'TEST', options);
  assert.equal(result.snapshot.completeness.available, 4); assert.equal(result.snapshot.restingHr.value, 48.5);
  assert.equal(result.snapshot.sleepDuration.value, 0); assert.equal(result.snapshot.sleepScore.value, 0);
});
for (const [label, change] of [
  ['invalid source', { hrv_source: 'manual_parser' }], ['missing source', { hrv_source: null }],
  ['missing ingestion', { hrv_ingested_at: null }], ['standalone metadata', { hrv_ms: null }],
  ['timestamp without offset', { hrv_ingested_at: '2026-09-04T10:00:00' }],
  ['invalid timestamp date', { hrv_ingested_at: '2026-02-30T10:00:00Z' }],
  ['invalid timestamp hour', { hrv_ingested_at: '2026-09-04T24:00:00Z' }],
]) {
  test(`${label} marks only HRV invalid`, async () => {
    const result = await daily(database({ ...row(), ...change }), 'TEST', options);
    assert.equal(result.snapshot.hrv.status, 'invalid'); assert.equal(result.snapshot.completeness.available, 3);
  });
}
test('missing selected column is an invalid signal; malformed global shape/identity is an error', async () => {
  const raw = row(); delete raw.hrv_source;
  assert.equal((await daily(database(raw), 'TEST', options)).snapshot.hrv.reason, 'missing_canonical_column');
  for (const invalid of [[], 'row', undefined, {}, { ...row(), user_codigo: 'OTHER' }, { ...row(), fecha: '2026-02-30' }]) {
    assert.equal((await daily(database(invalid), 'TEST', options)).error, 'invalid_response');
  }
});
test('history applies inclusive bounds and DESC order before limit, preserving partial rows', async () => {
  const db = database([row(asOfDate), row('2026-09-02', false)]);
  const result = await history(db, 'TEST', { asOfDate, fromDate: '2026-09-01', toDate: asOfDate, limit: 2 });
  assert.equal(result.ok, true); assert.deepEqual(result.snapshots.map(s => s.effectiveDate), [asOfDate, '2026-09-02']);
  assert.equal(result.snapshots[1].completeness.missing, 4); assert.equal(result.snapshots[1].isToday, false);
  assert.deepEqual(db.calls.find(c => c[0] === 'order'), ['order', 'fecha', { ascending: false }]);
  assert.ok(db.calls.findIndex(c => c[0] === 'order') < db.calls.findIndex(c => c[0] === 'limit'));
  assert.deepEqual(db.calls.find(c => c[0] === 'gte'), ['gte', 'fecha', '2026-09-01']);
  assert.deepEqual(db.calls.find(c => c[0] === 'lte'), ['lte', 'fecha', asOfDate]);
});
test('history never calls its newest historical row today or synthesizes absent dates', async () => {
  const result = await history(database([row('2026-09-02'), row('2026-08-20')]), 'TEST', options);
  assert.deepEqual(result.snapshots.map(s => s.isToday), [false, false]);
  assert.equal(result.snapshots.length, 2); assert.equal(result.snapshots[0].ageDays, 2);
});
test('history isolates an invalid signal within its date and preserves other rows', async () => {
  const result = await history(database([{ ...row(), resting_hr_source: null }, row('2026-09-03')]), 'TEST', options);
  assert.equal(result.ok, true); assert.equal(result.snapshots[0].restingHr.status, 'invalid');
  assert.equal(result.snapshots[0].hrv.status, 'available'); assert.equal(result.snapshots[1].completeness.available, 4);
});
test('all six canonical sources are accepted without precedence or freshness interpretation', async () => {
  for (const source of ['device_measurement', 'explicit_user_report', 'deterministic_extraction',
    'llm_conversation_extraction', 'llm_vision_extraction', 'confirmed_correction']) {
    const result = await daily(database({ ...row(), hrv_source: source }), 'TEST', options);
    assert.equal(result.snapshot.hrv.source, source); assert.equal(result.snapshot.hrv.status, 'available');
    assert.equal('fresh' in result.snapshot, false); assert.equal('stale' in result.snapshot, false);
  }
});
test('empty history is success; null data is malformed, not empty', async () => {
  const result = await history(database([]), 'TEST', options);
  assert.equal(result.ok, true); assert.deepEqual(result.snapshots, []); assert.equal(result.limit, 100); assert.equal(result.toDate, asOfDate);
  assert.equal((await history(database(null), 'TEST', options)).error, 'invalid_response');
});
test('history rejects duplicate dates, unexpected order, identity/range mismatch and over-limit response', async () => {
  for (const rows of [[row(), row()], [row('2026-09-01'), row()], [row('2026-09-05')],
    [{ ...row(), user_codigo: 'OTHER' }], [row('2026-08-01')]]) {
    assert.equal((await history(database(rows), 'TEST', { asOfDate, fromDate: '2026-09-01' })).error, 'invalid_response');
  }
  assert.equal((await history(database([row(), row('2026-09-03')]), 'TEST', { asOfDate, limit: 1 })).error, 'invalid_response');
});
test('history rejects invalid limit or reversed range without querying', async () => {
  for (const opts of [{ limit: 0 }, { limit: 1001 }, { limit: 2.5 }, { limit: '2' }, { fromDate: '2026-09-05', toDate: asOfDate }]) {
    const db = database([]); assert.equal((await history(db, 'TEST', { asOfDate, ...opts })).error, 'invalid_input'); assert.equal(db.calls.length, 0);
  }
});
test('all legacy values/JSON are ignored by both readers; no fallback query', async () => {
  const legacy = { ...row(asOfDate, false), hrv: 99, rhr: 44, sueno: 100,
    estado_fisiologico: { hrv: 99 }, historial_fisiologico: [{ fecha: asOfDate, hrv: 99 }] };
  for (const [method, data] of [[daily, legacy], [history, [legacy]]]) {
    const db = database(data); const result = await method(db, 'TEST', options);
    const projected = result.snapshot || result.snapshots[0];
    assert.equal(projected.completeness.missing, 4);
    assert.deepEqual(db.calls.filter(c => c[0] === 'from'), [['from', 'physiology_records']]);
    const selected = db.calls.find(c => c[0] === 'select')[1].split(',');
    assert.equal(selected.length, 14);
    for (const name of ['hrv', 'rhr', 'sueno', 'estado_fisiologico', 'historial_fisiologico', 'source', 'updated_at']) assert.equal(selected.includes(name), false);
  }
});
test('reader has no write, RPC or legacy fallback primitive', () => {
  const source = readFileSync(resolve(root, 'lib/physiology/getCanonicalPhysiology.ts'), 'utf8');
  assert.doesNotMatch(source, /\.(insert|upsert|update|delete|rpc)\s*\(/);
  assert.doesNotMatch(source, /estado_fisiologico|historial_fisiologico|\.select\(['"]\*/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cache = new Map();
function load(path) {
  path = resolve(root, path);
  if (cache.has(path)) return cache.get(path);
  const module = { exports: {} }; cache.set(path, module.exports);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => load(resolve(dirname(path), name + '.ts')), module, module.exports);
  return module.exports;
}
const { syncHealthKit } = load('lib/physiology/healthKit.ts');
const { prepareCanonicalReadiness } = load('lib/readiness/prepareCanonicalReadiness.ts');
const now = new Date('2026-10-09T12:00:00Z');
const hrv = { value: 62, type: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', unit: 'ms', startDate: '2026-10-09T06:00:00Z', endDate: '2026-10-09T06:01:00Z' };
const rhr = { ...hrv, type: 'HKQuantityTypeIdentifierRestingHeartRate', unit: 'count/min', value: 48 };
const sleep = { durationMinutes: 420, effectiveDate: '2026-10-09', startDate: '2026-10-08T23:00:00Z', endDate: '2026-10-09T06:00:00Z' };
const stems = { hrv_ms: 'hrv', resting_hr_bpm: 'resting_hr', sleep_duration_minutes: 'sleep_duration', sleep_score: 'sleep_score' };
/** RPC contract fixture, not a live SQL deployment test. Rows feed the real canonical readiness reader. */
function database() {
  const rows = new Map(), calls = [], writes = [];
  const user = { codigo: 'TEST', prescriptionParameters: { restingHrReference: 55 }, estado_fisiologico: {}, historial_fisiologico: [] };
  const db = { rows, calls, writes, user, fail: null,
    async rpc(name, args) {
      calls.push({ name, args });
      if (args.p_signal === db.fail) return { error: {} };
      let row = rows.get(args.p_fecha);
      if (!row) {
        row = { user_codigo: args.p_user_codigo, fecha: args.p_fecha };
        for (const [field, stem] of Object.entries(stems)) Object.assign(row, { [field]: null, [stem + '_source']: null, [stem + '_ingested_at']: null });
        rows.set(args.p_fecha, row);
      }
      const field = args.p_signal, stem = stems[field];
      const status = row[field] === null ? 'accepted' : row[field] === args.p_value ? 'no_op' : 'conflict';
      if (status === 'accepted') Object.assign(row, { [field]: args.p_value, [stem + '_source']: args.p_source, [stem + '_ingested_at']: now.toISOString() });
      return { data: { signal: field, status, current: { value: row[field], source: row[stem + '_source'], ingested_at: row[stem + '_ingested_at'] } } };
    },
    from(table) {
      const filters = []; let values, count = 1000;
      const q = { select() { return q; }, update(v) { values = v; writes.push({ table, values: v }); return q; },
        eq(k, v) { filters.push(r => r[k] === v); return q; }, lte(k, v) { filters.push(r => r[k] <= v); return q; },
        gte(k, v) { filters.push(r => r[k] >= v); return q; }, order() { return q; }, limit(n) { count = n; return q; } };
      const result = single => {
        const matches = (table === 'usuarios' ? [user] : [...rows.values()]).filter(r => filters.every(f => f(r))).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, count);
        if (values) matches.forEach(r => Object.assign(r, values));
        return { data: single ? structuredClone(matches[0] ?? null) : structuredClone(matches), error: null };
      };
      q.single = q.maybeSingle = async () => result(true);
      q.then = (ok, bad) => Promise.resolve(result(false)).then(ok, bad);
      return q;
    },
  }; return db;
}
const run = (db, payload) => syncHealthKit(db, 'TEST', payload, now);
test('B1/B3 HRV SDNN ms persisted on sample Madrid date, source is server-owned', async () => {
  const db = database(); const result = await run(db, { hrv: { ...hrv, startDate: '2026-10-07T22:30:00Z', endDate: '2026-10-07T22:31:00Z', source: 'confirmed_correction' } });
  assert.equal(result.signals.hrv.status, 'accepted'); assert.equal(result.signals.hrv.effectiveDate, '2026-10-08');
  assert.equal(db.rows.get('2026-10-08').hrv_ms, 62);
  assert.equal(db.calls[0].args.p_source, 'device_measurement'); assert.equal(db.calls[0].args.p_operation, 'observe');
});
test('B2 HRV wrong unit and semantic rejected independently', async () => {
  for (const extra of [{ unit: 's' }, { type: 'RMSSD' }, { value: 0 }, { value: Infinity }, { value: '62' }]) {
    const db = database(); const r = await run(db, { hrv: { ...hrv, ...extra } });
    assert.equal(r.signals.hrv.status, 'rejected'); assert.equal(db.calls.length, 0);
  }
});
test('B4/B5/B6 RHR verified count/min or bpm only; never changes profile reference', async () => {
  for (const unit of ['count/min', 'bpm']) {
    const db = database(); assert.equal((await run(db, { rhr: { ...rhr, unit } })).signals.rhr.status, 'accepted');
    assert.equal(db.rows.get('2026-10-09').resting_hr_bpm, 48);
    assert.deepEqual(db.user.prescriptionParameters, { restingHrReference: 55 });
    assert.ok(db.writes.every(w => Object.keys(w.values).every(k => ['rhr', 'estado_fisiologico', 'historial_fisiologico'].includes(k))));
  }
  for (const extra of [{ unit: 'count/s' }, { unit: ['count/min'] }, { type: 'HKQuantityTypeIdentifierHeartRate' }, { value: 0 }]) {
    const db = database(); assert.equal((await run(db, { rhr: { ...rhr, ...extra } })).signals.rhr.status, 'rejected'); assert.equal(db.calls.length, 0);
  }
});
test('B7 sleep date is preserved, timestamp accepted, no invented score', async () => {
  const db = database(); const result = await run(db, { sleep: { durationMinutes: 480, effectiveDate: '2026-10-08T06:00:00Z' } });
  assert.equal(result.signals.sleep.effectiveDate, '2026-10-08');
  assert.equal(db.rows.get('2026-10-08').sleep_duration_minutes, 480); assert.equal(db.rows.get('2026-10-08').sleep_score, null);
  assert.equal(db.rows.has('2026-10-09'), false);
});
test('B8 mixed payload partially persists and reports rejected RHR', async () => {
  const db = database(); const result = await run(db, { hrv, rhr: { ...rhr, unit: 'bad' }, sleep });
  assert.equal(result.ok, false); assert.equal(result.sincronizado, true);
  assert.deepEqual(Object.values(result.signals).map(r => r.status), ['accepted', 'rejected', 'accepted']);
  assert.equal(db.rows.get('2026-10-09').resting_hr_bpm, null);
});
test('B9 null signals are ignored; workouts and profile input never reach authority', async () => {
  const db = database(); const r = await run(db, { hrv: null, rhr: null, sleep: null, ultimoEntrenamiento: {}, restingHrReference: 1 });
  assert.equal(r.ok, true); assert.equal(r.sincronizado, false); assert.equal(db.calls.length, 0); assert.equal(db.writes.length, 0);
});
test('B10 persisted canonical HRV/RHR/duration reach real readiness preparation', async () => {
  const db = database(); await run(db, { hrv, rhr, sleep });
  const result = await prepareCanonicalReadiness(db, 'TEST', '2026-10-09');
  assert.equal(result.ok, true); assert.deepEqual(result.points, [{ fecha: '2026-10-09', hrv: 62, rhr: 48, duracionSueno: 420 }]);
  assert.deepEqual(result.physiology.todaySignals, { hrv: 'available', rhr: 'available', duracionSueno: 'available' });
  const tomorrow = await prepareCanonicalReadiness(db, 'TEST', '2026-10-10');
  assert.deepEqual(tomorrow.points, []);
});
test('B11 legacy supports only sleep hours with explicit date warning; bare HRV/RHR rejected', async () => {
  const db = database(); const r = await run(db, { suenoHoras: 8, hrv: 60, rhr: 45 });
  assert.equal(r.signals.sleep.status, 'accepted'); assert.equal(r.signals.hrv.status, 'rejected'); assert.equal(r.signals.rhr.status, 'rejected');
  assert.ok(r.warnings.includes('legacy_sleep_date_assumed_today')); assert.equal(db.rows.get('2026-10-09').sleep_duration_minutes, 480);
});
test('B12 replay no_op preserves metadata; new value conflicts without overwrite', async () => {
  const db = database(); await run(db, { hrv }); const before = structuredClone(db.rows.get('2026-10-09'));
  assert.equal((await run(db, { hrv })).signals.hrv.status, 'no_op');
  const newer = await run(db, { hrv: { ...hrv, value: 70, startDate: '2026-10-09T07:00:00Z', endDate: '2026-10-09T07:01:00Z' } });
  assert.equal(newer.signals.hrv.status, 'conflict'); assert.equal(newer.signals.hrv.retryable, false);
  assert.deepEqual(db.rows.get('2026-10-09'), before);
});
test('invalid/future timestamps, sleep date mismatch and out-of-range duration isolated', async () => {
  for (const extra of [{ startDate: '2026-02-30T06:00:00Z' }, { startDate: '2026-10-09T06:00:00' },
    { startDate: '2026-10-10T06:00:00Z', endDate: '2026-10-10T06:01:00Z' }, { endDate: '2026-10-08T00:00:00Z' }]) {
    const db = database(); const r = await run(db, { hrv: { ...hrv, ...extra }, rhr });
    assert.equal(r.signals.hrv.status, 'rejected'); assert.equal(r.signals.rhr.status, 'accepted');
  }
  for (const extra of [{ durationMinutes: 1441 }, { durationMinutes: -1 }, { durationMinutes: 2.5 }, { effectiveDate: '2026-10-08' }, { effectiveDate: '2026-10-09T23:00:00Z', endDate: undefined }]) {
    assert.equal((await run(database(), { sleep: { ...sleep, ...extra } })).signals.sleep.status, 'rejected');
  }
});
test('transient failure is per-signal retryable; others persist', async () => {
  const db = database(); db.fail = 'hrv_ms';
  const r = await run(db, { hrv, sleep });
  assert.equal(r.signals.hrv.retryable, true); assert.equal(r.signals.sleep.status, 'accepted');
  db.fail = null; assert.equal((await run(db, { hrv })).signals.hrv.status, 'accepted');
});

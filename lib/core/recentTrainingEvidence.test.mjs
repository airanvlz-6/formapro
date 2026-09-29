import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { sportsRuntime, plain, compile } from '../sports/trainingContractTestRuntime.mjs';

const runtime = sportsRuntime();
const { loadRecentTrainingEvidence: load } = runtime('../core/recentTrainingEvidence');
const { sealRunningExecution } = runtime('../execution/runningExecutionStore');
const date = '2026-09-29';
const session = (extra = {}) => ({ dia: 'lunes', session_id: 'run-1', tipo: 'carrera', titulo: '18 km long run',
  duracion_min: 100, structuredPrescription: { proposal: { stimulusId: 'long_run', blocks: [{ distanceMeters: 18000 }] } }, ...extra });
function database({ sessions = [session()], history = [], modern = [], modifications = [], plans, failures = {} } = {}) {
  const tables = { weekly_plan: plans ?? [{ week_start: '2026-09-28', sessions }],
    usuarios: { workout_history: history }, running_execution_records: modern, session_modification_events: modifications };
  const calls = [];
  return { tables, calls, from(table) {
    const call = { table, filters: [] }; calls.push(call);
    const q = {
      select(fields) { call.fields = fields; return q; },
      eq(key, value) { call.filters.push(['eq', key, value]); return q; },
      gte(key, value) { call.filters.push(['gte', key, value]); return q; },
      lte(key, value) { call.filters.push(['lte', key, value]); return q; },
      order(key, options) { call.order = [key, options]; return q; },
      limit(n) { call.limit = n; return q; }, maybeSingle() { return q; },
      then(yes, no) {
        if (failures[table] === 'throw') return Promise.reject(Error('transport')).then(yes, no);
        let data = tables[table];
        if (Array.isArray(data)) {
          data = data.filter(r => call.filters.every(([op, key, v]) => op === 'eq' || (op === 'gte' ? r[key] >= v : r[key] <= v)));
          data = data.slice(0, call.limit);
        }
        return Promise.resolve({ data, error: failures[table] ? { message: 'failure' } : null }).then(yes, no);
      },
    }; return q;
  } };
}
const run = async (options) => plain(await load(database(options), 'athlete', date));
const modern = (extra = {}, athlete = 'athlete') => plain(sealRunningExecution(athlete, {
  sourceActivityId: 'actual-1', occurredAt: '2026-09-28', planSessionId: 'run-1', completeness: 'PARTIAL',
  quantities: { totalDistance: { value: 7, unit: 'kilometers' } }, ...extra }, date));

test('A/B: 18 km prescribed and completed flag never supply executed quantities or full completion', async () => {
  const p = await run({ sessions: [session({ completada: true })] });
  const i = p.items[0];
  assert.equal(i.prescribed.state, 'PRESCRIBED');
  assert.equal(i.prescribed.title, '18 km long run');
  assert.equal(i.state, 'REPORTED_EXECUTED');
  assert.equal(i.completeness, 'UNKNOWN');
  assert.equal(i.discipline, null);
  assert.deepEqual(i.quantities, {});
  assert.equal(JSON.stringify(p).includes('18000'), false);
});

test('C/D: planned is not executed, future detail is excluded, missing is not skipped', async () => {
  const p = await run({ sessions: [session(), session({ dia: 'miercoles', session_id: 'future' }),
    { dia: 'martes', tipo: 'sin_registrar' }] });
  assert.equal(p.items.length, 2);
  assert.ok(p.items.some(i => i.state === 'PLANNED_ONLY'));
  assert.ok(p.items.some(i => i.state === 'NO_EXECUTION_RECORDED'));
  assert.ok(p.items.every(i => i.state !== 'REPORTED_EXECUTED'));
  assert.doesNotMatch(JSON.stringify(p), /SKIPPED/);
});

test('E: modern partial/modified/abandoned are preserved with verified actual quantities only', async () => {
  for (const completeness of ['PARTIAL', 'MODIFIED', 'ABANDONED', 'FULL']) {
    const p = await run({ modern: [modern({ completeness })] });
    const i = p.items.find(i => i.source === 'running_execution_records');
    assert.equal(i.completeness, completeness);
    assert.equal(i.quantities.distance.value, 7000);
    assert.equal(i.quantities.distance.unit, 'meters');
    assert.equal(i.quantities.duration, undefined);
    assert.equal(i.association, 'REPORTED_PLAN_ASSOCIATION');
  }
});

test('chat execution and responses preserve actual discipline, quantity provenance, zero and modifications', async () => {
  const p = await run({ sessions: [session({ completada: true, modificado: true, motivo_modificacion: 'changed work',
    chatExecutionEvidence: [
      { id: 'report', kind: 'PERFORMED', source: 'athlete_report', executionDate: '2026-09-28', discipline: 'box', quote: 'did skill',
        reportedExecution: { description: 'actual skill work', durationMinutes: 0, rpe: 0 }, responseQuotes: ['felt fine'] },
      { id: 'response', kind: 'RESPONSE', source: 'athlete_report', executionDate: '2026-09-28', quote: 'sore next day' },
    ] })], modifications: [{ id: 'm', week_start: '2026-09-28', dia: 'lunes', reason_code: 'TIME', trigger_type: 'athlete_request' }] });
  const i = p.items.find(i => i.sourceIdentity === 'report');
  assert.equal(i.discipline, 'box'); assert.equal(i.quantities.duration.value, 0); assert.equal(i.quantities.rpe.value, 0);
  assert.match(i.quantities.duration.source, /reportedExecution.durationMinutes/);
  assert.deepEqual(i.responses, ['felt fine']);
  assert.equal(p.items.find(i => i.sourceIdentity === 'response').state, 'UNKNOWN');
  assert.equal(p.items.find(i => i.sourceIdentity === 'm').state, 'UNKNOWN');
  assert.equal(p.items.find(i => i.source === 'weekly_plan').modification.type, 'PRESCRIPTION_MODIFIED');
});

test('F: external reports never complete Forge and heterogeneous legacy does not gain reliable quantities', async () => {
  const p = await run({ history: [
    { fecha: '2026-09-28', tipo: 'box', descripcion: 'external conditioning', source: 'coach_first_external_report', external: true,
      operationId: 'external-1', duracion: 45, intensidad_percibida: 7 },
    { fecha: '2026-09-28', tipo: 'carrera_larga', workout_id: 'run-1', duracion: 90, sensacion: 'buena' },
  ] });
  const e = p.items.find(i => i.sourceIdentity === 'external-1');
  assert.equal(e.association, 'EXTERNAL'); assert.equal(e.quantities.duration.value, 45);
  assert.equal(e.state, 'REPORTED_EXECUTED');
  const old = p.items.find(i => i.confidence === 'LEGACY_UNVERIFIED');
  assert.equal(old.state, 'UNKNOWN'); assert.deepEqual(old.quantities, {}); assert.deepEqual(old.responses, []);
  assert.equal(p.items.find(i => i.source === 'weekly_plan').state, 'PLANNED_ONLY');
});

test('G: duplicates/overlap remain visible, no session totals and contradictory versions fail closed across window', async () => {
  const record = modern();
  let p = await run({ modern: [record, record] });
  assert.equal(p.items.filter(i => i.source === 'running_execution_records').length, 1);
  assert.ok(p.coverage.limitations.includes('IDENTICAL_RUNNING_RECORD_COLLAPSED'));
  assert.ok(p.overlaps.some(o => o.reason === 'SHARED_REFERENCE'));
  assert.ok(p.overlaps.some(o => o.reason === 'POSSIBLE_SAME_DAY'));
  p = await run({ modern: [record, modern({ occurredAt: '2026-08-01' })] });
  const i = p.items.find(i => i.source === 'running_execution_records');
  assert.equal(i.state, 'UNKNOWN'); assert.deepEqual(i.quantities, {});
  assert.ok(i.uncertainty.includes('CONFLICTING_EXECUTION_VERSIONS'));
  assert.doesNotMatch(JSON.stringify(p), /executedSessions|frequency|totalLoad/);
});

test('H: inclusive 28 civil days, intersecting fifth week, Canary timestamps, and excluded unknown dates', async () => {
  const p = await run({ plans: [
    { week_start: '2026-08-31', sessions: [session({ dia: 'martes' }), session({ dia: 'miercoles' })] },
    { week_start: '2026-09-28', sessions: [session({ dia: 'martes' }), session({ dia: 'miercoles' })] },
  ], history: [{ fecha: '2026-09-01T23:30:00Z', tipo: 'box' }, { fecha: '2026-02-30', tipo: 'box' }] });
  assert.equal(p.coverage.windowStart, '2026-09-02'); assert.equal(p.coverage.windowEnd, date);
  assert.deepEqual(p.items.map(i => i.date).sort(), ['2026-09-02', '2026-09-02', date]);
  assert.ok(p.coverage.limitations.includes('INVALID_DATE:usuarios.workout_history'));
  assert.deepEqual(p.coverage.weeksFound, ['2026-08-31', '2026-09-28']);
});

test('source failures, bad signatures, wrong athletes, malformed data and read caps remain visible', async () => {
  let p = await run({ failures: { weekly_plan: 'throw', usuarios: true } });
  assert.equal(p.coverage.sourceFailures.length, 2);
  for (const record of [{ ...modern(), signature: 'bad' }, modern({}, 'other')]) {
    p = await run({ modern: [record] });
    assert.equal(p.coverage.sourceFailures[0].reason, 'INTEGRITY_INVALID');
    assert.ok(!p.items.some(i => i.source === 'running_execution_records'));
  }
  p = await run({ modern: Array(1001).fill(modern()) });
  assert.equal(p.coverage.sourceFailures[0].reason, 'SOURCE_READ_CAP_EXCEEDED');
  p = await run({ history: 'malformed' });
  assert.equal(p.coverage.sourceFailures[0].reason, 'INVALID_STORED_DATA');
});

test('empty weeks are distinguishable from absent weeks and never prove no training', async () => {
  const empty = await run({ sessions: [] }), absent = await run({ plans: [] });
  assert.deepEqual(empty.items, []); assert.deepEqual(absent.items, []);
  assert.deepEqual(empty.coverage.weeksFound, ['2026-09-28']); assert.deepEqual(absent.coverage.weeksFound, []);
  assert.ok(absent.coverage.limitations.includes('MISSING_RECORD_IS_NOT_NO_TRAINING'));
});

test('bounded payload marks omitted detail and text truncation, stays serializable and never writes', async () => {
  const db = database({ history: Array.from({ length: 205 }, (_, n) => ({ fecha: date, workout_id: `w-${n}`, notas: 'x'.repeat(900) })) });
  const before = plain(db.tables), p = plain(await load(db, 'athlete', date));
  assert.equal(p.items.length, 200); assert.equal(p.coverage.omittedItems, 6);
  assert.ok(p.items.some(i => i.uncertainty.includes('TEXT_TRUNCATED')));
  assert.deepEqual(db.tables, before);
  assert.ok(db.calls.every(c => c.filters.some(([op, key, v]) => op === 'eq' && ['codigo', 'user_codigo'].includes(key) && v === 'athlete')));
  assert.deepEqual(p, JSON.parse(JSON.stringify(p)));
});

test('I: transitive runtime dependencies contain only factual integrity and node crypto', () => {
  const visited = new Set();
  function walk(file) {
    file = resolve(file); if (visited.has(file)) return; visited.add(file);
    for (const [, dependency] of compile(readFileSync(file, 'utf8')).matchAll(/require\("([^"]+)"\)/g)) {
      if (dependency.startsWith('.')) walk(resolve(dirname(file), dependency + '.ts'));
      else assert.equal(dependency, 'node:crypto');
    }
  }
  walk('lib/core/recentTrainingEvidence.ts');
  assert.deepEqual([...visited].map(f => relative(resolve('lib'), f).replaceAll('\\', '/')).sort(),
    ['core/recentTrainingEvidence.ts', 'execution/executionIntegrity.ts']);
});

test('invalid identity/reference dates fail before reading', async () => {
  const db = database();
  await assert.rejects(load(db, '', date), /INVALID_INPUT/);
  await assert.rejects(load(db, 'athlete', '2026-02-30'), /INVALID_INPUT/);
  assert.equal(db.calls.length, 0);
});

test('execution date inside window survives a different out-of-window slot date with explicit uncertainty', async () => {
  const p = await run({ plans: [{ week_start: '2026-08-31', sessions: [session({ dia: 'martes',
    chatExecutionEvidence: [{ id: 'moved', source: 'athlete_report', kind: 'PERFORMED', executionDate: '2026-09-02',
      discipline: 'carrera', quote: 'ran today' }] })] }] });
  assert.equal(p.items.length, 1);
  assert.equal(p.items[0].date, '2026-09-02');
  assert.ok(p.items[0].uncertainty.includes('PLAN_DATE_MISMATCH'));
});

test('missing verification key is a visible failed source, never trusted execution', async () => {
  const isolated = sportsRuntime({ process: { env: {} } })('../core/recentTrainingEvidence');
  const p = plain(await isolated.loadRecentTrainingEvidence(database({ modern: [modern()] }), 'athlete', date));
  assert.equal(p.coverage.sourceFailures[0].reason, 'VERIFICATION_UNAVAILABLE');
  assert.ok(!p.items.some(i => i.source === 'running_execution_records'));
});

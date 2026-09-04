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
    assert.ok(name.startsWith('.')); return load(resolve(dirname(path), name + '.ts'));
  }, module, module.exports);
  return module.exports;
}
const { prepareCanonicalReadiness: prepare } = load('lib/readiness/prepareCanonicalReadiness.ts');
const { calcularReadiness: calculate, scoreAForgeState, combinarConCheckinSubjetivo } = load('lib/readiness/readinessEngine.ts');
const { calcularBaselinePersonal: baseline, compararConBaseline: compare } = load('lib/readiness/personalBaselineEngine.ts');
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
      if (table !== 'physiology_records') return { data: table === 'usuarios' ? { perfil: { dias: '4' }, workout_history: [] }
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
const score = p => calculate(p.points, 0.5, p.baselines);

test('exact today maps canonical HRV/RHR/minutes; ignores legacy and sleep score', async () => {
  const p = await run([row(), ...history()]);
  assert.equal(p.ok, true);
  assert.deepEqual(p.points, [{ fecha: today, hrv: 60, rhr: 50, duracionSueno: 420 }]);
  assert.equal(score(p).score, 70); assert.equal(scoreAForgeState(score(p).score), 'MODERATE');
});
test('yesterday is never promoted; absent today follows existing absent-input policy', async () => {
  const p = await run(history());
  assert.deepEqual(p.points, []); assert.equal(p.physiology.todayRowPresent, false);
  assert.equal(p.physiology.baselineCounts.hrv, 28); assert.equal(score(p).score, null);
});
test('partial today retains available signals, missing does not become zero', async () => {
  const p = await run([row(0, [60, null, 420]), ...history()]);
  assert.equal(p.points[0].rhr, null); assert.equal(p.physiology.todaySignals.rhr, 'missing');
  assert.equal(score(p).contribuyentes.rhr, null); assert.equal(score(p).score, 70);
});
test('invalid today signal is isolated from other available signals', async () => {
  const p = await run([{ ...row(), hrv_source: 'unknown' }, ...history()]);
  assert.equal(p.points[0].hrv, null); assert.equal(p.physiology.todaySignals.hrv, 'invalid');
  assert.equal(score(p).contribuyentes.hrv, null); assert.notEqual(score(p).contribuyentes.rhr, null);
});
test('sleep score and legacy data cannot supply missing canonical duration or baseline', async () => {
  const p = await run(Array.from({ length: 35 }, (_, i) => row(i, [60, 50, null, 100])));
  assert.equal(p.points[0].duracionSueno, null); assert.equal(p.physiology.baselineCounts.duracionSueno, 0);
  assert.equal(score(p).estado, 'BUILDING_BASELINE'); assert.equal(score(p).score, null);
});
test('newest 28 valid observations per signal span different actual dates and paginated gaps', async () => {
  const rows = Array.from({ length: 100 }, (_, i) => row((i + 1) * 3,
    [i % 3 === 0 ? i : null, i % 3 === 1 ? 50 + i : null, i % 3 === 2 ? 400 + i : null]));
  const db = database([row(), ...rows], { pageCap: 10 });
  const p = await prepare(db, 'TEST', today);
  for (const [metric, index] of [['hrv', 0], ['rhr', 1], ['duracionSueno', 2]]) {
    const expected = rows.filter((_, i) => i % 3 === index).slice(0, 28);
    assert.deepEqual(p.observations[metric].map(r => r.fecha), expected.map(r => r.fecha));
    assert.equal(p.physiology.baselineCounts[metric], 28);
    assert.ok(p.observations[metric].every(r => r.fecha < today));
  }
  assert.equal(p.observations.hrv[0].hrv, 0); // Valid canonical zero is a real HRV sample.
  assert.ok(db.calls.length > 2);
});
test('invalid historical signals excluded, missing not counted, other signals preserved', async () => {
  const p = await run([row(), { ...row(1), hrv_ms: -1 }, row(2, [null, 50, 420]), ...history(30).slice(2)]);
  assert.equal(p.physiology.invalidHistoricalSignals.hrv, 1);
  assert.equal(p.observations.hrv[0].fecha, date(3));
  assert.equal(p.observations.rhr[0].fecha, date(1));
  assert.equal(p.physiology.baselineCounts.hrv, 28);
});
for (const [n, confidence, phase] of [[6, 'insuficiente', 'BUILDING_BASELINE'], [7, 'aprendiendo', 'EARLY_READINESS'], [27, 'aprendiendo', 'EARLY_READINESS'], [28, 'estable', 'READY']]) {
  test(`baseline confidence threshold preserved at ${n} observations`, async () => {
    const p = await run([row(), ...history(n)]);
    assert.equal(score(p).nivelConfianza, confidence); assert.equal(score(p).estado, phase);
    assert.equal(p.physiology.insufficientBaseline, n < 7);
    assert.equal(score(p).score, n < 7 ? null : 70);
  });
}
test('no canonical data distinguishable from insufficient nonempty history', async () => {
  const absent = await run([]); const insufficient = await run([row()]);
  assert.equal(absent.physiology.noCanonicalData, true);
  assert.equal(insufficient.physiology.noCanonicalData, false);
  assert.equal(insufficient.physiology.insufficientBaseline, true);
});
test('existing all-missing-today behavior remains frequency-only with sufficient baseline', async () => {
  const p = await run([row(0, []), ...history()]);
  assert.equal(score(p).score, 70); assert.equal(score(p).dataCompleteness, 0);
  assert.deepEqual(score(p).missingSignals, ['hrv', 'rhr', 'duracionSueno']);
});
for (const stage of ['today', 'history']) for (const kind of ['error', 'invalid']) {
  test(`${stage} ${kind} aborts preparation, never becomes low readiness`, async () => {
    const p = await run([row()], { [kind]: stage });
    assert.equal(p.ok, false); assert.equal(p.error, kind === 'error' ? 'db_error' : 'invalid_response');
    assert.equal('points' in p, false);
  });
}
test('equivalent complete input preserves score, contributors, labels, weights and frequency', async () => {
  const rows = [row(0, [70, 45, 480]), ...Array.from({ length: 28 }, (_, i) => row(i + 1, i % 2 ? [60, 50, 420] : [50, 60, 360]))];
  const p = await run(rows);
  const oldShape = rows.map(r => ({ fecha: r.fecha, hrv: r.hrv_ms, rhr: r.resting_hr_bpm, duracionSueno: r.sleep_duration_minutes }));
  for (const frequency of [0.2, 0.4, 0.5, 0.75, 0.8]) {
    assert.deepEqual(calculate(p.points, frequency, p.baselines), calculate(oldShape, frequency));
  }
  assert.equal(score(p).score, 94); assert.equal(scoreAForgeState(score(p).score), 'READY');
  assert.deepEqual([null, 39, 40, 59, 60, 79, 80, 100].map(scoreAForgeState), [null, 'RESET', 'RECOVER', 'RECOVER', 'MODERATE', 'MODERATE', 'READY', 'READY']);
});
test('homogeneous sleep hours/minutes preserves Z, direction, relative change including rounding', () => {
  for (const [hours, current] of [[[6, 8], 9], [[6.5, 7.5], 7.2]]) {
    const points = Array.from({ length: 28 }, (_, i) => ({ fecha: date(i + 1), hrv: null, rhr: null, duracionSueno: hours[i % 2] }));
    const a = compare(current, baseline(points, 'duracionSueno'));
    const b = compare(current * 60, baseline(points.map(p => ({ ...p, duracionSueno: p.duracionSueno * 60 })), 'duracionSueno'));
    assert.ok(Math.abs(a.desviacionZ - b.desviacionZ) <= 0.01);
    assert.equal(a.direccion, b.direccion); assert.equal(a.porcentajeVsBaseline, b.porcentajeVsBaseline);
  }
});

// Extract the actual action branches by AST; execute their production bodies without Next/network.
const route = ts.createSourceFile('route.ts', readFileSync(resolve(root, 'app/api/chat/route.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
function branch(action) {
  const found = [];
  function visit(node) {
    if (ts.isIfStatement(node) && ts.isBinaryExpression(node.expression) && node.expression.left.getText(route) === 'action'
      && ts.isStringLiteral(node.expression.right) && node.expression.right.text === action) found.push(node.thenStatement);
    ts.forEachChild(node, visit);
  } visit(route); assert.equal(found.length, 1); return found[0].getText(route);
}
async function endpoint(action, db, preparation = (db, user) => prepare(db, user, today)) {
  const names = ['supabase', 'codigo', 'prepareCanonicalReadiness', 'calcularReadiness', 'scoreAForgeState', 'combinarConCheckinSubjetivo', 'calcularFrecuenciaRealRelativa', 'evaluarRelevanciaContextual', 'NextResponse'];
  const code = ts.transpileModule(`async function invoke(${names.join(',')}) ${branch(action)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(code + '; return invoke;')()(db, 'TEST', preparation, calculate, scoreAForgeState, combinarConCheckinSubjetivo,
    () => 0.5, () => ({ nivel: 'ninguno', mensaje: null, ofrecerRevision: false }), { json: (body, init) => ({ body, status: init?.status ?? 200 }) });
}
test('both actual endpoints share canonical preparation and return equivalent physiology/readiness', async () => {
  const rows = [row(), ...history()];
  const a = await endpoint('obtener_today_state', database(rows));
  const b = await endpoint('obtener_readiness_calculado', database(rows));
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.deepEqual(a.body.physiology, b.body.physiology);
  assert.equal(a.body.readiness.score, b.body.score);
  assert.deepEqual(a.body.readiness.contributors, b.body.contribuyentes);
  assert.equal(a.body.discrepancy.detected, b.body.hayDiscrepancia);
});
for (const action of ['obtener_today_state', 'obtener_readiness_calculado']) {
  test(`${action} has no direct physiology/legacy reads and stops on canonical errors`, async () => {
    const body = branch(action);
    assert.match(body, /await prepareCanonicalReadiness\(supabase, codigo\)/);
    assert.doesNotMatch(body, /physiology_records|estado_fisiologico|historial_fisiologico|\.sueno|\.hrv\b|\.rhr\b/);
    for (const error of ['db_error', 'invalid_response']) {
      const db = database([]);
      const r = await endpoint(action, db, async () => ({ ok: false, error, reason: 'test' }));
      assert.equal(r.status, 503); assert.equal(r.body.error, error); assert.equal(db.calls.length, 0);
    }
  });
}

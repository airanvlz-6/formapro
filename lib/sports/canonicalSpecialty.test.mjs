import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { sportsRuntime, plain, compile } from './trainingContractTestRuntime.mjs';

const load = sportsRuntime();
const integrity = load('canonicalSpecialty');
const { projectLegacyCreate: create, projectLegacyUpdate: update } = load('../auth/legacyContainment');
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const strategy = load('../athlete/strategyResolution').resolvePlanningStrategy;
const source = readFileSync(new URL('../../app/api/chat/route.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
function find(node, predicate) {
  if (predicate(node)) return node;
  let result; ts.forEachChild(node, child => { result ??= find(child, predicate); }); return result;
}
function branch(action) {
  return find(ast, n => ts.isIfStatement(n) && n.expression.getText(ast) === `action === "${action}"`).thenStatement.getText(ast);
}
const onboarding = source.slice(source.indexOf('const CAMPOS_REQUERIDOS_POR_MODO'), source.indexOf('if (action === "verificar_datos_cambio_modo_deterministico")'));
function execute(code, context) {
  const scope = { ...integrity, projectLegacyCreate: create, NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) }, console: { log() {} }, ...context };
  return new Function(...Object.keys(scope), compile(code))(...Object.values(scope));
}
function db(row, failure = null) {
  const writes = [];
  return { row, writes, from(table) {
    let patch; const filters = [];
    const query = { select() { return this; }, eq(k, v) { filters.push([k, v]); return this; }, is(k, v) { filters.push([k, v]); return this; },
      update(value) { patch = value; return this; },
      async maybeSingle() {
        if (failure === 'read' && !patch || failure === 'write' && patch) return { data: null, error: {} };
        if (patch) {
          if (failure === 'race') row.especialidad = 'funcional_crossfit';
          if (filters.some(([k, v]) => k !== 'codigo' && row[k] !== v)) return { data: null, error: null };
          writes.push(patch); Object.assign(row, patch);
        }
        return { data: row, error: null };
      }, then(ok, no) { return (table === 'athlete_training_sources' ? Promise.resolve({ data: [] }) : this.maybeSingle()).then(ok, no); } };
    return query;
  } };
}
const transition = database => execute(`return (async () => ${branch('cambiar_modo_entrada')})();`, { supabase: database, codigo: 'test', datos: { nuevoModo: 'planificacion' } });
test('T1 creation fills Carrera and preserves explicit specialty', () => {
  assert.equal(create({ categoria: 'carrera' }).especialidad, 'carrera');
  assert.equal(create({ categoria: 'carrera', especialidad: 'funcional_crossfit' }).especialidad, 'funcional_crossfit');
  assert.equal(create({ categoria: 'funcional' }).especialidad, undefined);
});
for (const value of [null, undefined, '', '  \t ']) test(`T2/T3 generic empty update preserves stored specialty: ${String(value)}`, () => {
  assert.deepEqual({ especialidad: 'carrera', ...plain(update({ especialidad: value })) }, { especialidad: 'carrera' });
});
test('T4 real mode transition repairs before changing mode', async () => {
  const database = db({ categoria: 'carrera', especialidad: null });
  assert.equal((await transition(database)).status, 200);
  assert.deepEqual(plain(database.writes), [{ especialidad: 'carrera' }, { modo_entrada: 'planificacion' }]);
});
test('T5 ambiguous category fails closed; no mode write', async () => {
  const database = db({ categoria: 'funcional', especialidad: null });
  assert.equal((await transition(database)).body.code, 'CANONICAL_SPECIALTY_REQUIRED');
  assert.equal(database.writes.length, 0);
});
test('T6 actual onboarding requires persisted specialty for planning only', async () => {
  const database = db({ categoria: 'funcional', especialidad: null, perfil: { edad: '30', nivel: 'Intermedio', objetivo_detalle: 'Meta', duracion: '60' }, distribucion_semanal: '{}' });
  for (const mode of ['planificacion', 'coach', 'focus', 'supervision']) {
    const result = await execute(`${onboarding}\nreturn calcularEstadoOnboarding(supabase, codigo, mode);`, { supabase: database, codigo: 'test', mode });
    assert.equal(result.missingFields.includes('especialidad'), mode !== 'supervision');
  }
  assert.equal(database.writes.length, 0);
});
for (const distance of ['Media maraton (21K)', 'Media maratón (21K)', ' media maratón (21k) ']) test(`T7/T8/T9 repaired historic event resolves exactly: ${distance}`, async () => {
  const row = { categoria: 'carrera', especialidad: null, perfil: { distancia_objetivo: distance }, objetivo_principal: { descripcion: 'media maratón Santa Cruz' }, onboarding_completado: true, modo_entrada: 'planificacion' };
  assert.equal(strategy(project(row)).status, 'STRATEGY_UNSUPPORTED');
  assert.equal((await integrity.ensurePlanningSpecialty(db(row), 'test', 'planificacion')).ok, true);
  const result = strategy(project(row));
  assert.equal(result.strategyId, 'half_marathon'); assert.equal(result.strategySpecificity, 'SPECIFIC');
  assert.equal(row.objetivo_principal.descripcion, 'media maratón Santa Cruz');
});
test('structured distance does not match an appended event or marathon', () => {
  for (const distance of ['Media maraton (21K) Santa Cruz', 'Maratón (42K)']) {
    assert.equal(load('declaredSportStrategy').structuredEventStrategy('carrera', distance), null);
  }
});
test('T10/T11 existing CrossFit is never overwritten by category', async () => {
  const row = { categoria: 'carrera', especialidad: 'funcional_crossfit', objetivo_principal: { descripcion: 'CrossFit Games' } };
  const database = db(row);
  assert.equal((await integrity.ensurePlanningSpecialty(database, 'test', 'coach')).ok, true);
  assert.equal(strategy(project(row)).strategyId, 'crossfit'); assert.equal(database.writes.length, 0);
});
test('T12 supervision needs no repair and gains no prescribing authority', async () => {
  assert.equal((await integrity.ensurePlanningSpecialty({ from() { throw Error('unexpected DB'); } }, 'test', 'supervision')).ok, true);
  assert.equal(load('prescriptionScope').buildPrescriptionScope({ mode: 'supervision', sources: [], profileDisciplines: ['carrera'] }).scope.prescriptionAllowed, false);
});
for (const failure of ['read', 'write', 'race']) test(`failed repair cannot change mode: ${failure}`, async () => {
  const database = db({ categoria: 'carrera', especialidad: null }, failure);
  assert.equal((await transition(database)).status, 422);
  assert.equal(database.writes.length, 0);
});
test('all mutating transition/confirmation branches guard before completion or RPC', () => {
  for (const action of ['verificar_datos_cambio_modo_deterministico', 'cambiar_modo_atleta', 'confirmar_onboarding']) {
    const text = branch(action);
    assert.ok(text.indexOf('ensurePlanningSpecialty(') < text.indexOf('await calcularEstadoOnboarding('));
  }
});

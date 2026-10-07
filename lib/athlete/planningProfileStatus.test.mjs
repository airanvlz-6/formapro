import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { sportsRuntime, plain, compile } from '../sports/trainingContractTestRuntime.mjs';

// FORGE BUILD 8A — estado de planificacion DERIVADO. Funcion pura: sin DB, sin flags persistidos.
const load = sportsRuntime();
const { resolvePlanningProfileStatus, legacyOnboardingCompleted, computeOnboardingFields, CAMPOS_REQUERIDOS_POR_MODO, FREE_MODE } = load('../athlete/planningProfileStatus');
const { buildPrescriptionScope, validatePrescriptionScope } = load('prescriptionScope');

const deepFreeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(deepFreeze); Object.freeze(v); } return v; };
const sources = (...rows) => rows.map(r => ({ activo: true, dias: ['lunes'], ...r }));
const base = { categoria: 'carrera', especialidad: 'carrera', objetivo_principal: { descripcion: 'Media maraton' },
  perfil: { edad: '31-40', nivel: 'Intermedio', duracion: 'Hasta 1 hora' }, distribucion_semanal: '{"carrera":["lunes"]}' };
const coachComplete = { ...base, modo_entrada: 'coach', trainingSources: [] };
const focusComplete = { ...base, modo_entrada: 'focus',
  trainingSources: sources({ owner: 'forge', disciplina: 'carrera' }, { owner: 'external', disciplina: 'box' }) };

test('FREE_MODE is the literal the identity bootstrap persists', () => {
  assert.equal(FREE_MODE, 'free');
  const identity = readFileSync(new URL('../auth/athleteIdentity.ts', import.meta.url), 'utf8');
  assert.match(identity, /const FREE_MODE = 'free';/);
});
test('FREE: valid status, not planning-ready, no missing fields, never an error', () => {
  const status = resolvePlanningProfileStatus({ modo_entrada: FREE_MODE, categoria: null, especialidad: null, perfil: {}, objetivo_principal: null, distribucion_semanal: null });
  assert.deepEqual(plain(status), { mode: 'free', ready: false, missingFields: [] });
  assert.equal(legacyOnboardingCompleted(status), true, 'Free must not be gated by the legacy onboarding screen');
});
test('FREE stays Free even when the row happens to carry planning data (mode is the authority)', () => {
  const status = resolvePlanningProfileStatus({ ...coachComplete, modo_entrada: 'free' });
  assert.deepEqual(plain(status), { mode: 'free', ready: false, missingFields: [] });
});
test('COACH complete: ready, nothing missing', () => {
  assert.deepEqual(plain(resolvePlanningProfileStatus(coachComplete)), { mode: 'coach', ready: true, missingFields: [] });
  assert.equal(legacyOnboardingCompleted(resolvePlanningProfileStatus(coachComplete)), true);
});
test('COACH incomplete: not ready, exact missing fields in requirement order (incl. canonical specialty)', () => {
  const status = resolvePlanningProfileStatus({ modo_entrada: 'coach', categoria: 'funcional', especialidad: null, perfil: { nivel: 'Principiante' }, objetivo_principal: null, distribucion_semanal: null });
  assert.equal(status.ready, false);
  assert.deepEqual(plain(status.missingFields), ['objetivo', 'edad', 'disponibilidad', 'duracion_sesion', 'especialidad']);
  assert.equal(legacyOnboardingCompleted(status), false);
});
test('FOCUS complete / incomplete', () => {
  assert.deepEqual(plain(resolvePlanningProfileStatus(focusComplete)), { mode: 'focus', ready: true, missingFields: [] });
  const noExternal = resolvePlanningProfileStatus({ ...focusComplete, trainingSources: sources({ owner: 'forge', disciplina: 'carrera', dias: [] }) });
  assert.equal(noExternal.ready, false);
  assert.deepEqual(plain(noExternal.missingFields), ['dias_forge', 'disciplina_externa', 'dias_externos']);
  const inactive = resolvePlanningProfileStatus({ ...focusComplete, trainingSources: focusComplete.trainingSources.map(s => ({ ...s, activo: false })) });
  assert.deepEqual(plain(inactive.missingFields), ['disciplina_forge', 'dias_forge', 'disciplina_externa', 'dias_externos']);
});
test('SUPERVISION keeps the current semantics: core fields, no specialty requirement', () => {
  const status = resolvePlanningProfileStatus({ modo_entrada: 'supervision', categoria: 'fuerza', especialidad: null, perfil: { nivel: 'Avanzado', edad: '20-30' }, objetivo_principal: { descripcion: 'Fuerza' } });
  assert.deepEqual(plain(status), { mode: 'supervision', ready: true, missingFields: [] });
  assert.deepEqual(plain(CAMPOS_REQUERIDOS_POR_MODO.supervision), ['categoria', 'objetivo', 'edad', 'nivel']);
});
test('legacy / unknown / absent modes use the supervision core (as the onboarding engine always did)', () => {
  const planificacion = resolvePlanningProfileStatus({ modo_entrada: 'planificacion', categoria: 'carrera', especialidad: null, perfil: { nivel: 'x', edad: 'y' }, objetivo_principal: { descripcion: 'z' } });
  assert.deepEqual(plain(planificacion), { mode: 'planificacion', ready: false, missingFields: ['especialidad'] });
  for (const modo_entrada of [null, undefined, '', '  ', 'desconocido']) {
    const status = resolvePlanningProfileStatus({ modo_entrada, categoria: null, perfil: null });
    assert.equal(status.mode, typeof modo_entrada === 'string' && modo_entrada.trim() ? modo_entrada : null);
    assert.deepEqual(plain(status.missingFields), ['categoria', 'objetivo', 'edad', 'nivel']);
  }
});
test('partial profile is reported, never completed with invented data', () => {
  const status = resolvePlanningProfileStatus({ modo_entrada: 'supervision', categoria: 'fuerza', perfil: { nivel: 'Intermedio' } });
  assert.deepEqual(plain(status), { mode: 'supervision', ready: false, missingFields: ['objetivo', 'edad'] });
});
test('perfil.objetivo_general (where bootstrapNewAthlete writes the goal) counts as objetivo; edad requirement unchanged', () => {
  const bootstrapped = { modo_entrada: 'supervision', categoria: 'fuerza', especialidad: 'fuerza', perfil: { objetivo_general: 'Progresar', nivel: 'Principiante' } };
  assert.deepEqual(plain(resolvePlanningProfileStatus(bootstrapped)), { mode: 'supervision', ready: false, missingFields: ['edad'] });
  assert.deepEqual(plain(resolvePlanningProfileStatus({ ...bootstrapped, perfil: { ...bootstrapped.perfil, edad: '20-30' } })), { mode: 'supervision', ready: true, missingFields: [] });
  for (const objetivo_general of ['', '   ', null, 0, {}, []]) {
    const status = resolvePlanningProfileStatus({ ...bootstrapped, perfil: { objetivo_general, nivel: 'Principiante', edad: 'x' } });
    assert.deepEqual(plain(status.missingFields), ['objetivo'], JSON.stringify(objetivo_general));
  }
  // the other recognized sources keep working
  assert.equal(computeOnboardingFields({ objetivo_principal: { descripcion: 'x' } }, 'supervision').completedFields.objetivo, true);
  assert.equal(computeOnboardingFields({ perfil: { objetivo_detalle: 'x' } }, 'supervision').completedFields.objetivo, true);
  assert.equal(computeOnboardingFields({}, 'supervision').completedFields.objetivo, false);
});
test('the 3 production supervision users (auth-linked, onboarding flag false) cannot regress: legacy answer was false', async () => {
  // Their stored flag is false => verificar_onboarding_completado answered completado:false before 8A.
  // Derived: web-bootstrapped shape => only `edad` can be missing => false (unchanged) or true if edad exists.
  const legacyAnswer = false;
  for (const perfil of [{ objetivo_general: 'Progresar', nivel: 'Principiante' }, { objetivo_general: 'x', nivel: 'Avanzado', edad: '31-40' }]) {
    const res = await runOnboarding(fakeDb({ usuarios: { modo_entrada: 'supervision', categoria: 'fuerza', especialidad: 'fuerza', perfil, onboarding_completado: false } }));
    assert.equal(typeof res.body.completado, 'boolean');
    // never a true->false flip: the only possible change is false->true, and only when nothing is missing
    assert.equal(res.body.completado === legacyAnswer || res.body.planningProfileStatus.missingFields.length === 0, true);
  }
});
test('deterministic, side-effect free: same input => same output, input untouched', () => {
  const input = deepFreeze(JSON.parse(JSON.stringify(focusComplete)));
  const a = plain(resolvePlanningProfileStatus(input)), b = plain(resolvePlanningProfileStatus(input));
  assert.deepEqual(a, b);
  assert.deepEqual(plain(input), plain(focusComplete));
  assert.deepEqual(resolvePlanningProfileStatus(undefined).missingFields.length, 4);
});
test('the module has no database or I/O dependency (cannot write DB by construction)', () => {
  const text = readFileSync(new URL('./planningProfileStatus.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  const imports = [...text.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(imports, ['../sports/canonicalSpecialty']);
  assert.doesNotMatch(text, /supabase|\.from\(|\.insert\(|\.update\(|\.upsert\(|\.rpc\(|fetch\(|process\.env|Date\.now|new Date|Math\.random/);
});
test('shared engine: computeOnboardingFields keeps the pre-8A calculation (flag-independent)', () => {
  const r = computeOnboardingFields({ ...coachComplete, onboarding_completado: false }, 'coach');
  assert.deepEqual(plain(r.missingFields), []);
  assert.deepEqual(plain(r.camposRequeridos), ['categoria', 'objetivo', 'edad', 'nivel', 'disponibilidad', 'duracion_sesion', 'especialidad']);
  const level = computeOnboardingFields({ perfil: { nivel_cf: 'RX' } }, 'supervision');
  assert.equal(level.completedFields.nivel, true);
});

test('FREE resolves to a NON-prescriptive scope (never coach/focus); stored mode is not rewritten', () => {
  const free = buildPrescriptionScope({ mode: 'free', sources: [], profileDisciplines: [] });
  assert.equal(free.ok, true);
  assert.equal(free.scope.prescriptionAllowed, false);
  assert.deepEqual(plain(free.scope.managedDisciplines), []);
  assert.deepEqual(plain(validatePrescriptionScope(free.scope)), []);
  const consulta = buildPrescriptionScope({ mode: 'consulta', sources: [], profileDisciplines: [] });
  assert.deepEqual(plain(free), plain(consulta));
  assert.deepEqual(plain(buildPrescriptionScope({ mode: 'free', sources: sources({ owner: 'forge', disciplina: 'carrera' }), profileDisciplines: ['carrera'] }).scope.managedDisciplines), []);
  assert.equal(buildPrescriptionScope({ mode: 'freee', sources: [] }).ok, false, 'unknown modes still fail closed');
});
test('FREE cannot receive a PREPARE_WEEK suggestion', async () => {
  const { resolveCurrentWeekState } = load('../planning/resolveCurrentWeekState');
  const db = { from: () => ({ select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; } }) };
  for (const [mode, type] of [['free', 'NONE'], ['consulta', 'NONE'], ['supervision', 'NONE'], ['coach', 'PREPARE_WEEK'], ['focus', 'PREPARE_WEEK']]) {
    const state = await resolveCurrentWeekState(db, 'u', '2026-10-07', mode);
    assert.equal(state.nextAction.type, type, mode);
  }
});

// ---- real route branches (AST extraction, as canonicalSpecialty.test.mjs does) ----
const source = readFileSync(new URL('../../app/api/chat/route.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
function find(node, predicate) { if (predicate(node)) return node; let r; ts.forEachChild(node, c => { r ??= find(c, predicate); }); return r; }
const branch = action => find(ast, n => ts.isIfStatement(n) && n.expression.getText(ast) === `action === "${action}"`).thenStatement.getText(ast);
const NextResponse = { json: (body, init) => ({ body, status: init?.status ?? 200 }) };
function fakeDb(rows, sourcesRows = []) {
  const log = [];
  return { log, from(table) {
    log.push(['from', table]);
    const q = { select(cols) { log.push(['select', table, cols]); return q; }, eq() { return q; }, is() { return q; },
      async single() { return { data: rows[table] ?? null, error: null }; }, async maybeSingle() { return { data: rows[table] ?? null, error: null }; },
      then: (ok, no) => Promise.resolve({ data: table === 'athlete_training_sources' ? sourcesRows : rows[table] ?? null, error: null }).then(ok, no) };
    for (const w of ['insert', 'update', 'upsert', 'delete']) q[w] = () => { log.push([w, table]); return q; };
    return q;
  }, rpc() { log.push(['rpc']); return { data: null, error: null }; } };
}
const onboardingBranch = `return (async () => ${branch('verificar_onboarding_completado')})();`;
const runOnboarding = (db) => new Function('supabase', 'codigo', 'NextResponse', 'resolvePlanningProfileStatus', 'legacyOnboardingCompleted', compile(onboardingBranch))
  (db, 'FP-TEST', NextResponse, resolvePlanningProfileStatus, legacyOnboardingCompleted);
const row = ({ trainingSources, ...r }) => r;

test('verificar_onboarding_completado keeps the legacy contract { completado: boolean } and adds planningProfileStatus', async () => {
  const res = await runOnboarding(fakeDb({ usuarios: row(coachComplete) }));
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.completado, 'boolean');
  assert.deepEqual(plain(res.body), { completado: true, planningProfileStatus: { mode: 'coach', ready: true, missingFields: [] } });
});
test('verificar_onboarding_completado does NOT use usuarios.onboarding_completado as authority', async () => {
  const db = fakeDb({ usuarios: { ...row(coachComplete), modo_entrada: 'coach', perfil: {}, onboarding_completado: true } });
  const res = await runOnboarding(db);
  assert.equal(res.body.completado, false, 'a stale true flag must not make an incomplete profile complete');
  const selected = db.log.filter(e => e[0] === 'select' && e[1] === 'usuarios').map(e => e[2]).join(',');
  assert.doesNotMatch(selected, /onboarding_completado/);
  const done = await runOnboarding(fakeDb({ usuarios: { ...row(coachComplete), onboarding_completado: false } }));
  assert.equal(done.body.completado, true, 'a false/absent flag must not block a complete profile');
});
test('verificar_onboarding_completado: Free is not an error and not blocked; partial/Focus/Supervision coherent; missing row stays legacy', async () => {
  const free = await runOnboarding(fakeDb({ usuarios: { modo_entrada: 'free', categoria: null, especialidad: null, perfil: {}, objetivo_principal: null, distribucion_semanal: null } }));
  assert.deepEqual(plain(free.body), { completado: true, planningProfileStatus: { mode: 'free', ready: false, missingFields: [] } });
  const partial = await runOnboarding(fakeDb({ usuarios: { modo_entrada: 'supervision', categoria: 'fuerza', perfil: { nivel: 'Principiante' } } }));
  assert.deepEqual(plain(partial.body), { completado: false, planningProfileStatus: { mode: 'supervision', ready: false, missingFields: ['objetivo', 'edad'] } });
  const focus = await runOnboarding(fakeDb({ usuarios: row(focusComplete) }, focusComplete.trainingSources));
  assert.equal(focus.body.completado, true);
  const missing = await runOnboarding(fakeDb({}));
  assert.deepEqual(plain(missing.body), { completado: false, planningProfileStatus: null });
});
test('verificar_onboarding_completado is read-only (no insert/update/upsert/delete/rpc)', async () => {
  const db = fakeDb({ usuarios: row(coachComplete) });
  await runOnboarding(db);
  assert.deepEqual(db.log.filter(e => !['from', 'select'].includes(e[0])), []);
});

test('guardar_plan_semana refuses Free exactly like supervision/consulta (capability guard)', async () => {
  const run = (modo_entrada) => new Function('supabase', 'codigo', 'NextResponse', 'datos', 'console', compile(`return (async () => ${branch('guardar_plan_semana')})();`))
    (fakeDb({ usuarios: { modo_entrada } }), 'FP-TEST', NextResponse, {}, { error() {}, log() {} });
  for (const mode of ['free', 'supervision', 'consulta']) {
    const res = await run(mode);
    assert.equal(res.status, 403, mode);
    assert.equal(res.body.reason, 'SUPERVISION_NO_PLANNING');
  }
});
test('daily briefing serves Free the non-planning briefing and never builds a canonical plan state', async () => {
  const explode = () => { throw new Error('planning path must not run for Free'); };
  const run = (modo_entrada) => new Function('supabase', 'codigo', 'NextResponse', 'prepareRecoveryContext', 'physiologyToday', 'resolveCurrentWeekState', 'generarEstadoCanonico', 'buildAthleteKnowledge',
    compile(`return (async () => ${branch('obtener_daily_briefing')})();`))
    (fakeDb({ usuarios: { modo_entrada, workout_history: [] } }), 'FP-TEST', NextResponse, async () => ({ ok: true }), () => '2026-10-07',
      async () => ({ weekState: 'NO_PLAN_FOUND', nextAction: { type: 'NONE' } }), explode, explode);
  const free = await run('free');
  assert.equal(free.body.briefing.modoEntrada, 'free');
  assert.equal(free.body.briefing.ultimoEntreno, null);
  assert.equal('sesionHoy' in free.body.briefing, false);
});

// ---- getAthleteContext tolerates an identity-only athlete ----
import vm from 'node:vm';
import { resolve } from 'node:path';
test('getAthleteContext does not throw on an identity-only athlete and fabricates no planning values', async () => {
  const nullRow = Object.fromEntries('categoria,especialidad,perfil,marcas,historial,lesiones_actuales,plan_proxima_semana,notas_coach,ciclo_actual,perfil_psicologico,premium,admin,athlete_state,datos_entrenamiento,distribucion_semanal,objetivo_principal,debilidades,analisis_bloques'.split(',').map(k => [k, null]));
  const chain = data => { const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, single: async () => ({ data, error: null }), then: (ok, no) => Promise.resolve({ data, error: null }).then(ok, no) }; return q; };
  const supabase = { from: table => chain(table === 'usuarios' ? nullRow : table === 'block_outcomes' ? [] : null) };
  const module = { exports: {} };
  const path = resolve('lib/mobile/getAthleteContext.ts');
  vm.runInNewContext(compile(readFileSync(path, 'utf8')), { module, exports: module.exports, Date, JSON, Array, Object, String, Number, Math,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture' } },
    fetch: async () => ({ json: async () => ({ estado: {} }) }),
    require: name => {
      if (name === '@supabase/supabase-js') return { createClient: () => supabase };
      if (name === '@/lib/execution/workoutRegistry') return { readWorkouts: async () => [] };
      if (name === '@/lib/execution/workoutProjections') return { projectWorkoutPlans: () => [] };
      throw new Error('unexpected ' + name);
    } });
  const ctx = await module.exports.getAthleteContext('FP-FREE');
  assert.deepEqual(plain(ctx.perfil), {});
  assert.deepEqual(plain(ctx.objetivoPrincipal), {});
  assert.deepEqual(plain(ctx.marcas), []);
  assert.deepEqual(plain(ctx.historial), []);
  assert.equal(ctx.planSemanal, null);
  assert.equal(ctx.esPremiumOAdmin, false);
});

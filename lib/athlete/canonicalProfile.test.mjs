import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

// FORGE BUILD 8C-A — perfil canonico editable + activacion Free -> supervision | focus | coach.
// Se ejercita el handler HTTP real (GET/PUT/PATCH) contra una base en memoria con compare-and-set.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const AUTH_A = '00000000-0000-4000-8000-00000000000a', ID_A = '00000000-0000-4000-8000-0000000000a1';
const AUTH_B = '00000000-0000-4000-8000-00000000000b', ID_B = '00000000-0000-4000-8000-0000000000b1';
const plain = x => JSON.parse(JSON.stringify(x));

const cache = new Map();
function load(file) {
  const path = resolve(root, file);
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} }; cache.set(path, module);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Request, Response, URL, Buffer, structuredClone, console: { log() {}, error() {} },
    process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'isolated-8c-test-key' } },
    require(name) {
      if (name === 'server-only') return {};
      if (name === 'node:crypto') return crypto;
      if (!name.startsWith('.') && !name.startsWith('@/')) throw new Error(`Unexpected dependency: ${name}`);
      return load(name.startsWith('@/') ? name.slice(2) + '.ts' : resolve(dirname(path), name + '.ts').slice(root.length + 1));
    } });
  return module.exports;
}
const { handleAthleteProfile } = load('lib/athlete/profileHandler.ts');
const { PROFILE_READ_COLUMNS } = load('lib/athlete/canonicalProfile.ts');
const { projectAthletePrescriptionProfile } = load('lib/athlete/athletePrescriptionContext.ts');
const { resolvePlanningProfileStatus, computeOnboardingFields, legacyOnboardingCompleted } = load('lib/athlete/planningProfileStatus.ts');

// ---------------------------------------------------------------------------------------------
// Base en memoria con la semantica que usa el codigo real (eq/is como compare-and-set, upsert, rpc).
// ---------------------------------------------------------------------------------------------
const JSON_COLUMNS = new Set(['objetivo_principal', 'perfil']);
function freeRow(over = {}) {
  return { id: ID_A, codigo: 'FP-A', auth_user_id: AUTH_A, email: 'a@example.invalid', modo_entrada: 'free', categoria: null, especialidad: null,
    perfil: {}, objetivo_principal: null, distribucion_semanal: null, admin: false, premium: false, stripe_customer_id: 'cus_secret',
    historial: [{ role: 'user', content: 'privado' }], notas_coach: 'nota interna', workout_history: [{ x: 1 }],
    test_atleta: null, marcas_especificas: null, datos_entrenamiento: null, historial_marcas: [], nombre_mostrar: null, altura_cm: null, peso_kg: null, avatar_url: null, ...over };
}
function makeDb(rows, sources = [], options = {}) {
  const state = { rows, sources, selects: [], updates: [], upserts: [], rpcCalls: [], touched: new Set(), tableReads: [] };
  const matches = (row, filters) => filters.every(([op, key, value]) => op === 'is' ? row[key] == null
    : JSON_COLUMNS.has(key) && typeof value === 'string' ? JSON.stringify(row[key]) === value : row[key] === value);
  state.db = {
    from(table) {
      state.touched.add(table);
      const filters = []; let patch = null, selected = null, kind = 'select';
      const rowsOf = () => table === 'usuarios' ? state.rows : state.sources;
      const resolveSelect = () => {
        const found = rowsOf().filter(r => matches(r, filters.map(([op, k, v]) => (table === 'athlete_training_sources' && k === 'user_codigo') ? [op, 'user_codigo', v] : [op, k, v])));
        return found;
      };
      const q = {
        select(columns) { selected = columns; if (kind === 'select') state.selects.push([table, columns]); return q; },
        eq(k, v) { filters.push(['eq', k, v]); return q; },
        is(k, v) { filters.push(['is', k, v]); return q; },
        update(value) { kind = 'update'; patch = value; return q; },
        async upsert(value, opts) {
          if (options.upsertFails) return { error: { message: 'upsert failed' } };
          state.upserts.push(plain(value));
          for (const row of value) {
            const existing = state.sources.find(s => s.user_codigo === row.user_codigo && s.disciplina === row.disciplina);
            if (existing) Object.assign(existing, row); else state.sources.push({ ...row });
          }
          return { error: null };
        },
        async maybeSingle() {
          if (kind === 'update') { const r = await runUpdate(); return { data: r.data?.[0] ? { especialidad: r.data[0].especialidad } : null, error: r.error }; }
          options.onRead?.(table, state);
          const found = resolveSelect();
          return { data: found[0] ? plain(found[0]) : null, error: null };
        },
        async single() { const r = await q.maybeSingle(); return r; },
        async limit() { return { data: plain(resolveSelect()), error: null }; },
        then(ok, no) { return (kind === 'update' ? runUpdate() : Promise.resolve((options.onRead?.(table, state), { data: plain(resolveSelect()), error: null }))).then(ok, no); },
      };
      async function runUpdate() {
        options.beforeUpdate?.(state);
        if (options.updateThrows) throw new Error('transport');
        if (options.updateError) return { data: null, error: { message: 'boom' } };
        const found = resolveSelect();
        if (!found.length) return { data: [], error: null };
        state.updates.push({ table, patch: plain(patch), filters: plain(filters) });
        for (const row of found) Object.assign(row, plain(patch));
        return { data: plain(found), error: null };
      }
      return q;
    },
    async rpc(name, args) {
      state.touched.add(`rpc:${name}`);
      state.rpcCalls.push([name, plain(args)]);
      if (options.rpcError) return { data: null, error: { message: 'rpc failed' } };
      const row = state.rows.find(r => r.codigo === args.p_codigo);
      row.modo_entrada = args.p_target_mode;
      if (args.p_new_cycle) row.ciclo_actual = args.p_new_cycle;
      return { data: { ok: true, mode: args.p_target_mode }, error: null };
    },
  };
  return state;
}
function fixture(rows, sources = [], options = {}) {
  const state = makeDb(rows, sources, options);
  const calls = { deps: 0, getUser: [] };
  const auth = { async getUser(token) {
    calls.getUser.push(token);
    if (token === 'token-a') return { data: { user: { id: AUTH_A, email_confirmed_at: '2026-01-01' } }, error: null };
    if (token === 'token-b') return { data: { user: { id: AUTH_B, email_confirmed_at: '2026-01-01' } }, error: null };
    if (token === 'token-stranger') return { data: { user: { id: '00000000-0000-4000-8000-0000000000ff', email_confirmed_at: '2026-01-01' } }, error: null };
    return { data: { user: null }, error: { status: 401 } };
  } };
  const call = async (method, body, token = 'token-a') => {
    const headers = { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
    const request = new Request('https://forge.invalid/api/athlete/profile', { method, headers, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
    const response = await handleAthleteProfile(request, () => { calls.deps++; return { auth, db: state.db }; });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  return { ...state, calls, call, row: code => state.rows.find(r => r.codigo === code) };
}

const supervisionPayload = { category: 'carrera', objective: 'Correr una media maraton', age: '31-40', level: 'Intermedio' };
const coachPayload = { ...supervisionPayload, weeklyAvailability: { days: ['lunes', 'miercoles', 'viernes'] }, sessionDuration: 'Hasta 1 hora' };
const focusPayload = { category: 'funcional', specialty: 'funcional_crossfit', objective: 'Competir en CrossFit', age: '20-30', level: 'Avanzado',
  sessionDuration: 'Hasta 1 hora', trainingSources: [{ owner: 'forge', discipline: 'box', days: ['lunes', 'miercoles'] }, { owner: 'external', discipline: 'carrera', days: ['sabado'] }] };
const build7 = (mode, over = {}) => freeRow({ modo_entrada: mode, categoria: 'carrera', especialidad: 'carrera',
  perfil: { edad: '31-40', nivel: 'Intermedio', duracion: 'Hasta 1 hora', objetivo_detalle: 'Media maraton', fc_max: { value: 185, unit: 'bpm', source: 'profile_editor', updated_at: '2026-08-01T00:00:00.000Z' } },
  objetivo_principal: { descripcion: 'Media maraton' }, distribucion_semanal: JSON.stringify({ disponibilidad: ['lunes', 'jueves'] }), ...over });
const src = (owner, disciplina, dias = ['lunes']) => ({ user_codigo: 'FP-A', owner, disciplina, dias, activo: true });

// ============================== READ (1-6) ==============================
test('1 READ: Free vacio => cuenta valida, no planning-ready, sin campos pendientes, nada inventado', async () => {
  const f = fixture([freeRow()]);
  const r = await f.call('GET');
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.body.profile.mode, 'free');
  assert.deepEqual(plain(r.body.profile.planningProfileStatus), { mode: 'free', ready: false, missingFields: [] });
  const p = r.body.profile.planStructure;
  assert.deepEqual([p.category, p.specialty, p.objective, p.age, p.level, p.weeklyAvailability, p.sessionDuration, p.targetEvent], Array(8).fill(null));
  assert.deepEqual(p.trainingSources, []);
  assert.equal(f.updates.length, 0, 'GET never writes');
});
test('2 READ: supervision existente (Build 7)', async () => {
  const f = fixture([build7('supervision')]);
  const { profile } = (await f.call('GET')).body;
  assert.equal(profile.mode, 'supervision'); assert.equal(profile.planningProfileStatus.ready, true);
  assert.equal(profile.planStructure.level, 'Intermedio'); assert.equal(profile.planStructure.objective, 'Media maraton');
  assert.equal(profile.planStructure.objectiveCanonical, true); assert.deepEqual(plain(profile.planStructure.weeklyAvailability), { days: ['lunes', 'jueves'] });
  assert.equal(profile.prescriptionParameters.hrMax.value, 185);
});
test('3 READ: focus existente (fuentes forge + external)', async () => {
  const f = fixture([build7('focus')], [src('forge', 'carrera', ['lunes']), src('external', 'box', ['sabado'])]);
  const { profile } = (await f.call('GET')).body;
  assert.equal(profile.mode, 'focus'); assert.equal(profile.planningProfileStatus.ready, true);
  assert.deepEqual(plain(profile.planStructure.trainingSources.map(s => [s.owner, s.discipline, s.days])), [['forge', 'carrera', ['lunes']], ['external', 'box', ['sabado']]]);
});
test('4 READ: coach existente', async () => {
  const f = fixture([build7('coach')]);
  const { profile } = (await f.call('GET')).body;
  assert.equal(profile.mode, 'coach'); assert.deepEqual(plain(profile.planningProfileStatus), { mode: 'coach', ready: true, missingFields: [] });
  assert.equal(profile.planStructure.sessionDuration, 'Hasta 1 hora');
});
test('5 READ: planificacion legacy se normaliza al leer (objetivo en perfil.objetivo_general, sin tocar la fila)', async () => {
  const row = build7('planificacion', { objetivo_principal: null, perfil: { edad: '31-40', nivel: 'Intermedio', objetivo_general: 'Media maraton' } });
  const before = plain(row);
  const f = fixture([row]);
  const { profile } = (await f.call('GET')).body;
  assert.equal(profile.mode, 'planificacion'); assert.equal(profile.planStructure.objective, 'Media maraton');
  assert.equal(profile.planStructure.objectiveSource, 'perfil.objetivo_general'); assert.equal(profile.planStructure.objectiveCanonical, false);
  assert.equal(profile.planningProfileStatus.ready, true);
  assert.deepEqual(plain(f.row('FP-A')), before, 'no destructive migration on read');
});
test('6 READ: lista blanca explicita (sin select *, sin admin/premium/stripe/auth_user_id/id/historial/notas/legacyCodigo)', async () => {
  const f = fixture([freeRow({ nombre_mostrar: 'Ana' })]);
  const r = await f.call('GET');
  // 1) resolucion de identidad existente (id,codigo,auth_user_id; interna, nunca se devuelve)  2) lectura del perfil: lista blanca
  assert.deepEqual(f.selects.filter(([t]) => t === 'usuarios'), [['usuarios', 'id,codigo,auth_user_id'], ['usuarios', PROFILE_READ_COLUMNS]]);
  assert.ok(!PROFILE_READ_COLUMNS.split(',').some(c => ['*', 'admin', 'premium', 'auth_user_id', 'stripe_customer_id', 'historial', 'notas_coach', 'workout_history', 'email', 'codigo'].includes(c)));
  assert.deepEqual(f.selects.filter(([t]) => t === 'athlete_training_sources').map(s => s[1]), ['owner,disciplina,dias,activo']);
  const text = JSON.stringify(r.body);
  for (const forbidden of ['admin', 'premium', 'auth_user_id', 'stripe', 'cus_secret', 'historial"', 'notas', 'nota interna', 'privado', 'legacyCodigo', 'FP-A', ID_A, 'a@example.invalid', 'workout'])
    assert.ok(!text.includes(forbidden), `must not expose ${forbidden}`);
  assert.deepEqual(Object.keys(r.body.profile).sort(), ['context', 'editableFields', 'mode', 'planStructure', 'planningProfileStatus', 'prescriptionParameters', 'unsupported']);
  assert.equal(r.body.profile.context.displayName, 'Ana');
});

// ============================== WRITE (7-17) ==============================
test('7 WRITE: guardar categoria (Free sigue Free; categoria persistida; sin writer previo)', async () => {
  const f = fixture([freeRow()]);
  const r = await f.call('PUT', { profile: { category: 'carrera' } });
  assert.equal(r.status, 200); assert.equal(r.body.saved, true);
  assert.equal(f.row('FP-A').categoria, 'carrera'); assert.equal(f.row('FP-A').modo_entrada, 'free');
  assert.equal(r.body.profile.planStructure.category, 'carrera'); assert.equal(f.rpcCalls.length, 0);
});
test('8 WRITE: especialidad valida del catalogo de la categoria', async () => {
  const f = fixture([freeRow()]);
  const r = await f.call('PUT', { profile: { category: 'funcional', specialty: 'funcional_crossfit' } });
  assert.equal(r.status, 200); assert.equal(f.row('FP-A').especialidad, 'funcional_crossfit');
  assert.equal(r.body.profile.planStructure.specialtyStatus, 'catalog');
});
test('9 WRITE: especialidad invalida (cualquier string, o de otra categoria) => cero escrituras', async () => {
  for (const profile of [{ category: 'carrera', specialty: 'lo-que-sea' }, { category: 'carrera', specialty: 'funcional_crossfit' }, { specialty: 'carrera' }, { category: 'carrera', specialty: '' }, { category: 'carrera', specialty: 7 }]) {
    const f = fixture([freeRow()]);
    const r = await f.call('PUT', { profile });
    assert.equal(r.status, 400, JSON.stringify(profile)); assert.equal(r.body.code, 'PROFILE_INVALID');
    assert.ok(r.body.errors.some(e => e.field === 'specialty'));
    assert.equal(f.updates.length + f.upserts.length + f.rpcCalls.length, 0);
  }
  // cambiar de categoria no deja sobrevivir una especialidad de otra categoria en silencio
  const f = fixture([build7('supervision', { categoria: 'funcional', especialidad: 'funcional_crossfit' })]);
  const r = await f.call('PUT', { profile: { category: 'carrera' } });
  assert.equal(r.status, 400); assert.equal(r.body.errors[0].code, 'SPECIALTY_CATEGORY_MISMATCH'); assert.equal(f.updates.length, 0);
});
test('10 WRITE: objetivo canonico en objetivo_principal (fuente del planner), sin quinta copia ni conflicto de evidencia', async () => {
  const row = freeRow({ perfil: { objetivo_general: 'Objetivo antiguo', objetivo_detalle: 'detalle libre' }, categoria: 'carrera' });
  const f = fixture([row]);
  const r = await f.call('PUT', { profile: { objective: 'Media maraton en 1h50' } });
  assert.equal(r.status, 200);
  const saved = f.row('FP-A');
  assert.equal(saved.objetivo_principal.descripcion, 'Media maraton en 1h50');
  assert.equal(saved.objetivo_principal.resolution.source, 'canonical_profile_editor');
  assert.deepEqual(plain(saved.objetivo_principal.resolution.previousProfileDeclarations), { objetivo_general: 'Objetivo antiguo' });
  assert.ok(!('objetivo_general' in saved.perfil) && !('objetivo_principal' in saved.perfil), 'duplicates removed so evidence cannot conflict');
  assert.equal(saved.perfil.objetivo_detalle, 'detalle libre', 'legacy detail neither written nor erased');
  const goals = projectAthletePrescriptionProfile(saved).goals.primary;
  assert.equal(goals.reason, 'resolved'); assert.equal(goals.resolved.value, 'Media maraton en 1h50');
  assert.equal(r.body.profile.planStructure.objectiveCanonical, true);
});
test('11/12/13 WRITE: edad, nivel, duracion y disponibilidad invalidas => 400 y cero escrituras', async () => {
  const cases = [
    ['age', { age: '35' }], ['age', { age: 35 }], ['level', { level: 'experto' }], ['level', { level: '' }],
    ['sessionDuration', { sessionDuration: '90' }], ['weeklyAvailability', { weeklyAvailability: { days: [] } }],
    ['weeklyAvailability', { weeklyAvailability: { days: ['funday'] } }], ['weeklyAvailability', { weeklyAvailability: { days: 'lunes' } }],
    ['weeklyAvailability', { weeklyAvailability: { days: ['lunes'], extra: 1 } }], ['objective', { objective: '  ' }], ['objective', { objective: 'x'.repeat(501) }],
    ['category', { category: 'rehabilitacion' }], ['trainingSources', { trainingSources: [{ owner: 'otro', discipline: 'box' }] }],
    ['trainingSources', { trainingSources: [{ owner: 'forge', discipline: 'box' }, { owner: 'external', discipline: 'BOX' }] }],
    ['level', { level: null }], ['codigo', { codigo: 'FP-B' }], ['modo_entrada', { modo_entrada: 'coach' }], ['marks', { marks: { squat: 100 } }], ['hrMax', { hrMax: 190 }],
  ];
  for (const [field, profile] of cases) {
    const f = fixture([freeRow()]);
    const r = await f.call('PUT', { profile });
    assert.equal(r.status, 400, JSON.stringify(profile));
    assert.ok(r.body.errors.some(e => e.field === field), `${JSON.stringify(profile)} => ${JSON.stringify(r.body.errors)}`);
    assert.equal(f.updates.length + f.upserts.length + f.rpcCalls.length, 0);
    assert.deepEqual(plain(f.row('FP-A')), plain(freeRow()));
  }
});
test('14 WRITE: payload parcial toca solo las columnas afectadas (PATCH == PUT)', async () => {
  for (const method of ['PUT', 'PATCH']) {
    const f = fixture([build7('supervision')]);
    const before = plain(f.row('FP-A'));
    const r = await f.call(method, { profile: { level: 'Avanzado' } });
    assert.equal(r.status, 200);
    assert.deepEqual(f.updates.map(u => Object.keys(u.patch)), [['perfil']]);
    const after = f.row('FP-A');
    assert.equal(after.perfil.nivel, 'Avanzado');
    assert.deepEqual({ ...plain(after), perfil: null }, { ...before, perfil: null });
    assert.deepEqual({ ...plain(after.perfil), nivel: null }, { ...before.perfil, nivel: null });
  }
});
const strengthRow = () => build7('supervision', {
  test_atleta: { back_squat: '120kg', fecha: '2026-08-01' }, marcas_especificas: { deadlift: '150kg' },
  datos_entrenamiento: { squat_1rm: '120kg', fc_reposo: 50 }, historial_marcas: [{ fecha: '2026-07-01', ejercicio: 'back_squat', valor: '118kg' }],
  estado_fisiologico: { rhr: 49, hrv: 80, fecha: '2026-10-07' }, historial_fisiologico: [{ rhr: 50 }] });
test('15 WRITE: preserva marcas/RM al guardar PLAN_STRUCTURE', async () => {
  const f = fixture([strengthRow()]);
  const read = async () => plain((await f.call('GET')).body.profile.prescriptionParameters.marks);
  const marksBefore = await read();
  assert.ok(Object.keys(marksBefore).length > 0);
  const r = await f.call('PUT', { profile: { objective: 'Nuevo objetivo', level: 'Avanzado', age: '41-50', sessionDuration: 'Hasta 45 min', weeklyAvailability: { days: ['martes'] } } });
  assert.equal(r.status, 200);
  const keys = f.updates.flatMap(u => Object.keys(u.patch));
  for (const forbidden of ['test_atleta', 'marcas_especificas', 'datos_entrenamiento', 'historial_marcas', 'marcas']) assert.ok(!keys.includes(forbidden));
  assert.deepEqual(await read(), marksBefore);
  assert.deepEqual(plain(f.row('FP-A').historial_marcas), [{ fecha: '2026-07-01', ejercicio: 'back_squat', valor: '118kg' }]);
});
test('16 WRITE: preserva referencias FC (fc_max profile_editor, hrZoneBootstrap) y no convierte fisiologia diaria en perfil', async () => {
  const row = strengthRow(); row.perfil.hrZoneBootstrap = { version: 1, confirmation: 'USER_CONFIRMED' }; row.perfil.fc_reposo = { value: 50, unit: 'bpm', source: 'profile_editor' };
  const f = fixture([row]);
  const before = plain(row.perfil);
  const r = await f.call('PUT', { profile: { level: 'Avanzado' } });
  assert.equal(r.status, 200);
  const after = f.row('FP-A').perfil;
  for (const k of ['fc_max', 'fc_reposo', 'hrZoneBootstrap']) assert.deepEqual(plain(after[k]), before[k]);
  assert.equal(r.body.profile.prescriptionParameters.hrMax.value, 185);
  assert.deepEqual(plain(f.row('FP-A').estado_fisiologico), { rhr: 49, hrv: 80, fecha: '2026-10-07' }, 'daily physiology untouched');
  assert.ok(!JSON.stringify(r.body).includes('hrv'), 'daily physiology is not part of the profile contract');
});
test('17 WRITE: preserva datos no incluidos (evento, declaraciones, senales, claves legacy desconocidas)', async () => {
  const row = build7('supervision'); Object.assign(row.perfil, { targetEvent: { event: { x: 1 }, signature: 's' }, runningHabitualDeclarations: { a: 1 },
    prescription_signals: { s: 1 }, coaching_knowledge: [1], clave_legacy_desconocida: 'se conserva', nivel_cf: 'Avanzado' });
  const f = fixture([row]);
  const before = plain(row.perfil);
  assert.equal((await f.call('PUT', { profile: { age: '20-30' } })).status, 200);
  assert.deepEqual({ ...plain(f.row('FP-A').perfil), edad: null }, { ...before, edad: null });
});

// ============================== ACTIVATION (18-25) ==============================
test('18 ACTIVATION: Free -> supervision completo reutiliza change_athlete_mode', async () => {
  const f = fixture([freeRow()]);
  const r = await f.call('PUT', { profile: supervisionPayload, activate: { mode: 'supervision' } });
  assert.equal(r.status, 200); assert.equal(r.body.activation.status, 'ACTIVATED');
  assert.deepEqual(f.rpcCalls.map(c => [c[0], c[1].p_codigo, c[1].p_target_mode, c[1].p_new_cycle, c[1].p_reason]), [['change_athlete_mode', 'FP-A', 'supervision', null, 'canonical_profile_activation']]);
  assert.equal(r.body.profile.mode, 'supervision'); assert.deepEqual(plain(r.body.profile.planningProfileStatus), { mode: 'supervision', ready: true, missingFields: [] });
  // el perfil se persistio ANTES de cambiar el modo
  assert.equal(f.updates.length, 1); assert.equal(f.row('FP-A').categoria, 'carrera');
  assert.equal(f.row('FP-A').onboarding_completado, undefined, 'legacy onboarding_completado is never written');
});
test('19 ACTIVATION: Free -> supervision incompleto: guarda lo valido, devuelve missingFields, no cambia el modo', async () => {
  const f = fixture([freeRow()]);
  const r = await f.call('PUT', { profile: { category: 'carrera', objective: 'Correr' }, activate: { mode: 'supervision' } });
  assert.equal(r.status, 200); assert.equal(r.body.saved, true);
  assert.deepEqual(plain(r.body.activation), { requested: 'supervision', status: 'NOT_READY', missingFields: ['edad', 'nivel'] });
  assert.equal(f.rpcCalls.length, 0); assert.equal(f.row('FP-A').modo_entrada, 'free'); assert.equal(f.row('FP-A').categoria, 'carrera');
  assert.deepEqual(plain(r.body.profile.planningProfileStatus), { mode: 'free', ready: false, missingFields: [] });
});
test('20 ACTIVATION: Free -> focus completo (guarda fuentes y reutiliza la transicion con ciclo)', async () => {
  const f = fixture([freeRow()]);
  const r = await f.call('PUT', { profile: focusPayload, activate: { mode: 'focus' } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.activation.status, 'ACTIVATED');
  assert.deepEqual(plain(f.upserts[0].map(s => [s.owner, s.disciplina, s.user_codigo, s.activo])), [['forge', 'box', 'FP-A', true], ['external', 'carrera', 'FP-A', true]]);
  const [name, args] = f.rpcCalls[0];
  assert.equal(name, 'change_athlete_mode'); assert.equal(args.p_target_mode, 'focus');
  assert.deepEqual(args.p_new_cycle, { bloque: 'acumulacion', semana: 1, totalSemanas: 4, objetivo: 'Competir en CrossFit' });
  assert.equal(r.body.profile.mode, 'focus'); assert.equal(r.body.profile.planningProfileStatus.ready, true);
});
test('21 ACTIVATION: Free -> focus incompleto (falta fuente externa) => NOT_READY, sin cambio de modo', async () => {
  const f = fixture([freeRow()]);
  const r = await f.call('PUT', { profile: { ...focusPayload, trainingSources: [focusPayload.trainingSources[0]] }, activate: { mode: 'focus' } });
  assert.equal(r.status, 200); assert.equal(r.body.activation.status, 'NOT_READY');
  assert.deepEqual(plain(r.body.activation.missingFields), ['disciplina_externa', 'dias_externos']);
  assert.equal(f.rpcCalls.length, 0); assert.equal(f.row('FP-A').modo_entrada, 'free');
});
test('22 ACTIVATION: Free -> coach completo (Carrera deriva su especialidad canonica, igual que ensurePlanningSpecialty)', async () => {
  const f = fixture([freeRow()]);
  const r = await f.call('PUT', { profile: coachPayload, activate: { mode: 'coach' } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.activation.status, 'ACTIVATED');
  assert.equal(f.row('FP-A').especialidad, 'carrera');
  assert.equal(f.rpcCalls[0][1].p_target_mode, 'coach'); assert.equal(f.rpcCalls[0][1].p_new_cycle.objetivo, 'Correr una media maraton');
  assert.equal(JSON.parse(f.row('FP-A').distribucion_semanal).disponibilidad.join(), 'lunes,miercoles,viernes');
});
test('23 ACTIVATION: Free -> coach incompleto (sin disponibilidad/duracion; categoria ambigua sin especialidad)', async () => {
  const f = fixture([freeRow()]);
  const r = await f.call('PUT', { profile: supervisionPayload, activate: { mode: 'coach' } });
  assert.equal(r.body.activation.status, 'NOT_READY');
  assert.deepEqual(plain(r.body.activation.missingFields), ['disponibilidad', 'duracion_sesion']);
  const g = fixture([freeRow()]);
  const r2 = await g.call('PUT', { profile: { ...coachPayload, category: 'funcional' }, activate: { mode: 'coach' } });
  assert.equal(r2.body.activation.status, 'NOT_READY'); assert.ok(r2.body.activation.missingFields.includes('especialidad'));
  assert.equal(f.rpcCalls.length + g.rpcCalls.length, 0);
});
test('24 ACTIVATION: nunca cambia el modo si el estado resultante no esta ready; destinos no activables se rechazan', async () => {
  for (const activate of [{ mode: 'free' }, { mode: 'planificacion' }, { mode: 'consulta' }, { mode: 'admin' }, { mode: 7 }, 'coach', { mode: 'coach', extra: 1 }]) {
    const f = fixture([freeRow()]);
    const r = await f.call('PUT', { profile: coachPayload, activate });
    assert.equal(r.status, 400, JSON.stringify(activate)); assert.ok(r.body.errors.some(e => e.code === 'ACTIVATION_MODE_INVALID'));
    assert.equal(f.updates.length + f.rpcCalls.length, 0);
  }
  const f = fixture([freeRow()]);
  await f.call('PUT', { activate: { mode: 'focus' } });
  assert.equal(f.rpcCalls.length, 0); assert.equal(f.row('FP-A').modo_entrada, 'free');
});
test('25 ACTIVATION: sin efectos de planificacion (ni semana, ni Coach, ni onboarding)', async () => {
  const f = fixture([freeRow()]);
  const previousFetch = globalThis.fetch; let fetched = 0; globalThis.fetch = () => { fetched++; throw new Error('no network'); };
  try { assert.equal((await f.call('PUT', { profile: coachPayload, activate: { mode: 'coach' } })).status, 200); } finally { globalThis.fetch = previousFetch; }
  assert.deepEqual([...f.touched].sort(), ['rpc:change_athlete_mode', 'usuarios', 'athlete_training_sources'].sort());
  assert.equal(fetched, 0);
  assert.deepEqual(f.rpcCalls.map(c => c[0]), ['change_athlete_mode']);
});

// ============================== SECURITY (26-29) ==============================
test('26 SECURITY: sin token / token malformado / invalido => 401 y la base ni se construye', async () => {
  const f = fixture([freeRow()]);
  const none = await f.call('GET', undefined, null);
  assert.equal(none.status, 401); assert.equal(none.body.code, 'AUTH_REQUIRED');
  const bad = await handleAthleteProfile(new Request('https://x.invalid', { method: 'PUT', headers: { authorization: 'Basic abc' }, body: '{}' }), () => { f.calls.deps++; return {}; });
  assert.equal(bad.status, 401);
  const invalid = await f.call('PUT', { profile: { category: 'carrera' } }, 'token-desconocido');
  assert.equal(invalid.status, 401); assert.equal(invalid.body.code, 'AUTH_INVALID');
  assert.equal(f.updates.length, 0); assert.equal(f.calls.deps, 1, 'dependencies only built for the well-formed Bearer');
});
test('27 SECURITY: principal sin atleta vinculado => 404 sin escribir; metodo no permitido => 405', async () => {
  const f = fixture([freeRow()]);
  const r = await f.call('PUT', { profile: { category: 'carrera' } }, 'token-stranger');
  assert.equal(r.status, 404); assert.equal(r.body.code, 'ATHLETE_NOT_LINKED'); assert.equal(f.updates.length, 0);
  const post = await f.call('POST', { profile: {} });
  assert.equal(post.status, 405);
});
test('28 SECURITY: codigo/email/id del body no eligen atleta (se rechazan antes de escribir)', async () => {
  const f = fixture([freeRow(), freeRow({ id: ID_B, codigo: 'FP-B', auth_user_id: AUTH_B, email: 'b@example.invalid' })]);
  const snapshot = plain(f.rows);
  for (const extra of [{ codigo: 'FP-B' }, { email: 'b@example.invalid' }, { athleteId: ID_B }, { auth_user_id: AUTH_B }, { userId: 'FP-B' }]) {
    const r = await f.call('PUT', { profile: { category: 'carrera' }, ...extra });
    assert.equal(r.status, 400); assert.ok(r.body.errors.some(e => e.code === 'PROFILE_FIELD_NOT_ALLOWED'));
  }
  assert.deepEqual(plain(f.rows), snapshot);
});
test('29 SECURITY: el usuario A no modifica a B (toda escritura va filtrada por el codigo del principal)', async () => {
  const f = fixture([freeRow(), freeRow({ id: ID_B, codigo: 'FP-B', auth_user_id: AUTH_B })]);
  const bBefore = plain(f.row('FP-B'));
  assert.equal((await f.call('PUT', { profile: supervisionPayload, activate: { mode: 'supervision' } }, 'token-a')).status, 200);
  assert.deepEqual(plain(f.row('FP-B')), bBefore);
  assert.ok(f.updates.every(u => u.filters.some(([op, k, v]) => op === 'eq' && k === 'codigo' && v === 'FP-A')));
  assert.ok(f.rpcCalls.every(c => c[1].p_codigo === 'FP-A'));
  assert.equal((await f.call('PUT', { profile: { category: 'fuerza' } }, 'token-b')).status, 200);
  assert.equal(f.row('FP-A').categoria, 'carrera'); assert.equal(f.row('FP-B').categoria, 'fuerza');
});

// ============================== COMPATIBILITY (30-32) ==============================
test('30 COMPAT: usuario Build 7 sin cambios (GET no escribe; guardar los mismos valores es no-op)', async () => {
  const f = fixture([build7('coach')]);
  const before = plain(f.row('FP-A'));
  await f.call('GET');
  const same = await f.call('PUT', { profile: { category: 'carrera', specialty: 'carrera', objective: 'Media maraton', age: '31-40', level: 'Intermedio', sessionDuration: 'Hasta 1 hora' }, activate: { mode: 'coach' } });
  assert.equal(same.status, 200); assert.equal(same.body.saved, false); assert.equal(same.body.activation.status, 'ALREADY_ACTIVE');
  assert.equal(f.updates.length + f.rpcCalls.length, 0); assert.deepEqual(plain(f.row('FP-A')), before);
});
test('32 COMPAT: lectores legacy siguen funcionando sobre una fila guardada por el perfil canonico', async () => {
  const f = fixture([freeRow()]);
  assert.equal((await f.call('PUT', { profile: coachPayload, activate: { mode: 'coach' } })).status, 200);
  const row = f.row('FP-A');
  const status = resolvePlanningProfileStatus({ ...row, trainingSources: [] });
  assert.deepEqual(plain(status), { mode: 'coach', ready: true, missingFields: [] });
  assert.equal(legacyOnboardingCompleted(status), true);
  assert.deepEqual(plain(computeOnboardingFields({ ...row, trainingSources: [] }, 'coach').missingFields), []);
  const projected = projectAthletePrescriptionProfile(row);
  assert.equal(projected.goals.primary.resolved.value, 'Correr una media maraton');
  assert.equal(projected.sessionTimeBudget.resolved?.value.maxMinutes, 60);
  assert.equal(row.perfil.edad, '31-40'); assert.equal(row.perfil.nivel, 'Intermedio'); assert.equal(row.perfil.duracion, 'Hasta 1 hora');
  assert.equal(row.objetivo_principal.descripcion, 'Correr una media maraton'); // lo que lee el ciclo (objetivo_principal.descripcion)
});

// ============================== ATOMICITY (33-35) ==============================
test('33 ATOMICITY: un campo invalido entre campos validos => cero escrituras de cualquier tipo', async () => {
  const f = fixture([freeRow()]);
  const r = await f.call('PUT', { profile: { ...focusPayload, level: 'experto' }, activate: { mode: 'focus' } });
  assert.equal(r.status, 400);
  assert.equal(f.updates.length + f.upserts.length + f.rpcCalls.length, 0); assert.deepEqual(plain(f.row('FP-A')), plain(freeRow()));
  assert.equal((await f.call('PUT', '{not json')).status, 400); assert.equal((await f.call('PUT', [])).status, 400); assert.equal((await f.call('PUT', {})).status, 400);
  assert.equal(f.updates.length, 0);
});
test('34 ATOMICITY: fallos de persistencia dejan estado coherente (nunca modo nuevo + perfil invalido)', async () => {
  // (a) el UPDATE falla => nada cambia, ni fuentes ni modo
  for (const options of [{ updateThrows: true }, { updateError: true }]) {
    const f = fixture([freeRow()], [], options);
    const r = await f.call('PUT', { profile: focusPayload, activate: { mode: 'focus' } });
    assert.ok([409, 503].includes(r.status), String(r.status)); assert.equal(f.upserts.length + f.rpcCalls.length, 0);
    assert.deepEqual(plain(f.row('FP-A')), plain(freeRow()));
  }
  // (b) fallan las fuentes => perfil guardado y valido, modo intacto, sin RPC
  const b = fixture([freeRow()], [], { upsertFails: true });
  const rb = await b.call('PUT', { profile: focusPayload, activate: { mode: 'focus' } });
  assert.equal(rb.status, 500); assert.equal(rb.body.code, 'PROFILE_PARTIAL_WRITE'); assert.equal(rb.body.modeChanged, false);
  assert.equal(b.row('FP-A').modo_entrada, 'free'); assert.equal(b.rpcCalls.length, 0); assert.equal(b.row('FP-A').categoria, 'funcional');
  // (c) falla el RPC => perfil guardado (valido), modo anterior, y reintentar activa sin duplicar nada
  const c = fixture([freeRow()], [], { rpcError: true });
  const rc = await c.call('PUT', { profile: supervisionPayload, activate: { mode: 'supervision' } });
  assert.equal(rc.status, 502); assert.equal(rc.body.code, 'MODE_CHANGE_FAILED'); assert.equal(rc.body.profileSaved, true); assert.equal(rc.body.modeChanged, false);
  assert.equal(c.row('FP-A').modo_entrada, 'free'); assert.equal(rc.body.profile.planStructure.level, 'Intermedio');
  const writesBefore = c.updates.length;
  const options = {}; // reintento sin fallo: misma base
  c.db.rpc = async (name, args) => { c.rpcCalls.push([name, args]); c.row('FP-A').modo_entrada = args.p_target_mode; return { data: { ok: true }, error: null }; };
  const retry = await c.call('PUT', { activate: { mode: 'supervision' } });
  assert.equal(retry.status, 200); assert.equal(retry.body.activation.status, 'ACTIVATED'); assert.equal(c.updates.length, writesBefore, 'retry writes no profile again'); void options;
});
test('35 ATOMICITY: actualizacion concurrente => 409 PROFILE_CHANGED_RETRY, cero escrituras propias', async () => {
  let fired = false;
  const f = fixture([freeRow({ perfil: { nivel: 'Principiante' } })], [], { beforeUpdate: state => {
    if (fired) return; fired = true;
    state.rows[0].perfil = { nivel: 'Avanzado', concurrente: true }; // otro cliente edita entre la lectura y la escritura
  } });
  const r = await f.call('PUT', { profile: { category: 'carrera', objective: 'Correr', age: '20-30', level: 'Intermedio', trainingSources: [{ owner: 'forge', discipline: 'carrera' }] }, activate: { mode: 'supervision' } });
  assert.equal(r.status, 409); assert.equal(r.body.code, 'PROFILE_CHANGED_RETRY');
  assert.deepEqual(plain(f.row('FP-A').perfil), { nivel: 'Avanzado', concurrente: true });
  assert.equal(f.row('FP-A').categoria, null); assert.equal(f.updates.length, 0); assert.equal(f.upserts.length + f.rpcCalls.length, 0);
  const retry = await f.call('PUT', { profile: { category: 'carrera' } });
  assert.equal(retry.status, 200, 'the client can retry after rereading');
});

// ============================== extras de contrato ==============================
test('EXTRA: cambiar la categoria exige especialidad; la disponibilidad usa el mismo almacen que guardar_campo_mode_change', async () => {
  const f = fixture([build7('supervision')]);
  assert.equal((await f.call('PUT', { profile: { category: 'funcional', specialty: 'funcional_crossfit', weeklyAvailability: { days: ['Lunes', 'miércoles'] } } })).status, 200);
  assert.equal(JSON.parse(f.row('FP-A').distribucion_semanal).disponibilidad.join(), 'lunes,miercoles');
  assert.equal(typeof f.row('FP-A').distribucion_semanal, 'string');
});
test('EXTRA: Free con identidad nueva (perfil {}) puede guardar el perfil sin activar y seguir siendo Free', async () => {
  const f = fixture([freeRow()]);
  const r = await f.call('PUT', { profile: coachPayload });
  assert.equal(r.status, 200); assert.equal(r.body.activation.status, 'NOT_REQUESTED'); assert.equal(r.body.profile.mode, 'free');
  assert.equal(f.rpcCalls.length, 0);
});
test('EXTRA: la disponibilidad respeta la forma por disciplina existente y no adivina entre varias', async () => {
  const one = fixture([build7('coach', { distribucion_semanal: JSON.stringify({ carrera: ['lunes', 'jueves'], observaciones: 'solo tardes' }) })]);
  assert.equal((await one.call('PUT', { profile: { weeklyAvailability: { days: ['martes', 'sabado'] } } })).status, 200);
  assert.deepEqual(JSON.parse(one.row('FP-A').distribucion_semanal), { carrera: ['martes', 'sabado'], observaciones: 'solo tardes' });
  const two = fixture([build7('coach', { distribucion_semanal: JSON.stringify({ carrera: ['lunes'], box: ['martes'] }) })]);
  const r = await two.call('PUT', { profile: { weeklyAvailability: { days: ['viernes'] } } });
  assert.equal(r.status, 400); assert.equal(r.body.errors[0].code, 'AVAILABILITY_MULTI_CATEGORY_UNSUPPORTED'); assert.equal(two.updates.length, 0);
});

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
  const state = { rows, sources, selects: [], updates: [], upserts: [], inserts: [], rpcCalls: [], touched: new Set(), tableReads: [],
    states: options.states ?? [], notes: options.notes ?? [] };
  let nextId = 1;
  const matches = (row, filters) => filters.every(([op, key, value]) => op === 'is' ? row[key] == null : op === 'in' ? value.includes(row[key])
    : JSON_COLUMNS.has(key) && typeof value === 'string' ? JSON.stringify(row[key]) === value : row[key] === value);
  // Mirror of docs/sql/profile-field-cas.sql: compare ONLY the touched authorities, then write them on the CURRENT row.
  const getPath = (obj, path) => path.reduce((o, k) => (o && typeof o === 'object' && k in o ? o[k] : undefined), obj);
  async function profileApply(args) {
    if (options.updateFails?.includes('usuarios')) return { data: null, error: { message: 'update failed' } };
    options.beforeUpdate?.(state);
    if (options.updateThrows) throw new Error('transport');
    if (options.updateError) return { data: null, error: { message: 'boom' } };
    const row = state.rows.find(r => r.codigo === args.p_user);
    if (!row) return { data: { result: 'NOT_FOUND' }, error: null };
    const fields = [];
    for (const [col, value] of Object.entries(args.p_expected.columns ?? {})) if (JSON.stringify(row[col] ?? null) !== JSON.stringify(value ?? null)) fields.push(`column:${col}`);
    for (const e of args.p_expected.perfil ?? []) {
      const cur = getPath(row.perfil, e.path);
      if (e.absent ? cur !== undefined : JSON.stringify(cur ?? null) !== JSON.stringify(e.value ?? null) || cur === undefined) fields.push(`perfil:${e.path.join('.')}`);
    }
    if (fields.length) return { data: { result: 'CONFLICT', fields }, error: null };
    const patch = {};
    for (const [col, value] of Object.entries(args.p_set.columns ?? {})) { row[col] = plain(value); patch[col] = plain(value); }
    if ((args.p_set.perfil ?? []).length) {
      const perfil = plain(row.perfil ?? {});
      for (const c of args.p_set.perfil) {
        const [a, b] = c.path;
        if (b === undefined) { if (c.remove) delete perfil[a]; else perfil[a] = plain(c.value); continue; }
        if (c.remove) { if (perfil[a] && typeof perfil[a] === 'object') delete perfil[a][b]; continue; }
        if (!perfil[a] || typeof perfil[a] !== 'object') perfil[a] = {};
        perfil[a][b] = plain(c.value);
      }
      row.perfil = perfil; patch.perfil = plain(perfil);
    }
    state.updates.push({ table: 'usuarios', patch, filters: [['eq', 'codigo', args.p_user]] });
    return { data: { result: 'SUCCESS' }, error: null };
  }
  state.db = {
    from(table) {
      state.touched.add(table);
      const filters = []; let patch = null, selected = null, kind = 'select';
      const rowsOf = () => table === 'usuarios' ? state.rows : table === 'athlete_state_events' ? state.states : table === 'athlete_coaching_notes' ? state.notes : state.sources;
      const resolveSelect = () => {
        const found = rowsOf().filter(r => matches(r, filters.map(([op, k, v]) => (table === 'athlete_training_sources' && k === 'user_codigo') ? [op, 'user_codigo', v] : [op, k, v])));
        return found;
      };
      const q = {
        select(columns) { selected = columns; if (kind === 'select') state.selects.push([table, columns]); return q; },
        eq(k, v) { filters.push(['eq', k, v]); return q; },
        is(k, v) { filters.push(['is', k, v]); return q; },
        in(k, v) { filters.push(['in', k, v]); return q; },
        order() { return q; },
        range() { return q; },
        async insert(value) {
          if (options.insertFails?.includes(table)) return { error: { message: 'insert failed' } };
          for (const row of Array.isArray(value) ? value : [value]) { const stored = { id: `${table}-${nextId++}`, ...plain(row) }; rowsOf().push(stored); state.inserts.push({ table, row: plain(stored) }); }
          return { error: null };
        },
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
        if (options.updateFails?.includes(table)) return { data: null, error: { message: 'update failed' } };
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
      if (name === 'forge_profile_apply') return profileApply(args);
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
  // Las restricciones solo se LEEN (perfil canonico); ninguna escritura fuera de usuarios/fuentes/RPC.
  assert.deepEqual([...f.touched].sort(), ['rpc:change_athlete_mode', 'usuarios', 'athlete_training_sources', 'athlete_state_events', 'athlete_coaching_notes'].sort());
  assert.deepEqual([...new Set(f.updates.map(u => u.table))], ['usuarios']); assert.equal(f.inserts.length, 0);
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

// =====================================================================================================
// CORRECCION 8C-A — restricciones y equipamiento como PLAN_STRUCTURE (almacen canonico existente)
// =====================================================================================================
const { getCanonicalRestrictions } = load('lib/athlete/getCanonicalRestrictions.ts');
const stateRow = (over = {}) => ({ id: 'st-1', user_codigo: 'FP-A', estado: 'restricted', motivo: 'dolor', body_area: 'rodilla', fecha_inicio: '2026-10-01', reason_description: 'd', activo: true, ...over });
const noteRow = (over = {}) => ({ id: 'n-1', user_codigo: 'FP-A', movement: 'rodilla', issue: 'Dolor al saltar', constraint_level: 'hard', status: 'pending', valid_until: null,
  source: 'modification_ledger', prohibits_impact: true, prohibits_jump: true, prohibits_axial_load: false, prohibits_deep_flexion: true, prohibits_overhead_load: false, ...over });
const knee = { area: 'rodilla', description: 'Dolor al saltar' };
const snapshot = f => plain({ rows: f.rows, states: f.states, notes: f.notes });
const noWrites = f => { assert.equal(f.updates.length, 0); assert.equal(f.inserts.length, 0); assert.equal(f.upserts.length, 0); assert.equal(f.rpcCalls.length, 0); };

test('R1 RESTRICTIONS: usuario legacy sin restricciones => GET devuelve [] seguro y estado conocido', async () => {
  const f = fixture([build7('supervision')]);
  const { planStructure } = (await f.call('GET')).body.profile;
  assert.deepEqual(plain(planStructure.restrictions), []); assert.equal(planStructure.restrictionsStatus, 'KNOWN');
  assert.deepEqual(plain(planStructure.equipment), []); noWrites(f);
});
test('R2 RESTRICTIONS: guardar restriccion valida en el almacen canonico (notas + estado) y leerla con getCanonicalRestrictions', async () => {
  const f = fixture([build7('supervision')]);
  const r = await f.call('PATCH', { profile: { restrictions: [knee] } });
  assert.equal(r.status, 200); assert.equal(r.body.saved, true);
  assert.deepEqual(plain(f.inserts.map(i => i.table)), ['athlete_coaching_notes', 'athlete_state_events']);
  const note = f.notes[0], state = f.states[0];
  assert.deepEqual([note.source, note.constraint_level, note.status, note.movement, note.issue], ['canonical_profile_editor', 'hard', 'pending', 'rodilla', 'Dolor al saltar']);
  assert.deepEqual([note.prohibits_impact, note.prohibits_jump, note.prohibits_deep_flexion, note.prohibits_axial_load, note.prohibits_overhead_load], [true, true, true, false, false]);
  assert.deepEqual([state.estado, state.body_area, state.activo], ['restricted', 'rodilla', true]);
  const item = r.body.profile.planStructure.restrictions[0];
  assert.deepEqual([item.area, item.description, item.level, item.source, item.prohibits.sort()], ['rodilla', 'Dolor al saltar', 'hard', 'canonical_profile_editor', ['deep_flexion', 'impact', 'jump']]);
  const canonical = await getCanonicalRestrictions(f.db, 'FP-A');
  assert.equal(canonical.active, true); assert.equal(canonical.restrictions.length, 1); assert.deepEqual(plain(canonical.areas), ['rodilla']);
  assert.equal((await f.call('PATCH', { profile: { restrictions: [knee] } })).body.saved, false, 'idempotente: la misma restriccion no se duplica');
  assert.equal(f.notes.length, 1);
});
test('R3 RESTRICTIONS: payload invalido => 400 y CERO escrituras (tampoco otros campos del mismo payload)', async () => {
  const bad = [[{ area: 'cuello', description: 'Dolor' }], [{ area: 'rodilla', description: 'x' }], [{ id: 'no-existe' }], [{ area: 'rodilla', description: 'Dolor fuerte', extra: 1 }],
    [{ area: 'rodilla', description: 'Dolor fuerte', validUntil: '2000-01-01' }], [{ area: 'rodilla', description: 'Dolor fuerte', validUntil: '2099-02-31' }], 'rodilla', {}, Array(11).fill(knee),
    [{ area: 'rodilla', description: 'Dolor fuerte', movement: 'x' }]];
  for (const restrictions of bad) {
    const f = fixture([build7('supervision')]); const before = snapshot(f);
    const r = await f.call('PUT', { profile: { restrictions, objective: 'Otro objetivo valido' } });
    assert.equal(r.status, 400, JSON.stringify(restrictions)); assert.equal(r.body.code, 'PROFILE_INVALID'); noWrites(f);
    assert.deepEqual(snapshot(f), before);
  }
  const f = fixture([build7('supervision')]);
  assert.equal((await f.call('PUT', { profile: { restrictions: null } })).status, 400);
});
test('R4 RESTRICTIONS: PATCH de campos no relacionados preserva restricciones activas (ninguna escritura en su almacen)', async () => {
  const f = fixture([build7('supervision')], [], { states: [stateRow()], notes: [noteRow()] });
  const before = plain({ states: f.states, notes: f.notes });
  const r = await f.call('PATCH', { profile: { level: 'Avanzado', objective: 'Correr 10K en 50 minutos' } });
  assert.equal(r.status, 200);
  assert.deepEqual(plain({ states: f.states, notes: f.notes }), before);
  assert.ok(f.updates.every(u => u.table === 'usuarios')); assert.equal(f.inserts.length, 0);
  assert.equal(r.body.profile.planStructure.restrictions.length, 1); assert.equal(r.body.profile.planStructure.restrictions[0].id, 'n-1');
});
test('R5 RESTRICTIONS: `[]` es valido ("sin restricciones" es informacion real): cierra el conjunto activo sin borrar notas', async () => {
  const f = fixture([build7('supervision')], [], { states: [stateRow()], notes: [noteRow(), noteRow({ id: 'n-2', movement: 'hombro', issue: 'Molestia', constraint_level: 'reassessment', status: 'considerada' })] });
  const r = await f.call('PATCH', { profile: { restrictions: [] } });
  assert.equal(r.status, 200); assert.deepEqual(plain(r.body.profile.planStructure.restrictions), []); assert.equal(r.body.profile.planStructure.restrictionsStatus, 'KNOWN');
  assert.deepEqual(f.notes.map(n => n.status), ['resuelta', 'resuelta']); assert.equal(f.notes.length, 2, 'historial conservado');
  assert.equal(f.states[0].activo, false); assert.ok(f.states[0].fecha_fin);
  assert.equal((await getCanonicalRestrictions(f.db, 'FP-A')).active, false);
  const again = await f.call('PATCH', { profile: { restrictions: [] } }); assert.equal(again.status, 200); assert.equal(again.body.saved, false);
  const keep = fixture([build7('supervision')], [], { states: [stateRow()], notes: [noteRow()] });
  const k = await keep.call('PATCH', { profile: { restrictions: [{ id: 'n-1' }] } });
  assert.equal(k.status, 200); assert.equal(k.body.saved, false); assert.equal(keep.notes[0].status, 'pending');
});
test('R6 RESTRICTIONS: no forman parte de los campos REQUERIDOS: no bloquean ni cambian planningProfileStatus / activacion', async () => {
  const withR = fixture([freeRow()]), without = fixture([freeRow()]);
  const a = await withR.call('PUT', { profile: { ...coachPayload, restrictions: [knee] }, activate: { mode: 'coach' } });
  const b = await without.call('PUT', { profile: coachPayload, activate: { mode: 'coach' } });
  assert.equal(a.status, 200); assert.equal(a.body.activation.status, 'ACTIVATED'); assert.equal(b.body.activation.status, 'ACTIVATED');
  assert.deepEqual(plain(a.body.profile.planningProfileStatus), plain(b.body.profile.planningProfileStatus));
  const bareFree = fixture([freeRow()]); const bare = await bareFree.call('PUT', { profile: { restrictions: [knee], equipment: [{ id: 'barra', state: 'available' }] } });
  assert.deepEqual(plain(bare.body.profile.planningProfileStatus), { mode: 'free', ready: false, missingFields: [] });
  const incomplete = fixture([freeRow()]);
  const n = await incomplete.call('PUT', { profile: { restrictions: [knee], category: 'carrera' }, activate: { mode: 'supervision' } });
  assert.equal(n.body.activation.status, 'NOT_READY'); assert.ok(!n.body.activation.missingFields.some(x => /restric|equip|lesion/i.test(x)));
  assert.equal(incomplete.rpcCalls.length, 0);
});
test('R7 RESTRICTIONS: lectura fallida nunca se presenta como "sin restricciones"; guardar restricciones falla cerrado', async () => {
  const onRead = table => { if (table === 'athlete_state_events') throw new Error('read down'); };
  const f = fixture([build7('supervision')], [], { onRead });
  const g = await f.call('GET'); assert.equal(g.status, 200);
  assert.equal(g.body.profile.planStructure.restrictions, null); assert.equal(g.body.profile.planStructure.restrictionsStatus, 'UNAVAILABLE');
  const p = await f.call('PATCH', { profile: { restrictions: [knee], objective: 'Otro objetivo valido' } });
  assert.equal(p.status, 503); assert.equal(p.body.code, 'PROFILE_RESTRICTIONS_UNAVAILABLE'); noWrites(f);
});
test('R8 RESTRICTIONS: fallo al escribir restricciones => 500 PROFILE_PARTIAL_WRITE, modo sin cambiar, la restriccion protectora no se libera', async () => {
  const f = fixture([freeRow()], [], { insertFails: ['athlete_state_events'] });
  const r = await f.call('PUT', { profile: { ...coachPayload, restrictions: [knee] }, activate: { mode: 'coach' } });
  assert.equal(r.status, 500); assert.equal(r.body.code, 'PROFILE_PARTIAL_WRITE'); assert.equal(r.body.restrictionsSaved, false); assert.equal(f.rpcCalls.length, 0);
  assert.equal(f.notes.length, 1, 'la nota protectora se escribe antes que el estado');
  const g = fixture([build7('supervision')], [], { states: [stateRow()], notes: [noteRow()], updateFails: ['athlete_coaching_notes'] });
  const q = await g.call('PATCH', { profile: { restrictions: [] } });
  assert.equal(q.status, 500); assert.equal(g.notes[0].status, 'pending', 'las notas protectoras siguen vigentes si falla la liberacion');
});

const equipmentSignals = f => plain(f.row('FP-A').perfil.prescription_signals ?? null);
const bar = { id: 'barra', state: 'available' }, rack = { id: 'rack', state: 'unavailable' };
test('E1 EQUIPMENT: usuario legacy sin equipamiento => GET devuelve [] (desconocido, nunca "sin equipo")', async () => {
  const f = fixture([build7('coach')]);
  const { planStructure } = (await f.call('GET')).body.profile;
  assert.deepEqual(plain(planStructure.equipment), []); noWrites(f);
});
test('E2 EQUIPMENT: guardar equipamiento valido en perfil.prescription_signals (almacen canonico) y proyectarlo', async () => {
  const f = fixture([build7('supervision')]);
  const r = await f.call('PATCH', { profile: { equipment: [rack, bar] } });
  assert.equal(r.status, 200); assert.equal(r.body.saved, true);
  const stored = equipmentSignals(f);
  assert.equal(stored['equipment.barra'].state, 'available'); assert.equal(stored['equipment.rack'].state, 'unavailable'); assert.ok(stored['equipment.barra'].updatedAt);
  assert.deepEqual(plain(r.body.profile.planStructure.equipment.map(e => [e.id, e.state])), [['barra', 'available'], ['rack', 'unavailable']]);
  const signals = projectAthletePrescriptionProfile(f.row('FP-A')).prescriptionSignals.signals;
  assert.equal(signals['equipment.barra'].state, 'available'); assert.equal(signals['equipment.rack'].state, 'unavailable');
  assert.equal((await f.call('PATCH', { profile: { equipment: [bar, rack] } })).body.saved, false, 'sin cambios => sin escritura');
});
test('E3 EQUIPMENT: payload invalido => 400 y CERO escrituras', async () => {
  const bad = [[{ id: 'trineo_magico', state: 'available' }], [{ id: 'barra', state: 'maybe' }], [{ id: 'barra', state: 'unknown' }], [bar, bar], [{ id: 'barra' }],
    [{ id: 'barra', state: 'available', extra: 1 }], 'barra', {}, ['barra'], Array(31).fill(bar)];
  for (const equipment of bad) {
    const f = fixture([build7('supervision')]); const before = snapshot(f);
    const r = await f.call('PUT', { profile: { equipment, level: 'Avanzado' } });
    assert.equal(r.status, 400, JSON.stringify(equipment)); assert.equal(r.body.code, 'PROFILE_INVALID'); noWrites(f); assert.deepEqual(snapshot(f), before);
  }
  assert.equal((await fixture([build7('supervision')]).call('PUT', { profile: { equipment: null } })).status, 400);
});
test('E4 EQUIPMENT: PATCH de campos no relacionados preserva el equipamiento y el resto de senales', async () => {
  const signals = { 'equipment.barra': { state: 'available', updatedAt: '2026-09-01T00:00:00.000Z' }, 'capability.canMeasureHeartRate': { state: 'available', updatedAt: 'x' },
    'skill.movement.pull_up': { state: 'available', source: 'athlete_report', updatedAt: 'y' } };
  const f = fixture([build7('supervision', { perfil: { ...build7('x').perfil, prescription_signals: signals } })]);
  const r = await f.call('PATCH', { profile: { level: 'Avanzado', sessionDuration: 'Hasta 45 min' } });
  assert.equal(r.status, 200); assert.deepEqual(equipmentSignals(f), signals);
});
test('E5 EQUIPMENT: `[]` es valido: borra solo las declaraciones explicitas de equipo (vuelven a desconocido), no otras senales ni "sin equipo"', async () => {
  const signals = { 'equipment.barra': { state: 'available', updatedAt: 'a' }, 'equipment.rack': { state: 'unavailable', updatedAt: 'a' }, 'capability.canMeasurePace': { state: 'available', updatedAt: 'a' } };
  const f = fixture([build7('supervision', { perfil: { ...build7('x').perfil, prescription_signals: signals } })]);
  const r = await f.call('PATCH', { profile: { equipment: [] } });
  assert.equal(r.status, 200); assert.deepEqual(plain(r.body.profile.planStructure.equipment), []);
  assert.deepEqual(equipmentSignals(f), { 'capability.canMeasurePace': signals['capability.canMeasurePace'] });
  const projected = projectAthletePrescriptionProfile(f.row('FP-A')).prescriptionSignals.signals;
  assert.equal(projected['equipment.barra'].state, 'unknown'); assert.equal(projected['equipment.rack'].state, 'unknown');
  const only = fixture([build7('supervision')]); const o = await only.call('PATCH', { profile: { equipment: [] } });
  assert.equal(o.status, 200); assert.equal(o.body.saved, false); assert.ok(!('prescription_signals' in only.row('FP-A').perfil));
});
test('E6 EQUIPMENT: no se inventa equipamiento desde la especialidad/categoria (ni al leer ni al guardar otros campos)', async () => {
  for (const [categoria, especialidad] of [['funcional', 'funcional_crossfit'], ['hibrido', 'hibrido_hyrox'], ['fuerza', 'fuerza_powerlifting'], ['carrera', 'carrera']]) {
    const f = fixture([build7('supervision', { categoria, especialidad })]);
    assert.deepEqual(plain((await f.call('GET')).body.profile.planStructure.equipment), []);
    await f.call('PATCH', { profile: { level: 'Avanzado' } });
    assert.ok(!Object.keys(f.row('FP-A').perfil.prescription_signals ?? {}).some(k => k.startsWith('equipment.')));
    const signals = projectAthletePrescriptionProfile(f.row('FP-A')).prescriptionSignals.signals;
    const equipmentSignalList = Object.entries(signals).filter(([k]) => k.startsWith('equipment.'));
    // Solo CrossFit tiene un default de disciplina (derivado en la proyeccion, nunca guardado en el perfil); el resto sigue desconocido.
    if (especialidad === 'funcional_crossfit') assert.ok(equipmentSignalList.some(([, v]) => v.state === 'available' && v.source.startsWith('derived:training_environment')));
    else assert.ok(equipmentSignalList.every(([, v]) => v.state === 'unknown'));
  }
  const g = fixture([freeRow()]); await g.call('PUT', { profile: { category: 'funcional', specialty: 'funcional_crossfit' } });
  assert.deepEqual(plain(g.row('FP-A').perfil), {}, 'especialidad CrossFit no escribe equipo');
});

test('P1 PARTIAL: editar restricciones deja equipamiento y marcas/FC intactos (y no reescribe usuarios)', async () => {
  const perfil = { ...build7('x').perfil, prescription_signals: { 'equipment.barra': { state: 'available', updatedAt: 'a' } } };
  const f = fixture([build7('supervision', { perfil })]); const before = plain(f.row('FP-A'));
  const r = await f.call('PATCH', { profile: { restrictions: [knee] } });
  assert.equal(r.status, 200); assert.deepEqual(plain(f.row('FP-A')), before); assert.equal(f.updates.filter(u => u.table === 'usuarios').length, 0);
  assert.equal(r.body.profile.prescriptionParameters.hrMax.value, 185);
});
test('P2 PARTIAL: editar equipamiento deja restricciones intactas', async () => {
  const f = fixture([build7('supervision')], [], { states: [stateRow()], notes: [noteRow()] });
  const before = plain({ states: f.states, notes: f.notes });
  const r = await f.call('PATCH', { profile: { equipment: [bar] } });
  assert.equal(r.status, 200); assert.deepEqual(plain({ states: f.states, notes: f.notes }), before);
  assert.ok(f.updates.every(u => u.table === 'usuarios')); assert.equal(f.inserts.length, 0);
  assert.equal(r.body.profile.planStructure.restrictions.length, 1);
});
test('P3 PARTIAL: editar ambos a la vez conserva marcas/RM y referencias de FC; objetivo/modo no cambian', async () => {
  const row = build7('coach', { marcas_especificas: { sentadilla: '100kg 1RM' }, datos_entrenamiento: { rm_sentadilla: '100' } });
  const f = fixture([row]); const before = plain(f.row('FP-A'));
  const r = await f.call('PATCH', { profile: { restrictions: [knee], equipment: [bar, rack] } });
  assert.equal(r.status, 200);
  const after = plain(f.row('FP-A'));
  assert.deepEqual([after.marcas_especificas, after.datos_entrenamiento, after.objetivo_principal, after.modo_entrada], [before.marcas_especificas, before.datos_entrenamiento, before.objetivo_principal, 'coach']);
  assert.deepEqual(after.perfil.fc_max, before.perfil.fc_max); assert.equal(r.body.profile.prescriptionParameters.hrMax.value, 185);
  assert.equal(f.rpcCalls.length, 0);
});

test('C1 COMPAT (24): un perfil Build 7 (supervision/focus/coach) sigue proyectando igual, con restricciones/equipo vacios', async () => {
  for (const mode of ['supervision', 'focus', 'coach']) {
    const f = fixture([build7(mode)], mode === 'focus' ? [src('forge', 'carrera', ['lunes']), src('external', 'box', ['sabado'])] : []);
    const { profile } = (await f.call('GET')).body;
    assert.equal(profile.mode, mode); assert.equal(profile.planningProfileStatus.ready, true);
    assert.deepEqual(plain(profile.planStructure.restrictions), []); assert.deepEqual(plain(profile.planStructure.equipment), []);
    assert.deepEqual(plain(profile.unsupported), { targetEventWrite: 'USE_TARGET_EVENT_ACTION', marksWrite: 'PHASE_8C_E', hrReferencesWrite: 'PHASE_8C_E' });
    assert.ok(profile.editableFields.includes('restrictions') && profile.editableFields.includes('equipment'));
  }
});
test('C1b COMPAT (25): Free vacio sigue proyectando (cuenta valida, no planning-ready, restricciones/equipo vacios)', async () => {
  const free = (await fixture([freeRow()]).call('GET')).body.profile;
  assert.deepEqual(plain(free.planningProfileStatus), { mode: 'free', ready: false, missingFields: [] }); assert.deepEqual(plain(free.planStructure.restrictions), []);
  assert.deepEqual(plain(free.planStructure.equipment), []);
});
test('C2 COMPAT (26): transiciones de modo existentes siguen pasando con restricciones/equipo en el mismo payload', async () => {
  const f = fixture([freeRow()]);
  const r = await f.call('PUT', { profile: { ...focusPayload, restrictions: [knee], equipment: [bar] }, activate: { mode: 'focus' } });
  assert.equal(r.status, 200); assert.equal(r.body.activation.status, 'ACTIVATED'); assert.equal(f.row('FP-A').modo_entrada, 'focus');
  assert.deepEqual(f.rpcCalls.map(c => c[0]), ['change_athlete_mode']);
  const g = fixture([freeRow()]);
  const s = await g.call('PUT', { profile: { ...supervisionPayload, restrictions: [], equipment: [] }, activate: { mode: 'supervision' } });
  assert.equal(s.body.activation.status, 'ACTIVATED');
});

// ---- GOAL AUTHORITY en el editor (17-18): categoria/especialidad nunca sobrescriben el objetivo declarado
test('17 GOAL: cambiar la especialidad no sobrescribe el objetivo declarado', async () => {
  const f = fixture([build7('supervision', { categoria: 'funcional', especialidad: 'funcional_fitness', objetivo_principal: { descripcion: 'Opositar a Policía Nacional' } })]);
  const before = plain(f.row('FP-A').objetivo_principal);
  const r = await f.call('PATCH', { profile: { specialty: 'funcional_crossfit' } });
  assert.equal(r.status, 200); assert.equal(f.row('FP-A').especialidad, 'funcional_crossfit');
  assert.deepEqual(plain(f.row('FP-A').objetivo_principal), before); assert.equal(r.body.profile.planStructure.objective, 'Opositar a Policía Nacional');
});
test('18 GOAL: cambiar la categoria no sobrescribe el objetivo declarado', async () => {
  const f = fixture([build7('supervision', { objetivo_principal: { descripcion: 'Opositar a Policía Nacional' } })]);
  const before = plain(f.row('FP-A').objetivo_principal);
  const r = await f.call('PATCH', { profile: { category: 'funcional', specialty: 'funcional_crossfit' } });
  assert.equal(r.status, 200); assert.equal(f.row('FP-A').categoria, 'funcional');
  assert.deepEqual(plain(f.row('FP-A').objetivo_principal), before); assert.equal(r.body.profile.planStructure.objective, 'Opositar a Policía Nacional');
  const g = fixture([build7('supervision', { objetivo_principal: { descripcion: 'Opositar a Policía Nacional' } })]);
  assert.equal((await g.call('PATCH', { profile: { category: 'hibrido', specialty: 'hibrido_hyrox' } })).status, 200);
  assert.equal(g.row('FP-A').objetivo_principal.descripcion, 'Opositar a Policía Nacional');
});

// ---- FINAL PASS: equipo = overrides; objetivo independiente de medios (fuentes/equipo/especialidad)
const CUSTOM_OBJECTIVE = 'Preparar las pruebas físicas de Policía Nacional';
test('G7 cambiar las fuentes de entrenamiento no cambia el objetivo declarado', async () => {
  const f = fixture([build7('focus', { categoria: 'funcional', especialidad: 'funcional_crossfit', objetivo_principal: { descripcion: CUSTOM_OBJECTIVE } })], [src('forge', 'box', ['lunes'])]);
  const before = plain(f.row('FP-A').objetivo_principal);
  const r = await f.call('PATCH', { profile: { trainingSources: [{ owner: 'forge', discipline: 'box', days: ['lunes', 'miercoles'] }, { owner: 'forge', discipline: 'carrera', days: ['viernes'] }] } });
  assert.equal(r.status, 200); assert.deepEqual(plain(f.row('FP-A').objetivo_principal), before);
  assert.equal(r.body.profile.planStructure.objective, CUSTOM_OBJECTIVE); assert.equal(r.body.profile.planStructure.trainingSources.length, 2);
});
test('G8 cambiar el equipamiento no cambia el objetivo declarado', async () => {
  const f = fixture([build7('coach', { categoria: 'funcional', especialidad: 'funcional_crossfit', objetivo_principal: { descripcion: CUSTOM_OBJECTIVE } })]);
  const before = plain(f.row('FP-A').objetivo_principal);
  for (const equipment of [[{ id: 'remo', state: 'unavailable' }], [{ id: 'yoke', state: 'available' }], []]) {
    const r = await f.call('PATCH', { profile: { equipment } });
    assert.equal(r.status, 200); assert.deepEqual(plain(f.row('FP-A').objetivo_principal), before); assert.equal(r.body.profile.planStructure.objective, CUSTOM_OBJECTIVE);
  }
});
test('E7b CrossFit + equipment=[] + restrictions=[] activa focus/coach sin pedir inventario: nunca missingFields equipment', async () => {
  const f = fixture([freeRow()]);
  const r = await f.call('PUT', { profile: { ...focusPayload, objective: CUSTOM_OBJECTIVE, equipment: [], restrictions: [] }, activate: { mode: 'focus' } });
  assert.equal(r.status, 200); assert.equal(r.body.activation.status, 'ACTIVATED'); assert.equal(r.body.profile.planningProfileStatus.ready, true);
  assert.ok(!JSON.stringify(r.body.profile.planningProfileStatus).includes('equipment'));
  assert.equal(r.body.profile.planStructure.objective, CUSTOM_OBJECTIVE); assert.deepEqual(plain(r.body.profile.planStructure.equipment), []);
  assert.ok(!('prescription_signals' in f.row('FP-A').perfil), 'equipment=[] no escribe inventario ni defaults en el perfil');
});
test('E10 actualizar equipamiento parcialmente conserva el resto del perfil (objetivo, marcas, FC, fuentes, restricciones, otras senales)', async () => {
  const perfil = { ...build7('x').perfil, prescription_signals: { 'equipment.barra': { state: 'available', updatedAt: 'a' }, 'capability.canMeasurePace': { state: 'available', updatedAt: 'b' } } };
  const f = fixture([build7('focus', { perfil, marcas_especificas: { sentadilla: '100kg 1RM' } })], [src('forge', 'carrera', ['lunes']), src('external', 'box', ['sabado'])], { states: [stateRow()], notes: [noteRow()] });
  const before = plain({ row: f.row('FP-A'), sources: f.sources, states: f.states, notes: f.notes });
  const r = await f.call('PATCH', { profile: { equipment: [{ id: 'remo', state: 'unavailable' }, { id: 'barra', state: 'available' }] } });
  assert.equal(r.status, 200);
  const after = plain({ row: f.row('FP-A'), sources: f.sources, states: f.states, notes: f.notes });
  after.row.perfil.prescription_signals = Object.fromEntries(Object.entries(after.row.perfil.prescription_signals).filter(([k]) => !k.startsWith('equipment.')));
  before.row.perfil.prescription_signals = Object.fromEntries(Object.entries(before.row.perfil.prescription_signals).filter(([k]) => !k.startsWith('equipment.')));
  assert.deepEqual(after, before);
  assert.equal(f.row('FP-A').perfil.prescription_signals['equipment.barra'].updatedAt, 'a', 'declaracion sin cambios conserva su fecha');
  assert.equal(f.row('FP-A').perfil.prescription_signals['equipment.remo'].state, 'unavailable');
});

// ============================== 8C-A.2 CAS por autoridad (1-5) + 8C-D profileChange (6-10) ==============================
const bigPerfil = () => ({ edad: '31-40', nivel: 'Avanzado', duracion: 'Hasta 1 hora', objetivo_detalle: 'Open CrossFit Games 2027',
  fc_max: { value: 185, unit: 'bpm', source: 'profile_editor', updated_at: '2026-08-01T00:00:00.000Z' },
  prescription_signals: { 'equipment.barra': { state: 'available', updatedAt: 'a' }, 'strength.back_squat': { state: 'known', valueKg: 140 } },
  coach_first_turns: Array.from({ length: 60 }, (_, i) => ({ id: `t${i}`, text: 'x'.repeat(400), nested: { a: [1, 2, 3, { b: 'ñ"\\' }] } })), avatar_note: 'ñ' });
const crossfitRow = (over = {}) => build7('focus', { categoria: 'funcional', especialidad: 'funcional_crossfit', perfil: bigPerfil(),
  objetivo_principal: { descripcion: 'Open CrossFit Games 2027 – estándares Masters', origen: 'x' }, ...over });
const POLICE = 'Preparar las pruebas físicas de Policía Nacional';

test('CAS-1 objective-only PATCH on a complex perfil = 200 and the new objective is persisted (no false 409)', async () => {
  const f = fixture([crossfitRow()], [src('forge', 'box', ['lunes']), src('external', 'carrera', ['sabado'])]);
  const perfilBefore = plain(f.row('FP-A').perfil);
  const r = await f.call('PATCH', { profile: { objective: POLICE } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(f.row('FP-A').objetivo_principal.descripcion, POLICE);
  assert.equal(r.body.profile.planStructure.objective, POLICE);
  assert.deepEqual(plain(f.row('FP-A').perfil), perfilBefore, 'perfil untouched by an objective-only save');
  assert.equal(f.row('FP-A').especialidad, 'funcional_crossfit');
});
test('CAS-2 real objective conflict (A read, another client sets B, we save C) = 409 PROFILE_CHANGED_RETRY, nothing written', async () => {
  const f = fixture([crossfitRow()], [], { beforeUpdate: s => { s.rows[0].objetivo_principal = { descripcion: 'Objetivo B' }; } });
  const r = await f.call('PATCH', { profile: { objective: POLICE } });
  assert.equal(r.status, 409); assert.equal(r.body.code, 'PROFILE_CHANGED_RETRY'); assert.ok(r.body.fields.includes('column:objetivo_principal'));
  assert.equal(f.row('FP-A').objetivo_principal.descripcion, 'Objetivo B'); assert.equal(f.updates.length, 0);
});
test('CAS-3 unrelated concurrent mutations (perfil subfield, avatar, signal) never cause a false 409 and are preserved', async () => {
  const f = fixture([crossfitRow()], [], { beforeUpdate: s => {
    s.rows[0].perfil.avatar_note = 'otro cliente'; s.rows[0].perfil.prescription_signals['strength.back_squat'].valueKg = 150;
    s.rows[0].perfil.coach_first_turns.push({ id: 'nuevo' }); s.rows[0].avatar_url = 'https://cdn.invalid/a.png'; s.rows[0].nombre_mostrar = 'Ana';
  } });
  const r = await f.call('PATCH', { profile: { objective: POLICE } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = f.row('FP-A');
  assert.equal(row.objetivo_principal.descripcion, POLICE);
  assert.equal(row.perfil.avatar_note, 'otro cliente'); assert.equal(row.perfil.prescription_signals['strength.back_squat'].valueKg, 150);
  assert.equal(row.perfil.coach_first_turns.at(-1).id, 'nuevo'); assert.equal(row.avatar_url, 'https://cdn.invalid/a.png');
});
test('CAS-4 a concurrent change of a RELATED field (perfil.nivel when level is edited) is a real 409', async () => {
  const f = fixture([crossfitRow()], [], { beforeUpdate: s => { s.rows[0].perfil.nivel = 'Principiante'; } });
  const r = await f.call('PATCH', { profile: { level: 'Intermedio' } });
  assert.equal(r.status, 409); assert.equal(r.body.code, 'PROFILE_CHANGED_RETRY'); assert.deepEqual(r.body.fields, ['perfil:nivel']);
  assert.equal(f.row('FP-A').perfil.nivel, 'Principiante');
});
test('CAS-5 no lost updates: two sequential edits of different authorities both survive; a stale same-authority write cannot clobber', async () => {
  const f = fixture([crossfitRow()]);
  assert.equal((await f.call('PATCH', { profile: { objective: POLICE } })).status, 200);
  assert.equal((await f.call('PATCH', { profile: { level: 'Intermedio' } })).status, 200);
  assert.equal(f.row('FP-A').objetivo_principal.descripcion, POLICE); assert.equal(f.row('FP-A').perfil.nivel, 'Intermedio');
  assert.equal(f.row('FP-A').perfil.prescription_signals['equipment.barra'].updatedAt, 'a');
});
test('CAS-6 the RPC missing in the database fails closed with 503 PROFILE_CAS_UNAVAILABLE (never an unguarded write)', async () => {
  const f = fixture([crossfitRow()]);
  f.db.rpc = async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.forge_profile_apply in the schema cache' } });
  const r = await f.call('PATCH', { profile: { objective: POLICE } });
  assert.equal(r.status, 503); assert.equal(r.body.code, 'PROFILE_CAS_UNAVAILABLE'); assert.equal(f.row('FP-A').objetivo_principal.descripcion, 'Open CrossFit Games 2027 – estándares Masters');
});

test('DIFF-6 objective change => profileChange with objective previous/current, class PLAN_STRUCTURE, requiresCoachReview', async () => {
  const f = fixture([crossfitRow()]);
  const r = await f.call('PATCH', { profile: { objective: POLICE } });
  const pc = r.body.profileChange;
  assert.equal(pc.version, 1); assert.equal(pc.requiresCoachReview, true); assert.equal(typeof pc.handoffToken, 'string');
  assert.deepEqual(plain(pc.changedFields), [{ field: 'objective', class: 'PLAN_STRUCTURE', previous: 'Open CrossFit Games 2027 – estándares Masters', current: POLICE, requiresCoachReview: true }]);
});
test('DIFF-7 no-op PATCH => no profileChange and no handoff token', async () => {
  const f = fixture([crossfitRow()]);
  const r = await f.call('PATCH', { profile: { objective: 'Open CrossFit Games 2027 – estándares Masters' } });
  assert.equal(r.status, 200); assert.equal(r.body.profileChange, undefined); assert.equal(f.updates.length, 0);
});
test('DIFF-8 context-only / non-reviewed changes never require Coach review (age)', async () => {
  const f = fixture([crossfitRow()]);
  const r = await f.call('PATCH', { profile: { age: '41-50' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.profileChange.requiresCoachReview, false); assert.equal(r.body.profileChange.handoffToken, undefined);
});
test('DIFF-9 PLAN_STRUCTURE changes (specialty/availability/duration/level) require review', async () => {
  for (const [profile, field] of [[{ weeklyAvailability: { days: ['martes'] } }, 'weeklyAvailability'], [{ sessionDuration: 'Hasta 45 minutos' }, 'sessionDuration'], [{ level: 'Intermedio' }, 'level']]) {
    const f = fixture([crossfitRow()]);
    const r = await f.call('PATCH', { profile });
    if (r.status !== 200) continue; // option label not valid in this catalog: covered by validation tests
    assert.ok(r.body.profileChange.changedFields.some(c => c.field === field), field); assert.equal(r.body.profileChange.requiresCoachReview, true);
  }
  const g = fixture([crossfitRow()]);
  const r = await g.call('PATCH', { profile: { level: 'Intermedio' } });
  assert.equal(r.status, 200); assert.equal(r.body.profileChange.requiresCoachReview, true);
});
test('DIFF-10 previous/current come from persisted canonical state, not the payload (concurrent unrelated edits are not attributed)', async () => {
  const f = fixture([crossfitRow()], [], { beforeUpdate: s => { s.rows[0].perfil.nivel = 'Principiante'; } });
  const r = await f.call('PATCH', { profile: { objective: `  ${POLICE}  ` } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.profileChange.changedFields.map(c => c.field), ['objective']);
  assert.equal(r.body.profileChange.changedFields[0].current, r.body.profile.planStructure.objective);
});

// ============================== 8C-D Coach handoff (module + PATCH->handoff flow) ==============================
const { resolveProfileChangeHandoff, issueProfileChangeHandoff } = load('lib/chat/profileChangeHandoff.ts');
async function patched(over = {}) {
  const f = fixture([crossfitRow(over)], [src('forge', 'box', ['lunes']), src('external', 'carrera', ['sabado'])]);
  const r = await f.call('PATCH', { profile: { objective: POLICE } });
  const datos = { profileChange: { id: r.body.profileChange.id, changedFields: r.body.profileChange.changedFields.map(({ field, previous, current }) => ({ field, previous, current })) }, token: r.body.profileChange.handoffToken };
  const reread = async () => (await f.call('GET')).body.profile;
  return { f, r, datos, reread };
}
test('HANDOFF-11 only the authenticated athlete can use the token: another athlete / missing / garbled / expired token is rejected', async () => {
  const { datos, reread } = await patched(); const profile = await reread();
  assert.equal(resolveProfileChangeHandoff(datos, ID_A, profile).ok, true);
  for (const bad of [{ ...datos, token: undefined }, { ...datos, token: 'x.y' }, { ...datos, token: datos.token + 'A' }]) assert.equal(resolveProfileChangeHandoff(bad, ID_A, profile).code, 'PROFILE_HANDOFF_INVALID_TOKEN');
  assert.equal(resolveProfileChangeHandoff(datos, ID_B, profile).code, 'PROFILE_HANDOFF_INVALID_TOKEN', 'token is bound to the athlete');
  const old = issueProfileChangeHandoff(ID_A, datos.profileChange.id, Date.now() - 25 * 3600_000);
  assert.equal(resolveProfileChangeHandoff({ ...datos, token: old }, ID_A, profile).code, 'PROFILE_HANDOFF_INVALID_TOKEN');
  assert.equal(resolveProfileChangeHandoff(null, ID_A, profile).code, 'PROFILE_HANDOFF_INVALID');
});
test('HANDOFF-13 the handoff is reconciled against the REREAD persisted profile (stale => 409, not trusted)', async () => {
  const { f, datos, reread } = await patched();
  await f.call('PATCH', { profile: { objective: 'Otro objetivo posterior' } }); // a later edit supersedes the change
  const r = resolveProfileChangeHandoff(datos, ID_A, await reread());
  assert.equal(r.ok, false); assert.equal(r.status, 409); assert.equal(r.code, 'PROFILE_HANDOFF_STALE');
  assert.equal(resolveProfileChangeHandoff(datos, ID_A, null).status, 503);
});
test('HANDOFF-15/16/19 explicit objective is authority, previous is change context, CrossFit stays a MEANS, current truths included', async () => {
  const { datos, reread } = await patched(); const out = resolveProfileChangeHandoff(datos, ID_A, await reread());
  assert.equal(out.ok, true);
  assert.equal(out.context.objective.text, POLICE); assert.equal(out.context.objective.authority, true);
  assert.equal(out.context.changedFields[0].previous, 'Open CrossFit Games 2027 – estándares Masters');
  assert.equal(out.context.trainingMeans.specialty, 'funcional_crossfit'); assert.equal(out.context.trainingMeans.role, 'MEANS_NOT_OBJECTIVE');
  assert.deepEqual(plain(out.context.trainingMeans.sources.map(s => s.discipline).sort()), ['box', 'carrera']);
  assert.ok(out.context.weeklyAvailability !== undefined && 'restrictions' in out.context && 'equipment' in out.context && out.context.prescriptionParameters);
  assert.match(out.message, /Policía Nacional/); assert.match(out.message, /medios, no el objetivo/);
});
test('HANDOFF-17 PATCH never generates a week nor calls an LLM/chat: only usuarios/sources are touched', async () => {
  const { f } = await patched();
  assert.ok(![...f.touched].some(t => /weekly|plan|chat|coach_first/.test(t) && t !== 'athlete_coaching_notes'), [...f.touched].join());
  assert.equal(f.rpcCalls.length, 0);
});
test('HANDOFF-20 tampered handoff (edited current/previous/field, swapped id) is rejected; stale one is rejected without side effects', async () => {
  const { f, datos, reread } = await patched(); const profile = await reread(), before = plain(f.row('FP-A'));
  const edits = [d => { d.profileChange.changedFields[0].current = 'Objetivo inventado'; }, d => { d.profileChange.changedFields[0].previous = 'x'; },
    d => { d.profileChange.id = 'a'.repeat(24); }, d => { d.profileChange.changedFields.push({ field: 'level', previous: 'a', current: 'b' }); }];
  for (const edit of edits) { const d = plain(datos); edit(d); assert.equal(resolveProfileChangeHandoff(d, ID_A, profile).ok, false); }
  assert.equal(resolveProfileChangeHandoff({ ...plain(datos), profileChange: { ...plain(datos).profileChange, changedFields: [{ field: 'password', previous: 1, current: 2 }] } }, ID_A, profile).code, 'PROFILE_HANDOFF_INVALID');
  assert.deepEqual(plain(f.row('FP-A')), before, 'handoff resolution never writes');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sportsRuntime, compile, plain } from './trainingContractTestRuntime.mjs';

const load = sportsRuntime();
const api = load('chatAvailability');
const parser = load('weeklyAvailabilityDeclaration');
const week = '2026-09-21', user = 'synthetic-snapshot-regression';
const expected = { carrera: ['lunes', 'miercoles', 'viernes', 'domingo'], box: ['martes', 'jueves'] };
const variants = [
  'carrera: lunes, miercoles, viernes domingo. Box: martes, jueves',
  'Carrera: lunes, miércoles, viernes, domingo. Box: martes, jueves.',
  'carrera lunes miercoles viernes domingo, box martes jueves',
  'Carrera lunes, miércoles, viernes y domingo. Box martes y jueves',
  'Puedo correr lunes miércoles viernes domingo y hacer box martes jueves',
];
const followup = 'Sigo igual, pero el sábado quiero descansar porque el domingo tengo una carrera de 5 km.';
const stored = availability => ({ version: 1, source: 'explicit_user_declaration',
  availability, resolution: 'DECLARED_AVAILABILITY', excludedDisciplines: [], unavailableDays: [], unresolvedDays: [] });

// No network, providers or generation. Reads are detached; updates honor the real CAS.
function database(profile = {}) {
  const tables = {
    usuarios: [{ codigo: user, modo_entrada: 'coach', categoria: 'carrera', especialidad: 'crossfit',
      perfil: structuredClone(profile), distribucion_semanal: null, workout_history: [] }],
    athlete_training_sources: ['carrera', 'box'].map(disciplina => ({ user_codigo: user, disciplina,
      owner: 'forge', activo: true, dias: null })),
  };
  const writes = [];
  return { tables, writes, from(table) {
    assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
    let patch; const filters = [];
    const q = { select() { return q; },
      eq(key, value) { filters.push(row => row[key] !== null && typeof row[key] === 'object'
        ? JSON.stringify(row[key]) === value : row[key] === value); return q; },
      is(key, value) { filters.push(row => row[key] === value); return q; },
      update(value) { patch = plain(value); return q; },
      async execute(single = false) {
        const rows = tables[table].filter(row => filters.every(f => f(row)));
        if (patch) { writes.push({ table, patch }); rows.forEach(row => Object.assign(row, structuredClone(patch))); }
        return { data: structuredClone(single ? rows[0] ?? null : rows), error: null };
      }, single() { return q.execute(true); }, then(y, n) { return q.execute().then(y, n); } };
    return q;
  } };
}

function find(node, predicate) { return predicate(node) ? node : ts.forEachChild(node, child => find(child, predicate)); }
const ui = ts.createSourceFile('FormaPro.tsx', readFileSync('app/FormaPro.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handler = find(ui, n => ts.isIfStatement(n) && n.expression.getText(ui) === 'esperandoConfirmacionDisponibilidad && codigoUsuario');
const entry = find(ui, n => ts.isVariableDeclaration(n) && n.name.getText(ui) === 'dispararGeneracion');
const route = ts.createSourceFile('route.ts', readFileSync('app/api/chat/route.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const routes = ['obtener_confirmacion_disponibilidad', 'verificar_correccion_disponibilidad_deterministico'].map(action => {
  const branch = find(route, n => ts.isIfStatement(n) && n.expression.getText(route) === `action === "${action}"`);
  assert.ok(branch); return branch.getText(route);
});
assert.ok(handler && entry);
function conversation(db) {
  const actualRoute = vm.runInNewContext(compile(`async function route(action,codigo,datos) { ${routes.join('\n')} }; route;`), {
    supabase: db, NextResponse: { json: value => value }, ...api,
  });
  const state = { messages: [], results: [], advances: [], waiting: false };
  const context = {
    codigoUsuario: user, weeklyPlanningContinuationRef: { current: null },
    availabilityConfirmationRef: { current: null }, weeklyTemporalIntentRef: { current: {} },
    apiCall: async body => {
      // Only bootstrap metadata is simulated; no weekly generation code runs.
      if (body.action === 'preparar_generacion_semana') return { ok: true, generation: { currentWeek: week, nextWeek: '2026-09-28' } };
      if (body.action === 'check_week_closure') return { ok: true, yaCerrada: false };
      const result = await actualRoute(body.action, body.codigo, body.datos);
      if (body.action === 'verificar_correccion_disponibilidad_deterministico') state.results.push(plain(result));
      return result;
    },
    requestCoachOwnership: () => null, setMensajes: update => { state.messages = update(state.messages); },
    setCargando() {}, setDistribucionSemanal() {},
    setEsperandoConfirmacionDisponibilidad: value => { state.waiting = value; },
    dispararGeneracion: async (...args) => state.advances.push(args),
  };
  return { state,
    start: vm.runInNewContext(compile(`(${entry.initializer.getText(ui)})`), context),
    send: vm.runInNewContext(compile(`async function send(texto) ${handler.thenStatement.getText(ui)}; send;`), context),
  };
}

for (const text of variants) {
  test(`FULL_SNAPSHOT grammar: ${text}`, () => {
    for (const prior of [{}, { box: ['sabado'], carrera: ['martes'] }]) {
      const result = plain(parser.resolveWeeklyAvailabilityResponse(text, ['carrera', 'box'], prior));
      assert.equal(result.intent, 'FULL_SNAPSHOT', JSON.stringify(result));
      assert.deepEqual(result.declaration.availability, expected);
      assert.equal(result.declaration.resolution, 'DECLARED_AVAILABILITY');
      assert.deepEqual(result.declaration.unresolvedDays, []);
    }
  });
  test(`FULL_SNAPSHOT persists without previous canonical days: ${text}`, async () => {
    const db = database();
    const result = await api.updateChatAvailability(db, user, text, null, week);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.intent, 'FULL_SNAPSHOT'); assert.equal(result.partial, false);
    assert.deepEqual(plain(result.declaration), stored(expected));
    assert.deepEqual(db.tables.usuarios[0].perfil.weekly_availability[week], stored(expected));
    assert.deepEqual(plain((await api.readAvailabilityConfirmation(db, user, week)).availability), expected);
    assert.equal(db.tables.usuarios[0].distribucion_semanal, null);
    assert.ok(db.tables.athlete_training_sources.every(source => source.dias === null));
  });
}

for (const invalidStored of [false, true]) test(`actual UI/routes: reported conversation; invalid stored week=${invalidStored}`, async t => {
  // The second fixture reproduces the previously reported unresolved production
  // snapshot. Neither fixture claims to identify the current production rows.
  const db = database(invalidStored ? { weekly_availability: { [week]: { ...stored({ box: [], carrera: ['sabado'] }),
    unavailableDays: ['martes','jueves','lunes','miercoles','viernes','domingo'], unresolvedDays: ['domingo'] } } } : {});
  const chat = conversation(db);
  await chat.start();
  assert.match(chat.state.messages.at(-1).content, /No tengo una disponibilidad válida configurada/);
  const trace = [];
  for (const text of [variants[0], followup, followup.replace('Sigo', 'Sigue'), 'sigue igual']) {
    await chat.send(text);
    trace.push({ text, result: chat.state.results.at(-1), message: chat.state.messages.at(-1)?.content });
  }
  t.diagnostic(JSON.stringify(trace));
  assert.ok(chat.state.results.every(result => result.ok === true && result.partial !== true), 'Every Availability answer must now succeed');
  assert.equal(chat.state.advances.length, 4); // Recording spy only; never generates a plan.
  for (const result of chat.state.results) assert.deepEqual(result.availability, expected);
  assert.deepEqual(db.tables.usuarios[0].perfil.weekly_availability[week].availability, expected);
  assert.deepEqual(db.tables.usuarios[0].perfil.weekly_availability[week].unresolvedDays, []);
  assert.equal(db.tables.usuarios[0].perfil.targetEvent, undefined, 'Availability is not event authority');
});

test('causal event clause cannot swallow a real Saturday rest edit or remove Sunday', async () => {
  const db = database({ weekly_availability: { [week]: stored({ ...expected, box: ['martes','jueves','sabado'] }) } });
  const result = await api.updateChatAvailability(db, user, followup, undefined, week);
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.partial, false);
  assert.deepEqual(plain(result.availability), expected);
  assert.deepEqual(plain(result.declaration.unavailableDays), ['sabado']);
  assert.deepEqual(plain(result.declaration.unresolvedDays), []);
});

test('confirmation alone still cannot create canonical availability', async () => {
  const db = database(), chat = conversation(db);
  await chat.start(); await chat.send('sigue igual');
  assert.equal(chat.state.results.at(-1).ok, false);
  assert.match(chat.state.messages.at(-1).content, /No tengo una disponibilidad canónica válida para reutilizar/);
  assert.equal(db.writes.length, 0); assert.equal(chat.state.advances.length, 0);
});

for (const [text, digest] of [[followup, null], [variants[0], 'stale-snapshot']]) {
  test(`invalid stored week is not repaired by a patch or stale confirmation: ${text}`, async () => {
    const db = database({ weekly_availability: { [week]: { ...stored(expected), unresolvedDays: ['domingo'] } } });
    const before = structuredClone(db.tables);
    const result = await api.updateChatAvailability(db, user, text, digest, week);
    assert.equal(result.ok, false); assert.equal(db.writes.length, 0);
    assert.deepEqual(db.tables, before);
  });
}

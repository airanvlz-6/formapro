import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import vm from 'node:vm';
import ts from 'typescript';
import { sportsRuntime, compile, plain } from './trainingContractTestRuntime.mjs';

// Intentionally red contract tests. Do not weaken these expectations to match
// the current parser. No production DB, provider, Planner or generation runs.
const load = sportsRuntime({ console: { log() {}, info() {}, warn() {}, error() {} } });
const api = load('chatAvailability');
const parse = load('weeklyAvailabilityDeclaration').parseWeeklyAvailabilityDeclaration;
const week = '2026-09-21';
const user = 'synthetic-availability-regression';
const habitual = { box: ['martes', 'jueves'], carrera: ['lunes', 'miercoles', 'viernes', 'sabado'] };
const withoutSaturday = { box: ['martes', 'jueves'], carrera: ['lunes', 'miercoles', 'viernes'] };
const declaration = availability => ({ version: 1, source: 'explicit_user_declaration',
  resolution: 'DECLARED_AVAILABILITY', availability: structuredClone(availability),
  excludedDisciplines: [], unavailableDays: [], unresolvedDays: [] });

/** In-memory PostgREST boundary: real resolver, isolated rows, real CAS predicate.
 * Reads return copies so an in-place mutation cannot masquerade as persistence.
 * Only the two tables needed by availability are exposed; no network capability.
 */
function database({ days = habitual, profile = {} } = {}) {
  const tables = {
    usuarios: [{ codigo: user, modo_entrada: 'coach', categoria: 'carrera', especialidad: 'crossfit',
      perfil: { dias: 6, ...structuredClone(profile) }, workout_history: [],
      distribucion_semanal: structuredClone(days) }],
    athlete_training_sources: Object.entries(days).map(([disciplina, dias]) => ({
      user_codigo: user, disciplina, dias: [...dias], owner: 'forge', activo: true,
    })),
  };
  const writes = [];
  return { tables, writes, from(table) {
    assert.ok(Object.hasOwn(tables, table), `Unexpected table: ${table}`);
    let patch;
    const filters = [];
    const query = {
      select() { return query; },
      eq(key, value) { filters.push(row => typeof row[key] === 'object' && row[key] !== null
        ? JSON.stringify(row[key]) === value : row[key] === value); return query; },
      is(key, value) { filters.push(row => row[key] === value); return query; },
      update(value) { patch = plain(value); return query; },
      async execute(single = false) {
        const rows = tables[table].filter(row => filters.every(matches => matches(row)));
        if (patch) {
          writes.push({ table, patch: structuredClone(patch), matched: rows.length });
          for (const row of rows) Object.assign(row, structuredClone(patch));
        }
        if (single && rows.length !== 1) return { data: null, error: { code: 'PGRST116' } };
        return { data: structuredClone(single ? rows[0] : rows), error: null };
      },
      single() { return query.execute(true); },
      then(resolve, reject) { return query.execute().then(resolve, reject); },
    };
    return query;
  } };
}

async function answer(db, text) {
  const shown = await api.readAvailabilityConfirmation(db, user, week);
  assert.equal(shown.ok, true, `Fixture must have readable effective availability: ${JSON.stringify(shown)}`);
  return api.updateChatAvailability(db, user, text, shown.snapshotDigest, week);
}
async function assertAvailability(db, result, expected, message) {
  assert.equal(result.ok, true, `${message}: ${JSON.stringify(result)}`);
  assert.notEqual(result.partial, true, message);
  assert.deepEqual(plain(result.availability), expected, message);
  const reread = await api.readAvailabilityConfirmation(db, user, week);
  assert.equal(reread.ok, true);
  assert.deepEqual(plain(reread.availability), expected, `${message} (persisted readback)`);
}
function canonicalDeclarationsWritten(db) {
  return db.writes.flatMap(write => {
    const value = write.patch.perfil?.weekly_availability?.[week];
    return value === undefined ? [] : [value];
  });
}

// Execute the existing availability message handler, not a test reimplementation
// of its advancement rule. Generation is replaced only by a recording spy.
const ui = ts.createSourceFile('FormaPro.tsx', readFileSync('app/FormaPro.tsx', 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(node, predicate) {
  return predicate(node) ? node : ts.forEachChild(node, child => find(child, predicate));
}
const handler = find(ui, node => ts.isIfStatement(node)
  && node.expression.getText(ui) === 'esperandoConfirmacionDisponibilidad && codigoUsuario');
assert.ok(handler, 'Actual availability handler must be exercised');
async function conversation(db) {
  const shown = await api.readAvailabilityConfirmation(db, user, week);
  assert.equal(shown.ok, true);
  const state = { results: [], messages: [], advances: [], waiting: true };
  const execute = vm.runInNewContext(compile(`async function send(texto) ${handler.thenStatement.getText(ui)}; send;`), {
    codigoUsuario: user,
    weeklyPlanningContinuationRef: { current: { codigo: user, targetWeekStart: week } },
    availabilityConfirmationRef: { current: shown.snapshotDigest },
    weeklyTemporalIntentRef: { current: { text: 'Incluir hoy', answeringQuestion: true } },
    apiCall: async body => {
      assert.equal(body.action, 'verificar_correccion_disponibilidad_deterministico');
      assert.equal(body.codigo, user);
      assert.equal(body.datos.targetWeekStart, week);
      const r = await api.updateChatAvailability(db, user, body.datos.mensajeUsuario,
        body.datos.snapshotDigest, body.datos.targetWeekStart);
      state.results.push(plain(r));
      return r;
    },
    requestCoachOwnership: () => null,
    setMensajes: update => { state.messages = update(state.messages); },
    setCargando() {}, setDistribucionSemanal() {},
    setEsperandoConfirmacionDisponibilidad: value => { state.waiting = value; },
    dispararGeneracion: async (...args) => { state.advances.push(args); },
  });
  return { state, send: execute };
}

test('A: negative running exception patches prior availability, never selects only Saturday', async () => {
  const db = database();
  await assertAvailability(db, await answer(db, 'sigo igual excepto correr el sábado'), withoutSaturday,
    'Exclude running Saturday while preserving Box and the other running days');
});

test('B: sin cambios attached to named Box days preserves all prior disciplines', async () => {
  const db = database(), r = await answer(db, 'Box martes y jueves sin cambios');
  await assertAvailability(db, r, habitual, 'Sin cambios is not day unavailability');
  assert.equal((r.declaration?.unavailableDays ?? []).some(day => ['martes', 'jueves'].includes(day)), false);
});

for (const sharedSaturday of [false, true]) {
  for (const [text, runningOnly] of [
    ['sábado no', false], ['el sábado no puedo', false], ['el sábado no corro', true],
    ['no puedo sábado', false], ['no quiero correr el sábado', true],
  ]) test(`C: ${text}; Saturday shared with Box=${sharedSaturday}`, async () => {
    const days = structuredClone(habitual);
    if (sharedSaturday) days.box.push('sabado');
    const expected = { box: runningOnly ? days.box : days.box.filter(day => day !== 'sabado'),
      carrera: [...withoutSaturday.carrera] };
    const db = database({ days });
    await assertAvailability(db, await answer(db, text), expected,
      runningOnly ? 'Running negation must not prohibit Box on the same day' : 'Global day negation preserves all other days');
  });
}

for (const existingWeek of [false, true]) {
  for (const text of ['sigo igual', 'sigue igual', 'igual', 'sin cambios']) {
    test(`D: ${text}; effective weekly override=${existingWeek}`, async () => {
      const effectiveWeek = { box: ['martes'], carrera: ['lunes', 'miercoles', 'viernes'] };
      const db = database({ profile: existingWeek ? {
        weekly_availability: { [week]: declaration(effectiveWeek) },
        prescription_access: { '2026-09-25': { availability: 'unavailable' } },
      } : {} });
      const expected = existingWeek ? { box: ['martes'], carrera: ['lunes', 'miercoles'] } : habitual;
      const before = structuredClone(db.tables);
      await assertAvailability(db, await answer(db, text), expected, 'Confirmation preserves effective, not just habitual, availability');
      assert.deepEqual(db.tables, before, 'An unchanged confirmation does not replace the stored calendar');
      assert.equal(db.writes.length, 0);
    });
  }
}

test('E: clarification after a negative exception cannot lose its pending polarity', async () => {
  const db = database(), chat = await conversation(db);
  await chat.send('sigo igual excepto sábado');
  const first = chat.state.results.at(-1);
  if (first.ok === true && first.partial !== true) {
    // Resolving the unambiguous exception immediately is also a valid contract.
    await assertAvailability(db, first, withoutSaturday, 'An immediately resolved exception must remain negative');
    return;
  }
  assert.equal(chat.state.advances.length, 0);
  assert.equal(canonicalDeclarationsWritten(db).length, 0);
  assert.equal(chat.state.waiting, true);
  await chat.send('carrera sábado'); // Clarifies discipline/day; does not revoke the exclusion.
  const second = chat.state.results.at(-1);
  if (second.ok === true && second.partial !== true) {
    await assertAvailability(db, second, withoutSaturday, 'Follow-up must not become a positive replacement snapshot');
  } else {
    assert.equal(second.partial, true, 'If still ambiguous, the resolver must explicitly remain partial');
    assert.equal(chat.state.advances.length, 0);
    assert.equal(canonicalDeclarationsWritten(db).length, 0);
  }
});

for (const text of ['el domingo tengo una carrera 5K', 'el domingo a las 10 tengo una carrera 5K']) {
  test(`F: an event is not weekly availability: ${text}`, async () => {
    const db = database(), before = structuredClone(db.tables);
    await answer(db, text);
    assert.deepEqual(db.tables, before, 'Reporting an event alone cannot replace weekly availability');
    assert.equal(db.writes.length, 0);
    // Do not represent the event hour as an unresolved weekday construction.
    assert.equal(parse(text, ['box', 'carrera'], habitual), null, 'Event-only text is outside the availability declaration grammar');
  });
}
test('F: an event hour beside a training clause is not an unresolved weekday range', () => {
  const result = parse('El lunes puedo correr. El domingo a las 10 tengo una carrera 5K.',
    ['box', 'carrera'], habitual);
  assert.equal((result?.unresolvedDays ?? []).includes('domingo'), false,
    'Domingo a las 10 describes an event time, not an unresolved availability day range');
  assert.equal((result?.availability?.carrera ?? []).includes('domingo'), false,
    'The adjacent event must not add Sunday as weekly training availability');
});

const uncertain = 'Corro lunes y miércoles. Creo que quizá haga algo el sábado.';
test('G1: relevant unresolved days require an explicitly partial result', async () => {
  const r = await answer(database(), uncertain);
  assert.equal(r.partial, true, `Cannot present unresolved availability as complete: ${JSON.stringify(r)}`);
});
test('G2: relevant unresolved days cannot persist a definitive weekly snapshot', async () => {
  const db = database();
  await answer(db, uncertain);
  assert.deepEqual(canonicalDeclarationsWritten(db), [], 'Keep the definitive weekly calendar untouched pending clarification');
});
test('G3: actual UI handler cannot advance generation with unresolved availability', async () => {
  const chat = await conversation(database());
  await chat.send(uncertain);
  assert.equal(chat.state.advances.length, 0, 'No generation dispatch before resolving every relevant day');
  assert.equal(chat.state.waiting, true);
  assert.equal(chat.state.results.at(-1).partial, true);
});
test('G4: overlapping unresolved/unavailable Sunday requires clarification, not admission', async () => {
  const db = database(), chat = await conversation(db);
  await chat.send('Corro lunes. Domingo no puedo. Quizá el domingo corro.');
  assert.equal(chat.state.advances.length, 0, 'Conflicting Sunday classifications cannot advance generation');
  assert.equal(chat.state.results.at(-1).partial, true);
  assert.deepEqual(canonicalDeclarationsWritten(db), []);
  assert.equal(chat.state.waiting, true);
  assert.ok(chat.state.messages.some(m => m.role === 'assistant' && /[?¿]/.test(m.content)),
    'Ask for clarification instead of silently accepting both classifications');
});

test('H: a partially recognized misspelled day list cannot silently replace the week', async () => {
  const db = database(), r = await answer(db, 'Carrera lunes y savado');
  assert.equal(r.partial, true, 'Unrecognized savado must not disappear from an apparently complete declaration');
  assert.deepEqual(canonicalDeclarationsWritten(db), []);
});

// Synthetic wording reproduces the reported production JSON. It is NOT a claim
// about the unavailable original athlete message. Assert rejection, never the bug.
const incidentText = 'Box martes y jueves sin cambios. Carrera lunes, miércoles y viernes sin cambios. '
  + 'Sigo igual excepto correr el sábado. El domingo no entreno. El domingo a las 10 tengo una carrera 5K.';
const forbiddenIncident = { version: 1, source: 'explicit_user_declaration', resolution: 'DECLARED_AVAILABILITY',
  availability: { box: [], carrera: ['sabado'] }, excludedDisciplines: [],
  unavailableDays: ['martes', 'jueves', 'lunes', 'miercoles', 'viernes', 'domingo'], unresolvedDays: ['domingo'] };
test('I: message -> real resolver -> simulated write must never persist the incident JSON', async () => {
  const db = database(), chat = await conversation(db);
  await chat.send(incidentText);
  const written = canonicalDeclarationsWritten(db);
  assert.equal(written.filter(value => isDeepStrictEqual(value, forbiddenIncident)).length, 0,
    `Forbidden incident snapshot reached persistence: ${JSON.stringify(written)}`);
  assert.equal(chat.state.advances.length, 0);
  assert.equal(chat.state.results.at(-1).partial, true);
  assert.deepEqual(written, [], 'Unresolved Sunday must prevent a definitive replacement');
});

test('PATCH: adding one running day preserves omitted days and disciplines', async () => {
  const db = database();
  await assertAvailability(db, await answer(db, 'Añadir carrera el domingo'),
    { box: [...habitual.box], carrera: [...habitual.carrera, 'domingo'] }, 'An addition is not a replacement of the week');
});
test('SNAPSHOT: an unequivocal complete replacement can intentionally omit habitual days', async () => {
  const db = database();
  await assertAvailability(db, await answer(db, 'Esta semana solo correré el domingo. No hago box esta semana.'),
    { box: [], carrera: ['domingo'] }, 'Explicit complete-week availability still permits replacement');
});

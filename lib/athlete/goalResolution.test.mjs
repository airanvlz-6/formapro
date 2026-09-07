import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain, fakeDatabase } from '../sports/trainingContractTestRuntime.mjs';
let clockOffset = 0;
class TestDate extends Date { static now() { return Date.now() + clockOffset; } }
const logs = [], load = sportsRuntime({ Date: TestDate, console: { log: (...args) => logs.push(args), warn: () => {} } });
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const { resolveGoalAuthority: resolve, goalResolutionDiagnostic } = load('../athlete/goalResolution');
const answers = load('../athlete/goalAnswers');
const strategies = load('../planning/canonicalWeekStrategy');
const scope = { mode: 'coach', prescriptionAllowed: true, managedDisciplines: ['box', 'carrera'], externalDisciplines: [] };
const resolution = user => resolve(project(user));
for (const [value, id] of [['crossfit', 'crossfit'], ['Media maratón', 'half_marathon'], ['CrossFit Open', 'crossfit'], ['fuerza máxima', 'max_strength'], ['10K', '10k'], ['Hyrox', 'hyrox']]) {
  test(`supported declaration ${value} resolves exactly`, () => {
    const result = resolution({ objetivo_principal: { descripcion: value } });
    assert.equal(result.status, 'GOAL_RESOLVED'); assert.equal(result.canonicalGoalId, id);
    assert.equal(result.candidates[0].source, 'usuarios.objetivo_principal');
  });
}
for (const value of ['sport_not_in_catalog', 'halterofilia', 'weightlifting', 'olympic lifting', 'mejorar snatch y clean and jerk']) {
  test(`unsupported ${value} never maps to another sport`, () => {
    const result = resolution({ objetivo_principal: value });
    assert.equal(result.status, 'GOAL_UNSUPPORTED'); assert.equal(result.canonicalGoalId, null);
  });
}
test('missing has no candidates', () => assert.deepEqual(plain(resolution({})), { status: 'GOAL_MISSING', canonicalGoalId: null, candidates: [] }));
test('incompatible recognized candidates remain conflict', () => {
  const r = resolution({ objetivo_principal: 'crossfit', perfil: { objetivo_general: 'half_marathon' } });
  assert.equal(r.status, 'GOAL_CONFLICT'); assert.equal(r.canonicalGoalId, null); assert.equal(r.candidates.length, 2);
});
test('3A conflict is retained even for aliases of one ID', () => {
  assert.equal(resolution({ objetivo_principal: 'crossfit', perfil: { objetivo_detalle: 'CrossFit Open' } }).status, 'GOAL_CONFLICT');
});
for (const [name, user] of Object.entries({ analyzer: { analisis: { objetivo: 'CrossFit Open' }, ciclo_actual: { objetivo: 'half_marathon' } },
  ownership: { athlete_training_sources: [{ disciplina: 'carrera', owner: 'forge' }] },
  discipline: { categoria: 'carrera', especialidad: 'crossfit' },
  secondary: { perfil: { objetivos_secundarios: ['crossfit'], objetivo_skill: 'snatch' } },
  weakness: { athlete_development: [{ id: 'snatch', estado: 'activa', indicador: 'snatch' }], lesiones_actuales: 'knee' } })) {
  test(`${name} alone never supplies primary goal`, () => assert.equal(resolution(user).status, 'GOAL_MISSING'));
}
test('resolved running goal reaches demands and methods', () => {
  const s = strategies.buildCanonicalWeekStrategy(project({ objetivo_principal: 'half_marathon' }), scope, 3);
  assert.ok(s.adaptations.some(a => a.id === 'umbral')); assert.ok(s.methods.includes('running_threshold'));
});
test('CrossFit deload remains admitted with existing qualitative policy', () => {
  const s = strategies.buildCanonicalWeekStrategy(project({ objetivo_principal: 'crossfit', ciclo_actual: { bloque: 'deload' } }), scope, 3);
  assert.equal(s.goal.id, 'crossfit'); assert.equal(s.volumeIntent, 'reduce'); assert.equal(s.adaptations[0].id, 'recuperacion_activa');
});
test('unresolved pure strategy has no invented adaptations', () => {
  const s = strategies.buildCanonicalWeekStrategy(project({}), scope, 3);
  assert.equal(s.goal.id, null); assert.equal(s.adaptations.length, 0); assert.equal(s.methods.length, 0);
});
test('diagnostic removes personal prose and preserves cause and provenance', () => {
  const d = goalResolutionDiagnostic(resolution({ objetivo_principal: 'sensitive personal free text' }));
  assert.doesNotMatch(JSON.stringify(d), /sensitive/); assert.equal(d.status, 'GOAL_UNSUPPORTED');
  assert.deepEqual(plain(d.unsupportedLabelsSafe), ['[unrecognized]']);
});
function database(overrides = {}) {
  const tables = { usuarios: { codigo: 'fixture', modo_entrada: 'coach', categoria: 'carrera', especialidad: 'crossfit',
    objetivo_principal: null, perfil: { dias: 3, objetivos_secundarios: ['hyrox'], objetivo_skill: 'snatch', competicion: { fecha: '2027-01-01' } },
    distribucion_semanal: { box: ['martes'], carrera: ['lunes', 'sabado'] }, workout_history: [], ...overrides },
    athlete_training_sources: ['box', 'carrera'].map(disciplina => ({ disciplina, owner: 'forge', activo: true, dias: disciplina === 'box' ? ['martes'] : ['lunes', 'sabado'] })),
    weekly_plan: [], session_modification_events: [], physiology_records: [], athlete_state_events: [], athlete_coaching_notes: [] };
  const db = fakeDatabase(tables), original = db.from.bind(db);
  Object.assign(db, { tables, writes: [], userReads: 0 });
  db.from = table => {
    const q = original(table); let update, filters = [];
    q.update = value => { update = plain(value); return q; };
    q.eq = (key, value) => { filters.push([key, value]); return q; }; q.is = q.eq;
    q.single = async () => {
      if (table === 'usuarios') { db.userReads++; db.onRead?.(db); }
      return { data: structuredClone(tables[table]), error: db.readError ? {} : null };
    };
    if (['weekly_plan', 'physiology_records'].includes(table)) q.maybeSingle = async () => ({ data: null, error: null });
    q.then = (yes, no) => {
      if (update) {
        db.onWrite?.(db);
        const matches = filters.every(([key, value]) => {
          const actual = tables[table][key]; return value === null ? actual == null : (['objetivo_principal', 'perfil'].includes(key) ? JSON.stringify(actual) : actual) === value;
        });
        if (matches && !db.writeError) { db.writes.push(update); Object.assign(tables[table], update); }
        return Promise.resolve({ data: matches && !db.writeError ? [{ codigo: 'fixture' }] : [], error: db.writeError ? {} : null }).then(yes, no);
      }
      return Promise.resolve({ data: structuredClone(tables[table]), error: null }).then(yes, no);
    };
    return q;
  };
  return db;
}
const request = { targetWeekStart: '2026-09-07', today: '2026-09-07', empezarHoy: true, snapshot: null, strategyVersion: 1, planningRunId: 'fixture-run' };
for (const [status, overrides] of [['GOAL_MISSING', {}], ['GOAL_UNSUPPORTED', { objetivo_principal: 'weightlifting' }],
  ['GOAL_CONFLICT', { objetivo_principal: 'crossfit', perfil: { objetivo_detalle: 'half_marathon' } }]]) {
  test(`${status} stops normal Planner/Builder without writes`, async () => {
    const db = database(overrides); let calls = 0;
    const r = await load('../planning/prepareAllowedWeeklyPlanContract').planBoundedWeek(db, 'fixture', request, async () => { calls++; throw Error('must not call'); });
    assert.equal(r.ok, false); assert.equal(r.code, status); assert.equal(r.goalRequirement.resolution.status, status);
    assert.equal(r.goalRequirement.canPlanTowardDeclaredGoal, false); assert.equal(calls, 0); assert.equal(db.writes.length, 0);
    assert.equal(r.estructura, undefined); assert.equal(logs.at(-1)[1].admitted, false);
  });
}
test('explicit primary selection writes canonical source, archives conflicts and rereads database', async () => {
  const db = database({ objetivo_principal: { descripcion: 'crossfit' }, perfil: { objetivo_general: 'half_marathon', objetivo_detalle: 'sub 90', objetivos_secundarios: ['hyrox'], objetivo_skill: 'snatch' } });
  const before = structuredClone(db.tables), q = await answers.requireGoalAuthority(db, 'fixture');
  const result = await answers.saveGoalAnswer(db, 'fixture', q.questionToken, 'Media maratón');
  assert.equal(result.resolved, true); assert.equal(result.resolution.canonicalGoalId, 'half_marathon'); assert.equal(db.userReads, 3);
  assert.equal(db.tables.usuarios.objetivo_principal.descripcion, 'half_marathon');
  assert.deepEqual(db.tables.usuarios.objetivo_principal.resolution.previousPrimary, before.usuarios.objetivo_principal);
  assert.equal(db.tables.usuarios.objetivo_principal.resolution.previousProfileDeclarations.objetivo_detalle, 'sub 90');
  assert.deepEqual(db.tables.usuarios.perfil, { objetivos_secundarios: ['hyrox'], objetivo_skill: 'snatch' });
});
test('goal answer preserves scope, availability, restrictions and physiology tables', async () => {
  const db = database(), before = structuredClone(db.tables);
  const q = await answers.requireGoalAuthority(db, 'fixture'); await answers.saveGoalAnswer(db, 'fixture', q.questionToken, 'crossfit');
  for (const [key, value] of Object.entries(before.usuarios)) if (!['perfil', 'objetivo_principal'].includes(key)) assert.deepEqual(db.tables.usuarios[key], value);
  assert.deepEqual(db.tables.usuarios.perfil, before.usuarios.perfil);
  for (const key of Object.keys(before).filter(k => k !== 'usuarios')) assert.deepEqual(db.tables[key], before[key]);
  assert.deepEqual(Object.keys(db.writes[0]).sort(), ['objetivo_principal', 'perfil']);
});
for (const mode of ['coach', 'focus']) test(`${mode} scope is unchanged by resolution`, async () => {
  const db = database({ modo_entrada: mode }); if (mode === 'focus') db.tables.athlete_training_sources[0].owner = 'external';
  const before = structuredClone(db.tables.athlete_training_sources), q = await answers.requireGoalAuthority(db, 'fixture');
  assert.equal((await answers.saveGoalAnswer(db, 'fixture', q.questionToken, '10K')).resolved, true);
  assert.deepEqual(db.tables.athlete_training_sources, before); assert.equal(db.tables.usuarios.modo_entrada, mode);
});
test('Supervision remains non-prescriptive and goal projection remains available', async () => {
  const db = database({ modo_entrada: 'supervision' });
  assert.equal(resolution(db.tables.usuarios).status, 'GOAL_MISSING');
  await assert.rejects(() => answers.requireGoalAuthority(db, 'fixture'), /SCOPE_INVALID/); assert.equal(db.writes.length, 0);
});
test('unsupported answer and cancellation never mutate authority', async () => {
  const db = database(), q = await answers.requireGoalAuthority(db, 'fixture');
  const r = await answers.saveGoalAnswer(db, 'fixture', q.questionToken, 'sport_not_in_catalog');
  assert.equal(r.code, 'GOAL_ANSWER_UNSUPPORTED'); assert.equal(db.writes.length, 0);
  assert.equal((await answers.saveGoalAnswer(db, 'fixture', q.questionToken, 'mantener mi objetivo')).cancelled, true);
  assert.equal(db.writes.length, 0);
});
test('tampered and cross-user questions are rejected', async () => {
  const db = database(), q = await answers.requireGoalAuthority(db, 'fixture');
  await assert.rejects(() => answers.saveGoalAnswer(db, 'fixture', q.questionToken + 'x', 'crossfit'), /QUESTION_INVALID/);
  await assert.rejects(() => answers.saveGoalAnswer(db, 'other', q.questionToken, 'crossfit'), /QUESTION_EXPIRED/);
  assert.equal(db.writes.length, 0);
});
test('profile changed since question requires fresh authority', async () => {
  const db = database(), q = await answers.requireGoalAuthority(db, 'fixture'); db.tables.usuarios.perfil.dias = 4;
  await assert.rejects(() => answers.saveGoalAnswer(db, 'fixture', q.questionToken, 'crossfit'), /CHANGED_RETRY/); assert.equal(db.writes.length, 0);
});
test('expired question cannot write', async () => {
  const db = database(), q = await answers.requireGoalAuthority(db, 'fixture');
  try { clockOffset = 31 * 60_000;
    await assert.rejects(() => answers.saveGoalAnswer(db, 'fixture', q.questionToken, 'crossfit'), /EXPIRED/);
    assert.equal(db.writes.length, 0);
  } finally { clockOffset = 0; }
});
test('changed ownership invalidates question without modifying primary', async () => {
  const db = database(), q = await answers.requireGoalAuthority(db, 'fixture'); db.tables.athlete_training_sources[0].owner = 'external';
  await assert.rejects(() => answers.saveGoalAnswer(db, 'fixture', q.questionToken, 'crossfit'), /CHANGED_RETRY/);
  assert.equal(db.writes.length, 0);
});
test('goal readback precedes continuation and supplies the refreshed profile', async () => {
  const db = database(), q = await answers.requireGoalAuthority(db, 'fixture');
  const result = await answers.saveGoalAnswer(db, 'fixture', q.questionToken, 'crossfit');
  assert.deepEqual(plain(result.primaryGoal), db.tables.usuarios.objetivo_principal);
  assert.deepEqual(plain(result.profile), db.tables.usuarios.perfil);
  await assert.rejects(() => answers.saveGoalAnswer(db, 'fixture', q.questionToken, '10k'), /CHANGED_RETRY/);
  assert.equal(db.writes.length, 1);
});
test('CAS prevents overwrite of concurrent profile change', async () => {
  const db = database(), q = await answers.requireGoalAuthority(db, 'fixture'); db.onWrite = db => { db.tables.usuarios.perfil.dias = 4; };
  await assert.rejects(() => answers.saveGoalAnswer(db, 'fixture', q.questionToken, 'crossfit'), /CHANGED_RETRY/); assert.equal(db.writes.length, 0);
});
test('failed database reread never reports resolved', async () => {
  const db = database(), q = await answers.requireGoalAuthority(db, 'fixture'); db.onRead = db => { if (db.userReads === 3) db.readError = true; };
  await assert.rejects(() => answers.saveGoalAnswer(db, 'fixture', q.questionToken, 'crossfit'), /READ_FAILED/); assert.equal(db.writes.length, 1);
});
test('reread uses persisted data, not proposed update', async () => {
  const db = database(), q = await answers.requireGoalAuthority(db, 'fixture');
  db.onRead = db => { if (db.userReads === 3) db.tables.usuarios.objetivo_principal = { descripcion: 'weightlifting' }; };
  await assert.rejects(() => answers.saveGoalAnswer(db, 'fixture', q.questionToken, 'crossfit'), /CHANGED_RETRY/);
});
test('question and result serialize for Web and React Native with no browser dependency', async () => {
  const q = await answers.requireGoalAuthority(database(), 'fixture'); assert.deepEqual(plain(q), JSON.parse(JSON.stringify(q)));
  assert.ok(q.question.options.some(o => o.id === 'max_strength')); assert.equal(q.question.answerType, 'canonical_goal_selection');
  assert.doesNotMatch(Buffer.from(q.questionToken.split('.')[0], 'base64url').toString(), /objetivos_secundarios|snatch/);
});

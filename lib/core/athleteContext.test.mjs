import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import ts from 'typescript';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';

const runtime = sportsRuntime();
const { loadCoreAthleteContext: load } = runtime('../core/athleteContext');
const { declareTargetEvent } = runtime('../athlete/eventAuthority');
const date = '2026-09-29';
function database(user = {}, sources = [], failures = {}) {
  const calls = [];
  const tables = {
    usuarios: { codigo: 'athlete', modo_entrada: 'coach', especialidad: 'crossfit',
      objetivo_principal: 'CrossFit Open', perfil: { nivel_cf: 'intermedio' },
      distribucion_semanal: { box: ['lunes', 'martes', 'jueves', 'viernes', 'sabado'] }, ...user },
    athlete_training_sources: sources, athlete_state_events: [], athlete_coaching_notes: [], weekly_plan: [],
  };
  return { tables, calls, from(table) {
    calls.push({ table, filters: [], columns: null }); const call = calls.at(-1);
    const q = {
      select(columns) { call.columns = columns; return q; },
      eq(...args) { call.filters.push(args); return q; },
      in() { return q; }, order() { return q; }, range() { return q; }, lte() { return q; }, limit() { return q; },
      maybeSingle() { return q; },
      then(yes, no) {
        if (failures[table] === 'throw') return Promise.reject(new Error('transport')).then(yes, no);
        let data = tables[table];
        if (table === 'usuarios' && data) data = Object.fromEntries(call.columns.split(',').map(k => [k, data[k]]));
        return Promise.resolve({ data, error: failures[table] ? { message: 'database failure' } : null }).then(yes, no);
      },
    }; return q;
  } };
}
const source = (disciplina, owner = 'forge', activo = true) => ({ disciplina, owner, activo });

test('A: CrossFit/Open facts, availability distinct from frequency, no recorded restrictions', async () => {
  const db = database({}, [source('crossfit')]);
  const c = plain(await load(db, 'athlete', date));
  assert.equal(c.goal.value.canonicalGoalId, 'crossfit');
  assert.equal(c.goal.value.candidates[0].value, 'CrossFit Open');
  assert.deepEqual(c.disciplines.value.entries, [{ discipline: 'box', ownership: 'forge', active: true, source: 'athlete_training_sources' }]);
  assert.equal(c.availability.byDiscipline.box.value.length, 5);
  assert.equal(c.restrictions.value.resolution, 'confirmed_none');
  assert.equal(c.experience.value.declarations.nivel_cf.value, 'intermedio');
  assert.equal(c.trainingHistory.value.entries.length, 0);
  assert.equal(c.targetEvent.value.status, 'missing');
  assert.ok(db.calls.every(c => c.filters.some(([key, value]) => ['codigo', 'user_codigo'].includes(key) && value === 'athlete')));
  for (const key of ['method', 'frequency', 'phase', 'slots', 'sessions', 'planningMode']) assert.equal(Object.hasOwn(c, key), false);
});

test('B: confirmed half-marathon event, running and external CrossFit; position is not advanced', async () => {
  const targetEvent = declareTargetEvent('athlete', 'half_marathon', '2027-02-14', date, null, date + 'T12:00:00Z');
  const db = database({ especialidad: 'carrera', objetivo_principal: 'half_marathon',
    perfil: { targetEvent, nivel_carrera: 'intermedio' },
    ciclo_actual: { bloque: 'acumulacion', semana: 2, totalSemanas: 4, planningWeekStart: '2026-09-28' },
    distribucion_semanal: { carrera: ['lunes', 'miercoles', 'domingo'], box: ['martes', 'viernes'] },
  }, [source('running'), source('crossfit', 'external')]);
  const before = JSON.stringify(db.tables);
  const c = plain(await load(db, 'athlete', date));
  assert.equal(c.targetEvent.value.status, 'confirmed');
  assert.equal(c.targetEvent.value.targetDate, '2027-02-14');
  assert.equal(c.targetEvent.value.event.provenance.athleteId, 'athlete');
  assert.equal(c.disciplines.value.entries[1].ownership, 'external');
  assert.equal(c.availability.byDiscipline.carrera.value.length, 3);
  assert.equal(c.availability.byDiscipline.box.value.length, 2);
  assert.equal(c.currentPosition.value.week.value, 2);
  assert.equal(c.currentPosition.value.planningWeekStart.value, '2026-09-28');
  assert.equal(JSON.stringify(db.tables), before);
});

test('C: unsupported goal retained, missing availability unknown, restriction read failure visible', async () => {
  const db = database({ objetivo_principal: 'personal unrecognized goal', distribucion_semanal: {} },
    [source('box')], { athlete_state_events: true });
  const c = plain(await load(db, 'athlete', date));
  assert.equal(c.goal.value.status, 'GOAL_UNSUPPORTED');
  assert.equal(c.goal.value.candidates[0].value, 'personal unrecognized goal');
  assert.equal(c.availability.byDiscipline.box.status, 'unknown');
  assert.equal(c.availability.byDiscipline.box.value, null);
  assert.equal(c.restrictions.status, 'read_failed');
  assert.equal(c.restrictions.value, null);
});

test('missing/conflicting goals are different from unsupported; zero days is known', async () => {
  const db = database({ objetivo_principal: null, perfil: {}, distribucion_semanal: { box: [] } }, [source('box')]);
  let c = await load(db, 'athlete', date);
  assert.equal(c.goal.value.status, 'GOAL_MISSING');
  assert.deepEqual(plain(c.availability.byDiscipline.box), { status: 'known', source: 'usuarios.distribucion_semanal/athlete_training_sources.dias', value: [] });
  db.tables.usuarios.objetivo_principal = 'crossfit';
  db.tables.usuarios.perfil.objetivo_principal = 'half_marathon';
  c = await load(db, 'athlete', date);
  assert.equal(c.goal.value.status, 'GOAL_CONFLICT');
});

test('failed profile, sources and history reads never become empty known facts', async () => {
  const c = await load(database({}, [], { usuarios: true, athlete_training_sources: 'throw', weekly_plan: true }), 'athlete', date);
  for (const name of ['identity', 'disciplines', 'goal', 'targetEvent', 'experience', 'trainingHistory', 'currentPosition'])
    assert.equal(c[name].status, 'read_failed', name);
  assert.equal(c.availability.disciplineDiscovery, 'read_failed');
});

test('inactive sources remain inactive; contradictory ownership is inspectable', async () => {
  const c = await load(database({}, [source('box'), source('box', 'external'), source('running', 'external', false)]), 'athlete', date);
  assert.equal(c.disciplines.value.entries[2].active, false);
  assert.equal(c.disciplines.value.scopeStatus, 'unresolved');
  assert.ok(c.disciplines.value.diagnostics.includes('SCOPE_OWNERSHIP_AMBIGUOUS'));
});

test('unconfirmed date and invalid signature never become confirmed event', async () => {
  const db = database({ objetivo_principal: { descripcion: 'half_marathon', fecha: '2027-02-14' } });
  let c = await load(db, 'athlete', date);
  assert.equal(c.targetEvent.value.status, 'legacy_unconfirmed');
  assert.equal(c.targetEvent.value.targetDate, null);
  assert.equal(c.targetEvent.value.legacyCandidates[0].date, '2027-02-14');
  db.tables.usuarios.perfil.targetEvent = { event: { eventDate: '2027-02-14' }, signature: 'invalid' };
  c = await load(db, 'athlete', date);
  assert.equal(c.targetEvent.value.status, 'unverified');
});

test('recorded history separates planned from performed without inventing dose', async () => {
  const db = database();
  db.tables.weekly_plan = [{ week_start: '2026-09-28', sessions: [
    { dia: 'lunes', tipo: 'box', titulo: 'planned', descripcion: 'not executed' },
    { dia: 'martes', tipo: 'box', completada: true, descripcion_real: 'reported work' },
  ] }];
  const c = await load(db, 'athlete', date);
  assert.equal(c.trainingHistory.value.entries[0].factualState, 'EXECUTED');
  assert.equal(c.trainingHistory.value.entries[0].execution.quantityStatus, 'NOT_INFERRED_FROM_PRESCRIPTION');
  assert.equal(c.trainingHistory.value.entries[1].factualState, 'PLANNED_ONLY');
  assert.equal(c.trainingHistory.value.entries[1].execution, null);
});

test('invalid identity/date rejected before any database read', async () => {
  const db = database();
  await assert.rejects(load(db, '', date), /CORE_CONTEXT_INVALID_INPUT/);
  await assert.rejects(load(db, 'athlete', '2026-02-30'), /CORE_CONTEXT_INVALID_INPUT/);
  assert.equal(db.calls.length, 0);
  await assert.rejects(load(database({ codigo: 'someone-else' }), 'athlete', date), /IDENTITY_MISMATCH/);
});

test('restriction evidence, invalid restriction data and missing position remain distinct', async () => {
  const db = database();
  db.tables.athlete_state_events = [{ id: 'restriction', activo: true, estado: 'restricted', body_area: 'knee' }];
  let c = await load(db, 'athlete', date);
  assert.equal(c.restrictions.value.resolution, 'active');
  assert.equal(c.restrictions.value.state.id, 'restriction');
  assert.equal(c.currentPosition.status, 'unknown');
  db.tables.athlete_state_events.push({ id: 'ambiguous', activo: true, estado: 'normal' });
  c = await load(db, 'athlete', date);
  assert.equal(c.restrictions.status, 'unknown');
  assert.equal(c.restrictions.reason, 'RESTRICTIONS_AMBIGUOUS_STATE');
});

test('availability stays partial per discipline and respects active source days', async () => {
  const db = database({ distribucion_semanal: { box: ['lunes'] } }, [
    { ...source('box'), dias: ['viernes'] }, source('running'),
  ]);
  const c = await load(db, 'athlete', date);
  assert.deepEqual(plain(c.availability.byDiscipline.box.value), ['viernes']);
  assert.equal(c.availability.byDiscipline.carrera.status, 'unknown');
  assert.deepEqual(JSON.parse(JSON.stringify(c)), plain(c));
});

test('malformed stored history is not represented as known empty history', async () => {
  const db = database();
  db.tables.weekly_plan = [{ week_start: '2026-09-28', sessions: null }];
  const c = await load(db, 'athlete', date);
  assert.equal(c.trainingHistory.status, 'unknown');
  assert.equal(c.trainingHistory.reason, 'INVALID_STORED_DATA');
});

test('transitive runtime dependencies exclude chat, planners, analyzers and generation orchestration', () => {
  const visited = new Set();
  // Permit only factual calendar/history helpers and their existing persistence imports.
  // None is invoked for writing by this boundary; the fake DB has no write methods.
  const planning = new Set(['civilCalendar', 'weeklyCalendar', 'recordCompletion', 'planMutation', 'planMutationValidators',
    'prescriptionIdentity', 'planValidationPipeline', 'planPersistence']);
  function walk(file) {
    file = resolve(file); if (visited.has(file)) return; visited.add(file);
    const name = relative(resolve('lib'), file).replaceAll('\\', '/');
    assert.ok(!name.startsWith('chat/'), name);
    if (name.startsWith('planning/')) assert.ok(planning.has(name.slice(9, -3)), name);
    assert.doesNotMatch(name, /analy[sz]er|coachFirst|weeklyCoach|weeklyGeneration|longitudinal|sessionGeneration|loadAthletePrescriptionContext/i);
    const output = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    for (const [, dependency] of output.matchAll(/require\("([^"]+)"\)/g)) {
      if (dependency.startsWith('.')) walk(resolve(dirname(file), dependency + '.ts'));
      else assert.equal(dependency, 'node:crypto');
    }
  }
  walk('lib/core/athleteContext.ts');
  assert.ok(visited.size > 1);
});

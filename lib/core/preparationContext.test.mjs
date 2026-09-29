import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import vm from 'node:vm';
import { sportsRuntime, plain, compile, fakeDatabase } from '../sports/trainingContractTestRuntime.mjs';

const runtime = sportsRuntime();
const { loadCoreAthleteContext: load } = runtime('../core/athleteContext');
const { projectCorePreparationContext: project } = runtime('../core/preparationContext');
const { declareTargetEvent } = runtime('../athlete/eventAuthority');
const date = '2026-09-29';
const source = (disciplina, owner = 'forge', activo = true) => ({ disciplina, owner, activo });

async function athlete({ goal = 'half_marathon', sources = [source('carrera')], eventDate = '2026-11-01',
  eventGoal = 'half_marathon', mode = 'coach', failTable, user = {} } = {}) {
  const db = fakeDatabase({
    usuarios: { codigo: 'athlete', modo_entrada: mode, especialidad: sources[0]?.disciplina,
      objetivo_principal: goal, perfil: eventDate ? { targetEvent: declareTargetEvent('athlete', eventGoal, eventDate,
        '2024-01-01', null, '2024-01-01T12:00:00Z') } : {},
      distribucion_semanal: {}, ...user },
    athlete_training_sources: sources, athlete_state_events: [], athlete_coaching_notes: [], weekly_plan: [],
  }, failTable);
  return plain(await load(db, 'athlete', date));
}

function assertNoPrescription(value) {
  const prohibited = new Set(['allowedMethods', 'requiredMethods', 'permittedStimuli', 'frequency', 'sessionsPerWeek',
    'trainingDays', 'restDays', 'weeklyDistribution', 'sessions', 'exercises', 'sets', 'reps', 'mileage',
    'intensity', 'weeklySkeleton', 'constraints', 'weeklyIntent']);
  function walk(v) {
    if (!v || typeof v !== 'object') return;
    for (const [key, child] of Object.entries(v)) { assert.ok(!prohibited.has(key), key); walk(child); }
  }
  walk(value);
}

test('A: half marathon projects canonical facts, exact horizon and supported temporal phase', async () => {
  const c = await athlete({ user: { ciclo_actual: { bloque: 'acumulacion', semana: 2,
    totalSemanas: 4, planningWeekStart: '2026-09-28' } } });
  const before = plain(c), p = plain(project(c));
  assert.deepEqual(p.discipline.managed.value, ['carrera']);
  assert.equal(p.discipline.primary.value, 'carrera');
  assert.deepEqual(p.goal, c.goal);
  assert.equal(p.goal.value.canonicalGoalId, 'half_marathon');
  assert.equal(p.target.value.targetDate, '2026-11-01');
  assert.deepEqual(p.target.value.horizon.value, { daysRemaining: 33, weeksRemaining: 33 / 7 });
  assert.deepEqual(p.target.value.event.provenance, c.targetEvent.value.event.provenance);
  assert.equal(p.methodology.value.model, 'half_marathon_preparation');
  assert.equal(p.methodology.value.use, 'reasoning_dimensions');
  assert.ok(p.methodology.value.dimensions.includes('long-run progression'));
  assert.equal(p.position.phase.value.phase, 'SPECIFIC_BUILD');
  assert.equal(p.position.phase.value.basis, 'temporal_policy');
  assert.match(p.position.phase.source, /RUNNING_EVENT_PREPARATION_V1/);
  assert.deepEqual(p.position.stored, c.currentPosition);
  assert.equal(p.position.stored.value.week.value, 2);
  assert.deepEqual(c, before);
  assertNoPrescription(p);
  p.position.stored.value.week.value = 9;
  assert.equal(c.currentPosition.value.week.value, 2);
});

test('B: CrossFit/Open broad availability changes neither methodology nor frequency nor phase', async () => {
  const c = await athlete({ goal: 'CrossFit Open', sources: [source('box')], eventGoal: 'crossfit',
    user: { distribucion_semanal: { box: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] } } });
  const p = plain(project(c));
  assert.equal(c.availability.byDiscipline.box.value.length, 7);
  assert.equal(p.goal.value.candidates[0].value, 'CrossFit Open');
  assert.equal(p.methodology.value.model, 'crossfit_performance');
  assert.deepEqual(p.methodology.value.dimensions, ['strength', 'weightlifting', 'gymnastics', 'conditioning', 'power and skill']);
  assert.equal(p.position.phase.status, 'unknown');
  assert.equal(p.position.phase.reason, 'NO_TEMPORAL_POSITION_POLICY');
  c.availability.byDiscipline.box.value = [];
  assert.deepEqual(plain(project(c)), p);
  assertNoPrescription(p);
});

test('C: external CrossFit ownership survives and never becomes managed preparation', async () => {
  const c = await athlete({ sources: [source('carrera'), source('box', 'external')] });
  const p = plain(project(c));
  assert.deepEqual(p.discipline.managed.value, ['carrera']);
  assert.deepEqual(p.discipline.evidence, c.disciplines);
  assert.equal(p.discipline.evidence.value.entries[1].ownership, 'external');
  const externalGoal = await athlete({ goal: 'CrossFit Open', eventGoal: 'crossfit',
    sources: [source('carrera'), source('box', 'external')] });
  const e = plain(project(externalGoal));
  assert.equal(e.methodology.status, 'unknown');
  assert.equal(e.methodology.reason, 'GOAL_DISCIPLINE_NOT_MANAGED');
  assert.equal(e.discipline.primary.status, 'unknown');
  assertNoPrescription(e);
});

for (const [goal, resolution] of [[null, 'GOAL_MISSING'], ['a personal unknown goal', 'GOAL_UNSUPPORTED']]) {
  test(`D: ${resolution} remains unresolved, without fallback or invented dates`, async () => {
    const c = await athlete({ goal, eventDate: null }), p = plain(project(c));
    assert.equal(p.goal.value.status, resolution);
    assert.deepEqual(p.goal, c.goal);
    assert.equal(p.methodology.status, 'unknown');
    assert.equal(p.target.value.targetDate, null);
    assert.equal(p.target.value.horizon.status, 'unknown');
    assert.equal(p.position.phase.status, 'unknown');
    assert.equal(p.position.stored.status, 'unknown');
    assert.equal(p.discipline.primary.status, 'unknown');
  });
}

test('resolved goal without a descriptor stays known; unsupported knowledge does not veto the goal', async () => {
  const p = plain(project(await athlete({ goal: 'hyrox', sources: [source('hyrox')], eventGoal: 'hyrox' })));
  assert.equal(p.goal.value.canonicalGoalId, 'hyrox');
  assert.deepEqual(p.discipline.managed.value, ['hyrox']);
  assert.equal(p.methodology.reason, 'NO_DOMAIN_DESCRIPTOR');
  assert.equal(p.target.value.horizon.status, 'known');
});

test('missing date does not erase resolved methodology or infer a primary discipline', async () => {
  const p = plain(project(await athlete({ eventDate: null, sources: [source('carrera'), source('box')] })));
  assert.equal(p.methodology.status, 'known');
  assert.equal(p.target.value.horizon.status, 'unknown');
  assert.equal(p.discipline.primary.status, 'unknown');
  assert.equal(p.position.phase.status, 'unknown');
});

test('goal conflict or changed goal prevents target horizon and temporal phase', async () => {
  const conflicting = await athlete({ user: { perfil: { objetivo_principal: 'crossfit' } } });
  assert.equal(project(conflicting).goal.value.status, 'GOAL_CONFLICT');
  assert.equal(project(conflicting).methodology.status, 'unknown');
  const changed = await athlete({ goal: 'crossfit', sources: [source('box'), source('carrera')] });
  const p = project(changed);
  assert.equal(p.target.value.horizon.reason, 'TARGET_GOAL_MISMATCH');
  assert.equal(p.discipline.primary.status, 'unknown');
  assert.equal(p.position.phase.status, 'unknown');
});

test('legacy and invalid confirmation are retained as evidence, never promoted to authoritative dates', async () => {
  for (const user of [
    { objetivo_principal: { descripcion: 'half_marathon', fecha: '2026-11-01' }, perfil: {} },
    { perfil: { targetEvent: { event: { eventDate: '2026-11-01' }, signature: 'invalid' } } },
  ]) {
    const c = await athlete({ user }), p = project(c);
    assert.ok(['legacy_unconfirmed', 'unverified'].includes(p.target.value.status));
    assert.equal(p.target.value.targetDate, null);
    assert.equal(p.target.value.horizon.status, 'unknown');
    assert.deepEqual(plain(p.target.value.legacyCandidates), c.targetEvent.value.legacyCandidates);
  }
});

test('inactive, secondary, malformed or incompatible targets cannot support a preparation phase', async () => {
  const base = await athlete();
  for (const patch of [{ status: 'cancelled' }, { status: 'completed' }, { priority: 'secondary' },
    { eventDate: '2026-02-30' }, { discipline: 'box' }, { eventType: 'test' }]) {
    const c = structuredClone(base);
    Object.assign(c.targetEvent.value.event, patch);
    if (patch.eventDate) c.targetEvent.value.targetDate = patch.eventDate;
    assert.equal(project(c).position.phase.status, 'unknown', JSON.stringify(patch));
  }
});

test('read failures propagate instead of becoming empty known values', async () => {
  const userFailure = plain(project(await athlete({ failTable: 'usuarios' })));
  for (const fact of [userFailure.goal, userFailure.target, userFailure.methodology, userFailure.position.stored])
    assert.equal(fact.status, 'read_failed');
  const scopeFailure = plain(project(await athlete({ failTable: 'athlete_training_sources' })));
  for (const fact of [scopeFailure.discipline.evidence, scopeFailure.discipline.managed, scopeFailure.discipline.primary, scopeFailure.methodology])
    assert.equal(fact.status, 'read_failed');
});

test('resolved scope controls management, including supervision, inactive rows and conflicting ownership', async () => {
  const supervised = await athlete({ mode: 'supervision' });
  assert.equal(supervised.disciplines.value.entries[0].ownership, 'forge');
  const p = plain(project(supervised));
  assert.deepEqual(p.discipline.managed.value, []);
  assert.equal(p.methodology.status, 'unknown');
  assert.equal(p.position.phase.status, 'unknown');
  const inactive = project(await athlete({ mode: 'focus', sources: [source('carrera'), source('box', 'forge', false)] }));
  assert.deepEqual(plain(inactive.discipline.managed.value), ['carrera']);
  const conflict = project(await athlete({ sources: [source('carrera'), source('carrera', 'external')] }));
  assert.equal(conflict.discipline.managed.reason, 'SCOPE_UNRESOLVED');
  assert.equal(conflict.methodology.status, 'unknown');
});

test('signed civil-day arithmetic handles today, past, leap day and temporal policy boundaries', async () => {
  const base = await athlete();
  const { decideRunningEventPreparation: legacy } = runtime('runningEventPreparation');
  for (const [days, expected] of [[-1, 'POST_EVENT'], [0, 'RACE_WEEK'], [7, 'RACE_WEEK'], [8, 'TAPER'],
    [21, 'TAPER'], [22, 'SPECIFIC_BUILD'], [56, 'SPECIFIC_BUILD'], [57, 'BASE_BUILD']]) {
    const c = structuredClone(base);
    const eventDate = new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
    c.targetEvent.value.event.eventDate = eventDate;
    c.targetEvent.value.targetDate = eventDate;
    const p = project(c);
    assert.equal(p.target.value.horizon.value.daysRemaining, days);
    assert.equal(p.target.value.horizon.value.weeksRemaining, days / 7);
    assert.equal(p.position.phase.value.phase, expected);
    // Compatibility check only: production projection never imports this authority.
    const old = legacy({ eventAuthority: { targetEvent: c.targetEvent.value.event, goalId: 'half_marathon',
      eventDate, asOfDate: date }, runningHistory: { asOfDate: date, records: [] },
      scope: c.disciplines.value.scope, referenceDate: date });
    assert.equal(p.position.phase.value.phase, old.preparationState);
  }
  base.referenceDate = '2028-02-28';
  base.targetEvent.value.targetDate = base.targetEvent.value.event.eventDate = '2028-03-01';
  assert.equal(project(base).target.value.horizon.value.daysRemaining, 2);
  base.referenceDate = '2026-02-30';
  assert.throws(() => project(base), /INVALID_REFERENCE_DATE/);
});

test('projection runs with only its domain catalog, without Node APIs, UI, providers or old planning authorities', async () => {
  const visited = new Set();
  function isolated(file) {
    file = resolve(file);
    visited.add(relative(resolve('lib/core'), file).replaceAll('\\', '/'));
    const output = compile(readFileSync(file, 'utf8'));
    const module = { exports: {} };
    vm.runInNewContext(output, { module, exports: module.exports, structuredClone,
      require(name) {
        assert.equal(name, './preparationDomains');
        return isolated(resolve(dirname(file), name + '.ts'));
      } });
    return module.exports;
  }
  const { projectCorePreparationContext: pure } = isolated('lib/core/preparationContext.ts');
  const c = await athlete();
  assert.deepEqual(plain(pure(c)), plain(project(c)));
  assert.deepEqual([...visited].sort(), ['preparationContext.ts', 'preparationDomains.ts']);
  const source = readFileSync('lib/core/preparationContext.ts', 'utf8');
  assert.doesNotMatch(source, /context\.(availability|trainingHistory|restrictions|experience)/);
  const p = plain(pure(c));
  assert.deepEqual(p, JSON.parse(JSON.stringify(p)));
  p.methodology.value.dimensions.push('modified consumer copy');
  assert.ok(!pure(c).methodology.value.dimensions.includes('modified consumer copy'));
});

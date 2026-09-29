import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, contractFixture, plain } from '../sports/trainingContractTestRuntime.mjs';

const paths = new Set();
let networkCalls = 0;
const load = sportsRuntime({ console: { info() {}, warn() {}, log() {}, error() {} },
  fetch() { networkCalls++; throw new Error('Network forbidden'); },
}, (path, module) => { paths.add(path.replaceAll('\\', '/')); return module; });
const prepare = load('../planning/weekPrescriptionPlanAdapter').prepareWeekPrescriptionPlanMutation;
const known = value => ({ status: 'known', source: 'explicit_test_fixture', value });

async function materializedWeek() {
  const provenance = { kind: 'recorded_decision', authority: 'human_coach', source: 'fixture:coach',
    decidedAt: '2026-09-27T12:00:00Z', sourceReference: 'decision:week-3' };
  const block = { blockId: 'block-1', revision: 2, goalReference: { source: 'preparation', id: 'mixed' },
    purpose: 'Desarrollar resistencia y conservar fuerza', provenance };
  const week = { weekStart: '2026-09-28', revision: 3, blockIntentReference: { blockId: block.blockId, revision: 2 },
    positionInBlock: 3, purpose: 'Desarrollar capacidad aeróbica y tolerancia al umbral',
    contributionToBlock: 'Consolidar la continuidad de resistencia y fuerza', provenance };
  const longitudinal = load('../core/longitudinalIntent').projectLongitudinalIntent({ block, week });
  assert.equal(longitudinal.week.status, 'known');
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date('2026-09-28T00:00:00Z'); date.setUTCDate(date.getUTCDate() + i);
    const d = { date: date.toISOString().slice(0, 10) };
    if (i === 1 || i === 5) return { ...d, state: 'TRAIN', discipline: 'carrera', purpose: i === 1
      ? 'Sostener esfuerzo cercano al umbral con control técnico.' : 'Construir resistencia aeróbica con esfuerzo cómodo.' };
    if (i === 3) return { ...d, state: 'TRAIN', discipline: 'box', purpose: 'Consolidar fuerza de piernas con ejecución controlada.' };
    return { ...d, state: 'REST' };
  });
  const checked = load('../core/weekPrescription').validateWeekPrescription({ version: 1, weekStart: week.weekStart,
    revision: 1, weekIntentReference: { weekStart: week.weekStart, revision: week.revision,
      blockIntentReference: week.blockIntentReference }, provenance, days }, longitudinal.week.value);
  assert.equal(checked.ok, true);
  const prescription = checked.prescription, materialized = [], callbacks = [];
  for (const slot of days.filter(d => d.state === 'TRAIN')) {
    const base = contractFixture({ discipline: slot.discipline });
    base.exposureContext.report.disciplina = slot.discipline;
    const result = await load('weekPrescriptionSessionAdapter').materializeWeekPrescriptionSession({
      prescription, weekIntent: longitudinal.week.value, date: slot.date,
      core: { identity: known('athlete-6d'), disciplines: known({ scopeStatus: 'resolved', scope: base.prescriptionScope }),
        restrictions: known({ ...base.restrictionsSnapshot, resolution: 'confirmed_none' }) },
      scheduling: known({ date: slot.date, discipline: slot.discipline, availability: 'available', protection: 'clear' }),
      technical: { externalLoad: known(base.externalLoadContext), exposure: known(base.exposureContext),
        dose: known({ version: 1, policy: 'structured-dose-v1', sessionDecisionAuthority: 'coach',
          references: [], sufficiency: { version: 1, signals: {} },
          timeBudget: { maximumSeconds: 3600, minimumSeconds: null, status: 'resolved', source: 'fixture:60min' },
          weakness: null, weekStrategy: null, neighbours: [], evidenceDigest: 'fixture:resources', diagnostics: [] }) },
    }, [], async () => {
      callbacks.push(slot.date);
      const running = slot.discipline === 'carrera', threshold = slot.date === '2026-09-29';
      return JSON.stringify({ schemaVersion: 2, stimulusId: slot.purpose,
        finalDecision: { kind: 'session_decision', version: 1, stimulus: slot.purpose },
        structureId: running ? 'continuo_carrera' : 'strength_sets',
        blocks: [{ blockType: 'main', movements: [{ movementId: running ? threshold ? 'tempo_run' : 'rodaje_z2' : 'air_squat',
          prescription: running ? { durationSeconds: threshold ? 1200 : 2400, intensity: { kind: 'rpe', value: threshold ? 7 : 4 } }
            : { sets: 4, reps: 10, restSeconds: 90, intensity: { kind: 'rpe', value: 6 } } }] }] });
    });
    assert.equal(result.ok, true, JSON.stringify(result)); materialized.push(result);
  }
  assert.deepEqual(callbacks, ['2026-09-29', '2026-10-01', '2026-10-03']);
  return { userCodigo: 'athlete-6d', prescription, weekIntent: longitudinal.week.value, materialized, operation: { kind: 'create' } };
}
const fixturePromise = materializedWeek();
const fixture = async () => structuredClone(await fixturePromise);

test('three real materializations plus four REST markers become a genuine create mutation', async () => {
  const input = await fixture(), before = plain(input), result = await prepare(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, 'ready_for_commit');
  assert.equal(load('../planning/planMutation').isValidatedPlanMutation(result.mutation), true);
  assert.equal(load('../planning/planMutation').isValidatedPlanMutation(plain(result.mutation)), false);
  assert.equal(result.mutation.command.operationType, 'create_week');
  assert.equal(Object.hasOwn(result.mutation.command, 'expectedRevision'), false);
  assert.equal(result.candidate.week_start, input.prescription.weekStart);
  assert.equal(result.candidate.revision, 1);
  assert.equal(result.candidate.sessions.length, 7);
  assert.equal(new Set(result.candidate.sessions.map(s => s.session_id)).size, 7);
  assert.equal(result.candidate.sessions.filter(s => s.tipo === 'descanso').length, 4);
  assert.equal(result.candidate.sessions.filter(s => ['box', 'carrera'].includes(s.tipo)).length, 3);
  for (const [i, session] of result.candidate.sessions.entries()) {
    const slot = input.prescription.days[i], metadata = session.weekPrescriptionDecision;
    assert.equal(session.completada, false);
    assert.deepEqual(plain(metadata.day), plain(slot));
    assert.deepEqual(plain(metadata.weekIntentReference), plain(input.prescription.weekIntentReference));
    assert.deepEqual(plain(metadata.provenance), plain(input.prescription.provenance));
    if (slot.state === 'TRAIN') {
      const accepted = input.materialized.find(m => m.decision.date === slot.date);
      const { session_id, completada, weekPrescriptionDecision, ...content } = session;
      assert.deepEqual(plain(content), plain(accepted.session));
      assert.equal(session.structuredPrescription.finalDecision.stimulus, slot.purpose);
    } else {
      assert.equal(Object.hasOwn(session, 'structuredPrescription'), false);
      assert.equal(Object.hasOwn(session, 'descripcion_real'), false);
    }
  }
  assert.deepEqual(plain(input), before);
});

test('existing snapshot prepares regenerate command with unchanged expected revision, without CAS', async () => {
  const input = await fixture(), created = await prepare(input);
  const snapshot = { ...plain(created.candidate), id: 'plan-1', user_codigo: input.userCodigo, revision: 4 };
  input.prescription.revision = 2;
  input.materialized.forEach(m => { m.decision.revision = 2; });
  input.operation = { kind: 'regenerate', snapshot, expectedRevision: 4 };
  const before = plain(snapshot), result = await prepare(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.mutation.command.operationType, 'regenerate_week');
  assert.equal(result.mutation.command.expectedRevision, 4);
  assert.equal(result.candidate.revision, 4); // Only persistence may advance it.
  assert.equal(result.candidate.id, 'plan-1');
  assert.deepEqual(snapshot, before);
  input.operation.expectedRevision = 3;
  assert.equal((await prepare(input)).code, 'PLAN_SNAPSHOT_MISMATCH');
});

for (const [name, mutate, code] of [
  ['missing TRAIN', f => f.materialized.pop(), 'TRAIN_MATERIALIZATION_MISSING'],
  ['wrong in-week date', f => { f.materialized[0].decision.date = '2026-10-03'; }, 'MATERIALIZATION_DECISION_MISMATCH'],
  ['wrong discipline', f => { f.materialized[0].decision.discipline = 'box'; }, 'MATERIALIZATION_DECISION_MISMATCH'],
  ['wrong purpose', f => { f.materialized[0].decision.purpose = 'Different target'; }, 'MATERIALIZATION_DECISION_MISMATCH'],
  ['duplicate TRAIN', f => f.materialized.push(structuredClone(f.materialized[0])), 'DUPLICATE_MATERIALIZATION'],
  ['extra REST session', f => { const m = structuredClone(f.materialized[0]); m.decision.date = '2026-09-28'; f.materialized.push(m); }, 'MATERIALIZATION_FOR_NON_TRAIN'],
  ['extra outside week', f => { const m = structuredClone(f.materialized[0]); m.decision.date = '2026-10-05'; f.materialized.push(m); }, 'MATERIALIZATION_OUTSIDE_WEEK'],
  ['wrong WeekIntent', f => { f.prescription.weekIntentReference.revision++; }, 'WEEK_PRESCRIPTION_INVALID'],
  ['wrong materialization revision', f => { f.materialized[0].decision.revision++; }, 'MATERIALIZATION_DECISION_MISMATCH'],
  ['changed executable content', f => { f.materialized[0].session.structuredPrescription.proposal.blocks[0].movements[0].prescription.durationSeconds = 1; }, 'MATERIALIZATION_SESSION_MISMATCH'],
  ['invented completion', f => { f.materialized[0].session.completada = true; }, 'MATERIALIZATION_SESSION_MISMATCH'],
]) {
  test(`rejects ${name} before issuing mutation authority`, async () => {
    const input = await fixture(); mutate(input);
    const result = await prepare(input);
    assert.equal(result.ok, false, JSON.stringify(result)); assert.equal(result.code, code);
    assert.equal(Object.hasOwn(result, 'mutation'), false);
  });
}

test('UNAVAILABLE remains factual unavailable, not REST or executed training', async () => {
  const input = await fixture();
  input.prescription.days[6] = { date: '2026-10-04', state: 'UNAVAILABLE',
    factualReference: { source: 'fixture:calendar', reference: 'closed:2026-10-04' } };
  const result = await prepare(input); assert.equal(result.ok, true, JSON.stringify(result));
  const session = result.candidate.sessions[6];
  assert.equal(session.tipo, 'unavailable'); assert.equal(session.completada, false);
  assert.equal(Object.hasOwn(session, 'structuredPrescription'), false);
  assert.deepEqual(plain(session.weekPrescriptionDecision.day), plain(input.prescription.days[6]));
});

test('actual RecentTrainingEvidence reads produced REST as no execution, even on past days', async () => {
  const result = await prepare(await fixture()); assert.equal(result.ok, true);
  const tables = { weekly_plan: [plain(result.candidate)], usuarios: { workout_history: [] },
    running_execution_records: [], session_modification_events: [] };
  const db = { from(table) {
    const q = { select() { return q; }, eq() { return q; }, gte() { return q; }, lte() { return q; },
      order() { return q; }, limit() { return q; }, maybeSingle() { return q; },
      then(yes, no) { return Promise.resolve({ data: tables[table], error: null }).then(yes, no); } };
    return q;
  } };
  const evidence = await load('../core/recentTrainingEvidence').loadRecentTrainingEvidence(db, 'athlete-6d', '2026-10-05');
  assert.equal(evidence.coverage.sourceFailures.length, 0);
  for (const session of result.candidate.sessions) {
    const item = evidence.items.find(i => i.prescriptionReference === session.session_id);
    assert.ok(item);
    assert.equal(item.state, session.tipo === 'descanso' ? 'NO_EXECUTION_RECORDED' : 'PLANNED_ONLY');
    assert.deepEqual(plain(item.quantities), {});
    if (session.tipo === 'descanso') assert.equal(item.prescribed, null);
  }
});

test('no-op and completed snapshots are not automatically regenerated', async () => {
  const input = await fixture(), created = await prepare(input);
  const snapshot = { ...plain(created.candidate), id: 'plan-1', user_codigo: input.userCodigo };
  input.operation = { kind: 'regenerate', snapshot, expectedRevision: 1 };
  assert.equal((await prepare(input)).code, 'NO_PLAN_CHANGE');
  snapshot.sessions[0].completada = true;
  assert.equal((await prepare(input)).code, 'COMPLETED_CONTENT_REQUIRES_PRESERVATION');
});

test('runtime uses real mutation and identity validation without persistence or legacy orchestration', () => {
  const graph = [...paths].join('\n');
  assert.match(graph, /\/planMutation\.ts/); assert.match(graph, /\/prescriptionIdentity\.ts/);
  assert.match(graph, /\/sessionGeneration\.ts/);
  assert.doesNotMatch(graph, /\/(?:chat|providers)\/|\/(?:canonicalWeekStrategy|strategyResolution|weeklyCalendarAuthority|allowedWeeklyPlanContract|openWeeklyCoachContract|trainingFrequencySafetyNet|sessionAuthority|planPersistence)\.ts|\/(?:[^/]*Analyzer|[^/]*Planner)[^/]*\.ts/i);
  assert.equal(networkCalls, 0);
});

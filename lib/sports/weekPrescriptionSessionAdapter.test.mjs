import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sportsRuntime, contractFixture, plain } from './trainingContractTestRuntime.mjs';

const loaded = new Set();
const load = sportsRuntime({ console: { info() {}, warn() {}, log() {}, error() {} },
  fetch() { throw new Error('Network forbidden'); } }, (path, module) => { loaded.add(path.replaceAll('\\', '/')); return module; });
const api = load('weekPrescriptionSessionAdapter');
const known = value => ({ status: 'known', source: 'authoritative_test_fixture', value });
const unknown = () => ({ status: 'unknown', source: 'test', value: null, reason: 'NOT_KNOWN' });
function fixture() {
  const base = contractFixture({ discipline: 'box' });
  const provenance = { kind: 'recorded_decision', authority: 'human_coach', source: 'coaching_review',
    decidedAt: '2026-09-27T12:00:00Z', sourceReference: 'decision:4' };
  const weekIntent = { weekStart: '2026-09-28', revision: 2, blockIntentReference: { blockId: 'block-1', revision: 3 },
    positionInBlock: 1, purpose: 'Mejorar la capacidad de trabajo', contributionToBlock: 'Consolidar continuidad', provenance };
  const prescription = { version: 1, weekStart: weekIntent.weekStart, revision: 4,
    weekIntentReference: { weekStart: weekIntent.weekStart, revision: 2, blockIntentReference: { ...weekIntent.blockIntentReference } },
    provenance: { ...provenance }, days: Array.from({ length: 7 }, (_, i) => {
      const d = new Date('2026-09-28T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
      return { date: d.toISOString().slice(0, 10), ...(i < 3 ? { state: 'TRAIN', discipline: 'box',
        purpose: '  Practicar fuerza con control y continuidad  ' } : { state: 'REST' }) };
    }) };
  return { prescription, weekIntent, date: prescription.days[0].date,
    core: { identity: known('athlete-1'), disciplines: known({ entries: [], profileDisciplines: ['box'],
      scopeStatus: 'resolved', scope: base.prescriptionScope, diagnostics: [] }),
      restrictions: known({ ...base.restrictionsSnapshot, resolution: 'confirmed_none' }) },
    scheduling: known({ date: prescription.days[0].date, discipline: 'box', availability: 'available', protection: 'clear' }),
    technical: { externalLoad: known(base.externalLoadContext), exposure: known(base.exposureContext),
      dose: known({ version: 1, policy: 'structured-dose-v1', sessionDecisionAuthority: 'coach',
        sufficiency: { version: 1, signals: { 'equipment.barbell': { state: 'unknown', source: null } } },
        references: [], timeBudget: { maximumSeconds: null, minimumSeconds: null, status: 'unknown', source: null },
        weakness: null, weekStrategy: null, neighbours: [], evidenceDigest: 'fixture-evidence', diagnostics: [] }) } };
}
function adapt(f = fixture()) { return plain(api.adaptWeekPrescriptionSession(f)); }
function proposal(purpose) {
  return { schemaVersion: 2, stimulusId: purpose, structureId: 'strength_sets',
    finalDecision: { kind: 'session_decision', version: 1, stimulus: purpose },
    blocks: [{ blockType: 'main', movements: [{ movementId: 'air_squat', prescription: { sets: 3, reps: 5 } }] }] };
}

test('TRAIN preserves literal purpose, discipline, provenance and exact decision identity in v5', () => {
  const f = fixture(), before = plain(f), r = adapt(f);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.contract.contractVersion, 5);
  assert.equal(r.contract.stimulusId, f.prescription.days[0].purpose);
  assert.equal(r.contract.finalDecision.stimulus, f.prescription.days[0].purpose);
  assert.equal(r.contract.coachingGuidance.stimulus, f.prescription.days[0].purpose);
  assert.equal(r.contract.discipline, 'box');
  assert.deepEqual(r.decision.weekIntentReference, f.prescription.weekIntentReference);
  assert.deepEqual(r.decision.provenance, f.prescription.provenance);
  assert.equal(r.decision.revision, 4);
  assert.deepEqual(f, before);
  assert.deepEqual(adapt(f), r);
});

test('three TRAIN plus four REST yield only three potential Builder inputs', () => {
  const f = fixture();
  const results = f.prescription.days.map(slot => adapt({ ...f, date: slot.date,
    scheduling: known({ ...f.scheduling.value, date: slot.date }) }));
  assert.equal(results.filter(r => r.ok).length, 3);
  assert.ok(results.slice(3).every(r => r.code === 'SLOT_NOT_TRAIN'));
  assert.equal(f.prescription.days.filter(d => d.state === 'TRAIN').length, 3);
});

test('REST, UNAVAILABLE, absent dates and invalid WeekIntent never invoke completion', async () => {
  let calls = 0;
  for (const state of ['REST', 'UNAVAILABLE']) {
    const f = fixture();
    f.prescription.days[0] = { date: f.date, state, ...(state === 'UNAVAILABLE'
      ? { factualReference: { source: 'schedule', reference: 'closed-day' } } : {}) };
    const r = await api.materializeWeekPrescriptionSession(f, [], async () => { calls++; return '{}'; });
    assert.equal(r.code, 'SLOT_NOT_TRAIN');
  }
  const f = fixture(); f.date = '2026-10-05'; assert.equal(adapt(f).code, 'SLOT_NOT_IN_WEEK');
  f.prescription.weekIntentReference.revision++; assert.equal(adapt(f).code, 'WEEK_PRESCRIPTION_INVALID');
  assert.equal(calls, 0);
});

test('known unavailable/protected/external scheduling conflicts and unknown stays unresolved', () => {
  for (const [key, value, code] of [['availability', 'unavailable', 'SLOT_UNAVAILABLE'],
    ['availability', 'unknown', 'SCHEDULING_UNKNOWN'], ['protection', 'protected', 'SLOT_PROTECTED'],
    ['protection', 'unknown', 'SCHEDULING_UNKNOWN'], ['date', '2026-09-29', 'SCHEDULING_SCOPE_MISMATCH'],
    ['discipline', 'carrera', 'SCHEDULING_SCOPE_MISMATCH']]) {
    const f = fixture(); f.scheduling.value[key] = value; assert.equal(adapt(f).code, code);
  }
  const f = fixture(); f.scheduling = unknown(); assert.equal(adapt(f).code, 'SCHEDULING_UNKNOWN');
  const external = fixture();
  external.core.disciplines.value.scope.externalDisciplines = ['natacion'];
  external.technical.externalLoad.value.activities = [{ discipline: 'natacion', days: ['lunes'] }];
  assert.equal(adapt(external).code, 'EXTERNAL_ACTIVITY_CONFLICT');
});

test('unmanaged, external and ambiguous ownership never grant permission', () => {
  const f = fixture(); f.core.disciplines = unknown(); assert.equal(adapt(f).code, 'PRESCRIPTION_AUTHORITY_UNKNOWN');
  for (const mutate of [s => { s.managedDisciplines = ['carrera']; },
    s => { s.externalDisciplines = ['box']; }, s => { s.prescriptionAllowed = false; }]) {
    const f = fixture(); mutate(f.core.disciplines.value.scope); assert.equal(adapt(f).code, 'DISCIPLINE_NOT_MANAGED');
  }
  const unresolved = fixture(); unresolved.core.disciplines.value.scopeStatus = 'unresolved';
  assert.equal(adapt(unresolved).code, 'PRESCRIPTION_AUTHORITY_UNKNOWN');
});

test('restrictions and unknown resources reach the existing factual validator unchanged', () => {
  const f = fixture();
  f.core.restrictions.value.areas = ['lumbar'];
  f.core.restrictions.value.active = true;
  f.core.restrictions.value.resolution = 'active';
  const r = adapt(f); assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.contract.restrictionsSnapshot, f.core.restrictions.value);
  assert.deepEqual(r.contract.doseContext.sufficiency, f.technical.dose.value.sufficiency);
  assert.equal(r.contract.doseContext.sufficiency.signals['equipment.barbell'].state, 'unknown');
  assert.deepEqual(r.evidence.technical, f.technical);
  f.core.restrictions = unknown(); assert.equal(adapt(f).code, 'RESTRICTIONS_UNKNOWN');
});

test('missing technical evidence is not replaced with fake exposure, references or resource facts', () => {
  for (const key of ['externalLoad', 'exposure', 'dose']) {
    const f = fixture(); f.technical[key] = unknown(); assert.equal(adapt(f).code, 'BUILDER_FACTS_UNKNOWN');
  }
  const f = fixture(); f.technical.dose.value.weekStrategy = { invented: true };
  assert.equal(adapt(f).code, 'LEGACY_SPORTS_AUTHORITY_NOT_ACCEPTED');
  const missing = fixture(); delete missing.technical.dose.value.sufficiency;
  assert.equal(adapt(missing).code, 'BUILDER_RESOURCE_FACTS_REQUIRED');
});

test('no method, pattern, adaptation or catalog stimulus is invented', () => {
  const f = fixture(); f.prescription.days[0].purpose = 'Explorar una intención deportiva abierta sin identificador';
  const r = adapt(f); assert.equal(r.ok, true);
  assert.equal(r.contract.stimulusId, f.prescription.days[0].purpose);
  for (const key of ['intent', 'methodId', 'patternId', 'adaptationId', 'runningEventPreparation', 'runningMethodDose']) {
    assert.equal(Object.hasOwn(r.contract, key), false, key);
  }
  assert.equal(r.contract.doseContext.weekStrategy, null);
});

test('unsupported Builder representations return conflicts instead of rewriting the Coach decision', () => {
  const f = fixture(); f.prescription.days[0].purpose = 'x'.repeat(401);
  assert.equal(adapt(f).code, 'PURPOSE_NOT_REPRESENTABLE');
  f.prescription.days[0].purpose = 'Open\npurpose'; assert.equal(adapt(f).code, 'PURPOSE_NOT_REPRESENTABLE');
  const other = fixture(); other.prescription.days[0].discipline = 'escalada';
  other.scheduling.value.discipline = 'escalada'; other.core.disciplines.value.scope.managedDisciplines = ['escalada'];
  other.technical.exposure.value.report.disciplina = 'escalada';
  assert.equal(adapt(other).code, 'BUILDER_CONTRACT_CONFLICT');
  assert.ok(adapt(other).errors.includes('DISCIPLINE_UNSUPPORTED'));
});

test('actual existing Builder with deterministic completion materializes and retains purpose', async () => {
  const f = fixture(), purpose = f.prescription.days[0].purpose;
  let calls = 0;
  const r = await api.materializeWeekPrescriptionSession(f, [], async () => { calls++; return JSON.stringify(proposal(purpose)); });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(calls, 1);
  assert.equal(r.decision.purpose, purpose);
  assert.equal(r.session.structuredPrescription.finalDecision.stimulus, purpose);
  assert.equal(r.session.tipo, 'box');
});

test('v5 sports revision is isolated: bridge returns conflict without changed session', async () => {
  const f = fixture();
  const p = proposal('Un propósito deportivo diferente'); p.finalDecision.reason = 'Builder preferred another target';
  const r = await api.materializeWeekPrescriptionSession(f, [], async () => JSON.stringify(p));
  assert.equal(r.ok, false, JSON.stringify(r)); assert.equal(r.code, 'COACH_PURPOSE_CONFLICT');
  assert.equal(Object.hasOwn(r, 'session'), false);
});

test('same stimulus with a different adaptation is not allowed to conceal a purpose change', async () => {
  const f = fixture(), p = proposal(f.prescription.days[0].purpose);
  p.finalDecision.adaptation = 'A different adaptation'; p.finalDecision.reason = 'Changed adaptation';
  const r = await api.materializeWeekPrescriptionSession(f, [], async () => JSON.stringify(p));
  assert.equal(r.code, 'COACH_PURPOSE_CONFLICT');
});

test('bridge keeps a private decision snapshot across the asynchronous Builder call', async () => {
  const f = fixture(), purpose = f.prescription.days[0].purpose;
  const r = await api.materializeWeekPrescriptionSession(f, [], async () => {
    f.prescription.days[0].purpose = 'Caller changed the input';
    return JSON.stringify(proposal(purpose));
  });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.decision.purpose, purpose);
});

test('architecture: no direct old orchestration; existing Builder transitive dependencies remain visible', () => {
  const source = readFileSync(new URL('./weekPrescriptionSessionAdapter.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"].*(?:planning\/|sessionAuthority|provider|Frequency|Availability)/);
  assert.doesNotMatch(source, /\b(?:fetch|createPlan|mutatePlanWithCAS|issueWeeklyCalendar|buildSessionDoseContext)\s*\(/);
  const paths = [...loaded].join('\n');
  assert.doesNotMatch(paths, /\/(?:chat|providers)\/|\/(?:weeklyCalendarAuthority|allowedWeeklyPlanContract|openWeeklyCoachContract|strategyResolution|trainingFrequencySafetyNet|planPersistence|sessionAuthority)\.ts/);
  assert.ok(paths.includes('/sessionGeneration.ts'));
  assert.ok(paths.includes('/allowedTrainingContract.ts'));
  // Existing validators import these knowledge/type-related modules; no strategy is constructed.
  assert.equal(adapt().contract.doseContext.weekStrategy, null);
});

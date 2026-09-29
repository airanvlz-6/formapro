import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from './trainingContractTestRuntime.mjs';

// Load actual production modules; the observer records imports without replacing exports.
const paths = new Set();
let networkCalls = 0;
const load = sportsRuntime({ console: { info() {}, warn() {}, log() {}, error() {} },
  fetch() { networkCalls++; throw new Error('Network forbidden in deterministic integration'); },
}, (path, exports) => { paths.add(path.replaceAll('\\', '/')); return exports; });
const bridge = load('weekPrescriptionSessionAdapter');
const known = (source, value) => ({ status: 'known', source, value });
const weekStart = '2026-09-28';
const purposes = {
  carrera: 'Desarrollar tolerancia al esfuerzo cercano al umbral sin perder el control de la carrera.',
  box: 'Consolidar fuerza de piernas y control del tronco para sostener el trabajo mixto.',
};

function fixture(index = 1) {
  const provenance = { kind: 'recorded_decision', authority: 'human_coach', source: 'fixture:coach_review',
    decidedAt: '2026-09-27T12:00:00Z', sourceReference: 'review:week-3' };
  const block = { blockId: 'block-aerobic-strength', revision: 1,
    goalReference: { source: 'preparation', id: 'athlete-mixed-preparation' },
    purpose: 'Desarrollar capacidad aeróbica manteniendo la fuerza.', provenance };
  const week = { weekStart, revision: 2, blockIntentReference: { blockId: block.blockId, revision: block.revision },
    positionInBlock: 3, purpose: 'Desarrollar capacidad aeróbica y tolerancia al umbral esta semana.',
    contributionToBlock: 'Dar continuidad al trabajo de resistencia conservando una exposición de fuerza.', provenance };
  const longitudinal = load('../core/longitudinalIntent').projectLongitudinalIntent({ block, week });
  assert.equal(longitudinal.week.status, 'known');
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${weekStart}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    if (i === 1 || i === 5) return { date, state: 'TRAIN', discipline: 'carrera',
      purpose: i === 1 ? purposes.carrera : 'Dar continuidad al desarrollo aeróbico con esfuerzo cómodo.' };
    if (i === 3) return { date, state: 'TRAIN', discipline: 'box', purpose: purposes.box };
    return { date, state: 'REST' };
  });
  const validated = load('../core/weekPrescription').validateWeekPrescription({ version: 1, weekStart, revision: 1,
    weekIntentReference: { weekStart, revision: week.revision, blockIntentReference: week.blockIntentReference },
    provenance, days }, longitudinal.week.value);
  assert.equal(validated.ok, true);
  const slot = days[index], discipline = slot.discipline ?? 'carrera';
  return { prescription: validated.prescription, weekIntent: longitudinal.week.value, date: slot.date,
    core: { identity: known('fixture:athlete_identity', 'athlete-6c'),
      disciplines: known('fixture:training_sources', { scopeStatus: 'resolved', diagnostics: [],
        entries: ['carrera', 'box'].map(d => ({ discipline: d, ownership: 'forge', active: true, source: 'fixture:training_sources' })),
        profileDisciplines: ['carrera', 'box'], scope: { mode: 'coach', prescriptionAllowed: true,
          managedDisciplines: ['carrera', 'box'], externalDisciplines: [] } }),
      restrictions: known('fixture:restriction_read', { resolution: 'confirmed_none', asOfDate: '2026-09-27',
        state: null, areas: [], restrictions: [], reassessments: [], active: false }) },
    scheduling: known('fixture:explicit_date_availability', { date: slot.date, discipline, availability: 'available', protection: 'clear' }),
    technical: {
      externalLoad: known('fixture:external_activity_read', { source: 'server_training_sources_and_records',
        policy: 'read_only_context', activities: [], records: [] }),
      // Explicit empty legacy report, not a fabricated projection of recent evidence.
      exposure: known('fixture:legacy_exposure_read', { source: 'legacy_completed_weekly_rows',
        report: { disciplina: discipline, exposiciones: [], estimulosSubexpuestos: [], estimulosSobreexpuestos: [] },
        limitations: ['fixture_empty_legacy_report_not_complete_execution_history'] }),
      dose: known('fixture:resource_and_time_facts', { version: 1, policy: 'structured-dose-v1',
        sessionDecisionAuthority: 'coach', references: [], sufficiency: { version: 1, signals: {
          'capability.canMeasureHeartRate': { state: 'unknown', source: null },
          'capability.canMeasurePace': { state: 'unknown', source: null },
        } }, timeBudget: { maximumSeconds: 3600, minimumSeconds: null, status: 'resolved', source: 'fixture:declared_60_minutes' },
        weakness: null, weekStrategy: null, neighbours: [], evidenceDigest: 'fixture:6c-facts', diagnostics: [] }),
    } };
}

function builderProposal(discipline, purpose) {
  const movement = (movementId, prescription) => ({ movementId, prescription });
  const running = discipline === 'carrera';
  return { schemaVersion: 2, stimulusId: purpose,
    finalDecision: { kind: 'session_decision', version: 1, stimulus: purpose },
    structureId: running ? 'intervalos_carrera' : 'strength_sets', blocks: [
      { blockType: 'warmup', movements: [movement(running ? 'rodaje_z2' : 'air_squat',
        running ? { durationSeconds: 600, intensity: { kind: 'rpe', value: 3 } }
          : { sets: 2, reps: 8, restSeconds: 30, intensity: { kind: 'rpe', value: 3 } })] },
      { blockType: 'main', movements: [movement(running ? 'series_umbral' : 'air_squat',
        running ? { sets: 3, durationSeconds: 360, restSeconds: 120, intensity: { kind: 'rpe', value: 7 } }
          : { sets: 4, reps: 10, restSeconds: 90, intensity: { kind: 'rpe', value: 6 } })] },
      { blockType: 'cooldown', movements: [movement(running ? 'rodaje_z2' : 'dead_bug',
        { durationSeconds: running ? 300 : 120, intensity: { kind: 'rpe', value: 2 } })] },
    ] };
}

for (const [index, discipline, day] of [[1, 'carrera', 'martes'], [3, 'box', 'jueves']]) {
  test(`canonical ${day} ${discipline}: actual Builder validates, renders and preserves the decided session`, async () => {
    const input = fixture(index), before = plain(input), proposal = builderProposal(discipline, purposes[discipline]);
    const received = [];
    const result = await bridge.materializeWeekPrescriptionSession(input, [], async prompt => {
      const contract = JSON.parse(prompt.split('CONTRACT:\n')[1].split('\n')[0]);
      received.push(contract);
      assert.equal(load('allowedTrainingContract').validateAllowedTrainingContract(contract).ok, true);
      assert.equal(contract.targetDay, day); assert.equal(contract.discipline, discipline);
      assert.equal(contract.stimulusId, purposes[discipline]);
      assert.deepEqual(contract.coachingGuidance, { kind: 'weekly_guidance', version: 2, stimulus: purposes[discipline] });
      assert.deepEqual(contract.finalDecision, proposal.finalDecision);
      for (const field of ['intent', 'methodId', 'patternId', 'adaptationId', 'frequency', 'allowedMethods', 'requiredMethods', 'runningEventPreparation']) {
        assert.equal(Object.hasOwn(contract, field), false, field);
      }
      assert.deepEqual(contract.doseContext, plain(input.technical.dose.value));
      assert.deepEqual(contract.exposureContext, plain(input.technical.exposure.value));
      assert.deepEqual(contract.restrictionsSnapshot, plain(input.core.restrictions.value));
      assert.equal(Object.hasOwn(load('movementLibrary').STIMULUS_LIBRARY, contract.stimulusId), false);
      return JSON.stringify(proposal);
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(received.length, 1); assert.equal(result.attempts, 1);
    assert.equal(result.session.dia, day); assert.equal(result.session.tipo, discipline);
    assert.equal(result.decision.date, input.date); assert.equal(result.decision.purpose, purposes[discipline]);
    assert.deepEqual(plain(result.decision.weekIntentReference), before.prescription.weekIntentReference);
    assert.deepEqual(plain(result.session.structuredPrescription.proposal.blocks), proposal.blocks);
    assert.equal(result.session.structuredPrescription.finalDecision.stimulus, purposes[discipline]);
    assert.ok(result.session.descripcion.trim().length > 0);
    assert.equal(load('structuredSession').validateSessionAgainstTrainingContract(result.contract, result.proposal).ok, true);
    assert.equal(bridge.checkWeekPrescriptionSessionFidelity(bridge.adaptWeekPrescriptionSession(input), result).ok, true);
    assert.deepEqual(plain(input), before); // No added sessions or advanced longitudinal position.
    assert.equal(input.prescription.days.filter(d => d.state === 'TRAIN').length, 3);
  });
}

test('changed running purpose yields COACH_PURPOSE_CONFLICT and no accepted session', async () => {
  const input = fixture(), proposal = builderProposal('carrera', 'Recuperación fácil en lugar de trabajo de umbral.');
  proposal.finalDecision.reason = 'The deterministic fixture deliberately changes the sports decision.';
  let calls = 0;
  const result = await bridge.materializeWeekPrescriptionSession(input, [], async () => { calls++; return JSON.stringify(proposal); });
  assert.equal(calls, 1);
  assert.equal(result.ok, false); assert.equal(result.code, 'COACH_PURPOSE_CONFLICT');
  assert.equal(Object.hasOwn(result, 'session'), false);
});

for (const [name, mutate, expected] of [
  ['Monday REST', () => {}, 'SLOT_NOT_TRAIN'],
  ['UNAVAILABLE', f => { f.prescription.days[0] = { date: f.date, state: 'UNAVAILABLE',
    factualReference: { source: 'fixture:calendar', reference: 'closure:2026-09-28' } }; }, 'SLOT_NOT_TRAIN'],
  ['known unavailable TRAIN', f => { f.scheduling.value.availability = 'unavailable'; }, 'SLOT_UNAVAILABLE'],
  ['unmanaged TRAIN', f => { f.core.disciplines.value.scope.managedDisciplines = ['box']; }, 'DISCIPLINE_NOT_MANAGED'],
  ['unknown authority', f => { f.core.disciplines = { status: 'unknown', source: 'fixture:training_sources', value: null,
    reason: 'OWNERSHIP_UNRESOLVED' }; }, 'PRESCRIPTION_AUTHORITY_UNKNOWN'],
]) {
  test(`${name} rejects before the Builder completion callback`, async () => {
    const f = fixture(['Monday REST', 'UNAVAILABLE'].includes(name) ? 0 : 1); mutate(f);
    assert.equal(load('../core/weekPrescription').validateWeekPrescription(f.prescription, f.weekIntent).ok, true);
    const before = plain(f); let calls = 0;
    const result = await bridge.materializeWeekPrescriptionSession(f, [], async () => { calls++; throw new Error('Must not run'); });
    assert.equal(result.ok, false); assert.equal(result.code, expected);
    assert.equal(calls, 0); assert.equal(Object.hasOwn(result, 'session'), false);
    assert.deepEqual(plain(f), before);
  });
}

test('complete tested runtime contains actual Builder and no legacy orchestration, providers or persistence', () => {
  for (const name of ['weekPrescription', 'weekPrescriptionSessionAdapter', 'allowedTrainingContract', 'sessionGeneration', 'structuredSession']) {
    assert.ok([...paths].some(p => p.endsWith(`/${name}.ts`)), name);
  }
  assert.doesNotMatch([...paths].join('\n'), /\/(?:chat|providers)\/|\/(?:canonicalWeekStrategy|strategyResolution|weeklyCalendarAuthority|allowedWeeklyPlanContract|openWeeklyCoachContract|trainingFrequencySafetyNet|sessionAuthority|planPersistence|planMutation)\.ts|\/(?:[^/]*Analyzer|[^/]*Planner)[^/]*\.ts/i);
  assert.equal(networkCalls, 0);
});

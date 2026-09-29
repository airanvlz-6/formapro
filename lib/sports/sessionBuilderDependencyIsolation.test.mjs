import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from './trainingContractTestRuntime.mjs';

for (const entry of ['allowedTrainingContract', 'sessionGeneration', 'weekPrescriptionSessionAdapter']) {
  test(`${entry} loads without legacy strategy or orchestration at runtime`, () => {
    const paths = [];
    const load = sportsRuntime({}, (path, module) => { paths.push(path.replaceAll('\\', '/')); return module; });
    load(entry);
    assert.doesNotMatch(paths.join('\n'), /\/(?:chat|providers)\/|\/(?:canonicalWeekStrategy|strategyResolution|weeklyCalendarAuthority|allowedWeeklyPlanContract|openWeeklyCoachContract|trainingFrequencySafetyNet|sessionAuthority|planPersistence)\.ts/);
    assert.ok(paths.some(p => p.endsWith('/sessionDoseContract.ts')));
  });
}

test('historical public exports refer to the same extracted functions, not duplicate implementations', () => {
  const load = sportsRuntime();
  assert.equal(load('sessionDoseContext').validateDoseContext, load('sessionDoseContract').validateDoseContext);
  assert.equal(load('../planning/canonicalWeekStrategy').renderWeekObjective, load('weekObjectivePresentation').renderWeekObjective);
  assert.equal(typeof load('sessionDoseContext').buildSessionDoseContext, 'function');
  assert.equal(typeof load('../planning/canonicalWeekStrategy').resolveStrategyGoal, 'function');
});

test('dose projection still validates through both public entry points and rejects invalid references', () => {
  const load = sportsRuntime();
  const profile = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({
    test_atleta: { back_squat: 150 }, perfil: { duracion: '60 min' },
  });
  const legacy = load('sessionDoseContext'), pure = load('sessionDoseContract');
  const context = legacy.buildSessionDoseContext(profile);
  assert.equal(pure.validateDoseContext(context), true);
  assert.equal(legacy.validateDoseContext(context), true);
  const before = plain(context);
  const invalid = structuredClone(context);
  invalid.references[0].value = -1;
  assert.equal(pure.validateDoseContext(invalid), false);
  assert.equal(legacy.validateDoseContext(invalid), false);
  assert.deepEqual(plain(context), before);
});

test('objective presentation preserves covered adaptation order, fallback and existing goal labels', () => {
  const load = sportsRuntime(), render = load('weekObjectivePresentation').renderWeekObjective;
  assert.equal(render({ goal: { id: null } }), 'Objetivo pendiente de resolución: planificación limitada por el contexto autorizado.');
  const s = { goal: { id: 'half_marathon' }, block: { phase: 'acumulacion' },
    adaptations: [{ id: 'aerobic_durability', role: 'PRIMARY' }, { id: 'strength', role: 'SUPPORTING' }],
    coverage: [{ adaptationId: 'aerobic_durability' }] };
  const before = plain(s);
  assert.equal(render(s), 'half marathon · acumulacion: aerobic durability (primary).');
  assert.deepEqual(s, before);
  assert.equal(render({ ...s, coverage: [] }), 'half marathon · acumulacion: adaptaciones pendientes de un método compatible.');
  for (const [id, definition] of Object.entries(load('goalTransferModel').GOAL_DEFINITIONS)) {
    if (definition.kind === 'general_training') {
      assert.equal(render({ ...s, goal: { id } }), `${definition.label} · acumulacion: aerobic durability (primary).`);
    }
  }
});

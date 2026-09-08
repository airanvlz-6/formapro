import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain, contractFixture } from './trainingContractTestRuntime.mjs';
const load = sportsRuntime();
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const doseContext = load('sessionDoseContext').buildSessionDoseContext;
const resolve = load('prescriptionDataSufficiency').resolvePrescriptionDataSufficiency;
const environment = load('trainingEnvironment').resolveTrainingEnvironment;
const box = { lugar_entreno: 'Box CrossFit (equipamiento completo)' };
const gym = { lugar_entreno: 'Gimnasio convencional adaptado' };
const home = { lugar_entreno: 'En casa con equipamiento básico' };
const signals = (profile, date) => project({ perfil: profile }, date).prescriptionSignals;
const state = (profile, id, date) => signals(profile, date).signals[`equipment.${id}`];
const answer = value => ({ prescription_signals: { 'equipment.mancuerna': { state: value, updatedAt: '2026-09-08' } } });
function decision(profile, movementId = 'db_deadlift', authorizedAlternatives) {
  const context = doseContext(project({ perfil: profile }), undefined, null, [], true);
  return resolve(context.sufficiency, context.references, { movementId, discipline: 'box', authorizedAlternatives });
}
for (const id of ['mancuerna', 'kettlebell', 'barra', 'disco', 'bumper', 'rack', 'barra_dominadas', 'anillas', 'cajon', 'balon_medicinal', 'comba']) {
  test(`T1–T3 standard Box grants ${id} with derived provenance`, () => {
    assert.deepEqual(plain(state(box, id)), { state: 'available', source: 'derived:training_environment:v1:STANDARD_BOX:usuarios.perfil.lugar_entreno', updatedAt: null });
  });
}
test('T4/T18 full canonical context satisfies dumbbell requirement without question', () => {
  const result = decision(box);
  assert.equal(result.status, 'sufficient'); assert.equal(result.questions.length, 0);
  assert.equal(result.resolvedSignals[0].signal, 'equipment.mancuerna');
});
test('T5 explicit unavailable overrides environment and does not ask', () => {
  const profile = { ...box, ...answer('unavailable') };
  assert.equal(state(profile, 'mancuerna').state, 'unavailable');
  assert.equal(decision(profile).status, 'missing_required_data');
  assert.equal(decision(profile).questions.length, 0);
  const alternative = decision(profile, 'goblet_squat', ['air_squat']);
  // The existing ANY equipment rule can use the implicit kettlebell directly.
  assert.equal(alternative.status, 'sufficient');
  const bodyweight = decision({ ...profile, material: ['banco'] }, 'db_bench_press', ['push_up']);
  assert.equal(bodyweight.status, 'fallback_available');
  assert.equal(bodyweight.fallbacks[0].movementId, 'push_up');
});
test('T6 temporal exception wins over persistent available only on its date', () => {
  const profile = { ...box, ...answer('available'), prescription_access: { '2026-09-10': { 'equipment.mancuerna': { state: 'unavailable', updatedAt: '2026-09-08' } } } };
  assert.equal(state(profile, 'mancuerna', '2026-09-10').state, 'unavailable');
  assert.equal(state(profile, 'mancuerna', '2026-09-10').source, 'usuarios.perfil.prescription_access.2026-09-10.equipment.mancuerna');
  assert.equal(state(profile, 'mancuerna', '2026-09-11').state, 'available');
  assert.equal(state(profile, 'mancuerna').state, 'available');
});
test('T7/T8 Box does not grant specialized equipment or concrete ergometers', () => {
  for (const id of ['ghd', 'ski_erg', 'assault_bike', 'echo_bike', 'remo', 'yoke', 'sled', 'cuerda']) assert.equal(state(box, id).state, 'unknown');
  assert.equal(state({ ...box, material: ['SkiErg'] }, 'ski_erg').state, 'available');
});
test('T9/T10 STANDARD_GYM is exactly the requested existing equipment', () => {
  const expected = ['mancuerna', 'barra', 'disco', 'rack', 'banco', 'barra_dominadas', 'bici_estatica'];
  assert.deepEqual(plain(environment(gym).implicitEquipmentIds), expected);
  for (const id of expected) assert.equal(state(gym, id).state, 'available');
});
test('T11 Gym does not grant box-specific equipment', () => {
  for (const id of ['anillas', 'balon_medicinal', 'bumper', 'ghd', 'sled', 'yoke', 'ski_erg', 'echo_bike', 'assault_bike']) assert.equal(state(gym, id).state, 'unknown');
});
test('T12/T13 Home needs explicit equipment and may ask when unknown', () => {
  assert.equal(state(home, 'mancuerna').state, 'unknown');
  assert.equal(decision(home).questions[0].signalIds[0], 'equipment.mancuerna');
  const explicit = state({ ...home, material: ['Mancuernas'] }, 'mancuerna');
  assert.equal(explicit.state, 'available'); assert.equal(explicit.source, 'usuarios.perfil.material');
});
test('T14 unknown or outdoor invents no inventory; explicit answers still apply', () => {
  for (const lugar_entreno of [undefined, 'OUTDOOR', 'UNKNOWN', 'Un box espectacular', 42]) {
    assert.equal(state({ lugar_entreno }, 'mancuerna').state, 'unknown');
    assert.equal(state({ lugar_entreno, ...answer('available') }, 'mancuerna').state, 'available');
  }
  assert.equal(environment({ lugar_entreno: 'OUTDOOR' }).capabilityProfile, 'MINIMAL');
});
test('T15/T16 sport, availability, titles and history never establish a facility', () => {
  const p = project({ especialidad: 'funcional_crossfit', categoria: 'box', distribucion_semanal: { box: ['jueves'] },
    objetivo_principal: { descripcion: 'Entrenar en un Box' }, workout_history: [{ movementId: 'remo' }], perfil: {} });
  assert.equal(p.prescriptionSignals.signals['equipment.mancuerna'].state, 'unknown');
});
test('T17 explicit persistent and material evidence retain precedence and provenance', () => {
  assert.equal(state({ ...box, ...answer('available') }, 'mancuerna').source, 'usuarios.perfil.prescription_signals.equipment.mancuerna');
  assert.equal(state({ ...box, material: ['Mancuernas'] }, 'mancuerna').source, 'usuarios.perfil.material');
  for (const value of ['unknown', 'ambiguous']) assert.equal(state({ ...box, ...answer(value) }, 'mancuerna').state, value);
});
test('real complete-gym options resolve; mixed or contradictory environments stay unknown', () => {
  for (const profile of [{ material: ['Gimnasio completo'] }, { tipo_sala: 'Sala de pesas completa' }, { tipo_sala: 'Sala mixta (pesas + cardio)' }]) {
    assert.equal(environment(profile).environment, 'GYM'); assert.equal(state(profile, 'mancuerna').state, 'available');
  }
  for (const profile of [{ lugar_entreno: 'Mixto (box + casa)' }, { ...home, material: ['Gimnasio completo'] }, { tipo_sala: 'Estudio boutique' }, { lugar_entreno: 'Box CrossFit (equipamiento completo) cerca de casa' }]) {
    assert.equal(environment(profile).environment, 'UNKNOWN'); assert.equal(state(profile, 'mancuerna').state, 'unknown');
  }
});
test('all implicit equipment belongs to the actual movement catalog; no measurement/skill inferred', () => {
  const ids = load('../athlete/prescriptionSignals').equipmentIds;
  for (const profile of [box, gym]) {
    for (const id of environment(profile).implicitEquipmentIds) assert.ok(ids.includes(id));
    const s = signals(profile).signals;
    assert.equal(s['capability.canMeasureDistance'].state, 'unknown');
    assert.equal(s['skill.box.advanced'].state, 'unknown');
  }
});
test('existing feasibility consumes environment signals without widening restrictions or inventing equipment', () => {
  const build = load('allowedTrainingContract').buildAllowedTrainingContract;
  const input = contractFixture({ stimulus: 'cadena_posterior' });
  const withProfile = profile => build({ ...input, doseContext: doseContext(project({ perfil: profile }), undefined, null, [], true) });
  const result = withProfile(box);
  assert.equal(result.ok, true);
  assert.ok(result.contract.allowedMovementIds.includes('db_deadlift'));
  const denied = withProfile({ ...box, ...answer('unavailable') });
  assert.equal(denied.ok, true);
  assert.ok(!denied.contract.allowedMovementIds.includes('db_deadlift'));
  assert.deepEqual(plain(result.contract.prescriptionScope), input.prescriptionScope);
  assert.deepEqual(plain(result.contract.restrictionsSnapshot), input.restrictionsSnapshot);
});

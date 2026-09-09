import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { sportsRuntime, contractFixture, plain } from './trainingContractTestRuntime.mjs';
const load = sportsRuntime({ console: { info() {} } });
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const references = load('runningReferenceAuthority');
const athleteFixtures = {
  A: { perfil: { dispositivo: 'No, entreno por sensación (RPE)' } },
  B: { perfil: { dispositivo: 'Sí, solo pulsómetro (banda o reloj básico)', fc_max: 190, fc_max_metodo: 'real', fc_reposo: 55 } },
  C: { perfil: { dispositivo: 'Sí, reloj GPS con pulsómetro', fc_suave: 140, ritmo_suave: '6:00', umbral_fc: 165, ritmo_umbral: '5:00' },
    marcas_especificas: { '5k': '24:00', '10k': '50:00' } },
  D: { perfil: { dispositivo: 'Sí, reloj GPS con pulsómetro' }, marcas_especificas: { '21k': '1:45:00', '42k': '4:00:00' } },
  E: { perfil: { dispositivo: 'Sí, reloj GPS con pulsómetro', tiempo_media_maraton: '1:50:00', umbral_fc: 165 },
    marcas_especificas: { '21k': '1:45:00' }, datos_entrenamiento: { umbral_fc: 175 } },
  F: { perfil: { dispositivo: 'Sí, reloj GPS con pulsómetro', fc_max: 180, fc_max_metodo: 'formula_edad' }, marcas_especificas: { '21k': '1:55:00' } },
};
function fixture(methodId, athlete) {
  const user = structuredClone(athleteFixtures[athlete]);
  const goalId = methodId === 'running_vo2' ? '10k' : 'half_marathon';
  const canonical = project({ ...user, objetivo_principal: goalId, perfil: { ...user.perfil, duracion: '90 min', nivel_carrera: 'Avanzado (corro con frecuencia)' } });
  if (athlete === 'A') for (const id of ['canMeasureHeartRate', 'canMeasurePace']) canonical.prescriptionSignals.signals[`capability.${id}`].state = 'unavailable';
  const m = load('goalTransferModel').transferMethod(methodId);
  const intent = { kind: 'adaptation', goalId, adaptationId: m.adaptationId, methodId, role: methodId === 'running_recovery' ? 'MAINTENANCE'
    : ['running_vo2', 'running_economy'].includes(methodId) ? 'SUPPORTING' : 'PRIMARY',
    pattern: 'run', blockPhase: methodId === 'running_recovery' ? 'deload' : 'intensification', blockWeek: 12, weaknessId: null };
  const input = contractFixture({ discipline: 'carrera', stimulus: m.stimulusId, intent,
    doseContext: load('sessionDoseContext').buildSessionDoseContext(canonical, intent, null, [], true) });
  input.exposureContext.report.disciplina = 'carrera';
  const built = load('allowedTrainingContract').buildAllowedTrainingContract(input);
  assert.equal(built.ok, true, JSON.stringify(built));
  const c = built.contract; c.intensityAuthority = load('methodIntensityAuthority').resolveMethodIntensity(c);
  const movementId = { running_base: 'rodaje_z2', running_threshold: 'series_umbral', running_specific: 'rodaje_largo',
    running_vo2: 'series_vo2max', running_recovery: 'regenerativo', running_economy: 'drills_tecnica' }[methodId];
  const primary = c.intensityAuthority.targets.find(t => t.movementId === movementId)?.primary ?? { kind: 'rpe', value: 2 };
  const p = { schemaVersion: 2, stimulusId: c.stimulusId, structureId: c.allowedStructureIds[0], blocks: [
    { blockType: 'warmup', movements: [{ movementId, prescription: { durationSeconds: 120, intensity: { kind: 'rpe', value: 2 } } }] },
    { blockType: 'main', movements: [{ movementId, prescription: { durationSeconds: 300, intensity: primary,
      ...(c.allowedStructureIds[0] === 'intervalos_carrera' ? { sets: 3, restSeconds: 120 } : {}) } }] },
  ] };
  return { c, p, canonical };
}
for (const athlete of Object.keys(athleteFixtures)) for (const method of ['running_base', 'running_threshold', 'running_specific', 'running_vo2', 'running_recovery', 'running_economy']) {
  test(`C2.1 end-to-end ATHLETE_${athlete} ${method}`, async () => {
    const { c, p, canonical } = fixture(method, athlete);
    const rra = c.doseContext.runningReferenceAuthority;
    assert.deepEqual(plain(rra), plain(references.resolveRunningReferences(canonical)));
    const expected = athlete === 'C' && method === 'running_base' ? 'running:easyHr'
      : athlete === 'C' && method === 'running_threshold' ? 'running:thresholdPace'
      : ['D', 'F'].includes(athlete) && method === 'running_specific' ? 'running:halfMarathon' : null;
    const primary = p.blocks[1].movements[0].prescription.intensity;
    assert.equal(primary.kind, expected ? 'reference' : 'rpe'); if (expected) assert.equal(primary.referenceId, expected);
    assert.equal(c.intensityAuthority.status, method === 'running_economy' ? 'UNRESOLVED' : 'RESOLVED');
    const before = JSON.stringify(c); let calls = 0;
    const result = await load('sessionGeneration').generateContractSession(c, [], async prompt => {
      calls++; assert.match(prompt, method === 'running_economy' ? /METHOD INTENSITY UNRESOLVED/ : /Copia EXACTAMENTE/);
      return JSON.stringify(p);
    }, '', undefined, 'human_v3');
    assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(calls, 1); assert.equal(JSON.stringify(c), before);
    assert.equal(result.session.structuredPrescription.presentation.version, 'human_v3');
    assert.equal(result.session.descripcion.includes('RPE esperado'), !!expected);
    assert.doesNotMatch(result.session.descripcion, /DIRECT|DERIVED|ESTIMATED|algorithm|confidence|usuarios\./);
    if (method !== 'running_economy') {
      p.blocks[1].movements[0].prescription.intensity = { kind: 'rpe', value: 10 };
      assert.ok(load('structuredSession').validateSessionAgainstTrainingContract(c, p).violations.includes('METHOD_INTENSITY_OUTSIDE_DOMAIN'));
      assert.throws(() => load('structuredSession').renderContractSession(c, p, 'human_v3'), /METHOD_INTENSITY_OUTSIDE_DOMAIN/);
    }
  });
}
test('21k/42k editor labels map to official distances, declared time DIRECT and arithmetic pace DERIVED', () => {
  const p = project(athleteFixtures.D), a = references.resolveRunningReferences(p);
  for (const [type, seconds, distance] of [['halfMarathon', 6300, 21.0975], ['marathon', 14400, 42.195]]) {
    const entry = a.entries.find(e => e.type === type), ref = a.references.find(r => r.metric === type);
    assert.equal(entry.evidence.kind, 'DIRECT'); assert.equal(entry.value, seconds);
    assert.equal(entry.performanceRole, 'UNCLASSIFIED_PERFORMANCE'); assert.equal(entry.freshness, 'NOT_ASSESSED');
    assert.equal(ref.value, seconds / distance); assert.equal(ref.intensityEvidence.kind, 'DERIVED');
    assert.equal(ref.intensityEvidence.inputs[0].referenceId, entry.referenceId);
  }
});
test('same metric conflict never becomes latest wins; history/profile/PR are not interchangeable with current performance', () => {
  const p = project({ marcas_especificas: { '21k': '1:45:00' }, historial_marcas: [{ ejercicio: '21k', valor: '1:40:00', fecha: '2026-09-01' }] });
  const a = references.resolveRunningReferences(p);
  assert.equal(a.entries.find(e => e.type === 'halfMarathon').status, 'CONFLICT'); assert.equal(a.references.some(r => r.metric === 'halfMarathon'), false);
});
test('future target metadata and goal prose never become current capability or an executable race reference', () => {
  for (const store of ['marcas_especificas', 'historial_marcas']) {
    const value = { value: '1:30:00', performanceRole: 'TARGET_PERFORMANCE' };
    const p = project({ objetivo_principal: 'half_marathon sub 1:30', [store]: store === 'historial_marcas'
      ? [{ ejercicio: '21k', valor: value.value, performanceRole: value.performanceRole }] : { '21k': value } });
    const a = references.resolveRunningReferences(p);
    assert.equal(a.entries.find(e => e.type === 'halfMarathon').performanceRole, 'TARGET_PERFORMANCE');
    assert.equal(a.references.some(r => r.metric === 'halfMarathon'), false);
  }
  assert.equal(references.resolveRunningReferences(project({ objetivo_principal: 'half_marathon sub 1:30' })).references.length, 0);
});
test('population-marked HRmax stays ESTIMATED; physiology and VO2 do not invent executable zones or vVO2', () => {
  const p = project({ ...athleteFixtures.F, datos_entrenamiento: { fc_reposo: 50, vo2max: 55 } });
  const a = references.resolveRunningReferences(p), max = a.entries.find(e => e.type === 'maxHr');
  assert.equal(max.evidence.kind, 'ESTIMATED'); assert.equal(max.evidence.containsEstimatedData, true);
  assert.equal(max.evidence.measurementBasis, 'ESTIMATED');
  assert.equal(a.references.some(r => r.unit === 'bpm' || r.metric === 'vo2max'), false);
  assert.ok(a.limitations.includes('no_race_prediction_policy'));
});
test('tampered arithmetic, inputs, or metadata fails contract validation and cannot be rendered', () => {
  for (const mutate of [c => { c.doseContext.references.find(r => r.metric === 'halfMarathon').value = 200; },
    c => { c.doseContext.runningReferenceAuthority.entries.find(e => e.type === 'halfMarathon').value = 100; },
    c => { c.doseContext.runningReferenceAuthority.references.find(r => r.metric === 'halfMarathon').intensityEvidence.algorithm.version = 99; }]) {
    const { c, p } = fixture('running_specific', 'D'); mutate(c);
    assert.equal(load('allowedTrainingContract').validateAllowedTrainingContract(c).ok, false);
    assert.throws(() => load('structuredSession').renderContractSession(c, p, 'human_v3'));
  }
});
test('C1/C2 human_v2 and C2.1 human_v3 receipts coexist, including comparison text and tamper protection', () => {
  const sign = payload => { const data = Buffer.from(JSON.stringify(payload)).toString('base64url'); return data + '.'
    + createHmac('sha256', 'isolated-sports-test-key').update('forge-session-contract-v1:' + data).digest('base64url'); };
  for (const version of [1, 2, 3]) {
    const { c, p } = fixture('running_threshold', 'C');
    if (version < 3) {
      delete c.doseContext.runningReferenceAuthority;
      if (version === 1) {
        const target = c.intensityAuthority.targets.find(t => t.movementId === 'series_umbral');
        c.intensityAuthority = load('methodIntensityAuthority').resolveMethodIntensity(c,
          { id: 'historical_c1', version: 1, methodId: 'running_threshold', scope: 'main', targets: [target] });
      }
    }
    const presentationVersion = version < 3 ? 'human_v2' : 'human_v3';
    const s = load('structuredSession').renderContractSession(c, p, presentationVersion);
    assert.equal(s.descripcion.includes('RPE esperado'), version === 3);
    const receipt = sign({ userCodigo: 'synthetic', expiresAt: Date.now() + 60000, contract: c, proposal: p, presentationVersion });
    const verify = load('sessionAuthority').verifySessionReceipt;
    assert.equal(verify(receipt, s, 'synthetic', c.targetWeekStart).descripcion, s.descripcion);
    const altered = structuredClone(s); altered.descripcion += ' · 190 ppm';
    assert.throws(() => verify(receipt, altered, 'synthetic', c.targetWeekStart), /CONTENT_MISMATCH/);
    const legacy = load('sessionPresentation').legacySessionView(s);
    assert.equal(legacy.descripcion, s.structuredPrescription.presentation.comparisonRepresentation.descripcion);
  }
});

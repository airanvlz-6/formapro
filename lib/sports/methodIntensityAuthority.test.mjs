import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { sportsRuntime, contractFixture, plain } from './trainingContractTestRuntime.mjs';
const logs = [], load = sportsRuntime({ console: { info: (...args) => logs.push(args) } });
const api = load('methodIntensityAuthority');
function fixture(profile = {}, data = {}) {
  const m = load('goalTransferModel').transferMethod('running_threshold');
  const intent = { kind: 'adaptation', goalId: 'half_marathon', adaptationId: m.adaptationId, methodId: m.id, role: 'PRIMARY',
    pattern: 'run', blockPhase: 'intensification', blockWeek: 12, weaknessId: null };
  const canonical = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({ objetivo_principal: 'half_marathon', perfil: { duracion: '90 min', ...profile }, datos_entrenamiento: data });
  const input = contractFixture({ discipline: 'carrera', stimulus: m.stimulusId, intent,
    doseContext: load('sessionDoseContext').buildSessionDoseContext(canonical, intent, null, [], true) });
  input.exposureContext.report.disciplina = 'carrera';
  const c = load('allowedTrainingContract').buildAllowedTrainingContract(input).contract;
  const p = { schemaVersion: 2, stimulusId: c.stimulusId, structureId: 'intervalos_carrera', blocks: [
    { blockType: 'warmup', movements: [{ movementId: 'series_umbral', prescription: { durationSeconds: 120, intensity: { kind: 'rpe', value: 3 } } }] },
    { blockType: 'main', movements: [{ movementId: 'series_umbral', prescription: { sets: 5, durationSeconds: 360, restSeconds: 120, intensity: { kind: 'rpe', value: 7, max: 8 } } }] },
  ] };
  return { c, p };
}
const evidence = kind => ({ kind, resolution: 'RESOLVED', confidence: kind === 'ESTIMATED' ? 'estimated' : 'declared', source: 'test_policy',
  measurementBasis: kind === 'ESTIMATED' ? 'ESTIMATED' : 'DECLARED',
  inputs: kind === 'DERIVED' ? [{ referenceId: 'test_input', source: 'test_observation', containsEstimatedData: false }] : [],
  algorithm: kind === 'DERIVED' ? { id: 'test_only_derivation', version: 1 } : null, containsEstimatedData: kind === 'ESTIMATED' });
const policy = primary => ({ id: 'test_only_not_sports_policy', version: 1, methodId: 'running_threshold', scope: 'main',
  targets: [{ movementId: 'series_umbral', primary, evidence: evidence(primary.kind === 'reference' ? 'DIRECT' : 'SUBJECTIVE') }] });
const hr = { kind: 'reference', referenceId: 'running:thresholdHr' };
const device = { dispositivo: 'Sí, reloj GPS con pulsómetro' };
const validate = load('structuredSession').validateSessionAgainstTrainingContract;

test('A/B/H capability or maxHR alone creates no zone; production registry stays unresolved', () => {
  for (const profile of [device, { ...device, fc_max: 190, fc_reposo: 50 }, { ...device, fc_max_metodo: 'formula_edad', edad: 40 }]) {
    const { c } = fixture(profile);
    assert.equal(c.doseContext.references.length, 0);
    const a = api.resolveMethodIntensity(c); assert.equal(a.status, 'UNRESOLVED'); assert.equal(a.reason, 'NO_METHOD_POLICY');
    assert.equal(api.resolveMethodIntensity(c, policy(hr)).status, 'UNRESOLVED');
  }
});
test('C/D/E references and capability intersect without metric equivalence or invented values', () => {
  for (const [id, data] of [['running:thresholdHr', { umbral_fc: '160–165' }], ['running:thresholdPace', { ritmo_umbral: '5:00 min/km' }]]) {
    const target = { kind: 'reference', referenceId: id };
    const { c } = fixture(device, data);
    assert.equal(api.resolveMethodIntensity(c, policy(target)).status, 'RESOLVED');
    const missing = fixture({ dispositivo: 'No, entreno por sensación (RPE)' }, data).c;
    assert.equal(api.resolveMethodIntensity(missing, policy(target)).status, 'UNRESOLVED');
  }
});
test('F/G resolved main copies exact target; schema/executable can pass while method domain rejects', async () => {
  const { c, p } = fixture(device, { umbral_fc: '160–165', z2_fc: '130–140' });
  c.intensityAuthority = api.resolveMethodIntensity(c, policy(hr));
  assert.equal(load('allowedTrainingContract').validateAllowedTrainingContract(c).ok, true);
  p.blocks[1].movements[0].prescription.intensity = { kind: 'reference', referenceId: 'running:z2' };
  assert.equal(load('structuredSession').checkSessionShape(p).ok, true);
  assert.deepEqual(plain(validate(c, p).violations), ['METHOD_INTENSITY_OUTSIDE_DOMAIN']);
  p.blocks[1].movements[0].prescription.intensity = hr;
  assert.equal(validate(c, p).ok, true);
  let calls = 0;
  const r = await load('sessionGeneration').generateContractSession(c, [], async prompt => {
    calls++; assert.match(prompt, /METHOD INTENSITY RESOLVED/); assert.match(prompt, /Copia EXACTAMENTE/); return JSON.stringify(p);
  }, '', undefined, 'human_v2');
  assert.equal(r.ok, true); assert.equal(calls, 1); assert.deepEqual(plain(r.proposal), p);
});
test('G policy-local bounds reject all audit counterexample values without activating sports numbers', () => {
  // This is an arbitrary test domain, NOT a recovery/base/VO2 policy or an endorsement of RPE 6.
  for (const value of [8, 7, 1]) {
    const { c, p } = fixture(); c.intensityAuthority = api.resolveMethodIntensity(c, policy({ kind: 'rpe', value: 6 }));
    p.blocks[1].movements[0].prescription.intensity = { kind: 'rpe', value };
    assert.ok(validate(c, p).violations.includes('METHOD_INTENSITY_OUTSIDE_DOMAIN'));
    delete c.intensityAuthority; assert.equal(validate(c, p).ok, true);
  }
});
test('H unresolved retains compatible legacy behavior and emits explicit non-authoritative diagnostic', async () => {
  logs.length = 0; const { c, p } = fixture(); c.intensityAuthority = api.resolveMethodIntensity(c);
  const before = JSON.stringify(c);
  const r = await load('sessionGeneration').generateContractSession(c, [], async prompt => { assert.match(prompt, /METHOD INTENSITY UNRESOLVED/); return JSON.stringify(p); });
  assert.equal(r.ok, true); assert.equal(JSON.stringify(c), before);
  assert.ok(logs.some(([tag, d]) => tag === 'METHOD_INTENSITY_AUTHORITY' && d.status === 'UNRESOLVED'));
});
test('I/J primary HR plus subjective guide coexist in signed facts, provenance retained without editorial invention', () => {
  for (const kind of ['DIRECT', 'DERIVED', 'ESTIMATED']) {
    const { c, p } = fixture(device, { umbral_fc: '160–165' }), pol = policy(hr);
    pol.targets[0].evidence = evidence(kind);
    pol.targets[0].secondary = { metric: 'rpe', value: 5, purpose: 'perception_guide', evidence: evidence('SUBJECTIVE') };
    c.intensityAuthority = api.resolveMethodIntensity(c, pol);
    p.blocks[1].movements[0].prescription.intensity = hr;
    const s = load('structuredSession').renderContractSession(c, p, 'human_v2');
    assert.deepEqual(plain(s.structuredPrescription.intensityAuthority.targets), pol.targets);
    assert.equal(s.structuredPrescription.intensityAuthority.targets[0].secondary.metric, 'rpe');
    assert.doesNotMatch(s.descripcion, /test_policy|test_only_derivation|perception_guide/);
  }
});
test('K historical receipts and C1 receipts verify; altered version/authority/metadata fails closed', () => {
  const { c, p } = fixture(), render = load('structuredSession').renderContractSession, verify = load('sessionAuthority').verifySessionReceipt;
  const sign = payload => { const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url'); return encoded + '.' + createHmac('sha256', 'isolated-sports-test-key').update('forge-session-contract-v1:' + encoded).digest('base64url'); };
  for (const modern of [false, true]) {
    if (modern) c.intensityAuthority = api.resolveMethodIntensity(c, policy({ kind: 'rpe', value: 7, max: 8 }));
    const s = render(c, p, modern ? 'human_v2' : 'legacy');
    const receipt = sign({ userCodigo: 'test', expiresAt: Date.now() + 60000, contract: c, proposal: p, ...(modern ? { presentationVersion: 'human_v2' } : {}) });
    assert.equal(verify(receipt, s, 'test', c.targetWeekStart).descripcion, s.descripcion);
    if (modern) { const altered = structuredClone(s); altered.structuredPrescription.intensityAuthority.status = 'UNRESOLVED'; assert.throws(() => verify(receipt, altered, 'test', c.targetWeekStart), /CONTENT_MISMATCH/); }
  }
  c.intensityAuthority.version = 99; assert.equal(load('allowedTrainingContract').validateAllowedTrainingContract(c).ok, false);
});
test('binding rejects changed signals and incomplete derived provenance; logger failure cannot change success', async () => {
  const { c, p } = fixture(); const pol = policy({ kind: 'rpe', value: 7, max: 8 });
  pol.targets[0].evidence = evidence('DERIVED'); pol.targets[0].evidence.algorithm = null;
  assert.equal(api.resolveMethodIntensity(c, pol).status, 'UNRESOLVED');
  c.intensityAuthority = api.resolveMethodIntensity(c);
  const throwing = sportsRuntime({ console: { info() { throw Error('logger'); } } });
  assert.equal((await throwing('sessionGeneration').generateContractSession(c, [], async () => JSON.stringify(p))).ok, true);
  c.doseContext.sufficiency.signals['capability.canMeasureHeartRate'].state = 'available';
  assert.equal(load('allowedTrainingContract').validateAllowedTrainingContract(c).ok, false);
});

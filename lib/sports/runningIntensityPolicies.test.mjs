import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { sportsRuntime, contractFixture, plain } from './trainingContractTestRuntime.mjs';
const logs = [], load = sportsRuntime({ console: { info: (...args) => logs.push(args) } });
const api = load('methodIntensityAuthority');
const policies = load('runningIntensityPolicies');
const hr = { fc_suave: '135–140', umbral_fc: '160–165', z1_fc: '110–125', z2_fc: '130–140', z5_fc: '175–185' };
const pace = { ritmo_suave: '6:00 min/km', ritmo_umbral: '5:00 min/km', tiempo_5k: '24:00', tiempo_10k: '50:00' };
const bands = { running_base: [2, 3], running_long_run: [2, 3], running_threshold: [6, 7], running_specific: [4, 5], running_vo2: [8, 9], running_recovery: [1, 2] };
const deviceStates = { none: ['unavailable', 'unavailable'], hr: ['available', 'unavailable'], both: ['available', 'available'] };
function fixture(methodId = 'running_threshold', device = 'both', data = {}, profile = {}) {
  const m = load('goalTransferModel').transferMethod(methodId);
  const goalId = methodId === 'running_vo2' ? '10k' : 'half_marathon';
  const intent = { kind: 'adaptation', goalId, adaptationId: m.adaptationId, methodId, role: methodId === 'running_recovery' ? 'MAINTENANCE'
    : ['running_vo2', 'running_economy'].includes(methodId) ? 'SUPPORTING' : 'PRIMARY',
    pattern: 'run', blockPhase: methodId === 'running_recovery' ? 'deload' : 'intensification', blockWeek: 12, weaknessId: null };
  const canonical = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({ objetivo_principal: goalId,
    perfil: { duracion: '90 min', nivel_carrera: 'Avanzado (corro con frecuencia)', ...profile }, datos_entrenamiento: data });
  const dc = load('sessionDoseContext').buildSessionDoseContext(canonical, intent, null, [], true);
  for (const [i, name] of ['canMeasureHeartRate', 'canMeasurePace'].entries()) dc.sufficiency.signals[`capability.${name}`].state = deviceStates[device][i];
  const input = contractFixture({ discipline: 'carrera', stimulus: m.stimulusId, intent, doseContext: dc });
  input.exposureContext.report.disciplina = 'carrera';
  const result = load('allowedTrainingContract').buildAllowedTrainingContract(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.contract;
}
function attach(c) { c.intensityAuthority = api.resolveMethodIntensity(c); return c.intensityAuthority; }
function proposal(c, intensity) {
  const movementId = { running_base: 'rodaje_z2', running_threshold: 'series_umbral', running_specific: 'rodaje_largo',
    running_recovery: 'regenerativo', running_vo2: 'series_vo2max' }[c.intent.methodId];
  return { schemaVersion: 2, stimulusId: c.stimulusId, structureId: c.allowedStructureIds[0], blocks: [
    { blockType: 'warmup', movements: [{ movementId, prescription: { durationSeconds: 120, intensity: { kind: 'rpe', value: 2 } } }] },
    { blockType: 'main', movements: [{ movementId, prescription: { durationSeconds: 300,
      ...(c.allowedStructureIds[0] === 'intervalos_carrera' ? { sets: 3, restSeconds: 120 } : {}), intensity } }] },
  ] };
}
for (const method of policies.RUNNING_INTENSITY_POLICIES) for (const device of Object.keys(deviceStates)) {
  for (const kind of ['none', 'hr', 'pace', 'both', 'conflict', 'unknown', 'estimated']) {
    test(`C2 matrix ${method.methodId}/${device}/${kind}`, () => {
      const data = kind === 'hr' ? hr : kind === 'pace' ? pace : ['both', 'conflict', 'estimated'].includes(kind) ? { ...hr, ...pace } : {};
      const c = fixture(method.methodId, device, data, kind === 'conflict' ? { fc_suave: 150, umbral_fc: 170, ritmo_suave: '7:00', ritmo_umbral: '6:00' } : {});
      // C1 reference injection tests domain selection; C2.1 separately tests its canonical producer/binding.
      if (kind === 'estimated') delete c.doseContext.runningReferenceAuthority;
      if (kind === 'estimated') for (const r of c.doseContext.references) r.intensityEvidence = { ...r.intensityEvidence,
        kind: 'ESTIMATED', confidence: 'estimated', measurementBasis: 'ESTIMATED', containsEstimatedData: true };
      const before = JSON.stringify(c), a = api.resolveMethodIntensity(c);
      assert.equal(JSON.stringify(c), before); assert.deepEqual(plain(a), plain(api.resolveMethodIntensity(c)));
      if (method.methodId === 'running_economy') {
        assert.equal(a.status, 'UNRESOLVED'); assert.deepEqual(plain(a.diagnostics), ['METHOD_INTENSITY_POLICY_UNRESOLVED']); return;
      }
      assert.equal(a.status, 'RESOLVED'); assert.equal(a.version, 2);
      const supportsObjective = ['running_base', 'running_long_run', 'running_threshold'].includes(method.methodId);
      const hasHr = ['hr', 'both', 'estimated'].includes(kind) && device !== 'none';
      const hasPace = ['pace', 'both', 'estimated'].includes(kind) && device === 'both';
      const expectedRef = !supportsObjective ? null : ['running_base','running_long_run'].includes(method.methodId)
        ? hasHr ? 'running:easyHr' : hasPace ? 'running:easyPace' : null
        : hasHr ? 'running:thresholdHr' : hasPace ? 'running:thresholdPace' : null;
      for (const target of a.targets) {
        if (expectedRef) {
          assert.deepEqual(plain(target.primary), { kind: 'reference', referenceId: expectedRef });
          assert.deepEqual([target.secondary.value, target.secondary.max], bands[method.methodId]);
          assert.equal(target.secondary.evidence.kind, 'SUBJECTIVE');
          assert.equal(target.evidence.containsEstimatedData, kind === 'estimated');
        } else {
          assert.deepEqual(plain(target.primary), { kind: 'rpe', value: bands[method.methodId][0], max: bands[method.methodId][1] });
          assert.equal(target.evidence.kind, 'SUBJECTIVE'); assert.equal(target.secondary, undefined);
        }
      }
      if (kind === 'conflict' && supportsObjective) assert.ok(a.diagnostics.includes('METHOD_INTENSITY_REFERENCE_CONFLICT'));
      c.intensityAuthority = a; assert.equal(load('allowedTrainingContract').validateAllowedTrainingContract(c).ok, true);
    });
  }
}
test('C2 reproduces all four C1 counterexamples through full post-Builder validation', () => {
  for (const [method, invalid] of [['running_threshold', { kind: 'reference', referenceId: 'running:z2' }],
    ['running_recovery', { kind: 'rpe', value: 8 }], ['running_base', { kind: 'rpe', value: 7 }], ['running_vo2', { kind: 'rpe', value: 1 }]]) {
    const c = fixture(method, 'both', { ...hr, ...pace }), a = attach(c), p = proposal(c, invalid);
    const validate = load('structuredSession').validateSessionAgainstTrainingContract;
    assert.deepEqual(plain(validate(c, p).violations), ['METHOD_INTENSITY_OUTSIDE_DOMAIN']);
    p.blocks[1].movements[0].prescription.intensity = a.targets.find(t => t.movementId === p.blocks[1].movements[0].movementId).primary;
    assert.equal(validate(c, p).ok, true, JSON.stringify(validate(c, p)));
    p.blocks[1].movements[0].prescription.intensity = { kind: 'rpe', value: bands[method][0] };
    assert.ok(validate(c, p).violations.includes('METHOD_INTENSITY_OUTSIDE_DOMAIN'), 'exact domain band cannot be narrowed by Builder');
  }
});
test('specific consumes goal; no 5K/10K to HM equivalence and no new goal admission', () => {
  const c = fixture('running_specific', 'both', pace);
  assert.equal(attach(c).targets[0].primary.kind, 'rpe');
  // Resolver unit boundary only: 3B does not currently admit specific+10k. C2 must not change that.
  c.intent.goalId = '10k'; const a = api.resolveMethodIntensity(c);
  assert.equal(a.targets[0].primary.referenceId, 'running:10k'); assert.equal(a.targets[0].evidence.kind, 'DERIVED');
  assert.equal(a.targets[0].evidence.algorithm.id, 'race_time_divided_by_kilometres');
  assert.equal(load('allowedTrainingContract').validateAllowedTrainingContract(c).ok, false);
  c.intent.goalId = 'hyrox'; assert.equal(api.resolveMethodIntensity(c).status, 'UNRESOLVED');
});
test('economy run/jump and altered structure remain explicitly unresolved; no metabolic target invented', () => {
  const c = fixture('running_economy');
  for (const pattern of ['run', 'jump']) { c.intent.pattern = pattern; assert.equal(api.resolveMethodIntensity(c).status, 'UNRESOLVED'); }
  const threshold = fixture(); threshold.allowedStructureIds.push('tecnica_carrera');
  assert.equal(api.resolveMethodIntensity(threshold).status, 'UNRESOLVED');
});
test('all twelve other methods have no policy; no implicit registry expansion', () => {
  const c = fixture();
  const others = load('goalTransferModel').TRANSFER_METHODS.filter(m => !policies.RUNNING_INTENSITY_POLICIES.some(p => p.methodId === m.id));
  assert.equal(others.length, 12);
  for (const m of others) { c.intent.methodId = m.id; assert.equal(api.resolveMethodIntensity(c).reason, 'NO_METHOD_POLICY'); }
});
test('unknown/ambiguous measurement fails closed to RPE even with threshold reference; maxHR is not a zone', () => {
  for (const state of ['unknown', 'ambiguous', 'unavailable']) {
    const c = fixture('running_threshold', 'none', { ...hr, fc_maxima: 190 });
    c.doseContext.sufficiency.signals['capability.canMeasureHeartRate'].state = state;
    const a = attach(c); assert.equal(a.targets[0].primary.kind, 'rpe'); assert.ok(a.diagnostics.includes('METHOD_INTENSITY_NO_CAPABILITY'));
    assert.equal(c.doseContext.references.some(r => r.metric === 'maxHr'), false);
  }
});
test('C2 binding includes conflict and structure; diagnostics reject fields outside allowlist', () => {
  const c = fixture(); attach(c);
  c.doseContext.referenceResolution.running.thresholdHr = 'conflict'; assert.equal(api.validMethodIntensity(c), false);
  attach(c); c.allowedStructureIds = ['tempo_continuo']; assert.equal(api.validMethodIntensity(c), false);
  attach(c); c.intensityAuthority.diagnostics = ['SECRET FREE TEXT']; assert.equal(api.validMethodIntensity(c), false);
});
test('conflicting preferred reference falls to authorized other metric, never to the conflicting value', () => {
  for (const [method, conflict, expected] of [['running_base', { fc_suave: 150 }, 'running:easyPace'],
    ['running_threshold', { umbral_fc: 150 }, 'running:thresholdPace']]) {
    const c = fixture(method, 'both', { ...hr, ...pace }, conflict), a = attach(c);
    assert.equal(a.targets[0].primary.referenceId, expected);
    assert.ok(a.diagnostics.includes('METHOD_INTENSITY_REFERENCE_CONFLICT'));
  }
});
test('same-type direct evidence precedes estimates/derivations independent of array order, and preserves metadata', () => {
  const c = fixture('running_threshold', 'both', pace);
  delete c.doseContext.runningReferenceAuthority; // Synthetic C1 provider, not a forged C2.1 projection.
  const direct = c.doseContext.references.find(r => r.metric === 'thresholdPace');
  const derived = { ...structuredClone(direct), id: 'derived_threshold', intensityEvidence: { ...direct.intensityEvidence,
    kind: 'DERIVED', inputs: [{ referenceId: 'test_input', source: 'test', containsEstimatedData: false }],
    algorithm: { id: 'test_only_derivation', version: 1 } } };
  const estimated = { ...structuredClone(direct), id: 'estimated_threshold', intensityEvidence: { ...direct.intensityEvidence,
    kind: 'ESTIMATED', measurementBasis: 'ESTIMATED', confidence: 'estimated', containsEstimatedData: true } };
  for (const order of [[estimated, derived, direct], [direct, derived, estimated]]) {
    c.doseContext.references = order; assert.equal(attach(c).targets[0].primary.referenceId, direct.id);
  }
  c.doseContext.references = [estimated, derived];
  const a = attach(c); assert.equal(a.targets[0].primary.referenceId, derived.id);
  assert.equal(a.targets[0].evidence.algorithm.id, 'test_only_derivation');
  c.doseContext.referenceResolution.running.thresholdPace = 'conflict';
  assert.equal(attach(c).targets[0].primary.kind, 'rpe');
});
test('specific fallback passes full validation; arbitrary objective or narrower subjective target does not', () => {
  const c = fixture('running_specific', 'both', { ...hr, ...pace }), a = attach(c);
  const p = proposal(c, a.targets.find(t => t.movementId === 'rodaje_largo').primary);
  const validate = load('structuredSession').validateSessionAgainstTrainingContract;
  assert.equal(validate(c, p).ok, true, JSON.stringify(validate(c, p)));
  for (const intensity of [{ kind: 'reference', referenceId: 'running:10k' }, { kind: 'reference', referenceId: 'running:thresholdPace' }, { kind: 'rpe', value: 4 }]) {
    p.blocks[1].movements[0].prescription.intensity = intensity;
    assert.deepEqual(plain(validate(c, p).violations), ['METHOD_INTENSITY_OUTSIDE_DOMAIN']);
  }
});
test('C2 and historical C1 receipts round-trip; primary/secondary/version tampering cannot persist', () => {
  const sign = payload => { const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return encoded + '.' + createHmac('sha256', 'isolated-sports-test-key').update('forge-session-contract-v1:' + encoded).digest('base64url'); };
  const render = load('structuredSession').renderContractSession, verify = load('sessionAuthority').verifySessionReceipt;
  for (const legacy of [false, true]) {
    const c = fixture('running_threshold', 'both', hr);
    if (legacy) {
      delete c.doseContext.runningReferenceAuthority;
      delete c.doseContext.referenceResolution;
      for (const ref of c.doseContext.references) delete ref.intensityEvidence;
      const t = api.resolveMethodIntensity(c).targets.find(t => t.movementId === 'series_umbral');
      c.intensityAuthority = api.resolveMethodIntensity(c, { id: 'historical_c1', version: 1, methodId: c.intent.methodId, scope: 'main', targets: [t] });
    } else attach(c);
    const p = proposal(c, { kind: 'reference', referenceId: 'running:thresholdHr' });
    const s = render(c, p, 'human_v2');
    const receipt = sign({ userCodigo: 'synthetic', expiresAt: Date.now() + 60000, contract: c, proposal: p, presentationVersion: 'human_v2' });
    assert.equal(verify(receipt, s, 'synthetic', c.targetWeekStart).descripcion, s.descripcion);
    const altered = structuredClone(s); altered.structuredPrescription.intensityAuthority.targets[0].secondary.value = 9;
    assert.throws(() => verify(receipt, altered, 'synthetic', c.targetWeekStart), /CONTENT_MISMATCH/);
  }
});
test('SAFE diagnostics, Builder exact targets, logger failure, and unchanged contract/proposal', async () => {
  logs.length = 0;
  const c = fixture(), a = attach(c), p = proposal(c, a.targets.find(t => t.movementId === 'series_umbral').primary);
  const before = JSON.stringify(c); let calls = 0;
  const result = await load('sessionGeneration').generateContractSession(c, [], async prompt => {
    calls++; assert.match(prompt, /Copia EXACTAMENTE/); return JSON.stringify(p);
  });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(calls, 1); assert.equal(JSON.stringify(c), before);
  const diagnostic = logs.find(([tag]) => tag === 'METHOD_INTENSITY_AUTHORITY')[1];
  assert.deepEqual(Object.keys(diagnostic).sort(), ['codesCsv', 'reason', 'scope', 'status', 'version']);
  assert.match(diagnostic.codesCsv, /METHOD_INTENSITY_NO_REFERENCE/); assert.match(diagnostic.codesCsv, /METHOD_INTENSITY_FALLBACK_RPE/);
  assert.doesNotMatch(JSON.stringify(diagnostic), /usuarios|perfil|160|165|token|prompt|referenceId/);
  const throwing = sportsRuntime({ console: { info() { throw Error('logger failure'); } } });
  const again = await throwing('sessionGeneration').generateContractSession(c, [], async () => JSON.stringify(p));
  assert.equal(again.ok, true); assert.deepEqual(plain(again.proposal), plain(result.proposal));
});

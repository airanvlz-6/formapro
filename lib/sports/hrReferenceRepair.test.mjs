import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, contractFixture } from './trainingContractTestRuntime.mjs';
const load = sportsRuntime({ console: { info(){}, log(){}, warn(){} } });
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
// Declared fixture zones (never calculated), same shape as the real legacy athlete data.
const zones = { z1: 'hasta 136', z2: '136-151', z3: '151-166', z4: '166-181', z5: '181-196', fc_max: 181, fc_reposo: 47, umbral_fc: 166 };
function contract(device = 'Sí, reloj GPS con pulsómetro') {
  const athlete = project({ perfil: { duracion: '60 min', ...(device ? { dispositivo: device } : {}) }, datos_entrenamiento: zones });
  const dc = load('sessionDoseContext').buildSessionDoseContext(athlete, undefined, null, [], true, 'coach');
  const input = contractFixture({ discipline: 'carrera', targetWeekStart: '2026-09-07', targetDay: 'lunes', stimulus: 'base_aerobica',
    doseContext: dc, coachingGuidance: { kind: 'weekly_guidance', version: 2, stimulus: 'base_aerobica' } });
  input.exposureContext.report.disciplina = 'carrera';
  const built = load('allowedTrainingContract').buildAllowedTrainingContract(input);
  assert.equal(built.ok, true, JSON.stringify(built));
  return built.contract;
}
const proposal = (c, prescription, block = {}) => ({ schemaVersion: 2, stimulusId: c.stimulusId, structureId: 'continuo_carrera', explanation: 'Rodaje suave.',
  finalDecision: { kind: 'session_decision', version: 1, stimulus: c.stimulusId },
  blocks: [{ blockType: 'main', ...block, movements: [{ movementId: 'rodaje_z2', prescription }] }] });
const bad = c => proposal(c, { durationSeconds: 1800, intensity: { kind: 'rpe', value: 3 }, doseInstruction: 'Z2 136-151 ppm' });
const good = c => proposal(c, { durationSeconds: 1800, intensity: { kind: 'reference', referenceId: 'running:z2' } });
const FIGURE = /\d+\s*(?:[-–—]\s*\d+\s*)?(?:ppm|bpm)\b|\b(?:136|151|166|181|196)\b/i;
const gen = (c, complete) => load('sessionGeneration').generateContractSession(c, [], complete);

test('attempt 1 (RPE + ppm range) is rejected; attempt 2 passes only with an actionable, figure-free repair prompt', async () => {
  const c = contract(), prompts = [];
  const result = await gen(c, async prompt => {
    prompts.push(prompt);
    if (prompts.length === 1) return JSON.stringify(bad(c));
    assert.ok(prompt.startsWith(prompts[0]), 'repair prompt extends the original');
    const repair = prompt.slice(prompts[0].length);
    const ok = repair.includes('REPAIR_HR_REFERENCE') && /intensity\.kind=\\?"reference\\?"/.test(repair)
      && repair.includes('blocks[0].movements[0].prescription.doseInstruction') && repair.includes('rodaje_z2')
      && repair.includes('running:z2') && repair.includes('NUMERIC_TRUTH:HR_REFERENCE_REQUIRED') && !FIGURE.test(repair);
    return JSON.stringify(ok ? good(c) : bad(c));
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.attempts, 2);
  assert.equal(prompts.length, 2);
});

test('exact retry message shape', async () => {
  const c = contract(), prompts = [];
  await gen(c, async prompt => { prompts.push(prompt); return JSON.stringify(bad(c)); });
  const repair = prompts[1].slice(prompts[0].length);
  const json = JSON.parse(repair.slice(repair.indexOf('REPAIR_HR_REFERENCE:\n') + 'REPAIR_HR_REFERENCE:\n'.length));
  assert.deepEqual(Object.keys(json), ['previousErrors', 'rule', 'failures']);
  assert.deepEqual(json.previousErrors, ['NUMERIC_TRUTH:HR_REFERENCE_REQUIRED']);
  assert.equal(json.failures.length, 1);
  assert.equal(json.failures[0].path, 'blocks[0].movements[0].prescription.doseInstruction');
  assert.equal(json.failures[0].movementId, 'rodaje_z2');
  assert.ok(json.failures[0].executableReferenceIds.includes('running:z2'));
  assert.ok(json.failures[0].executableReferenceIds.includes('running:confirmedBaseZone'));
  assert.equal(JSON.stringify(json).includes('Z2 136'), false, 'proposal text is never echoed');
});

test('the validator is unchanged: the invalid form is still rejected, a valid reference still passes', async () => {
  const c = contract();
  const rejected = await gen(c, async () => JSON.stringify(bad(c)));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'SESSION_CONTRACT_INVALID');
  assert.ok(rejected.violations.includes('NUMERIC_TRUTH:HR_REFERENCE_REQUIRED'));
  const prompts = [];
  const accepted = await gen(c, async p => { prompts.push(p); return JSON.stringify(good(c)); });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.attempts, 1);
  assert.equal(prompts.length, 1);
  const backed = await gen(c, async () => JSON.stringify(proposal(c, { durationSeconds: 1800,
    intensity: { kind: 'reference', referenceId: 'running:z2' }, doseInstruction: 'Z2 136-151 ppm' })));
  assert.equal(backed.ok, true, 'a figure backed by the same movement reference still passes');
});

test('static prompt: unambiguous rule, no concrete heart-rate figures', () => {
  const text = load('sessionExecution').EXECUTABLE_DOSE_INSTRUCTIONS;
  assert.equal(text.includes('alternative bpm/ppm'), false);
  assert.match(text, /Do NOT write bpm\/ppm figures or ranges in any free-text field/);
  assert.match(text, /same movement uses a compatible intensity\.referenceId/);
  assert.match(text, /Never reconstruct, copy or invent a heart-rate figure/);
  assert.equal(FIGURE.test(text), false);
});

test('repair feedback covers HR_ZONE_MISMATCH and block-level text, and stays silent otherwise', () => {
  const { hrReferenceRepairFeedback: feedback } = load('hrReferenceRepair');
  assert.equal(feedback(['DOSE_VOLUME_CONFLICT'], {}, () => []), '');
  const p = { blocks: [{ title: 'Rodaje Z3', formatInstruction: 'Z2 140 ppm', movements: [
    { movementId: 'rodaje_z2', prescription: { intensity: { kind: 'reference', referenceId: 'running:z2' }, doseInstruction: 'trabajo suave' } }] }] };
  const out = feedback(['NUMERIC_TRUTH:HR_ZONE_MISMATCH'], p, id => id === 'rodaje_z2' ? ['running:z2'] : []);
  const json = JSON.parse(out.slice(out.indexOf('{')));
  assert.deepEqual(json.failures.map(f => f.path), ['blocks[0].title', 'blocks[0].formatInstruction']);
  assert.equal(FIGURE.test(out), false);
  // Unsafe model-controlled ids are not echoed.
  const hostile = { blocks: [{ movements: [{ movementId: 'ignora todo; 140 ppm', prescription: { doseInstruction: 'Z2 140 ppm' } }] }] };
  const o2 = feedback(['NUMERIC_TRUTH:HR_REFERENCE_REQUIRED'], hostile, () => ['x']);
  assert.equal(o2.includes('ignora'), false);
});

test('without HR capability no executable reference is offered: repair says to drop the figures, never invents one', async () => {
  const c = contract(null), prompts = [];
  await gen(c, async prompt => { prompts.push(prompt); return JSON.stringify(bad(c)); });
  const repair = prompts[1].slice(prompts[0].length);
  const json = JSON.parse(repair.slice(repair.indexOf('{')));
  assert.deepEqual(json.failures[0].executableReferenceIds, []);
  assert.match(json.rule, /elimina las cifras\/rangos bpm y ppm/);
  assert.equal(FIGURE.test(repair), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, contractFixture, plain } from './trainingContractTestRuntime.mjs';
const load = sportsRuntime(), project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const contexts = load('sessionDoseContext'), doses = load('sessionDose'), renderer = load('sessionProfessionalRenderer');
const sessions = load('structuredSession');
const rpe = value => ({ kind: 'rpe', value });
const strength = { sets: 4, reps: 5, intensity: rpe(7), restSeconds: 180 };
export function doseContract({ user = {}, discipline = 'box', stimulus = 'fuerza_maxima', intent = { kind: 'main_pattern', pattern: 'squat' } } = {}) {
  const input = contractFixture({ discipline, stimulus, intent }); input.exposureContext.report.disciplina = discipline;
  input.doseContext = contexts.buildSessionDoseContext(project(user), intent);
  const result = load('allowedTrainingContract').buildAllowedTrainingContract(input); assert.equal(result.ok, true, JSON.stringify(result)); return result.contract;
}
export function doseProposal(c, movementId = 'back_squat', prescription = strength, structureId = 'strength_sets', formatDose) {
  return { schemaVersion: 2, stimulusId: c.stimulusId, structureId, blocks: [
    { blockType: 'warmup', movements: [{ movementId, prescription: { durationSeconds: 120, intensity: rpe(3) } }] },
    { blockType: 'main', ...(formatDose ? { formatDose } : {}), movements: [{ movementId, prescription: structuredClone(prescription) }] },
  ] };
}
const valid = (c, p) => { const r = sessions.validateSessionAgainstTrainingContract(c, p); assert.equal(r.ok, true, JSON.stringify(r)); return sessions.renderContractSession(c, p); };
const invalid = (c, p, code) => { const r = sessions.validateSessionAgainstTrainingContract(c, p); assert.equal(r.ok, false); assert.ok(r.violations.some(v => v.includes(code)), JSON.stringify(r)); };
export function doseExamples() {
  const c = doseContract({ user: { test_atleta: { back_squat: 150 }, perfil: { duracion: '60 min' } } });
  const p = doseProposal(c, 'back_squat', { ...strength, intensity: { kind: 'percent_1rm', referenceId: '1rm:back_squat', value: 75 } });
  const runner = doseContract({ user: { datos_entrenamiento: { z2_fc: '130–145' }, perfil: { duracion: '60 min' } }, discipline: 'carrera', stimulus: 'base_aerobica', intent: { kind: 'main_pattern', pattern: 'run' } });
  const run = doseProposal(runner, 'rodaje_z2', { durationSeconds: 2700, intensity: { kind: 'reference', referenceId: 'running:z2' } }, 'continuo_carrera');
  const met = doseContract({ discipline: 'box', stimulus: 'capacidad_glucolitica', intent: { kind: 'stimulus_only' } });
  const amrap = doseProposal(met, 'wall_ball', { reps: 10, intensity: rpe(7) }, 'amrap_corto', { durationSeconds: 720 });
  amrap.blocks[1].movements.push({ movementId: 'box_jump', prescription: { reps: 6, intensity: rpe(7) } });
  return { strength: valid(c, p), running: valid(runner, run), amrap: valid(met, amrap) };
}
test('1RM150 at75% gives112.5kg, professional rest and structured source references', () => {
  const s = doseExamples().strength;
  assert.equal(s.structuredPrescription.calculatedLoads[0].minimumKg, 112.5);
  assert.match(s.descripcion, /4 × 5 @ 112.5 kg \(75% 1RM\)/); assert.match(s.descripcion, /Descanso: 3 min/);
  assert.equal(s.structuredPrescription.references[0].source, 'usuarios.test_atleta.back_squat');
});
test('strength without 1RM accepts RPE, no invented load', () => {
  const c = doseContract(), s = valid(c, doseProposal(c)); assert.equal(s.structuredPrescription.calculatedLoads.length, 0); assert.match(s.descripcion, /RPE 7/);
});
for (const field of ['sets', 'reps', 'intensity', 'restSeconds']) test(`strength missing ${field} cannot persist`, () => {
  const c = doseContract(), p = doseProposal(c); delete p.blocks[1].movements[0].prescription[field]; invalid(c, p, field === 'reps' ? 'DOSE_REQUIRED' : 'SESSION_DOSE_INCOMPLETE');
});
for (const ref of ['5RM 120kg', '3RM 120kg', '120kg']) test(`${ref} never becomes 1RM`, () => {
  const c = doseContract({ user: { marcas_especificas: { back_squat: ref } } }); assert.equal(c.doseContext.references.length, 0);
  valid(c, doseProposal(c)); invalid(c, doseProposal(c, 'back_squat', { ...strength, intensity: { kind: 'percent_1rm', referenceId: '1rm:back_squat', value: 75 } }), 'REFERENCE_NOT_ALLOWED');
});
test('conflicting 1RM evidence never selects the larger value', () => {
  const c = doseContract({ user: { test_atleta: { back_squat: 150 }, datos_entrenamiento: { squat_1rm: '160kg' } } }); assert.equal(c.doseContext.references.length, 0);
});
test('borrowed benchmark and LLM kg cannot pass', () => {
  const c = doseContract({ user: { test_atleta: { back_squat: 150 } } });
  invalid(c, doseProposal(c, 'front_squat', { ...strength, intensity: { kind: 'percent_1rm', referenceId: '1rm:back_squat', value: 75 } }), 'ONE_RM_MOVEMENT_REQUIRED');
  invalid(c, doseProposal(c, 'back_squat', { ...strength, kg: 112.5 }), 'DOSE_FIELDS_INVALID');
});
test('weightlifting technical RPE and optional tempo; no borrowed Snatch1RM for Hang Snatch', () => {
  const c = doseContract({ stimulus: 'halterofilia_tecnica', intent: { kind: 'main_pattern', pattern: 'olympic_lift' } });
  const p = doseProposal(c, 'hang_snatch', { sets: 1, reps: 2, restSeconds: 0, intensity: rpe(6) }, 'complex_halterofilia', { rounds: 6, restSeconds: 120 });
  assert.match(valid(c, p).descripcion, /6 rondas · Complejo/);
  const squats = doseContract(); assert.match(valid(squats, doseProposal(squats, 'back_squat', { ...strength, tempo: [4, 0, 1, 0] })).descripcion, /Tempo: 4-0-1-0/);
});
test('Z2 canonical range renders45min and130–145ppm', () => { const s = doseExamples().running; assert.match(s.descripcion, /45 min @ Z2 · 130–145 ppm/); });
test('running without volume fails; RPE distance with unknown time cannot bypass finite budget', () => {
  const c = doseContract({ discipline: 'carrera', stimulus: 'base_aerobica', intent: { kind: 'stimulus_only' }, user: { perfil: { duracion: '60 min' } } });
  invalid(c, doseProposal(c, 'rodaje_z2', { intensity: rpe(4) }, 'continuo_carrera'), 'DOSE_REQUIRED');
  invalid(c, doseProposal(c, 'rodaje_z2', { distanceMeters: 8000, intensity: rpe(4) }, 'continuo_carrera'), 'UNBOUNDED_WITH_FINITE_BUDGET');
  invalid(c, doseProposal(c, 'rodaje_z2', { durationSeconds: 2700, intensity: { kind: 'reference', referenceId: 'running:z2' } }, 'continuo_carrera'), 'REFERENCE_NOT_ALLOWED');
});
test('6x800m canonical10K pace with2min recovery; missing recovery rejects', () => {
  const c = doseContract({ discipline: 'carrera', stimulus: 'umbral', intent: { kind: 'stimulus_only' }, user: { datos_entrenamiento: { tiempo_10k: '50:00' }, perfil: { duracion: '60 min' } } });
  const p = doseProposal(c, 'series_umbral', { sets: 6, distanceMeters: 800, restSeconds: 120, intensity: { kind: 'reference', referenceId: 'running:10k' } }, 'intervalos_carrera');
  const s = valid(c, p); assert.match(s.descripcion, /6 × 800 m @ Ritmo 10 km · 5:00 min\/km/);
  assert.equal(s.structuredPrescription.duration.parts[1].maximumSeconds, 2040);
  delete p.blocks[1].movements[0].prescription.restSeconds; invalid(c, p, 'INTERVAL_COUNT_RECOVERY');
});
test('split tempo preserves3x10min and recovery; continuous forbids split', () => {
  const c = doseContract({ discipline: 'carrera', stimulus: 'umbral', intent: { kind: 'stimulus_only' } });
  const p = doseProposal(c, 'series_umbral', { sets: 3, durationSeconds: 600, restSeconds: 120, intensity: rpe(7) }, 'intervalos_carrera'); valid(c, p);
  p.structureId = 'tempo_continuo'; invalid(c, p, 'CONTINUOUS_INTERRUPTED');
});
test('AMRAP temporal semantics survive rendering and persistence; missing duration fails', () => {
  const s = doseExamples().amrap; assert.match(s.descripcion, /AMRAP 12 min/); assert.equal(s.structuredPrescription.proposal.blocks[1].formatDose.durationSeconds, 720);
  const c = doseContract({ stimulus: 'capacidad_glucolitica', intent: { kind: 'stimulus_only' } });
  invalid(c, doseProposal(c, 'wall_ball', { reps: 10, intensity: rpe(7) }, 'amrap_corto'), 'FORMAT_DURATION');
});
test('For Time5rounds18min cap and EMOM16min retain their format', () => {
  const c = doseContract({ stimulus: 'capacidad_glucolitica', intent: { kind: 'stimulus_only' } });
  const s = valid(c, doseProposal(c, 'wall_ball', { reps: 10, intensity: rpe(7) }, 'for_time_corto', { rounds: 5, timeCapSeconds: 1080 }));
  assert.match(s.descripcion, /5 rondas · For Time\nTime cap: 18 min/);
  const emom = doseProposal(c, 'wall_ball', { reps: 10, intensity: rpe(7) }, 'emom_metcon', { durationSeconds: 960, intervalSeconds: 60, workSeconds: 40, restSeconds: 20 });
  assert.match(valid(c, emom).descripcion, /EMOM 16 min/); emom.blocks[1].formatDose.restSeconds = 30; invalid(c, emom, 'WORK_REST_CYCLE');
});
test('format clock cannot hide strength work or contradict its cycle count', () => {
  const c = doseContract(), p = doseProposal(c); p.blocks[1].formatDose = { durationSeconds: 1 }; invalid(c, p, 'FORMAT_NOT_ALLOWED');
});
test('timed strength requires explicit hold metadata and mixed volume cannot hide work', () => {
  const c = doseContract(); invalid(c, doseProposal(c, 'back_squat', { sets: 4, durationSeconds: 30, restSeconds: 120, intensity: rpe(7) }), 'STRENGTH_SETS_REPS_REST');
  invalid(c, doseProposal(c, 'back_squat', { ...strength, durationSeconds: 1 }), 'VOLUME_CONFLICT');
  const hold = doseContract({ stimulus: 'fuerza_general', intent: { kind: 'main_pattern', pattern: 'core_antiextension' } });
  valid(hold, doseProposal(hold, 'plank', { sets: 3, durationSeconds: 30, restSeconds: 60, intensity: rpe(6) }));
});
test('45min budget rejects63min; open-ended90min never creates maximum', () => {
  for (const [budget, accept] of [['45 min', false], ['más de 90 min', true]]) {
    const c = doseContract({ discipline: 'carrera', stimulus: 'base_aerobica', intent: { kind: 'stimulus_only' }, user: { perfil: { duracion: budget } } });
    const p = doseProposal(c, 'rodaje_z2', { durationSeconds: 3780, intensity: rpe(4) }, 'continuo_carrera');
    if (accept) { valid(c, p); assert.equal(c.doseContext.timeBudget.maximumSeconds, null); } else invalid(c, p, 'SESSION_BUDGET_EXCEEDED');
  }
});
for (const [seconds, expected] of [[4800,'1 h 20 min'],[3600,'1 h'],[3300,'55 min'],[2700,'45 min'],[150,'2 min 30 s'],[90,'1 min 30 s'],[45,'45 s']])
  test(`human duration${seconds}`, () => assert.equal(renderer.formatDuration(seconds), expected));
test('identical warmup/main rejects, cooldown optional and loaded cooldown rejects', () => {
  const c = doseContract(), p = doseProposal(c); valid(c, p);
  p.blocks[0].movements = structuredClone(p.blocks[1].movements); invalid(c, p, 'PREPARATION_IDENTICAL');
  const loaded = doseContract({ user: { test_atleta: { back_squat: 150 } } }), q = doseProposal(loaded);
  q.blocks.push({ blockType: 'cooldown', movements: [{ movementId: 'back_squat', prescription: { reps: 5,
    intensity: { kind: 'percent_1rm', referenceId: '1rm:back_squat', value: 40 } } }] });
  invalid(loaded, q, 'COOLDOWN_LOADED_STRENGTH');
});
test('strategic objective, why and weakness round trip use only canonical facts', () => {
  const intent = { kind: 'adaptation', goalId: 'half_marathon', adaptationId: 'fuerza_general', methodId: 'box_support_strength', role: 'SUPPORTING',
    pattern: 'squat', blockPhase: 'accumulation', blockWeek: 2, weaknessId: 'squat-deficit' };
  const c = doseContract({ stimulus: 'fuerza_general', intent, user: { objetivo_principal: 'media maraton', athlete_development: [{ id: 'squat-deficit', nombre_visible: 'Fuerza squat', indicador: 'back_squat', estado: 'activa' }] } });
  const s = valid(c, doseProposal(c, 'goblet_squat')); assert.equal(s.debilidad_relacionada, 'Fuerza squat');
  assert.equal(s.structuredPrescription.weakness.id, 'squat-deficit'); assert.deepEqual(plain(s.intent), intent);
  assert.match(s.por_que, /media maratón/); assert.match(s.por_que, /semana 2/); assert.match(s.por_que, /Fuerza squat/);
  assert.doesNotMatch(s.por_que, /competición|rodaje largo|sin añadir/);
});
test('new contract cannot downgrade schema; legacy schema remains readable', () => {
  const c = doseContract(), p = doseProposal(c); delete p.schemaVersion; p.blocks.push({ blockType: 'cooldown', movements: structuredClone(p.blocks[0].movements) });
  p.blocks.forEach(b => b.movements.forEach(m => { delete m.prescription.intensity; })); invalid(c, p, 'SCHEMA_VERSION_REQUIRED');
  const old = load('allowedTrainingContract').buildAllowedTrainingContract(contractFixture()).contract;
  assert.equal(sessions.validateSessionAgainstTrainingContract(old, p).ok, true);
});
test('incomplete dose retries exactly once with directed errors and never generates a session', async () => {
  const c = doseContract(), p = doseProposal(c); delete p.blocks[1].movements[0].prescription.intensity; let calls = 0;
  const result = await load('sessionGeneration').generateContractSession(c, [], async prompt => { if (++calls === 2) assert.match(prompt, /SESSION_DOSE_INCOMPLETE:INTENSITY/); return JSON.stringify(p); });
  assert.equal(result.ok, false); assert.equal(calls, 2); assert.equal(result.session, undefined);
});

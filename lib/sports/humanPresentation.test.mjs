import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sportsRuntime, contractFixture, plain } from './trainingContractTestRuntime.mjs';
const load = sportsRuntime();
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
function fixture(methodId = 'running_threshold', overrides = {}, runtime = load) {
  const method = runtime('goalTransferModel').transferMethod(methodId);
  const goalId = ['box_weightlifting', 'box_gymnastics', 'box_max_strength'].includes(methodId) ? 'crossfit' : 'half_marathon';
  const intent = { kind: 'adaptation', goalId, adaptationId: method.adaptationId, methodId, role: methodId.includes('support') ? 'SUPPORTING' : 'PRIMARY',
    pattern: method.patterns[0], blockPhase: ['running_recovery', 'box_technique'].includes(methodId) ? 'deload' : 'intensification', blockWeek: 12, weaknessId: null };
  const user = { objetivo_principal: goalId, perfil: { duracion: '90 min' }, test_atleta: { back_squat: 150 }, ...overrides };
  const input = contractFixture({ discipline: method.discipline, stimulus: method.stimulusId, intent });
  input.exposureContext.report.disciplina = method.discipline;
  input.doseContext = runtime('sessionDoseContext').buildSessionDoseContext(project(user), intent);
  const built = runtime('allowedTrainingContract').buildAllowedTrainingContract(input);
  assert.equal(built.ok, true, JSON.stringify(built));
  const c = built.contract;
  const id = methodId === 'running_threshold' ? 'series_umbral' : methodId === 'running_recovery' ? 'regenerativo' : methodId === 'box_max_strength' ? 'back_squat' : 'goblet_squat';
  const p = { schemaVersion: 2, stimulusId: c.stimulusId, structureId: c.allowedStructureIds[0], blocks: [
    { blockType: 'warmup', movements: [{ movementId: id, prescription: { durationSeconds: 120, intensity: { kind: 'rpe', value: 3 } } }] },
    { blockType: 'main', movements: [{ movementId: id, prescription: methodId === 'running_threshold' ? { sets: 5, durationSeconds: 360, restSeconds: 180, intensity: { kind: 'rpe', value: 8 } }
      : methodId === 'running_recovery' ? { durationSeconds: 300, intensity: { kind: 'rpe', value: 3 } }
      : { sets: 4, reps: 8, restSeconds: 120, intensity: { kind: 'rpe', value: 7, max: 8 } } }] },
  ] };
  return { c, p };
}
const render = (c, p, version = 'human_v2') => load('structuredSession').renderContractSession(c, p, version);
const visible = s => [s.titulo, s.por_que, s.descripcion].join('\n');
test('T22 support strength: known production movements and reported duration, without invented rests', () => {
  // The audit provides the estimate, not all rests: this is a projection test,
  // not a reconstruction or validation of the missing production prescription.
  const runtime = sportsRuntime({}, (path, exports) => path.endsWith('sessionDose.ts')
    ? { ...exports, estimateSessionDuration: () => ({ minimumSeconds: 1643, maximumSeconds: 3379, expectedSeconds: 2511 }) } : exports);
  const { c, p } = fixture('box_support_strength');
  const movement = (movementId, sets, amount, value, max) => ({ movementId, prescription: { sets, ...amount, intensity: { kind: 'rpe', value, ...(max ? { max } : {}) } } });
  p.blocks = [
    { blockType: 'warmup', movements: [movement('goblet_squat', 2, { reps: 8 }, 4), movement('push_up', 2, { reps: 10 }, 4), movement('hollow_hold', 2, { durationSeconds: 20 }, 4)] },
    { blockType: 'main', movements: [movement('kb_goblet_squat', 4, { reps: 8 }, 7, 8), movement('ring_row', 3, { reps: 10 }, 7), movement('db_shoulder_press', 3, { reps: 8 }, 7), movement('bulgarian_split_squat', 3, { reps: 8, perSide: true }, 7)] },
    { blockType: 'cooldown', movements: [movement('plank', 2, { durationSeconds: 30 }, 5), movement('knee_raise', 2, { reps: 12 }, 6)] },
  ];
  const projection = runtime('humanCoachingProjection').humanCoachingProjection(c, p);
  assert.equal(projection.title, 'Fuerza de apoyo');
  assert.equal(projection.sessionObjective, 'Complementar tu preparación de media maratón con trabajo de fuerza.');
  assert.equal(projection.why, 'Esta sesión añade trabajo de fuerza de apoyo a tu planificación.');
  assert.match(projection.durationPresentation, /aproximadamente 42 min/);
  assert.equal(projection.blocks.flatMap(b => b.movements).length, 9);
  assert.equal(projection.blocks[1].movements[3].dose, '3 × 8 por lado · RPE 7');
  assert.ok(projection.blocks.flatMap(b => b.movements).every(m => m.rest === null && m.tempo === null));
  assert.doesNotMatch(JSON.stringify(projection), /kg|sin fatiga|protección de rodilla|kb_goblet_squat/);
  p.blocks[1].movements[0].prescription.restSeconds = 0;
  assert.equal(runtime('humanCoachingProjection').humanCoachingProjection(c, p).blocks[1].movements[0].rest, 'Descanso: 0 s');
});
function receipt(c, p, version) {
  const data = { userCodigo: 'test', expiresAt: Date.now() + 60000, contract: c, proposal: p, ...(version === undefined ? {} : { presentationVersion: version }) };
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return payload + '.' + createHmac('sha256', 'isolated-sports-test-key').update('forge-session-contract-v1:' + payload).digest('base64url');
}
test('T1–7 catalog covers all 162 movements, all methods/structures/adaptations/goals; variants retain distinct names', () => {
  const labels = load('humanPresentationLabels'), catalog = load('movementLibrary');
  assert.equal(Object.keys(catalog.MOVEMENT_LIBRARY).length, 162);
  for (const [ids, names] of [[Object.keys(catalog.MOVEMENT_LIBRARY), labels.movementLabels],
    [load('goalTransferModel').TRANSFER_METHODS.map(m => m.id), labels.methodLabels],
    [Object.keys(catalog.STIMULUS_LIBRARY), labels.adaptationLabels],
    [Object.keys(load('workoutStructureLibrary').WORKOUT_STRUCTURE_LIBRARY), labels.structureLabels],
    [Object.keys(load('goalTransferModel').GOAL_DEFINITIONS), labels.goalLabels]]) {
    for (const id of ids) { assert.ok(names[id], id); assert.doesNotMatch(names[id], /_/); }
  }
  assert.notEqual(labels.movementLabels.strict_pull_up, labels.movementLabels.kipping_pull_up);
  assert.notEqual(labels.movementLabels.hang_power_clean, labels.movementLabels.power_clean);
  assert.notEqual(labels.movementLabels.db_clean, labels.movementLabels.db_power_clean);
});
test('T1–5/T10/T21 threshold has human title, purpose and dose, without invented claims', () => {
  const { c, p } = fixture(), s = render(c, p), text = visible(s);
  assert.equal(s.titulo, 'Intervalos de umbral');
  assert.equal(s.por_que, 'Esta es una de las sesiones principales de tu preparación.');
  assert.match(text, /Trabajo de umbral para tu preparación de media maratón\./);
  assert.match(text, /5 × 6 min · RPE 8/); assert.match(text, /Descanso entre intervalos: 3 min/);
  assert.doesNotMatch(text, /running_threshold|intervalos_carrera|half_marathon|PRIMARY|intensification|Tempo|rodilla|fresco|explosiv|sin fatiga/);
  p.structureId = 'tempo_continuo'; p.blocks[1].movements[0].prescription = { durationSeconds: 1800, intensity: { kind: 'rpe', value: 8 } };
  assert.equal(render(c, p).titulo, 'Carrera continua de umbral');
});
test('T8–9 intensity and prescribed tempo are retained; references never leak', () => {
  const { c, p } = fixture('box_max_strength');
  const d = p.blocks[1].movements[0].prescription;
  for (const i of [{ kind: 'rpe', value: 7, max: 8 }, { kind: 'rir', value: 3 }, { kind: 'percent_1rm', referenceId: '1rm:back_squat', value: 75 }]) {
    d.intensity = i; const text = visible(render(c, p));
    assert.match(text, i.kind === 'rpe' ? /RPE 7–8/ : i.kind === 'rir' ? /RIR 3/ : /112.5 kg \(75% 1RM\)/);
    assert.doesNotMatch(text, /1rm:back_squat|Tempo/);
  }
  d.tempo = [3, 1, 1, 0]; assert.match(visible(render(c, p)), /Tempo: 3-1-1-0/);
  assert.doesNotMatch(visible(render(c, p)), /bajada|subida|sin rebote/);
  const run = fixture('running_threshold', { datos_entrenamiento: { z2_fc: '130–145' } });
  run.p.blocks[1].movements[0].prescription.intensity = { kind: 'reference', referenceId: 'running:z2' };
  assert.match(visible(render(run.c, run.p)), /Z2 · 130–145 ppm/);
  assert.doesNotMatch(visible(render(run.c, run.p)), /running:z2/);
});
test('T11–12 expected is approximate, not availability/target; legacy unknown never invents midpoint', () => {
  const { c, p } = fixture(); const before = render(c, p);
  assert.match(before.descripcion, /Duración estimada: aproximadamente 45 min/);
  assert.equal(before.structuredPrescription.duration.expectedSeconds, 2700);
  assert.equal(before.structuredPrescription.timeBudget.maximumSeconds, 5400);
  assert.equal(before.structuredPrescription.timeAuthority.targetDuration, null);
  delete c.doseContext.timeAuthority;
  const old = render(c, p); assert.equal(old.structuredPrescription.duration.expectedSeconds, undefined);
  assert.match(old.descripcion, /44–46 min/);
});
test('T13–15/T30–31 signed version chooses renderer; legacy absent, tampering and downgrade', () => {
  const { c, p } = fixture(); const verify = load('sessionAuthority').verifySessionReceipt;
  for (const v of [undefined, 'legacy', 'human_v2']) {
    const s = render(c, p, v ?? 'legacy');
    assert.equal(verify(receipt(c, p, v), s, 'test', c.targetWeekStart).descripcion, s.descripcion);
  }
  assert.throws(() => verify(receipt(c, p, 'future'), render(c, p), 'test', c.targetWeekStart), /PRESENTATION_VERSION_UNSUPPORTED/);
  assert.throws(() => verify(receipt(c, p, 'human_v2'), render(c, p, 'legacy'), 'test', c.targetWeekStart), /CONTENT_MISMATCH/);
  const signed = receipt(c, p, 'human_v2'), [payload, mac] = signed.split('.');
  const altered = JSON.parse(Buffer.from(payload, 'base64url')); delete altered.presentationVersion;
  assert.throws(() => verify(Buffer.from(JSON.stringify(altered)).toString('base64url') + '.' + mac, render(c, p), 'test', c.targetWeekStart), /RECEIPT_INVALID/);
  const changed = structuredClone(render(c, p)); changed.structuredPrescription.presentation.comparisonRepresentation.descripcion = 'bypass';
  assert.throws(() => verify(signed, changed, 'test', c.targetWeekStart), /CONTENT_MISMATCH/);
});
test('T17–18 weekly text includes coverage only, correct roles and general-running limitation', () => {
  const { c } = fixture(); const strategy = load('../planning/canonicalWeekStrategy').buildCanonicalWeekStrategy(project({ objetivo_principal: 'half_marathon' }), c.prescriptionScope, 5);
  strategy.coverage = [{ adaptationId: 'umbral' }, { adaptationId: 'fuerza_general' }];
  const text = load('humanCoachingProjection').humanWeeklyObjective(strategy);
  assert.match(text, /Umbral como prioridad/); assert.match(text, /fuerza de apoyo/);
  assert.doesNotMatch(text, /base aeróbica|resistencia específica|PRIMARY|SUPPORTING|half_marathon/);
});
test('T23–26 sports data, context digest and restrictions remain deeply identical and inputs immutable', () => {
  const { c, p } = fixture('box_support_strength'); const original = JSON.stringify({ c, p });
  const legacy = render(c, p, 'legacy'), human = render(c, p);
  const { presentation, ...sports } = human.structuredPrescription;
  assert.deepEqual(plain(sports), plain(legacy.structuredPrescription));
  assert.equal(JSON.stringify({ c, p }), original);
  assert.deepEqual(plain(human.intent), plain(legacy.intent));
  assert.deepEqual(plain(presentation.comparisonRepresentation), { titulo: legacy.titulo, descripcion: legacy.descripcion, por_que: legacy.por_que });
});
test('T27–29 duplicate, Today, scientific rules and exposure are invariant to human copy', () => {
  const { c, p } = fixture(), legacy = render(c, p, 'legacy'), human = render(c, p);
  const duplicate = load('../validators/sessionDuplicationValidator').detectarSesionDuplicada;
  for (const history of [[], [legacy], [{ ...legacy, descripcion_real: legacy.descripcion }]])
    assert.deepEqual(plain(duplicate(human, history)), plain(duplicate(legacy, history)));
  assert.deepEqual(plain(duplicate(legacy, [human])), plain(duplicate(legacy, [legacy])));
  const view = load('sessionPresentation');
  assert.equal(view.contextualSessionIntensity(human), view.contextualSessionIntensity(legacy));
  assert.equal(view.legacyDurationMinutes(human), view.legacyDurationMinutes(legacy));
  const rules = load('../validators/scientificRules').aplicarTodasLasReglas;
  const ctx = s => ({ sesiones: [structuredClone(s), structuredClone(s)], analisis: {}, estructura: {}, esDeload: true, hayLesionLumbarActiva: true });
  const a = rules(ctx(legacy)), b = rules(ctx(human));
  assert.deepEqual(plain(a.map(s => s.notas_validador ?? [])), plain(b.map(s => s.notas_validador ?? [])));
  assert.equal(b[0].descripcion, human.descripcion);
  const exposure = load('exposureEngine').buildExposureReport;
  assert.deepEqual(plain(exposure([{ ...human, fecha: '2026-09-01', descripcionReal: 'series umbral' }], 'carrera')),
    plain(exposure([{ ...legacy, fecha: '2026-09-01', descripcionReal: 'series umbral' }], 'carrera')));
});
test('T16/T19–20 presentation consumers preserve historical text, no double prefix, duration header recognized', () => {
  const plan = { block_name: 'intensification', sessions: [] }, before = JSON.stringify(plan);
  assert.equal(load('planPresentation').planBlockLabel(plan), 'intensification'); assert.equal(JSON.stringify(plan), before);
  const ui = readFileSync('app/plan/page.tsx', 'utf8');
  assert.doesNotMatch(ui, /Esta semana Forge priorizará/);
  assert.match(ui, /Objetivo\|Duración/);
  assert.match(ui, /\{plan.week_objective\}/);
});
test('T32 unknown labels are neutral, diagnostic-safe and logger failure cannot change result', () => {
  const { c, p } = fixture(); p.blocks[1].movements[0].movementId = 'SECRET_UNKNOWN';
  const projected = load('humanCoachingProjection').humanCoachingProjection(c, p);
  assert.equal(projected.blocks[1].movements[0].name, 'Ejercicio programado');
  assert.doesNotMatch(JSON.stringify(projected), /SECRET_UNKNOWN/);
  const logs = [], observed = sportsRuntime({ console: { info: (tag, record) => logs.push([tag, record]) } });
  const throwing = sportsRuntime({ console: { info() { throw Error('logger'); } } });
  const expected = observed('sessionHumanRenderer').renderHumanSession(c, p);
  assert.deepEqual(plain(throwing('sessionHumanRenderer').renderHumanSession(c, p)), plain(expected));
  assert.equal(logs.length, 1); assert.doesNotMatch(JSON.stringify(logs), /SECRET|description|profile|reference/);
});

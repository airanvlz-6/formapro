import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sportsRuntime, plain, compile, fakeDatabase, equippedProfileFixture } from '../sports/trainingContractTestRuntime.mjs';
const load = sportsRuntime({ console: { info() {}, warn() {}, log() {} } });
const capture = load('../athlete/onboardingGoal').captureOnboardingGoal;
const create = load('../auth/legacyContainment').projectLegacyCreate;
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const goal = load('../athlete/goalResolution');
const strategy = load('../athlete/strategyResolution').resolvePlanningStrategy;
const source = ts.createSourceFile('FormaPro.tsx', readFileSync('app/FormaPro.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let formsNode, writeNode;
function visit(n) {
  if (ts.isVariableDeclaration(n) && n.name.getText(source) === 'FORMULARIOS') formsNode = n.initializer;
  if (ts.isCallExpression(n) && n.expression.getText(source) === 'apiCall' && n.arguments[0]?.getText(source).startsWith('{action:"guardar_usuario"')) writeNode = n.arguments[0];
  ts.forEachChild(n, visit);
} visit(source);
const forms = vm.runInNewContext(compile(`const forms=${formsNode.getText(source)}; forms;`));
const text = 'mejorar tiempos en media maratón', days = ['lunes','miercoles','viernes','domingo'];
const input = { categoria: 'carrera', especialidad: 'carrera', modo_entrada: 'planificacion',
  perfil: { objetivo_detalle: text, distancia_objetivo: 'Media maratón (21K)', dias: '4 días', dias_disponibles: days, duracion: 'Hasta 1h 30min', ...equippedProfileFixture() },
  distribucion_semanal: JSON.stringify({ disponibilidad: days }), onboardingGoalCapture: capture(forms.carrera) };

test('A-F/L: real form provenance creates one primary, preserves detail/distance/days and resolves structured HM', () => {
  const before = create({ ...input, onboardingGoalCapture: undefined }), after = create(input);
  assert.equal(goal.resolveGoalAuthority(project(before)).status, 'GOAL_MISSING');
  assert.deepEqual(plain(after.objetivo_principal), { descripcion: text });
  assert.deepEqual(after.perfil, input.perfil);
  assert.deepEqual(JSON.parse(after.distribucion_semanal), { carrera: days });
  assert.equal(Object.hasOwn(after, 'onboardingGoalCapture'), false);
  const resolved = goal.resolveGoalAuthority(project(after));
  assert.equal(resolved.status, 'GOAL_UNSUPPORTED'); assert.equal(resolved.candidates.length, 1);
  assert.equal(resolved.candidates[0].source, 'usuarios.objetivo_principal');
  assert.equal(strategy(project(after)).strategyId, 'half_marathon');
  assert.equal(strategy(project(after)).source, 'structured_event');
});
test('H: actual creation payload carries form provenance independently of welcome content', () => {
  for (const welcome of ['', 'Mi objetivo es otro objetivo inventado']) {
    const payload = vm.runInNewContext(compile(`const payload=${writeNode.getText(source)};payload;`), {
      codigo: 'fixture', categoria: 'carrera', espKey: 'carrera', perfil: input.perfil, preguntas: forms.carrera,
      captureOnboardingGoal: capture, texto: welcome, hist: [], email: '', modoEntrada: 'planificacion',
      distribucionAutoFocus: input.distribucion_semanal,
    });
    assert.equal(create(payload.datos).objetivo_principal.descripcion, text);
  }
  assert.equal(create({ ...input, onboardingGoalCapture: undefined, rutina: text, historial: [{ role: 'assistant', content: text }] }).objetivo_principal, undefined);
});
test('I: real notes/context forms and unmarked generic detail never create primary', () => {
  for (const key of ['funcional','grupos_crossfit','grupos_fitness','grupos_funcional','grupos_deporte','rehabilitacion_general']) {
    assert.equal(capture(forms[key]), undefined, key);
    assert.equal(create({ ...input, onboardingGoalCapture: capture(forms[key]) }).objetivo_principal, undefined);
  }
  for (const marker of [null, {}, { ...input.onboardingGoalCapture, role: 'SECONDARY' }, { ...input.onboardingGoalCapture, extra: true }])
    assert.equal(create({ ...input, onboardingGoalCapture: marker }).objetivo_principal, undefined);
});
test('J/K: explicit primary sources take precedence; existing contradictions remain visible', () => {
  for (const field of ['objetivo_general','objetivo_principal']) {
    const user = create({ ...input, perfil: { ...input.perfil, [field]: 'crossfit' } });
    assert.equal(user.objetivo_principal, undefined);
    const r = goal.resolveGoalAuthority(project(user)); assert.equal(r.candidates.length, 1); assert.equal(r.canonicalGoalId, 'crossfit');
  }
  const primary = { descripcion: '10k', resolution: { version: 1, source: 'existing' } };
  const user = create({ ...input, objetivo_principal: primary });
  assert.deepEqual(user.objetivo_principal, primary); assert.equal(goal.resolveGoalAuthority(project(user)).candidates.length, 1);
  const conflicting = create({ ...input, objetivo_principal: primary, perfil: { ...input.perfil, objetivo_general: 'crossfit' } });
  assert.equal(goal.resolveGoalAuthority(project(conflicting)).status, 'GOAL_CONFLICT');
  assert.equal(goal.resolveGoalAuthority(project(conflicting)).candidates.length, 2); // No third detail candidate.
  assert.equal(Object.hasOwn(load('../auth/legacyContainment').projectLegacyUpdate(input), 'objetivo_principal'), false);
});
test('blank/oversized detail grants nothing; description whitespace is preserved verbatim', () => {
  for (const value of ['', '  ', [], 'x'.repeat(2001)])
    assert.equal(create({ ...input, perfil: { objetivo_detalle: value } }).objetivo_principal, undefined);
  assert.equal(create({ ...input, perfil: { objetivo_detalle: '  meta  ' } }).objetivo_principal.descripcion, '  meta  ');
});
test('G/M: availability confirmation → temporal question → primary/strategy admission uses persisted data', async () => {
  const stored = create(input);
  const tables = { usuarios: stored, athlete_training_sources: [], weekly_plan: [], physiology_records: [],
    session_modification_events: [], athlete_coaching_notes: [], athlete_state_events: [], external_training_records: [] };
  const db = fakeDatabase(tables), from = db.from.bind(db);
  db.from = name => { const q = from(name); if (['weekly_plan','physiology_records'].includes(name)) q.maybeSingle = async () => ({ data: null, error: null }); return q; };
  const chat = load('chatAvailability');
  const question = await chat.readAvailabilityConfirmation(db, 'fixture'); assert.equal(question.ok, true);
  const confirmed = await chat.updateChatAvailability(db, 'fixture', 'Sí', question.snapshotDigest); assert.equal(confirmed.ok, true);
  const preflight = load('../planning/weeklyGenerationPreflight').resolveWeeklyGenerationPreflight;
  const request = { targetWeekStart: '2026-09-07', today: '2026-09-07', snapshot: null, confirmedAvailabilityDigest: question.snapshotDigest };
  const temporal = await preflight(db, 'fixture', request); assert.equal(temporal.code, 'TEMPORAL_DECISION_REQUIRED');
  const admitted = await preflight(db, 'fixture', { ...request, temporalReply: true, temporalIntent: 'próximo día disponible' });
  assert.equal(admitted.canContinue, true, JSON.stringify(admitted));
  assert.equal(admitted.goalRequirement, undefined); assert.equal(admitted.temporalDecision.includeToday, false);
});

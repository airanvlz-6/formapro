import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';
const load = sportsRuntime();
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const resolve = load('../athlete/strategyResolution').resolvePlanningStrategy;
const strategies = load('../planning/canonicalWeekStrategy');
const original = 'Open CrossFit Games 2027 - estándares Masters';
const user = (description = original, patch = {}) => ({ especialidad: 'funcional_crossfit', objetivo_principal: { descripcion: description },
  perfil: { objetivo_detalle: 'Masters, estándares y competición 2027' }, ...patch });
for (const description of ['crossfit', original, 'Clasificar al Open', 'Prepararme para Masters 2027', 'Mejorar mi rendimiento competitivo']) {
  test(`explicit CrossFit sport resolves without rewriting: ${description}`, () => {
    const row = user(description), context = project(row), before = JSON.stringify({ row, context });
    const r = resolve(context);
    assert.equal(r.status, 'STRATEGY_RESOLVED'); assert.equal(r.strategyId, 'crossfit');
    assert.equal(r.goal.candidates[0].value, description);
    assert.equal(r.source, description === 'crossfit' ? 'exact_primary_goal' : 'declared_sport');
    assert.equal(JSON.stringify({ row, context }), before);
    assert.equal(context.goals.detail[0].value, row.perfil.objetivo_detalle);
    assert.deepEqual(plain(r), JSON.parse(JSON.stringify(r)));
  });
}
for (const specialty of ['box', 'funcional', 'grupos_crossfit', 'functional_crossfit_typo', 'crossfit competition', 'fuerza_halterofilia', undefined]) {
  test(`no substring, group, broad category or ownership authority: ${specialty}`, () => {
    const r = resolve(project(user(original, { especialidad: specialty, categoria: 'funcional',
      managedDisciplines: ['box'], athlete_training_sources: [{ disciplina: 'box', owner: 'forge' }] })));
    assert.equal(r.status, 'STRATEGY_UNSUPPORTED'); assert.equal(r.strategyId, null);
  });
}
test('managed running and stale profile label cannot establish primary sport', () => {
  const r = resolve(project(user('Maratón de Madrid', { especialidad: 'hibrido_general',
    perfil: { especialidad: 'CrossFit / WOD', distancia_objetivo: 'Media maratón (21K)' }, managedDisciplines: ['carrera'] })));
  assert.equal(r.status, 'STRATEGY_UNSUPPORTED');
});
for (const [distance, id] of [['10K', '10k'], ['Media maratón (21K)', 'half_marathon'], ['Maratón (42K)', null], ['5K', null], ['Sin distancia fija', null], [undefined, null]]) {
  test(`running structured distance supports only existing strategy: ${distance}`, () => {
    const r = resolve(project(user('Mi próxima carrera', { especialidad: 'carrera', perfil: { distancia_objetivo: distance } })));
    assert.equal(r.strategyId, id ?? 'running_general'); assert.equal(r.status, 'STRATEGY_RESOLVED');
    assert.equal(r.strategySpecificity, id ? 'SPECIFIC' : 'GENERAL');
    if (id) { assert.equal(r.source, 'structured_event'); assert.ok(r.sources.includes('usuarios.perfil.distancia_objetivo')); }
  });
}
test('marathon prose alone never silently becomes half marathon', () => {
  assert.equal(resolve(project(user('Maratón de Madrid', { especialidad: 'carrera' }))).strategyId, 'running_general');
});
test('exact goal takes priority over sport; secondary distance cannot change CrossFit', () => {
  const r = resolve(project(user('half_marathon'))); assert.equal(r.strategyId, 'half_marathon'); assert.equal(r.source, 'exact_primary_goal');
  assert.equal(resolve(project(user(original, { perfil: { distancia_objetivo: 'Media maratón (21K)' } }))).strategyId, 'crossfit');
});
test('strategically material primary conflict still blocks', () => {
  const r = resolve(project(user(original, { perfil: { objetivo_general: 'fuerza máxima' } })));
  assert.equal(r.status, 'GOAL_CONFLICT'); assert.equal(r.strategyId, null);
});
for (const second of ['CrossFit Open', 'Prepararme para Masters 2027']) test(`same-family declarations preserve evidence without blocking: ${second}`, () => {
  const r = resolve(project(user(original, { perfil: { objetivo_general: second } })));
  assert.equal(r.goal.status, 'GOAL_CONFLICT'); assert.equal(r.status, 'STRATEGY_RESOLVED'); assert.equal(r.goal.candidates.length, 2);
});
test('missing primary still needs a declaration; detail is not primary', () => {
  const r = resolve(project(user(undefined, { objetivo_principal: null, perfil: { objetivo_detalle: 'crossfit' } })));
  assert.equal(r.status, 'GOAL_MISSING');
});
test('pure resolver ignores model analysis and proposals', () => {
  const row = user('Maratón', { especialidad: 'carrera', analisis: { strategyId: 'half_marathon' }, strategyProposal: { strategyId: 'crossfit' } });
  assert.equal(resolve(project(row)).strategyId, 'running_general');
});
test('CrossFit family retains running transfer and binds sport provenance in contract digest', () => {
  const scope = { mode: 'coach', prescriptionAllowed: true, managedDisciplines: ['box', 'carrera'], externalDisciplines: [] };
  const c = strategies.buildCanonicalWeekStrategy(project(user()), scope, 5);
  assert.equal(c.goal.id, 'crossfit'); assert.ok(c.methods.includes('running_base'));
  assert.ok(c.goal.sources.includes('usuarios.especialidad'));
  const changed = strategies.buildCanonicalWeekStrategy(project(user(original, { especialidad: 'hibrido_hyrox' })), scope, 5);
  assert.notEqual(c.goal.evidenceDigest, changed.goal.evidenceDigest);
});

for (const [description, id, specificity] of [['10K', '10k', 'SPECIFIC'], ['media maratón', 'half_marathon', 'SPECIFIC'],
  ['Maratón de Madrid', 'running_general', 'GENERAL'], ['quiero mejorar corriendo', 'running_general', 'GENERAL']]) {
  test(`Carrera preserves ${description} and resolves ${id} with ${specificity} specificity`, () => {
    const row = user(description, { especialidad: 'carrera', perfil: { distancia_objetivo: 'Maratón (42K)' } });
    const before = JSON.stringify(row), context = project(row), projectedBefore = JSON.stringify(context);
    const r = resolve(context);
    assert.equal(r.status, 'STRATEGY_RESOLVED'); assert.equal(r.strategyId, id); assert.equal(r.strategySpecificity, specificity);
    assert.equal(r.goal.candidates[0].value, description); assert.equal(JSON.stringify(row), before);
    assert.equal(JSON.stringify(context), projectedBefore);
    if (specificity === 'GENERAL') {
      assert.equal(r.source, 'general_declared_sport'); assert.equal(r.goal.canonicalGoalId, null);
      assert.ok(r.sources.includes('usuarios.especialidad'));
    }
  });
}
test('general running uses existing capabilities without distance-specific demands or aliases', () => {
  const model = load('goalTransferModel'); assert.deepEqual(plain(model.validateGoalTransferCatalog()), []);
  assert.equal(model.resolveGoalId('Maratón de Madrid'), null); assert.equal(model.resolveGoalId('running_general'), null);
  const scope = { mode: 'coach', prescriptionAllowed: true, managedDisciplines: ['carrera'], externalDisciplines: [] };
  const c = strategies.buildCanonicalWeekStrategy(project(user('Maratón de Madrid', { especialidad: 'carrera' })), scope, 4);
  assert.equal(c.goal.id, 'running_general'); assert.equal(c.block.phase, 'unknown');
  assert.ok(c.adaptations.some(a => a.id === 'base_aerobica' && a.role === 'PRIMARY'));
  assert.ok(!c.adaptations.some(a => a.id === 'resistencia_especifica'));
  for (const method of ['running_base', 'running_threshold', 'running_vo2', 'running_economy', 'runner_support_strength']) assert.ok(c.methods.includes(method));
  assert.ok(!c.methods.includes('running_specific'));
  assert.match(strategies.renderWeekObjective(c), /Carrera general \(sin preparación específica de distancia\)/);
});
for (const specialty of ['carrera_trail', 'trail', 'ultra', 'hibrido_triatlon', 'natacion']) test(`no general family invented for ${specialty}`, () => {
  const r = resolve(project(user('Mi próxima competición', { especialidad: specialty })));
  assert.equal(r.status, 'STRATEGY_UNSUPPORTED'); assert.equal(r.strategySpecificity, null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { equippedProfileFixture, sportsRuntime, contractFixture, plain, fakeDatabase, completeDoseFixture } from '../sports/trainingContractTestRuntime.mjs';
const load = sportsRuntime();
const model = load('goalTransferModel');
const strategyApi = load('../planning/canonicalWeekStrategy');
const api = load('../planning/allowedWeeklyPlanContract');
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const days = load('../planning/weeklyCalendar').calendarDays;
const availability = { carrera: ['lunes', 'miercoles', 'sabado'], box: ['martes', 'jueves'] };
export function fixture({ goal = 'media maraton', disciplines = ['box', 'carrera'], phase = 'acumulacion', weakness = false, restricted = false, preferences = true } = {}) {
  const profile = { objetivo_principal: { descripcion: goal }, categoria: preferences ? 'carrera' : 'hibrido', especialidad: preferences ? 'crossfit' : 'hibrido_general',
    ciclo_actual: { bloque: phase, semana: 2, totalSemanas: 4 },
    athlete_development: weakness ? [{ id: 'squat-weakness', indicador: 'back_squat', estado: 'activa' }] : [] };
  const scope = { mode: 'coach', prescriptionAllowed: true, managedDisciplines: disciplines, externalDisciplines: [] };
  const restrictions = load('../athlete/getCanonicalRestrictions').projectCanonicalRestrictions([], restricted ? [{
    id: 'knee', status: 'pending', constraint_level: 'reassessment', prohibits_impact: true, prohibits_jump: true,
    prohibits_deep_flexion: true, prohibits_axial_load: false }] : [], '2026-09-07');
  const contexts = Object.fromEntries(disciplines.map(discipline => {
    const input = contractFixture({ prescriptionScope: scope, targetWeekStart: '2026-09-07', discipline,
      availableDays: availability[discipline], restrictionsSnapshot: restrictions });
    input.exposureContext.report.disciplina = discipline; return [discipline, input];
  }));
  const strategy = strategyApi.buildCanonicalWeekStrategy(project(profile), scope, 5);
  return { targetWeekStart: '2026-09-07', prescriptionScope: scope, contexts, allowed: availability,
    maxExecutableDays: 5, completeNewWeek: true, fixed: {}, strategy };
}
function built(options) { const r = api.buildAllowedWeeklyPlanContract(fixture(options)); assert.equal(r.ok, true, JSON.stringify(r)); return r.contract; }
export function choose(c) {
  const groups = c.strategy.coverage;
  const bits = o => groups.reduce((n, g, i) => n | (o.intent?.kind === 'adaptation' && (!g.adaptationId || o.intent.adaptationId === g.adaptationId)
    && (!g.discipline || o.discipline === g.discipline) ? 1 << i : 0), 0);
  const memo = new Set();
  function search(i, n, mask, selected) {
    if (i === 7) return mask === (1 << groups.length) - 1 && n > 0 ? selected : null;
    const key = `${i}:${n}:${mask}`; if (memo.has(key)) return null; memo.add(key);
    for (const o of c.dayOptions[days[i]]) {
      const count = n + Number(['TRAIN', 'RECOVERY'].includes(o.state)); if (count > c.frequencyPolicy.maxExecutableDays) continue;
      const result = search(i + 1, count, mask | bits(o), [...selected, { day: days[i], optionId: o.optionId }]); if (result) return result;
    }
    return null;
  }
  const selections = search(0, 0, 0, []); assert.ok(selections);
  const p = { contractVersion: 1, contextDigest: c.contextDigest, selections };
  assert.equal(api.validateWeeklySelection(c, p).ok, true); return p;
}
test('transfer catalog uses real adaptations, disciplines, movement patterns and compatible structures', () => assert.deepEqual(plain(model.validateGoalTransferCatalog()), []));
for (const options of [{}, { disciplines: ['carrera'] }, { goal: 'crossfit' }]) test(`goal-to-session fixture ${JSON.stringify(options)}`, () => {
  const c = built(options), selected = api.validateWeeklySelection(c, choose(c)).selected;
  for (const o of Object.values(selected).filter(o => o.state === 'TRAIN')) {
    assert.equal(o.intent.kind, 'adaptation'); assert.equal(o.intent.goalId, c.strategy.goal.id);
    assert.ok((options.disciplines || ['box', 'carrera']).includes(o.discipline));
    assert.equal(load('prescriptionIntent').resolvePrescriptionIntent(o.intent).ok, true);
  }
  assert.doesNotMatch(strategyApi.renderWeekObjective(c.strategy), /genéricos/);
  assert.ok(c.strategy.coverage.some(g => g.discipline === 'carrera'));
  if (!options.disciplines) assert.ok(c.strategy.coverage.some(g => g.discipline === 'box'));
});
test('goal change changes demands and exact option authority', () => {
  const a = built(), b = built({ goal: 'crossfit' }); assert.notEqual(a.contextDigest, b.contextDigest);
  assert.notDeepEqual(plain(a.strategy.adaptations), plain(b.strategy.adaptations));
  assert.equal(api.validateWeeklySelection(b, choose(a)).ok, false);
});
test('declared deload changes qualitative strategy and daily intents without inventing doses', () => {
  const a = built(), b = built({ phase: 'deload' }); assert.notEqual(a.contextDigest, b.contextDigest);
  assert.equal(b.strategy.volumeIntent, 'reduce'); assert.equal(b.strategy.intensityIntent, 'reduce');
  assert.ok(Object.values(b.dayOptions).flat().filter(o => o.intent).every(o => o.intent.blockPhase === 'deload'));
  assert.notDeepEqual(plain(a.strategy.coverage), plain(b.strategy.coverage)); choose(b);
});
test('canonical squat weakness narrows supporting strength and persists its ID', () => {
  const c = built({ weakness: true }), strength = Object.values(c.dayOptions).flat().filter(o => o.intent?.adaptationId === 'fuerza_general');
  assert.ok(strength.length); assert.ok(strength.every(o => o.intent.pattern === 'squat' && o.intent.weaknessId === 'squat-weakness'));
  assert.notEqual(c.contextDigest, built().contextDigest); choose(c);
});
test('restriction eliminates weakness methods before coverage; no unsafe replacement', () => {
  const rejected = api.buildAllowedWeeklyPlanContract(fixture({ goal: 'crossfit', weakness: true, restricted: true }));
  assert.equal(rejected.ok, false); assert.equal(rejected.code, 'WEEKLY_CONTRACT_UNSATISFIABLE');
  const c = built({ goal: 'crossfit', restricted: true });
  assert.ok(!Object.values(c.dayOptions).flat().some(o => o.intent?.pattern === 'squat'));
  assert.ok(c.strategy.deferred.some(d => d.reason === 'no_feasible_managed_method')); choose(c);
});
test('preference is constrained to compatible managed environments, never ownership', () => {
  assert.deepEqual(plain(built({ disciplines: ['carrera'] }).strategy.preferredEnvironments), ['carrera']);
  assert.deepEqual(plain(built({ preferences: false }).strategy.preferredEnvironments), []);
  assert.ok(built().strategy.coverage.some(g => g.discipline === 'box'));
});
test('interday interference and equipment ambiguity are explicitly limited by available metadata', () => {
  const reasons = built().strategy.diagnostics.map(d => d.reason);
  assert.ok(reasons.includes('interday_interference_not_established_by_structure_metadata'));
  assert.ok(reasons.includes('equipment_inventory_and_all_vs_any_requirements_not_canonical'));
});
test('arbitrary Analyzer prose and IDs cannot create demands or override role priorities', () => {
  for (const raw of [{ version: 1, preferredAdaptations: ['invented'] }, { version: 1, preferredAdaptations: [], goal: 'crossfit' }, 'squat'])
    assert.throws(() => strategyApi.normalizeStrategyProposal(raw, ['fuerza_general']), /STRATEGY_PROPOSAL_INVALID/);
  const p = project({ objetivo_principal: 'media maraton' });
  const c = strategyApi.buildCanonicalWeekStrategy(p, fixture().prescriptionScope, 5, { version: 1, preferredAdaptations: ['fuerza_general'] });
  assert.equal(c.adaptations[0].role, 'PRIMARY');
});
test('whole-week generic fallback is explicit when goal is unknown, never inferred from sport', () => {
  const c = built({ goal: 'quiero mejorar lo mío' });
  assert.equal(c.strategy.goal.id, null);
  assert.ok(c.strategy.diagnostics.some(d => d.code === 'STRATEGY_FALLBACK'));
  assert.ok(Object.values(c.dayOptions).flat().filter(o => o.intent).every(o => o.intent.kind === 'stimulus_only'));
});
test('legal IDs still reject a strategically empty week', () => {
  const c = built(), p = choose(c);
  for (const s of p.selections) if (s.day !== 'lunes') s.optionId = c.dayOptions[s.day][0].optionId;
  assert.ok(api.validateWeeklySelection(c, p).errors.includes('WEEKLY_STRATEGY_COVERAGE_REQUIRED'));
});
test('Builder validates strategic main and rendered session keeps trace', () => {
  const c = built({ goal: 'crossfit' }), o = c.dayOptions.martes.find(o => o.intent?.pattern === 'squat' && o.stimulusId === 'fuerza_maxima');
  const input = { ...fixture({ goal: 'crossfit' }).contexts.box, targetDay: 'martes', stimulus: o.stimulusId, intent: o.intent };
  const contract = load('allowedTrainingContract').buildAllowedTrainingContract(input).contract;
  const proposal = main => ({ stimulusId: o.stimulusId, structureId: 'strength_sets', blocks: ['warmup', 'main', 'cooldown'].map(blockType => ({
    blockType, movements: [{ movementId: blockType === 'main' ? main : 'bench_press', prescription: { reps: 5 } }] })) });
  const sessions = load('structuredSession');
  assert.equal(sessions.validateSessionAgainstTrainingContract(contract, proposal('bench_press')).ok, false);
  assert.deepEqual(plain(sessions.renderContractSession(contract, proposal('back_squat')).intent), plain(o.intent));
  assert.equal(load('trainingFeasibility').evaluateTrainingFeasibility({ ...input, stimulus: 'potencia' }).feasible, false);
});

function strategyDatabase() {
  const tables = { usuarios: { modo_entrada: 'coach', categoria: 'carrera', especialidad: 'crossfit', perfil: { ...equippedProfileFixture(), dias: 5 },
    objetivo_principal: { descripcion: 'media maraton' }, ciclo_actual: { bloque: 'acumulacion', semana: 2, totalSemanas: 4 },
    distribucion_semanal: { box: availability.box, pista: ['lunes', 'miercoles'], carrera_larga: ['sabado'] }, workout_history: [] },
    athlete_training_sources: ['box', 'carrera'].map(disciplina => ({ disciplina, owner: 'forge', activo: true, dias: availability[disciplina] })),
    weekly_plan: [], session_modification_events: [], physiology_records: [], athlete_state_events: [], athlete_coaching_notes: [] };
  const db = fakeDatabase(tables), from = db.from.bind(db);
  db.tables = tables;
  db.from = table => { const q = from(table); q.lt = q.lte = () => q;
    if (['weekly_plan', 'physiology_records'].includes(table)) q.maybeSingle = async () => ({ data: null, error: null }); return q; };
  return db;
}
test('real 3A -> strategy -> Planner -> signed Builder -> admitted persisted sessions and objective', async () => {
  const db = strategyDatabase(), weekly = load('../planning/weeklyCalendarAuthority'), sessions = load('sessionAuthority');
  const result = await load('../planning/prepareAllowedWeeklyPlanContract').planBoundedWeek(db, 'fixture', {
    targetWeekStart: '2026-09-07', today: '2026-09-07', empezarHoy: true, snapshot: null, strategyVersion: 1,
    strategyProposal: { version: 1, preferredAdaptations: ['fuerza_general'] },
  }, async prompt => JSON.stringify(choose(JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1]))), 'token');
  assert.equal(result.ok, true, JSON.stringify(result));
  const p = result.estructura, generated = [], saved = [];
  for (const slot of p.sessions) {
    if (slot.state === 'REST') { saved.push(sessions.admitSessionContent(slot, 'fixture', '2026-09-07')); continue; }
    const b = await sessions.generateTrainingSession(db, 'fixture', { targetWeekStart: '2026-09-07', day: slot.dia,
      discipline: slot.discipline, stimulus: slot.stimulusId, intent: slot.intent, state: slot.state,
      weekly: { receipt: p.calendarReceipt, generationToken: 'token', optionId: slot.optionId } }, async prompt => {
      const c = JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nIntent canónico:')[0].split('\nContexto no autoritativo:')[0]);
      const libs = load('workoutStructureLibrary').WORKOUT_STRUCTURE_LIBRARY, semantics = load('structureSemantics');
      const structureId = c.allowedStructureIds.find(id => semantics.isStructureSatisfiable(libs[id], c.allowedMovementIds));
      const mainId = load('prescriptionIntent').intentMatchingMovementIds(c.intent, c.allowedMovementIds)[0];
      const ids = [mainId, ...c.allowedMovementIds.filter(id => id !== mainId)].slice(0, semantics.structureSemantics(libs[structureId]).exactMainMovements || 1);
      return JSON.stringify(completeDoseFixture(c,{ stimulusId: c.stimulusId, structureId, blocks: ['warmup', 'main', 'cooldown'].map(blockType => ({
        blockType, movements: (blockType === 'main' ? ids : [mainId]).map(movementId => ({ movementId, prescription: { durationSeconds: 60 } })) })) }));
    });
    assert.equal(b.ok, true, JSON.stringify(b)); generated.push(b.sesion);
    const admitted = sessions.admitSessionContent(b.sesion, 'fixture', '2026-09-07'); saved.push(admitted);
    assert.deepEqual(plain(admitted.intent), plain(slot.intent)); assert.equal(admitted.sessionReceipt, undefined);
    assert.throws(() => sessions.admitSessionContent({ ...b.sesion, intent: { ...b.sesion.intent, goalId: 'crossfit' } }, 'fixture', '2026-09-07'), /CONTENT_MISMATCH/);
  }
  await weekly.assertWeeklyCalendar(db, 'fixture', '2026-09-07', saved, p.calendarReceipt, { requireV2: true, generationToken: 'token', sessionEvidence: generated });
  assert.equal(weekly.admittedWeekObjective(p.calendarReceipt, 'fixture', '2026-09-07', 'forged client objective'), p.strategy.adaptacion_principal);
  db.tables.usuarios.objetivo_principal.descripcion = 'crossfit';
  await assert.rejects(() => weekly.assertFreshWeeklyAuthority(db, 'fixture', '2026-09-07', p.calendarReceipt, 'token'), /STALE/);
});

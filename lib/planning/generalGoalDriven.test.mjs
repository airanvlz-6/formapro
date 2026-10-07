import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sportsRuntime, contractFixture, plain } from '../sports/trainingContractTestRuntime.mjs';

// FORGE BUILD 8C-A (final blocker) — GENERAL_GOAL_DRIVEN: todo objetivo explicito valido es planificable.
// Orden: 1 EXACT_GOAL, 2 STRUCTURED_EVENT, 3 base de programacion de la especialidad (si tiene familia), 4 GENERAL_GOAL_DRIVEN.
// `general_goal_driven` es infraestructura tecnica (via universal), no una disciplina ni un objetivo.
const load = sportsRuntime();
const model = load('goalTransferModel');
const strategyApi = load('../planning/canonicalWeekStrategy');
const api = load('../planning/allowedWeeklyPlanContract');
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const resolve = load('../athlete/strategyResolution').resolvePlanningStrategy;
const { buildSessionDoseContext } = load('sessionDoseContext');
const { resolvePrescriptionDataSufficiency } = load('prescriptionDataSufficiency');
const days = load('../planning/weeklyCalendar').calendarDays;
const OBJECTIVE = 'Preparar las pruebas físicas de Policía Nacional';
const availability = { carrera: ['lunes', 'miercoles', 'sabado'], box: ['martes', 'jueves'] };

function fixture({ goal = OBJECTIVE, especialidad = 'funcional_fitness', categoria = 'funcional', perfil = {}, disciplines = ['box', 'carrera'], restricted = false } = {}) {
  const profile = { objetivo_principal: goal ? { descripcion: goal } : null, categoria, especialidad, perfil,
    ciclo_actual: { bloque: 'acumulacion', semana: 2, totalSemanas: 4 }, athlete_development: [] };
  const scope = { mode: 'coach', prescriptionAllowed: true, managedDisciplines: disciplines, externalDisciplines: [] };
  const restrictions = load('../athlete/getCanonicalRestrictions').projectCanonicalRestrictions([], restricted ? [{
    id: 'knee', status: 'pending', constraint_level: 'hard', prohibits_impact: true, prohibits_jump: true, prohibits_deep_flexion: true, prohibits_axial_load: false }] : [], '2026-09-07');
  const contexts = Object.fromEntries(disciplines.map(discipline => {
    const input = contractFixture({ prescriptionScope: scope, targetWeekStart: '2026-09-07', discipline, availableDays: availability[discipline], restrictionsSnapshot: restrictions });
    input.exposureContext.report.disciplina = discipline; return [discipline, input];
  }));
  const strategy = strategyApi.buildCanonicalWeekStrategy(project(profile), scope, 5);
  return { profile, targetWeekStart: '2026-09-07', prescriptionScope: scope, contexts, allowed: availability, maxExecutableDays: 5, completeNewWeek: true, fixed: {}, strategy };
}
const built = options => { const r = api.buildAllowedWeeklyPlanContract(fixture(options)); assert.equal(r.ok, true, JSON.stringify(r)); return r.contract; };
function choose(c) {
  const groups = c.strategy.coverage;
  const bits = o => groups.reduce((n, g, i) => n | (o.intent?.kind === 'adaptation' && (!g.adaptationId || o.intent.adaptationId === g.adaptationId)
    && (!g.discipline || o.discipline === g.discipline) ? 1 << i : 0), 0);
  const memo = new Set();
  function search(i, n, mask, selected) {
    if (i === 7) return mask === (1 << groups.length) - 1 && n > 0 ? selected : null;
    const key = `${i}:${n}:${mask}`; if (memo.has(key)) return null; memo.add(key);
    for (const o of c.dayOptions[days[i]]) {
      const count = n + Number(['TRAIN', 'RECOVERY'].includes(o.state)); if (count > c.frequencyPolicy.maxExecutableDays) continue;
      const result = search(i + 1, count, mask | bits(o), [...selected, { day: days[i], optionId: o.optionId,
        decision: { role: o.state === 'REST' ? 'RECOVERY' : 'PRIMARY', reason: 'Fixture: selección contextual dentro de los candidatos.' } }]); if (result) return result;
    }
    return null;
  }
  const selections = search(0, 0, 0, []); assert.ok(selections);
  return { contractVersion: 1, contextDigest: c.contextDigest, selections };
}
const SPECIALTIES = [['funcional', 'funcional_fitness'], ['hibrido', 'hibrido_general'], ['fuerza', 'fuerza_powerlifting'], ['fuerza', 'fuerza_strongman'],
  ['carrera', 'carrera_trail'], ['funcional', 'disciplina_futura_sin_familia'], ['hibrido', 'hibrido_triatlon']];

test('GG1 objetivo custom + funcional_fitness => planifica (la via universal, no STRATEGY_UNSUPPORTED) y construye una semana', () => {
  const r = resolve(project(fixture().profile));
  assert.equal(r.status, 'STRATEGY_RESOLVED'); assert.equal(r.strategyId, 'general_goal_driven'); assert.equal(r.source, 'general_goal_driven');
  assert.equal(r.strategySupport, 'GENERAL_GOAL_DRIVEN'); assert.equal(r.fallback, null); assert.equal(r.strategySpecificity, 'GENERAL');
  const c = built(); assert.equal(c.strategy.goal.id, 'general_goal_driven');
  const sessions = Object.values(c.dayOptions).flat().filter(o => o.intent);
  assert.ok(sessions.length > 0 && sessions.every(o => o.intent.kind === 'adaptation' && o.intent.goalId === 'general_goal_driven'));
  assert.ok(sessions.some(o => o.discipline === 'box') && sessions.some(o => o.discipline === 'carrera'), 'ambos medios disponibles');
  assert.equal(api.validateWeeklySelection(c, choose(c)).ok, true);
});
test('GG2 objetivo custom + hibrido_general => planifica', () => {
  const c = built({ categoria: 'hibrido', especialidad: 'hibrido_general' }); assert.equal(c.strategy.goal.id, 'general_goal_driven');
  assert.equal(api.validateWeeklySelection(c, choose(c)).ok, true);
});
test('GG3 objetivo custom + especialidad fuerza_* => planifica', () => {
  for (const especialidad of ['fuerza_powerlifting', 'fuerza_halterofilia', 'fuerza_strongman']) {
    const c = built({ categoria: 'fuerza', especialidad }); assert.equal(c.strategy.goal.id, 'general_goal_driven', especialidad);
    assert.equal(api.validateWeeklySelection(c, choose(c)).ok, true, especialidad);
  }
});
test('GG4 objetivo custom + trail / disciplina futura sin familia => planifica', () => {
  for (const [categoria, especialidad] of SPECIALTIES.slice(4)) {
    const r = resolve(project(fixture({ categoria, especialidad }).profile));
    assert.equal(r.status, 'STRATEGY_RESOLVED', especialidad); assert.equal(r.strategyId, 'general_goal_driven', especialidad);
    assert.equal(built({ categoria, especialidad }).strategy.goal.id, 'general_goal_driven');
  }
});
test('GG5 estrategia exacta soportada: sin cambios (id, fuente, demandas, sin via universal)', () => {
  for (const [goal, id, source] of [['half_marathon', 'half_marathon', 'exact_primary_goal'], ['10K', '10k', 'exact_primary_goal'], ['crossfit', 'crossfit', 'exact_primary_goal'],
    ['fuerza_maxima', 'max_strength', 'exact_primary_goal']]) {
    const r = resolve(project(fixture({ goal, especialidad: 'funcional_fitness' }).profile));
    assert.deepEqual([r.strategyId, r.source, r.strategySupport, r.fallback], [id, source, 'EXACT_GOAL', null]);
    const w = fixture({ goal, especialidad: 'funcional_fitness' }).strategy;
    assert.equal(w.goalRequirements.mode, 'EXACT_STRATEGY'); assert.equal(w.goalRequirements.universalPath, false);
    assert.deepEqual(plain(w.adaptations.map(a => [a.id, a.role]).sort()), plain(model.GOAL_DEMANDS[id].map(d => [d.adaptationId, d.role]).sort()));
  }
  // con familia de especialidad el comportamiento previo (base de programacion) se conserva
  const base = resolve(project(fixture({ especialidad: 'funcional_crossfit' }).profile));
  assert.deepEqual([base.strategyId, base.strategySupport, base.fallback.kind], ['crossfit', 'SPECIALTY_FALLBACK', 'DECLARED_SPORT_FAMILY']);
  assert.equal(resolve(project(fixture({ goal: 'Mi carrera popular', especialidad: 'carrera', categoria: 'carrera' }).profile)).strategyId, 'running_general');
});
test('GG6 el objetivo explicito no cambia en ningun caso (resolucion, requisitos y proyeccion)', () => {
  for (const [categoria, especialidad] of [...SPECIALTIES, ['funcional', 'funcional_crossfit'], ['carrera', 'carrera']]) {
    const f = fixture({ categoria, especialidad });
    assert.equal(resolve(project(f.profile)).goal.candidates[0].value, OBJECTIVE, especialidad);
    assert.equal(f.strategy.goalRequirements.objective.text, OBJECTIVE, especialidad);
    assert.equal(f.strategy.goalRequirements.objective.recognizedGoalId, null);
    assert.notEqual(f.strategy.goal.id, 'crossfit' && f.strategy.goalRequirements.objective.text);
  }
});
test('GG7 la planificacion no reescribe especialidad/categoria/objetivo del perfil', () => {
  const f = fixture(), before = JSON.stringify(f.profile);
  built(); resolve(project(f.profile)); strategyApi.buildCanonicalWeekStrategy(project(f.profile), f.prescriptionScope, 5);
  assert.equal(JSON.stringify(f.profile), before);
  assert.equal(f.strategy.goalRequirements.trainingMeans.declaredSpecialty, 'funcional_fitness'); assert.equal(f.strategy.goalRequirements.trainingContext.category, 'funcional');
});
test('GG8 restricciones del perfil, disponibilidad y limite de dias siguen aplicando en la via universal', () => {
  const c = built();
  for (const day of days) for (const o of c.dayOptions[day]) if (o.state !== 'REST') assert.ok(availability[o.discipline].includes(day), `${o.discipline} fuera de disponibilidad en ${day}`);
  assert.equal(c.frequencyPolicy.maxExecutableDays, 5);
  assert.ok(c.strategy.goalRequirements.interpretation.immutable.includes('weeklyAvailability') && c.strategy.goalRequirements.interpretation.immutable.includes('sessionDuration'));
  const level = project({ ...fixture().profile, perfil: { nivel: 'Intermedio' } }).declaredLevel;
  assert.equal(level.value, 'Intermedio'); assert.equal(strategyApi.buildCanonicalWeekStrategy(project({ ...fixture().profile, perfil: { nivel: 'Avanzado' } }), fixture().prescriptionScope, 5).goalRequirements.trainingContext.level, 'Avanzado');
});
test('GG9 equipo explicit unavailable sigue ganando a los defaults en la via universal', () => {
  const perfil = { lugar_entreno: 'Box CrossFit (equipamiento completo)', prescription_signals: { 'equipment.remo': { state: 'unavailable', updatedAt: 'x' } } };
  const profile = fixture({ perfil }).profile, signals = project(profile).prescriptionSignals.signals;
  assert.equal(signals['equipment.remo'].state, 'unavailable'); assert.equal(signals['equipment.kettlebell'].state, 'available');
  const c = buildSessionDoseContext(project(profile), undefined, null, [], true);
  assert.equal(resolvePrescriptionDataSufficiency(c.sufficiency, c.references, { movementId: 'row_erg', discipline: 'box' }).status, 'missing_required_data');
  assert.deepEqual(plain(fixture({ perfil }).strategy.goalRequirements.trainingContext.equipment.explicitUnavailable), ['remo']);
});
test('GG10 las restricciones siguen limitando metodos en la via universal', () => {
  const free = built(), restricted = built({ restricted: true });
  const patterns = c => new Set(Object.values(c.dayOptions).flat().filter(o => o.intent).map(o => o.intent.pattern));
  assert.ok(patterns(free).has('squat'));
  assert.ok(!patterns(restricted).has('squat') && !patterns(restricted).has('jump'), 'sentadilla/salto eliminados por la restriccion');
  assert.ok(patterns(restricted).size > 0, 'sigue habiendo opciones seguras');
});
test('GG11 objetivo ausente => GOAL_MISSING se conserva (la via universal exige un objetivo declarado)', () => {
  for (const especialidad of ['funcional_fitness', 'funcional_crossfit', 'carrera', 'hibrido_general']) {
    const r = resolve(project(fixture({ goal: '', especialidad }).profile));
    assert.equal(r.status, 'GOAL_MISSING'); assert.equal(r.strategyId, null); assert.equal(r.strategySupport, 'NONE');
    assert.equal(fixture({ goal: '', especialidad }).strategy.goalRequirements, undefined);
  }
});
test('GG12 sin implementacion por palabras clave: mismo comportamiento para cualquier objetivo y sin ids por objetivo', () => {
  for (const file of ['lib/athlete/strategyResolution.ts', 'lib/planning/goalRequirements.ts', 'lib/sports/goalTransferModel.ts', 'lib/planning/canonicalWeekStrategy.ts'])
    assert.ok(!/polic[ií]a|bombero|guardia civil|oposici/i.test(readFileSync(file, 'utf8')), file);
  assert.deepEqual(Object.keys(model.GOAL_DEFINITIONS).sort(), ['10k', 'crossfit', 'general_goal_driven', 'half_marathon', 'hyrox', 'max_strength', 'running_general']);
  const shapes = ['Preparar el examen de bombero', 'Cruzar los Pirineos', 'xyzzy plugh', 'Volver a jugar al pádel'].map(goal => {
    const w = fixture({ goal }).strategy; return JSON.stringify({ id: w.goal.id, mode: w.goalRequirements.mode, adaptations: w.adaptations, methods: w.methods }); });
  assert.equal(new Set(shapes).size, 1);
  const demands = model.GOAL_DEMANDS.general_goal_driven; assert.ok(demands.every(d => d.role !== 'PRIMARY'), 'sin prioridades por objetivo en el catalogo');
  assert.deepEqual(plain(model.validateGoalTransferCatalog()), []);
});
test('GG13 la via universal llega al contrato y al prompt del Coach semanal con el objetivo explicito y las instrucciones', () => {
  const c = built(); const gr = c.strategy.goalRequirements;
  assert.equal(gr.objective.text, OBJECTIVE); assert.equal(gr.mode, 'GOAL_DRIVEN'); assert.equal(gr.universalPath, true); assert.equal(gr.programmingBase, null);
  assert.deepEqual(plain(gr.trainingMeans.managedDisciplines), ['box', 'carrera']);
  const prompt = api.weeklyPlannerPrompt(c);
  assert.ok(prompt.includes(OBJECTIVE) && prompt.includes('GOAL_REQUIREMENTS') && prompt.includes('"general_goal_driven"'));
  assert.ok(strategyApi.renderWeekObjective({ ...c.strategy, coverage: c.strategy.adaptations.map(a => ({ id: a.id, adaptationId: a.id })) }).startsWith('Planificación dirigida por tu objetivo declarado'));
});
test('GG14 el contrato generado es determinista y firmable (digest estable, serializable, sensible al objetivo)', () => {
  const a = built(), b = built();
  assert.equal(a.contextDigest, b.contextDigest); assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(plain(a), JSON.parse(JSON.stringify(a)));
  assert.notEqual(built({ goal: 'Otro objetivo distinto' }).contextDigest, a.contextDigest);
  assert.doesNotThrow(() => strategyApi.assertStrategyShape(a.strategy));
  const p = choose(a); assert.equal(api.validateWeeklySelection(a, p).ok, true); assert.equal(p.contextDigest, a.contextDigest);
});
test('GG15 las estrategias especializadas existentes siguen siendo compatibles (forma, validacion y recibos)', () => {
  for (const goal of ['half_marathon', 'crossfit']) {
    const w = fixture({ goal }).strategy;
    assert.doesNotThrow(() => strategyApi.assertStrategyShape(w));
    assert.equal(w.goal.fallback, undefined); assert.ok(!w.diagnostics.some(d => d.reason === 'EXPLICIT_OBJECTIVE_NOT_SPECIALISED'));
    assert.deepEqual(Object.keys(w).sort(), ['adaptations', 'block', 'coverage', 'deferred', 'diagnostics', 'goal', 'goalRequirements', 'intensityIntent', 'methods', 'policy',
      'preferredEnvironments', 'trainingDaysTarget', 'version', 'volumeIntent', 'weeklyDecisionAuthority']);
    const c = built({ goal }); assert.equal(api.validateWeeklySelection(c, choose(c)).ok, true, goal);
  }
  for (const id of Object.keys(model.GOAL_DEMANDS)) assert.ok(model.GOAL_DEFINITIONS[id], id);
  const strategy = fixture({ goal: 'crossfit' }).strategy;
  assert.deepEqual(plain(model.GOAL_DEMANDS.crossfit.map(d => d.adaptationId).sort()), plain(strategy.adaptations.map(a => a.id).sort()));
});

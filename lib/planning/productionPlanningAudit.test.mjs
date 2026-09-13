import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sportsRuntime, compile, plain, equippedProfileFixture, fakeDatabase, completeDoseFixture } from '../sports/trainingContractTestRuntime.mjs';

// Characterization of the incident boundaries, not new sporting expectations or a fix.
const today = '2026-09-13', week = '2026-09-14';
class AuditDate extends Date { constructor(...a) { super(...(a.length ? a : [today + 'T12:00:00Z'])); } static now() { return Date.parse(today + 'T12:00:00Z'); } }
const silent = { info() {}, log() {}, warn() {}, error() {} };
const load = sportsRuntime({ Date: AuditDate, console: silent });
const days = load('../planning/weeklyCalendar').calendarDays;
const distribution = { box: ['martes', 'jueves', 'viernes', 'sabado'], carrera: ['lunes', 'miercoles', 'domingo'] };
const ui = ts.createSourceFile('ui.tsx', readFileSync('app/FormaPro.tsx', 'utf8'), 99, true, ts.ScriptKind.TSX);
const route = ts.createSourceFile('route.ts', readFileSync('app/api/chat/route.ts', 'utf8'), 99, true);
function find(n, p) { return p(n) ? n : ts.forEachChild(n, c => find(c, p)); }
const declaration = name => find(ui, n => ts.isVariableDeclaration(n) && n.name.getText(ui) === name).initializer.getText(ui);
const save = find(route, n => ts.isIfStatement(n) && n.expression.getText(route) === 'action === "guardar_plan_semana"');
test('repair: save projects the signed target and cannot advance or reconstruct ciclo_actual', () => {
  const text = save.getText(route);
  assert.match(text, /plan.week_number = longitudinal.semana/);
  assert.match(text, /plan.total_weeks_block = longitudinal.totalSemanas/);
  assert.doesNotMatch(text, /update\(\{ ciclo_actual:/);
});

function database(restricted = false) {
  const db = fakeDatabase({ usuarios: { modo_entrada: 'coach', categoria: 'box', especialidad: 'crossfit', objetivo_principal: { descripcion: 'crossfit' },
    ciclo_actual: { bloque: 'deload', semana: 1, totalSemanas: 1 }, perfil: { ...equippedProfileFixture(), dias: 4, duracion: '60 min' },
    workout_history: [], distribucion_semanal: distribution }, weekly_plan: [],
    athlete_training_sources: Object.entries(distribution).map(([disciplina, dias]) => ({ disciplina, dias, owner: 'forge', activo: true })),
    athlete_state_events: [], athlete_coaching_notes: restricted ? [{ id: 'fixture-knee', status: 'pending', constraint_level: 'hard', movement: 'rodilla', prohibits_impact: true, prohibits_jump: true, prohibits_deep_flexion: true }] : [] });
  const from = db.from.bind(db);
  db.from = table => { const q = from(table); if (table === 'weekly_plan') q.maybeSingle = async () => ({ data: null, error: null }); return q; };
  return db;
}
const request = { targetWeekStart: week, today, empezarHoy: false, snapshot: null, strategyVersion: 1,
  strategyProposal: { version: 1, preferredAdaptations: ['halterofilia_tecnica', 'base_aerobica', 'potencia', 'gimnasticos'] } };

test('audit: declared running days have TRAIN candidates when factual requirements are satisfied', async () => {
  const r = await load('../planning/prepareAllowedWeeklyPlanContract').prepareAllowedWeeklyPlanContract(database(), 'audit-fixture', request);
  assert.equal(r.ok, true, JSON.stringify(r));
  for (const day of distribution.carrera) assert.ok(r.contract.dayOptions[day].some(o => o.state === 'TRAIN' && o.discipline === 'carrera'), day);
  assert.equal(r.contract.strategy.block.phase, 'deload');
  assert.equal(r.contract.frequencyPolicy.maxExecutableDays, 6); // Analyzer's proposed four is not this ceiling.
  const decision = load('../planning/allowedWeeklyPlanContract').validateWeeklySelection(r.contract, {
    contractVersion: 1, contextDigest: r.contract.contextDigest, selections: days.map(day => ({ day,
      optionId: (day === 'martes' ? r.contract.dayOptions[day].find(o => o.intent?.methodId === 'box_max_strength' && o.intent.pattern === 'horizontal_push') : r.contract.dayOptions[day][0]).optionId })) });
  assert.equal(decision.ok, true); // Availability is not an obligation to run.
});

test('audit: restrictions can remove running candidates before the Coach without inventing a REST substitution', async () => {
  const r = await load('../planning/prepareAllowedWeeklyPlanContract').prepareAllowedWeeklyPlanContract(database(true), 'audit-fixture', request);
  assert.equal(r.ok, true, JSON.stringify(r));
  for (const day of distribution.carrera) assert.ok(!r.contract.dayOptions[day].some(o => o.discipline === 'carrera'), day);
});

test('audit: rendered objective describes advisory coverage even when the Coach selects another adaptation', async () => {
  const r = await load('../planning/prepareAllowedWeeklyPlanContract').prepareAllowedWeeklyPlanContract(database(), 'audit-fixture', request);
  assert.equal(r.ok, true);
  const contract = r.contract;
  const option = contract.dayOptions.martes.find(o => o.intent?.adaptationId === 'gimnasticos');
  assert.ok(option);
  const p = { contractVersion: 1, contextDigest: contract.contextDigest, selections: days.map(day => ({ day, optionId: day === 'martes' ? option.optionId : contract.dayOptions[day][0].optionId })) };
  const decision = load('../planning/allowedWeeklyPlanContract').validateWeeklySelection(contract, p);
  assert.equal(decision.ok, true);
  assert.ok(!Object.values(decision.selected).some(o => o.intent?.adaptationId === 'fuerza_maxima'));
  assert.match(load('humanCoachingProjection').humanWeeklyObjective(contract.strategy), /fuerza máxima/i);
});

test('audit: three actual Session calls share past context and receive only immediate neighbour summaries', async () => {
  const db = database();
  const planning = load('../planning/prepareAllowedWeeklyPlanContract');
  const planned = await planning.planBoundedWeek(db, 'audit-fixture', request, async prompt => {
    const c = JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1]);
    return JSON.stringify({ contractVersion: 1, contextDigest: c.contextDigest, selections: days.map(day => ({ day,
      optionId: (['martes', 'jueves', 'sabado'].includes(day)
        ? c.dayOptions[day].find(o => o.intent?.methodId === 'box_max_strength' && o.intent.pattern === 'horizontal_push') : c.dayOptions[day][0]).optionId,
      decision: { role: 'PRIMARY', reason: 'Fixture de transporte, no recomendación deportiva.' } })) });
  }, 'audit-token');
  assert.equal(planned.ok, true, JSON.stringify(planned));
  const contracts = [], contexts = [];
  for (const slot of planned.estructura.sessions.filter(s => s.state === 'TRAIN')) {
    const r = await load('sessionAuthority').generateTrainingSession(db, 'audit-fixture', { targetWeekStart: week, day: slot.dia, discipline: slot.tipo,
      stimulus: slot.stimulusId, intent: slot.intent, state: slot.state,
      weekly: { receipt: planned.estructura.calendarReceipt, generationToken: 'audit-token', optionId: slot.optionId, claims: slot } }, async prompt => {
      const c = JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nIntent canónico:')[0].split('\nContexto no autoritativo:')[0]);
      contracts.push(c);
      contexts.push(JSON.parse(prompt.split('\nContexto no autoritativo:\n')[1].split('\nOpciones ejecutables')[0]));
      assert.ok(c.allowedMovementIds.includes('bench_press'));
      return JSON.stringify(completeDoseFixture(c, { stimulusId: c.stimulusId, structureId: 'strength_sets',
        blocks: ['warmup', 'main'].map(blockType => ({ blockType, movements: [{ movementId: 'bench_press', prescription: { reps: 5 } }] })) }));
    });
    assert.equal(r.ok, true, JSON.stringify(r));
  }
  assert.equal(contracts.length, 3);
  for (const c of contracts) {
    assert.ok(c.generatedMovementAuthority);
    assert.ok(c.doseContext.neighbours.every(n => n.state === 'REST'));
    assert.ok(c.doseContext.neighbours.every(n => !('pattern' in n) && !('proposal' in n)));
    assert.ok(!('admittedSlots' in c.doseContext.weekStrategy));
  }
  assert.deepEqual(contexts[0].sessionHistory, contexts[2].sessionHistory);
});

test('audit: actual UI produces two start logs on preflight continuation but one Analyzer and coordinated Builders', async () => {
  const actions = [], requests = [], logs = [], pending = [];
  let preflights = 0, active = 0, peak = 0;
  const ctx = { codigoUsuario: 'audit-fixture', Date: AuditDate, structuredClone, console: { ...silent, log: (...a) => logs.push(a) },
    weeklyPlanningContinuationRef: { current: null }, availabilityConfirmationRef: { current: 'confirmed' },
    memoriaCoach: {}, debilidades: [], estadoFisiologico: {}, estadoCanonico: {}, historialFisiologico: [], distribucionSemanal: distribution,
    cicloActual: { bloque: 'deload', semana: 1, totalSemanas: 1 },
    setMensajes() {}, aplicarTodasLasReglas() {}, validarIntegridadSemana: () => ({ valido: true }), cargarPlanSemanal: async () => {},
    apiCall: async b => {
      actions.push(b.action); requests.push(b);
      if (b.action === 'preparar_generacion_semana') return { ok: true, generation: { currentWeek: '2026-09-07', nextWeek: week, token: 'run', planningRunId: 'fixture-run', snapshots: { [week]: null } } };
      if (b.action === 'check_week_closure') return { ok: true, yaCerrada: true };
      if (b.action === 'preflight_generacion_semana') return ++preflights === 1 ? { eventRequirement: { kind: 'target_event' } } : { canContinue: true, temporalDecision: { includeToday: false } };
      if (b.action === 'analizar_bloque_semana') return { ok: true, analisis: { tipo_semana: 'acumulacion', volumen_relativo: 0.5, intensidad_relativa: 0.6, dias_entreno_sugeridos: 4 } };
      if (b.action === 'planificar_semana') return { ok: true, estructura: { weeklyContractVersion: 2, strategy: { adaptacion_principal: 'Fixture' }, sessions: days.map(dia => ({ dia, tipo: ['martes', 'jueves', 'sabado'].includes(dia) ? 'box' : 'descanso' })) } };
      if (b.action === 'construir_sesion_dia') {
        active++; peak = Math.max(peak, active);
        await Promise.resolve(); active--; return { ok: true, sesion: { dia: b.datos.dia, tipo: 'box' } };
      }
      if (b.action === 'guardar_plan_semana') return { ok: true };
      throw Error(b.action);
    } };
  const run = vm.runInNewContext(compile(`const run=${declaration('orquestarGeneracionSemana')};run;`), ctx);
  assert.ok((await run()).eventRequirement);
  const result = await run();
  assert.equal(logs.filter(a => a[0] === '=== FORGE ORCHESTRATOR: INICIO ===').length, 2);
  assert.equal(actions.filter(a => a === 'analizar_bloque_semana').length, 1);
  assert.equal(actions.filter(a => a === 'guardar_plan_semana').length, 1);
  assert.equal(peak, 1);
  assert.deepEqual(requests.filter(r => r.action === "construir_sesion_dia").map(r => r.datos.acceptedCurrentWeek.length), [0, 1, 2]);
  assert.equal(result.block_name, 'deload'); // Analyzer's different phase does not overwrite stored cycle.
  assert.equal(result.week_number, 1); assert.equal(result.total_weeks_block, 1);
  const builders = requests.filter(r => r.action === 'construir_sesion_dia');
  assert.ok(builders.every(r => r.datos.diaAnterior.tipo === 'descanso' && r.datos.diaSiguiente.tipo === 'descanso'));
});

test('audit: client integrity accepts repeated movements; server distinguishes exact duplication from advisory repetition', async () => {
  const rows = ['martes', 'jueves', 'sabado'].map(dia => ({ dia, tipo: 'box', titulo: 'Bench press', descripcion: 'Bench press', debilidad_relacionada: null }));
  assert.equal(load('../validators/weekIntegrityValidator').validarIntegridadSemana(rows, distribution).valido, true);
  const facts = rows.map((r, i) => ({ id: r.dia, date: ['2026-09-15', '2026-09-17', '2026-09-19'][i], discipline: 'box', state: 'TRAIN',
    protected: false, structured: true, adaptationId: 'fuerza_maxima', role: 'PRIMARY', methodId: 'box_max_strength', weaknessId: null,
    structure: 'strength_sets', stimulus: 'fuerza_maxima', movements: ['bench_press'], patterns: ['horizontal_push'], dose: { sets: 4, reps: 5 + i },
    intensity: { kind: 'rpe', value: 7 }, impact: 'not_high', demanding: [], contributionValid: true, recoveryContradiction: false, load: null }));
  const input = { sessions: facts, strategy: { weeklyDecisionAuthority: 'coach', goal: 'crossfit', adaptations: [], required: [], deferred: [] }, exposure: { byPattern: { horizontal_push: { sessions: 3, knownRepetitions: 72, status: 'complete' } } } };
  const core = load('../planning/wholeWeekValidation');
  const warnings = core.validateWholeWeek(input);
  assert.equal(warnings.status, 'pass'); assert.ok(warnings.diagnostics.some(d => d.code === 'WEEK_NEAR_DUPLICATE'));
  const enforce = sportsRuntime({ console: silent }, (path, exports) => path.endsWith('wholeWeekAdapter.ts') ? { ...exports, validateAdmittedWholeWeek: () => warnings } : exports);
  let calls = 0;
  const r = await enforce('../planning/enforceWholeWeek').enforceWholeWeek('audit-fixture', week, [], [], 'unused', { evidence: { admittedSlots: [] }, contexts: {} }, async () => { calls++; throw Error('Unexpected review'); });
  assert.equal(r.ok, true); assert.equal(calls, 0);
  facts.forEach(f => f.dose = { sets: 4, reps: 5 });
  assert.equal(core.validateWholeWeek(input).status, 'repair_required');
});

test('audit: Analyzer numeric advice is not forwarded in the actual Planner request', () => {
  const branch = find(route, n => ts.isIfStatement(n) && n.expression.getText(route) === 'action === "planificar_semana"');
  const call = find(branch, n => ts.isCallExpression(n) && n.expression.getText(route) === 'planBoundedWeek');
  const requestText = call.arguments[2].getText(route);
  assert.match(requestText, /strategyProposal: datos\.analisis\?\.strategyProposal/);
  for (const field of ['tipo_semana', 'volumen_relativo', 'intensidad_relativa', 'dias_entreno_sugeridos']) assert.ok(!requestText.includes(field));
});

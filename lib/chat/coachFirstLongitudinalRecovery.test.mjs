import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sportsRuntime, equippedProfileFixture, plain, compile } from '../sports/trainingContractTestRuntime.mjs';

// Semantic reproduction of the exported longitudinal state, not a private profile copy.
// No network, credentials, production DB, module replacements or direct authority invocation.
const user = 'recovery-fixture', today = '2026-09-24', week = '2026-09-21';
const oldWeek = '2026-09-14', oldId = 'legacy:fixture-existing-block';
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [today + 'T21:00:00Z'])); }
  static now() { return Date.parse(today + 'T21:00:00Z'); }
}
const quiet = { log() {}, info() {}, warn() {}, error() {} };
const routeText = readFileSync(new URL('../../app/api/chat/route.ts', import.meta.url), 'utf8');
const route = ts.createSourceFile('route.ts', routeText, ts.ScriptTarget.Latest, true);
function find(node, predicate) {
  if (predicate(node)) return node;
  let found;
  ts.forEachChild(node, child => { found ??= find(child, predicate); });
  return found;
}

function database() {
  const position = { weekStart: oldWeek, bloque: 'deload', semana: 1, totalSemanas: 1,
    blockId: oldId, decision: { source: 'canonical_legacy', anchoredAt: oldWeek } };
  const tables = {
    usuarios: [{ codigo: user, modo_entrada: 'coach', categoria: 'box', especialidad: 'crossfit',
      objetivo_principal: 'crossfit', perfil: { ...equippedProfileFixture(), dias: 2, duracion: '60 min' },
      distribucion_semanal: { box: ['martes', 'jueves', 'viernes'] }, workout_history: [], athlete_development: [],
      ciclo_actual: { ...position, weekStart: undefined, planningWeekStart: oldWeek, positions: [position] } }],
    athlete_training_sources: [{ user_codigo: user, disciplina: 'box', owner: 'forge', activo: true, dias: ['martes', 'jueves', 'viernes'] }],
    weekly_plan: [{ id: 'old-plan', user_codigo: user, week_start: oldWeek, block_name: 'deload',
      week_number: 1, total_weeks_block: 1, revision: 5, status: 'active', sessions: [] }],
    week_closure_log: [{ id: 'old-closure', user_codigo: user, week_start: oldWeek, closed_at: '2026-09-20T20:17:28Z' }],
    athlete_state_events: [{ id: 'restriction', user_codigo: user, activo: true, estado: 'restricted',
      body_area: 'rodilla', fecha_inicio: '2026-09-07' }],
    athlete_coaching_notes: [{ id: 'no-jumps', user_codigo: user, status: 'pending', constraint_level: 'hard',
      movement: 'box_jump', issue: 'Synthetic restriction', prohibits_jump: true, prohibits_impact: true }],
    block_outcomes: [{ user_codigo: user, tipo_bloque: 'deload', duracion_semanas: 1,
      fecha_inicio: '2026-09-06', fecha_fin: '2026-09-13', adherencia: 100, sesiones_completadas: 4, resultado_global: 'bueno' }],
  };
  const writes = [];
  return { tables, writes, from(table) {
    const filters = []; let one = false, patch, order, cap = Infinity, offset = 0, expectedCycle, columns = '*';
    const q = {
      select(value = '*') { columns = value; return q; },
      eq(k, v) { if (k === 'ciclo_actual') expectedCycle = v;
        filters.push(r => typeof r[k] === 'object' && typeof v === 'string'
        ? JSON.stringify(r[k]) === v : r[k] === v); return q; },
      is(k, v) { filters.push(r => v === null ? r[k] == null : r[k] === v); return q; },
      in(k, vs) { filters.push(r => vs.includes(r[k])); return q; },
      gte(k, v) { filters.push(r => r[k] >= v); return q; },
      lte(k, v) { filters.push(r => r[k] <= v); return q; },
      lt(k, v) { filters.push(r => r[k] < v); return q; },
      or(expression) {
        assert.equal(expression, 'constraint_level.is.null,constraint_level.not.in.(hard,reassessment)');
        filters.push(r => !['hard', 'reassessment'].includes(r.constraint_level)); return q;
      },
      order(k, options) { order = { k, ascending: options?.ascending }; return q; },
      limit(n) { cap = n; return q; }, range(a, b) { offset = a; cap = b - a + 1; return q; },
      single() { one = true; return q; }, maybeSingle() { one = true; return q; },
      update(value) { patch = value; return q; },
      insert() { throw Error('Unexpected insert before Builder boundary'); },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          let rows = (tables[table] ?? []).filter(r => filters.every(f => f(r)));
          if (order) rows.sort((a, b) => String(a[order.k]).localeCompare(String(b[order.k])) * (order.ascending ? 1 : -1));
          rows = rows.slice(offset, offset + cap);
          if (patch) {
            assert.equal(table, 'usuarios'); assert.deepEqual(Object.keys(patch), ['ciclo_actual']);
            assert.equal(expectedCycle, JSON.stringify(tables.usuarios[0].ciclo_actual), 'exact prior JSON CAS');
            assert.equal(rows.length, 1, 'CAS must match the stored cycle');
            writes.push({ table, patch: plain(patch) }); rows.forEach(r => Object.assign(r, plain(patch)));
          }
          const projected = columns === '*' ? rows : rows.map(r => Object.fromEntries(
            columns.split(',').map(k => k.trim()).filter(k => Object.hasOwn(r, k)).map(k => [k, r[k]])));
          return { data: plain(one ? projected[0] ?? null : projected), error: null, count: rows.length };
        }).then(resolve, reject);
      },
    };
    return q;
  } };
}

test('Coach-first recovers closed legacy deload through real preflight, route Planner and cycle CAS', async t => {
  const load = sportsRuntime({ Date: Clock, console: quiet, Error });
  const db = database(), phases = [], providerCalls = [];
  let firstFailure, builderReached = false, plannerResult, weeklyRestrictions;
  const generation = load('../chat/coachFirstGeneration');
  const provider = async (_url, request) => {
    const prompt = JSON.parse(request.body).messages[0].content;
    let answer;
    if (prompt.startsWith('LONGITUDINAL_COACH_TRANSITION')) {
      providerCalls.push('transition');
      assert.match(prompt, /canonical_legacy/); assert.match(prompt, /2026-09-21/);
      const facts = JSON.parse(prompt.split('FACTS:\n')[1].split('\nCOACH_FIRST_REPORTED_EVENTS')[0]);
      assert.equal(facts.previousCycle.semana, 1); assert.equal(facts.previousCycle.totalSemanas, 1);
      assert.equal(facts.previousWeekStart, oldWeek); assert.equal(facts.targetWeekStart, week);
      answer = { bloque: 'acumulacion', totalSemanas: 3, reason: 'Synthetic explicit next block with adapted upper-body work.' };
    } else if (prompt.includes('WEEKLY_CONTRACT:\n')) {
      providerCalls.push('weekly');
      const contract = JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1].split('\nCOACH_FIRST_REPORTED_EVENTS')[0]);
      assert.equal(contract.openFacts.contexts.box.restrictionsSnapshot.active, true);
      assert.ok(contract.openFacts.contexts.box.restrictionsSnapshot.restrictions.some(n => n.prohibits_jump));
      weeklyRestrictions = contract.openFacts.contexts.box.restrictionsSnapshot;
      answer = { contractVersion: 2, contextDigest: contract.contextDigest,
        selections: Object.entries(contract.dayOptions).map(([day, options]) => {
          const fixed = options.find(o => o.protected);
          if (fixed) return { day, optionId: fixed.optionId };
          const train = contract.openFacts.allowed.box.includes(day);
          return { day, state: train ? 'TRAIN' : 'REST', decision: { role: train ? 'PRIMARY' : 'RECOVERY', reason: 'Synthetic adapted week.' },
            ...(train ? { intent: { kind: 'open_coach', version: 1, discipline: 'box',
              adaptationId: 'upper_body_control', stimulusId: 'technical_push_density', pattern: 'horizontal_push',
              role: 'PRIMARY', method: { kind: 'coach_defined', label: 'Controlled upper-body practice' } } } : {}) };
        }) };
    } else {
      assert.match(prompt, /Eres un analizador de bloques/);
      providerCalls.push('analyzer');
      answer = { tipo_semana: 'deload', objetivo: 'Synthetic analysis', volumen_relativo: 0.5, intensidad_relativa: 0.5,
        debilidad_prioritaria: null, dias_entreno_sugeridos: 2, coaching_notes_incorporadas: [],
        strategyProposal: { version: 1, preferredAdaptations: [] } };
    }
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(answer) }] }) };
  };
  // Same AST extraction approach as weeklySave.test.mjs; production action bodies are not rewritten.
  function executeRoute(action, datos, coachFirstPlanning) {
    const block = find(route, n => ts.isIfStatement(n) && n.expression.getText(route) === `action === "${action}"`);
    assert.ok(block, action);
    const globals = { Date: Clock, console: quiet, Error, Buffer, structuredClone,
      supabase: db, codigo: user, datos, coachFirstPlanning, apiKey: 'synthetic-not-a-key', fetch: provider,
      NextResponse: { json: body => body }, require: name => {
        assert.ok(name.startsWith('@/lib/')); return load('../' + name.slice('@/lib/'.length));
      } };
    for (const node of route.statements) {
      if (!ts.isImportDeclaration(node) || node.importClause?.isTypeOnly) continue;
      const path = node.moduleSpecifier.text;
      if (!path.startsWith('@/lib/')) continue;
      for (const binding of node.importClause?.namedBindings?.elements ?? []) {
        if (binding.isTypeOnly) continue;
        Object.defineProperty(globals, binding.name.text, { configurable: true,
          get: () => load('../' + path.slice('@/lib/'.length))[(binding.propertyName ?? binding.name).text] });
      }
    }
    const helpers = ['generarEstadoCanonico', 'buildFocusContext'].map(name =>
      find(route, n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(route)).join('\n');
    return vm.runInNewContext(compile(`${helpers}\nasync function run(){${block.thenStatement.getText(route)}}\nrun();`), globals);
  }
  const executePlanning = async (action, args, context) => {
      phases.push(action);
      try {
        if (action === 'construir_sesion_dia') {
          assert.equal(args.dia, 'viernes', 'no Builder call for Monday through Thursday');
          const proof = load('../planning/weeklyCalendarAuthority').verifyWeeklyCalendarReceipt(args.calendarReceipt, user, week, true);
          assert.equal(proof.longitudinal.blockId, db.tables.usuarios[0].ciclo_actual.blockId);
          assert.equal(proof.longitudinal.bloque, 'acumulacion');
          const policy = load('movementRestrictionPolicy'), library = load('movementLibrary').MOVEMENT_LIBRARY;
          const flags = policy.activeRestrictionFlags(weeklyRestrictions.restrictions);
          assert.equal(policy.evaluateMovementRestrictions(library.box_jump, flags).allowed, false);
          assert.equal(policy.evaluateMovementRestrictions(library.bench_press, flags).allowed, true);
          builderReached = true;
          // Intentional scope boundary, not a simulated successful session/save.
          return { ok: false, code: 'TEST_STOP_AT_BUILDER_BOUNDARY' };
        }
        assert.ok(['analizar_bloque_semana', 'planificar_semana'].includes(action));
        const response = await executeRoute(action, args, context);
        if (!response.ok) firstFailure ??= { action, response };
        if (action === 'planificar_semana') plannerResult = response;
        return response;
      } catch (error) { firstFailure ??= { action, error: error.stack }; throw error; }
    };
  const dispatch = load('../chat/coachFirstTools').coachFirstTools(db, user, {
    message: 'Desde mañana viernes hasta final de semana', messageId: 'fixture-message',
    timestamp: today + 'T21:00:00Z', timezone: 'Atlantic/Canary', conversation: [],
  }, 'fixture-turn', (args, id, diagnostic) => generation.generateCoachFirstWeek(db, user, args, id, today, executePlanning, diagnostic), () => {});
  const availability = await dispatch({ name: 'read_context', arguments: { resource: 'availability' } }, 1);
  const planning = await dispatch({ name: 'read_context', arguments: { resource: 'planning' } }, 2);
  assert.equal(availability.coverage.week, week); assert.equal(availability.data.ok, true);
  assert.equal(planning.data.position.status, 'unknown');
  const result = await dispatch({ name: 'generate_week', arguments: {
    availabilityReadId: availability.availabilityReadId, includeToday: false, snapshotDigest: availability.data.snapshotDigest,
  } }, 3);
  assert.equal(firstFailure, undefined, JSON.stringify(firstFailure));
  assert.equal(builderReached, true, JSON.stringify({ result, phases, providerCalls }));
  assert.deepEqual(providerCalls, ['analyzer', 'transition', 'weekly']);
  assert.equal(db.writes.length, 1);
  const cycle = db.tables.usuarios[0].ciclo_actual;
  assert.equal(cycle.planningWeekStart, week); assert.equal(cycle.semana, 1); assert.equal(cycle.totalSemanas, 3);
  assert.notEqual(cycle.blockId, oldId); assert.equal(cycle.decision.source, 'longitudinal_coach');
  assert.equal(cycle.decision.previousBlockId, oldId); assert.equal(cycle.decision.targetWeekStart, week);
  assert.ok(cycle.decision.planningRunId); assert.equal(cycle.positions.find(p => p.weekStart === oldWeek).blockId, oldId);
  assert.equal(cycle.positions.find(p => p.weekStart === week).blockId, cycle.blockId);
  assert.equal(plannerResult.estructura.longitudinal.blockId, cycle.blockId);
  for (const day of ['lunes', 'martes', 'miercoles', 'jueves'])
    assert.equal(plannerResult.estructura.sessions.find(s => s.dia === day).tipo, 'sin_registrar');
  assert.equal(db.tables.athlete_state_events[0].activo, true);
  assert.equal(result.code, 'BUILDER_NOT_ADMITTED');
  assert.equal(db.tables.weekly_plan.some(p => p.week_start === week), false);
  t.diagnostic('A-E reached real Builder boundary; F preserves restrictions and verifies real movement policy. No session construction or weekly save claimed.');
});

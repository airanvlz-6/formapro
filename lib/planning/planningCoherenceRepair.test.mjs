import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, fakeDatabase, equippedProfileFixture, completeDoseFixture, plain } from '../sports/trainingContractTestRuntime.mjs';

const today = '2026-09-13', week = '2026-09-14';
class FixedDate extends Date { constructor(...a) { super(...(a.length ? a : [today + 'T12:00:00Z'])); } static now() { return Date.parse(today + 'T12:00:00Z'); } }
const load = sportsRuntime({ Date: FixedDate, console: { log() {}, info() {}, warn() {}, error() {} } });
const days = load('../planning/weeklyCalendar').calendarDays;
const distribution = { box: ['martes', 'jueves', 'viernes', 'sabado'], carrera: ['lunes', 'miercoles', 'domingo'] };
function database(cycle = { bloque: 'deload', semana: 1, totalSemanas: 1, planningWeekStart: week, blockId: 'fixture-block', decision: { source: 'fixture' } }) {
  const tables = { usuarios: { modo_entrada: 'coach', categoria: 'box', especialidad: 'crossfit', objetivo_principal: { descripcion: 'crossfit' },
    ciclo_actual: cycle, perfil: { ...equippedProfileFixture(), dias: 4, duracion: '60 min' }, workout_history: [], distribucion_semanal: distribution },
    weekly_plan: [], athlete_training_sources: Object.entries(distribution).map(([disciplina, dias]) => ({ disciplina, dias, owner: 'forge', activo: true })),
    athlete_state_events: [], athlete_coaching_notes: [] };
  const db = fakeDatabase(tables), from = db.from.bind(db); db.writes = 0;
  db.from = table => {
    const q = from(table); let update, expected;
    q.update = value => { update = value; return q; };
    q.is = (_field, value) => { expected = value; return q; };
    q.eq = (field, value) => { if (field === 'ciclo_actual') expected = JSON.parse(value); return q; };
    const original = q.maybeSingle;
    q.maybeSingle = async () => {
      if (update) {
        assert.deepEqual(expected, tables.usuarios.ciclo_actual, 'cycle write must compare exact prior JSON');
        db.writes++; Object.assign(tables[table], update); return { data: tables[table], error: null };
      }
      return table === 'weekly_plan' ? { data: null, error: null } : original();
    };
    return q;
  };
  return { db, tables };
}
const request = { targetWeekStart: week, today, empezarHoy: false, snapshot: null, strategyVersion: 1, coherenceVersion: 1, planningRunId: 'fixture-run',
  strategyProposal: { version: 1, preferredAdaptations: ['base_aerobica'] } };
const authority = load('../planning/longitudinalAuthority');
const decisionOutput = load('../planning/longitudinalDecisionOutput');
const decisionEnvelope = input => ({ stop_reason: 'tool_use', content: [
  { type: 'tool_use', id: 'decision-fixture', name: 'submit_longitudinal_decision', input },
] });

test('longitudinal: advance once, regenerate identically, retain canonical older position', async () => {
  const { db, tables } = database({ bloque: 'acumulacion', semana: 2, totalSemanas: 4, planningWeekStart: '2026-09-07' });
  const complete = () => { throw Error('No transition needed within an existing block'); };
  const next = await authority.ensureLongitudinalTarget(db, 'fixture', week, today, complete);
  assert.equal(next.semana, 3); assert.equal(next.totalSemanas, 4); assert.equal(db.writes, 1);
  assert.deepEqual(plain(await authority.ensureLongitudinalTarget(db, 'fixture', week, today, complete)), plain(next));
  assert.equal(db.writes, 1);
  assert.equal(authority.longitudinalProjection(tables.usuarios.ciclo_actual, '2026-09-07').semana, 2);
});

test('longitudinal: exhausted deload requires explicit decision; another deload gets different provenance', async () => {
  const { db, tables } = database({ bloque: 'deload', semana: 1, totalSemanas: 1, planningWeekStart: '2026-09-07', blockId: 'old' });
  let calls = 0;
  const complete = async prompt => { calls++; assert.match(prompt, /LONGITUDINAL_COACH_TRANSITION/);
    return decisionOutput.readLongitudinalDecisionOutput(decisionEnvelope({ bloque: 'deload', totalSemanas: 1, reason: 'Explicit fixture decision based on longitudinal evidence.' })); };
  const next = await authority.ensureLongitudinalTarget(db, 'fixture', week, today, complete, 'run');
  assert.equal(next.bloque, 'deload'); assert.equal(next.semana, 1); assert.notEqual(next.blockId, 'old');
  assert.equal(next.decision.source, 'longitudinal_coach'); assert.equal(next.decision.previousBlockId, 'old');
  await authority.ensureLongitudinalTarget(db, 'fixture', week, today, complete, 'retry');
  assert.equal(calls, 1); assert.equal(db.writes, 1); assert.equal(tables.usuarios.ciclo_actual.blockId, next.blockId);
});

test('longitudinal: invalid transition cannot silently recycle or write a cycle', async () => {
  const { db, tables } = database({ bloque: 'deload', semana: 1, totalSemanas: 1, planningWeekStart: '2026-09-07' });
  await assert.rejects(authority.ensureLongitudinalTarget(db, 'fixture', week, today, async () => '{}'), /LONGITUDINAL_DECISION_INVALID/);
  assert.equal(db.writes, 0); assert.equal(tables.usuarios.ciclo_actual.planningWeekStart, '2026-09-07');
});

test('longitudinal tool boundary preserves semantic validation and rejects invalid transport without writes', async t => {
  const good = { bloque: 'acumulacion', totalSemanas: 3, reason: 'Valid explicit decision.' };
  const tool = decisionEnvelope(good).content[0];
  const cases = [
    ['valid', decisionEnvelope(good), true],
    ['prose plus one tool', { stop_reason: 'tool_use', content: [{ type: 'text', text: 'not JSON' }, tool] }, true],
    ...[{ bloque: 'unknown' }, { totalSemanas: '3' }, { totalSemanas: 0 }, { totalSemanas: 1.5 },
      { totalSemanas: Number.MAX_SAFE_INTEGER + 1 }, { reason: '' }, { reason: '   ' },
      { reason: 'x'.repeat(601) }, { extra: true }].map((patch, i) => ['invalid semantic ' + i, decisionEnvelope({ ...good, ...patch }), false]),
    ['missing reason', decisionEnvelope({ bloque: 'acumulacion', totalSemanas: 3 }), false],
    ['null input', decisionEnvelope(null), false],
    ['string input', decisionEnvelope(JSON.stringify(good)), false],
    ['missing input', { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'x', name: tool.name }] }, false],
    ['absent tool', { stop_reason: 'tool_use', content: [] }, false],
    ['text only', { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(good) }] }, false],
    ['wrong tool', { stop_reason: 'tool_use', content: [{ ...tool, name: 'other' }] }, false],
    ['duplicate', { stop_reason: 'tool_use', content: [tool, { ...tool, id: 'second' }] }, false],
    ['ambiguous', { stop_reason: 'tool_use', content: [tool, { ...tool, id: 'second', name: 'other' }] }, false],
    ['truncated', { stop_reason: 'max_tokens', content: [tool] }, false],
    ['missing id', { stop_reason: 'tool_use', content: [{ ...tool, id: '' }] }, false],
  ];
  for (const [name, envelope, accepted] of cases) await t.test(name, async () => {
    const { db, tables } = database({ bloque: 'deload', semana: 1, totalSemanas: 1, planningWeekStart: '2026-09-07',
      blockId: 'legacy:fixture', decision: { source: 'canonical_legacy', reason: null, planningRunId: null, previousBlockId: null } });
    const before = plain(tables.usuarios.ciclo_actual);
    const run = () => authority.ensureLongitudinalTarget(db, 'fixture', week, today,
      async () => decisionOutput.readLongitudinalDecisionOutput(envelope), 'run');
    if (accepted) {
      const result = await run();
      assert.equal(result.bloque, good.bloque); assert.equal(result.totalSemanas, 3); assert.equal(db.writes, 1);
    } else {
      await assert.rejects(run(), /LONGITUDINAL_DECISION_INVALID/);
      assert.equal(db.writes, 0); assert.deepEqual(plain(tables.usuarios.ciclo_actual), before);
    }
  });
  assert.deepEqual(plain(decisionOutput.LONGITUDINAL_DECISION_TOOL.input_schema), {
    type: 'object', additionalProperties: false, required: ['bloque', 'totalSemanas', 'reason'],
    properties: { bloque: { type: 'string', enum: ['acumulacion', 'intensificacion', 'realizacion', 'deload'] },
      totalSemanas: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
      reason: { type: 'string', minLength: 1, maxLength: 600 } },
  });
});

async function plan(db, adaptation = 'fuerza_maxima', selectedDays = distribution.box) {
  return load('../planning/prepareAllowedWeeklyPlanContract').planBoundedWeek(db, 'fixture', request, async prompt => {
    const c = JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1]);
    return JSON.stringify({ contractVersion: 1, contextDigest: c.contextDigest, selections: days.map(day => ({ day,
      optionId: (selectedDays.includes(day) ? c.dayOptions[day].find(o => o.intent?.adaptationId === adaptation
        && (adaptation !== 'fuerza_maxima' || o.intent.pattern === 'horizontal_push')) : c.dayOptions[day][0]).optionId,
      decision: { role: 'PRIMARY', reason: 'A controlled Coach choice, not a server sports rule.' } })) });
  }, 'generation');
}
test('objective and persisted metadata derive from signed selected facts and canonical target', async () => {
  const { db } = database(); const p = await plan(db, 'potencia', ['martes']);
  assert.equal(p.ok, true, JSON.stringify(p));
  const calendar = load('../planning/weeklyCalendarAuthority');
  const proof = calendar.verifyWeeklyCalendarReceipt(p.estructura.calendarReceipt, 'fixture', week, true);
  const selected = load('../planning/selectedWeekObjective').selectedWeekStrategy(proof.strategy, proof.admittedSlots, proof.coachingDecisions);
  assert.deepEqual(plain(selected.adaptations.map(a => a.id)), ['potencia']);
  assert.ok(!selected.coverage.some(a => a.adaptationId === 'base_aerobica'));
  assert.equal(calendar.admittedWeekObjective(p.estructura.calendarReceipt, 'fixture', week, 'base_aerobica'), p.estructura.strategy.adaptacion_principal);
  assert.equal(proof.longitudinal.semana, 1); assert.equal(proof.longitudinal.totalSemanas, 1);
});

async function buildWeek() {
  const { db } = database(); const p = await plan(db); assert.equal(p.ok, true, JSON.stringify(p));
  const receipt = p.estructura.calendarReceipt, sessions = [], contexts = [];
  for (const slot of p.estructura.sessions.filter(s => s.state === 'TRAIN')) {
    const r = await load('sessionAuthority').generateTrainingSession(db, 'fixture', { targetWeekStart: week, day: slot.dia, discipline: slot.tipo,
      stimulus: slot.stimulusId, intent: slot.intent, state: slot.state, acceptedCurrentWeek: sessions,
      weekly: { receipt, generationToken: 'generation', optionId: slot.optionId, claims: slot } }, async prompt => {
      const c = JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nIntent canónico:')[0].split('\nContexto no autoritativo:')[0]);
      contexts.push(JSON.parse(prompt.split('\nContexto no autoritativo:\n')[1].split('\nOpciones ejecutables')[0]));
      return JSON.stringify(completeDoseFixture(c, { stimulusId: c.stimulusId, structureId: 'strength_sets',
        blocks: ['warmup', 'main'].map(blockType => ({ blockType, movements: [{ movementId: 'bench_press', prescription: { reps: 5 } }] })) }));
    });
    assert.equal(r.ok, true, JSON.stringify(r)); sessions.push(r.sesion);
  }
  const rows = p.estructura.sessions.map(slot => sessions.find(s => s.dia === slot.dia) ?? load('sessionAuthority').admitSessionContent({ dia: slot.dia, tipo: 'descanso' }, 'fixture', week))
    .map(({ sessionReceipt, ...row }) => row);
  const calendar = load('../planning/weeklyCalendarAuthority');
  const admission = await calendar.assertWeeklyCalendar(db, 'fixture', week, rows, receipt, { requireV2: true, generationToken: 'generation', sessionEvidence: sessions });
  return { db, p, receipt, sessions, contexts, rows, admission };
}

test('four Session Coaches receive accepted siblings and separate planned exposure; forged or omitted memory is rejected', async () => {
  const f = await buildWeek();
  assert.deepEqual(f.contexts.map(c => c.currentWeek.sessions.length), [0, 1, 2, 3]);
  assert.deepEqual(plain(f.contexts[0].sessionHistory), plain(f.contexts[3].sessionHistory));
  for (const [i, context] of f.contexts.entries()) {
    assert.ok(context.currentWeek.sessions.every(s => s.provenance === 'PLANNED_CURRENT_WEEK'));
    assert.equal(context.currentWeek.plannedExposure.byMovement.bench_press?.sessions ?? 0, i);
    assert.ok(context.currentWeek.sessions.every(s => s.movements.every(m => m.canonicalFamily === 'bench_press')));
  }
  const slot = f.p.estructura.sessions.find(s => s.dia === 'jueves');
  for (const previous of [[], [{ ...f.sessions[0], titulo: 'forged' }]]) {
    const r = await load('sessionAuthority').generateTrainingSession(f.db, 'fixture', { targetWeekStart: week, day: slot.dia, discipline: slot.tipo,
      stimulus: slot.stimulusId, intent: slot.intent, acceptedCurrentWeek: previous,
      weekly: { receipt: f.receipt, generationToken: 'generation', optionId: slot.optionId } }, () => { throw Error('must not call model'); });
    assert.equal(r.ok, false);
  }
  const mixed = load('../planning/currentWeekCoachingContext').currentWeekCoachingContext(week, [{ ...f.sessions[0], completada: true }, f.sessions[1]], f.admission.evidence.admittedSlots);
  assert.equal(mixed.plannedExposure.byMovement.bench_press.sessions, 1);
  assert.equal(mixed.sessions[0].provenance, 'HISTORICAL_COMPLETED');
});

test('whole-week: exact repetition is advisory; a single conscious KEEP passes unchanged', async () => {
  const f = await buildWeek(); let calls = 0;
  const r = await load('../planning/enforceWholeWeek').enforceWholeWeek('fixture', week, f.rows, f.sessions, f.receipt, f.admission, async prompt => {
    calls++; assert.match(prompt, /WHOLE_WEEK_COACH_RECONSIDERATION/); assert.match(prompt, /WEEK_EXACT_DUPLICATE/);
    return JSON.stringify({ decision: 'KEEP', rationale: 'Intentional repeated exposure in this fixture.', days: [] });
  });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(calls, 1); assert.equal(r.orchestration.reconsideration.decision, 'KEEP');
  assert.deepEqual(plain(r.sessions), plain(f.rows)); assert.equal(r.repairCount, 0);
});

test('whole-week: REVISE rebuilds only authorized day and revalidates, with no second reconsideration', async () => {
  const f = await buildWeek(); let reviews = 0, builds = 0;
  const r = await load('../planning/enforceWholeWeek').enforceWholeWeek('fixture', week, f.rows, f.sessions, f.receipt, f.admission, async prompt => {
    if (prompt.startsWith('WHOLE_WEEK_COACH_RECONSIDERATION')) { reviews++; return JSON.stringify({ decision: 'REVISE', rationale: 'Adjust the last dose.', days: ['sabado'] }); }
    builds++;
    const c = JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nWEEK_STRATEGY:')[0]);
    const proposal = JSON.parse(prompt.split('REJECTED_PROPOSAL:\n')[1].split('\nWHOLE_WEEK_DIAGNOSTICS:')[0]);
    proposal.blocks.find(b => b.blockType === 'main').movements[0].prescription.reps = 6;
    return JSON.stringify(proposal);
  });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(reviews, 1); assert.equal(builds, 1); assert.equal(r.repairCount, 1);
  assert.equal(r.result.status, 'pass'); assert.deepEqual(plain(r.orchestration.reconsideration.revisedDays), ['sabado']);
  assert.deepEqual(plain(r.sessions.filter(s => s.dia !== 'sabado')), plain(f.rows.filter(s => s.dia !== 'sabado')));
  await load('../planning/weeklyCalendarAuthority').assertWeeklyCalendar(f.db, 'fixture', week, r.sessions, f.receipt,
    { requireV2: true, generationToken: 'generation', sessionEvidence: r.sessionEvidence, wholeWeekReviewed: true });
});

test('whole-week: an invalid advisory revision cannot replace valid sessions or cause a second review', async () => {
  const f = await buildWeek(); let calls = 0;
  const r = await load('../planning/enforceWholeWeek').enforceWholeWeek('fixture', week, f.rows, f.sessions, f.receipt, f.admission, async prompt => {
    calls++;
    return prompt.startsWith('WHOLE_WEEK_COACH_RECONSIDERATION')
      ? JSON.stringify({ decision: 'REVISE', rationale: 'Try a revision.', days: ['sabado'] }) : '{}';
  });
  assert.equal(r.ok, true); assert.equal(calls, 2); assert.equal(r.orchestration.reconsideration.count, 1);
  assert.equal(r.orchestration.reconsideration.decision, 'UNAVAILABLE'); assert.equal(r.repairCount, 0);
  assert.deepEqual(plain(r.sessions), plain(f.rows));
});

test('whole-week: no warnings needs no model; a hard violation still fails', async () => {
  const seam = sportsRuntime({}, (path, exports) => path.endsWith('wholeWeekAdapter.ts') ? { ...exports,
    validateAdmittedWholeWeek: (_w, rows) => ({ status: rows.length ? 'invalid' : 'pass', diagnostics: rows.length
      ? [{ code: 'WEEK_REST_CONTENT', severity: 'ERROR', sessionIds: [], repairability: 'none' }] : [] }) } : exports);
  const proof = { evidence: { coherenceVersion: 1, admittedSlots: [] }, contexts: {} };
  const complete = () => { throw Error('No advisory review is appropriate'); };
  assert.equal((await seam('../planning/enforceWholeWeek').enforceWholeWeek('fixture', week, [], [], 'unused', proof, complete)).ok, true);
  assert.equal((await seam('../planning/enforceWholeWeek').enforceWholeWeek('fixture', week, [{dia:'lunes'}], [], 'unused', proof, complete)).ok, false);
});

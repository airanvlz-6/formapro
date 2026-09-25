import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import { sportsRuntime, plain, equippedProfileFixture, compile } from '../sports/trainingContractTestRuntime.mjs';
const today = '2026-09-22', week = '2026-09-21';
class Clock extends Date { constructor(...a) { super(...(a.length ? a : [today+'T12:00:00Z'])); } static now() { return Date.parse(today+'T12:00:00Z'); } }
const load = sportsRuntime({ Date: Clock, Error, console: { info(){},warn(){},log(){} } });
const loop = load('../chat/coachFirstLoop'), store = load('../chat/coachFirstStore');
const availability = load('chatAvailability'), tools = load('../chat/coachFirstTools');
const days = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const turnIntentFixture = { version: 1, purpose: 'reintroduction', approach: 'conservative',
  volumeIntent: 'unspecified', intensityIntent: 'unspecified' };
function database() {
  const db = { writes: [], reads: [], conflict: false, uncertain: false, tables: {
    usuarios: [{codigo:'u',modo_entrada:'coach',categoria:'box',especialidad:'crossfit',objetivo_principal:'crossfit',
      perfil:{...equippedProfileFixture(),dias:'4'},distribucion_semanal:{box:['martes','jueves'],carrera:['lunes','miercoles','viernes','domingo']},
      workout_history:[], ciclo_actual:{bloque:'acumulacion',semana:1,totalSemanas:4,planningWeekStart:week}}],
    athlete_training_sources:[{user_codigo:'u',disciplina:'box',owner:'forge',activo:true,dias:['martes','jueves']},
      {user_codigo:'u',disciplina:'carrera',owner:'forge',activo:true,dias:['lunes','miercoles','viernes','domingo']}],
    weekly_plan:[{id:'plan',user_codigo:'u',week_start:week,revision:1, sessions:days.map((dia,i)=>({dia,tipo:i===1?'box':'descanso',
      titulo:'Sesión',descripcion:'Trabajo planificado',por_que:'Objetivo',session_id:`00000000-0000-4000-8000-00000000000${i}`,completada:false}))}],
    athlete_state_events:[], athlete_coaching_notes:[],
  }, from(table) {
    db.reads.push(table); const filters=[]; let patch, one=false, limit=Infinity, ordering;
    const q={select(){return q;},eq(k,v){filters.push(r=>typeof r[k]==='object'&&typeof v==='string'?JSON.stringify(r[k])===v:r[k]===v);return q;},
      is(k,v){filters.push(r=>v===null?r[k]==null:r[k]===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},
      gte(k,v){filters.push(r=>r[k]>=v);return q;},lte(k,v){filters.push(r=>r[k]<=v);return q;},lt(k,v){filters.push(r=>r[k]<v);return q;},
      or(){return q;},order(field,options){ordering={field,...options};return q;},range(){return q;},limit(n){limit=n;return q;},
      single(){one=true;return q;},maybeSingle(){one=true;return q;},update(value){patch=value;return q;},
      then(resolve,reject){try{let rows=(db.tables[table]??[]).filter(r=>filters.every(f=>f(r)));
        if(ordering)rows.sort((a,b)=>String(a[ordering.field]).localeCompare(String(b[ordering.field]))*(ordering.ascending?1:-1));
        rows=rows.slice(0,limit);
        if(patch){ if(db.conflict)rows=[]; else {db.writes.push({table,patch:plain(patch)});rows.forEach(r=>Object.assign(r,plain(patch)));}
          if(db.uncertain)throw Error('transport'); }
        return Promise.resolve({data:plain(one?rows[0]??null:rows),error:null}).then(resolve,reject);
      }catch(e){return Promise.reject(e).then(resolve,reject);}}};return q;
  }};return db;
}
const input = message => ({message,messageId:'message-0001',timestamp:today+'T12:00:00Z',timezone:'Atlantic/Canary',conversation:[]});
const dispatchFor = (db,i=input('reporte')) => tools.coachFirstTools(db,'u',i,'turn',async()=>({status:'rejected'}),()=>{});
async function generationReadArgs(dispatch, targetWeek = week) {
  const availability = await dispatch({ name: 'read_context', arguments: { resource: 'availability', week: targetWeek } }, 1);
  await dispatch({ name: 'read_context', arguments: { resource: 'planning', week: targetWeek } }, 2);
  assert.equal(availability.data.ok, true);
  return { availabilityReadId: availability.availabilityReadId, includeToday: false, snapshotDigest: availability.data.snapshotDigest };
}

test('server temporal projection uses civil timezone across week, month, year and DST boundaries', () => {
  for (const [timestamp, timezone, today, weekday, currentWeekStart, nextWeekStart, tomorrow] of [
    ['2026-09-24T12:00:00Z', 'Atlantic/Canary', '2026-09-24', 'jueves', '2026-09-21', '2026-09-28', '2026-09-25'],
    ['2026-09-27T22:59:59Z', 'Atlantic/Canary', '2026-09-27', 'domingo', '2026-09-21', '2026-09-28', '2026-09-28'],
    ['2026-09-27T23:00:00Z', 'Atlantic/Canary', '2026-09-28', 'lunes', '2026-09-28', '2026-10-05', '2026-09-29'],
    ['2026-09-30T23:00:00Z', 'Atlantic/Canary', '2026-10-01', 'jueves', '2026-09-28', '2026-10-05', '2026-10-02'],
    ['2026-12-31T23:59:59Z', 'Atlantic/Canary', '2026-12-31', 'jueves', '2026-12-28', '2027-01-04', '2027-01-01'],
    ['2027-01-01T00:00:00Z', 'Atlantic/Canary', '2027-01-01', 'viernes', '2026-12-28', '2027-01-04', '2027-01-02'],
    ['2026-10-25T01:30:00Z', 'Atlantic/Canary', '2026-10-25', 'domingo', '2026-10-19', '2026-10-26', '2026-10-26'],
    ['2026-09-28T00:30:00Z', 'America/New_York', '2026-09-27', 'domingo', '2026-09-21', '2026-09-28', '2026-09-28'],
  ]) {
    const actual = plain(loop.coachFirstTemporalContext({ timestamp, timezone }));
    assert.deepEqual({ ...actual, currentWeekDays: undefined },
      { today, weekday, timezone, currentWeekStart, nextWeekStart, tomorrow, currentWeekDays: undefined });
    assert.equal(actual.currentWeekDays.length, 7);
    assert.deepEqual(actual.currentWeekDays[0], { date: currentWeekStart, weekday: 'lunes' });
    assert.equal(actual.currentWeekDays[6].weekday, 'domingo');
  }
});

test('Thursday server envelope supports current reads and read-bound generation without calendar inference', async () => {
  class ThursdayClock extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-09-24T12:00:00Z'])); }
    static now() { return Date.parse('2026-09-24T12:00:00Z'); }
  }
  const runtime = sportsRuntime({ Date: ThursdayClock, Error, console: { info(){}, warn(){}, log(){} } });
  const currentLoop = runtime('../chat/coachFirstLoop'), currentTools = runtime('../chat/coachFirstTools');
  const request = { ...input('desde mañana viernes hasta final de esta semana'), timestamp: new ThursdayClock().toISOString(),
    conversation: [{ role: 'assistant', content: 'Viernes 26, sábado 27, domingo 28' }] };
  const db = database(), generated = [], observations = [];
  const dispatch = currentTools.coachFirstTools(db, 'u', request, 'turn', async args => {
    generated.push(plain(args)); return { status: 'committed' };
  }, event => observations.push(event));
  let round = 0, temporal, digest;
  const result = await currentLoop.runCoachFirstLoop(request, { dispatch, complete: async messages => {
    const envelope = JSON.parse(messages[1].content);
    if (round++ === 0) {
      temporal = envelope.metadata.temporal;
      assert.deepEqual({ ...temporal, currentWeekDays: undefined }, { today: '2026-09-24', weekday: 'jueves',
        timezone: 'Atlantic/Canary', currentWeekStart: week, nextWeekStart: '2026-09-28', tomorrow: '2026-09-25', currentWeekDays: undefined });
      assert.deepEqual(temporal.currentWeekDays.slice(4), [
        { date: '2026-09-25', weekday: 'viernes' }, { date: '2026-09-26', weekday: 'sábado' }, { date: '2026-09-27', weekday: 'domingo' }]);
      return { answer: null, calls: ['availability', 'planning'].map(resource =>
        ({ name: 'read_context', arguments: { resource, week: temporal.currentWeekStart } })) };
    }
    assert.deepEqual(envelope.metadata.temporal, temporal);
    if (round === 2) {
      const reads = messages.slice(-2).map(m => JSON.parse(m.content).toolResult);
      for (const read of reads) { assert.equal(read.status, 'read'); assert.equal(read.coverage.week, week); }
      digest = reads[0].data.snapshotDigest;
      return { answer: null, calls: [{ name: 'generate_week', arguments: {
        availabilityReadId: reads[0].availabilityReadId, includeToday: false, snapshotDigest: digest } }] };
    }
    return { answer: 'Plan confirmado', calls: [] };
  } });
  assert.equal(result.ok, true);
  assert.deepEqual(generated, [{ week, includeToday: false, snapshotDigest: digest }]);
  assert.equal(db.writes.length, 0);
  for (const resource of ['availability', 'planning']) {
    assert.equal((await dispatch({ name: 'read_context', arguments: { resource } }, 4)).status, 'read');
    assert.equal((await dispatch({ name: 'read_context', arguments: { resource, week: '2028-09-25' } }, 5)).status, 'rejected');
    assert.equal(observations.at(-1).failureReason, 'WEEK_OUT_OF_RANGE');
  }
  assert.ok(currentLoop.COACH_FIRST_INSTRUCTION.includes('metadata.temporal is computed by the server once'));
  assert.ok(currentLoop.COACH_FIRST_INSTRUCTION.includes('must agree with currentWeekDays'));
});

test('generation selects a same-turn availability read, never a supplied week or digest alone', async t => {
  const request = { ...input('Desde mañana viernes'), timestamp: '2026-09-24T12:00:00Z' };
  for (const target of [week, '2026-09-28']) await t.test('same digest, selected target ' + target, async () => {
    const db = database(), calls = [];
    const dispatch = tools.coachFirstTools(db, 'u', request, 'turn', async args => {
      calls.push(plain(args)); return { status: 'committed' };
    }, () => {});
    const a = await dispatch({ name: 'read_context', arguments: { resource: 'availability' } }, 1);
    const b = await dispatch({ name: 'read_context', arguments: { resource: 'availability', week: '2026-09-28' } }, 2);
    assert.equal(a.coverage.week, week); assert.equal(a.data.snapshotDigest, b.data.snapshotDigest);
    assert.notEqual(a.availabilityReadId, b.availabilityReadId);
    await dispatch({ name: 'read_context', arguments: { resource: 'planning', week: target } }, 3);
    const selected = target === week ? a : b;
    const result = await dispatch({ name: 'generate_week', arguments: {
      availabilityReadId: selected.availabilityReadId, includeToday: false, snapshotDigest: selected.data.snapshotDigest,
    } }, 4);
    assert.equal(result.status, 'committed');
    assert.deepEqual(calls, [{ week: target, includeToday: false, snapshotDigest: selected.data.snapshotDigest }]);
    assert.equal(db.writes.length, 0);
  });
  const cases = [
    ['unknown reference', a => ({ ...a, availabilityReadId: 'unknown' }), 'GENERATION_AVAILABILITY_READ_REQUIRED'],
    ['other turn', a => ({ ...a, availabilityReadId: 'other-turn:1' }), 'GENERATION_AVAILABILITY_READ_REQUIRED'],
    ['planning reference', a => ({ ...a, availabilityReadId: 'turn:2' }), 'GENERATION_AVAILABILITY_READ_REQUIRED'],
    ['invalid type', a => ({ ...a, availabilityReadId: null }), 'GENERATION_READ_ARGUMENT_INVALID'],
    ['missing reference', ({ availabilityReadId, ...a }) => a, 'GENERATION_READ_ARGUMENT_INVALID'],
    ['week forbidden', a => ({ ...a, week }), 'GENERATION_READ_ARGUMENT_INVALID'],
    ['digest mismatch', a => ({ ...a, snapshotDigest: 'private-wrong-digest' }), 'GENERATION_READ_DIGEST_MISMATCH'],
    ['different planning week', a => a, 'GENERATION_PLANNING_READ_REQUIRED'],
    ['invalidated', a => a, 'GENERATION_AVAILABILITY_READ_REQUIRED'],
    ['failed availability', a => a, 'GENERATION_AVAILABILITY_READ_REQUIRED'],
  ];
  for (const [name, change, code] of cases) await t.test(name, async () => {
    const db = database(), observations = []; let calls = 0;
    if (name === 'failed availability') db.tables.usuarios[0].modo_entrada = 'supervision';
    const dispatch = tools.coachFirstTools(db, 'u', request, 'turn', async () => { calls++; return { status: 'committed' }; }, e => observations.push(e));
    const a = await dispatch({ name: 'read_context', arguments: { resource: 'availability' } }, 1);
    await dispatch({ name: 'read_context', arguments: { resource: 'planning', week: name === 'different planning week' ? '2026-09-28' : week } }, 2);
    if (name === 'invalidated') await dispatch({ name: 'transition_restriction', arguments: {} }, 3);
    const args = change({ availabilityReadId: a.availabilityReadId ?? 'turn:1', includeToday: false, snapshotDigest: a.data.snapshotDigest ?? 'missing' });
    const result = await dispatch({ name: 'generate_week', arguments: args }, 4);
    assert.equal(result.status, 'rejected'); assert.equal(result.code, code);
    assert.equal(calls, 0); assert.equal(db.writes.length, 0);
    assert.equal(observations.at(-1).failureCode, code);
    assert.ok(!JSON.stringify(observations).includes('private-wrong-digest'));
  });
});

test('read references remain local and existing generation revalidates stale availability', async () => {
  const db = database(), generation = load('../chat/coachFirstGeneration'); let calls = 0;
  const dispatch = tools.coachFirstTools(db, 'u', input('request'), 'turn', (a, id, diagnostic) =>
    generation.generateCoachFirstWeek(db, 'u', a, id, today, async () => { calls++; throw Error('must not reach Analyzer'); }, diagnostic), () => {});
  const args = await generationReadArgs(dispatch);
  const otherTurn = tools.coachFirstTools(db, 'u', input('request'), 'other', async () => { throw Error('must not run'); }, () => {});
  assert.equal((await otherTurn({ name: 'generate_week', arguments: args }, 1)).code, 'GENERATION_AVAILABILITY_READ_REQUIRED');
  db.tables.athlete_training_sources[0].dias = ['viernes'];
  const result = await dispatch({ name: 'generate_week', arguments: args }, 3);
  assert.equal(result.status, 'conflict'); assert.equal(result.code, 'GENERATION_AVAILABILITY_CHANGED');
  assert.equal(calls, 0); assert.equal(db.writes.length, 0);
});

test('generation argument reasons preserve all predicates, short-circuit order and public results', async t => {
  const generation = load('../chat/coachFirstGeneration');
  const secret = 'PRIVATE_ARGUMENT_KEY_MESSAGE_DIGEST_PAYLOAD';
  const stop = () => { throw Error('later predicate must not be evaluated'); };
  const fixtures = [
    ...[undefined, null, false, 0, ''].map(a => ({ name: `falsy ${String(a)}`, a, reason: 'ARGUMENTS_FALSY' })),
    { name: 'unknown key first', a: { [secret]: secret, get week() { return stop(); } }, reason: 'UNKNOWN_ARGUMENT_KEY' },
    { name: 'week before boolean', a: { week: '2026-09-25', get includeToday() { return stop(); } }, reason: 'WEEK_RESOLUTION_MISMATCH' },
    { name: 'boolean before digest', a: { week, includeToday: secret, get snapshotDigest() { return stop(); } }, reason: 'INCLUDE_TODAY_NOT_BOOLEAN' },
    { name: 'digest type', a: { week, includeToday: false, snapshotDigest: { private: secret } }, reason: 'SNAPSHOT_DIGEST_NOT_STRING' },
    { name: 'absent week still reaches boolean', a: { includeToday: secret }, reason: 'INCLUDE_TODAY_NOT_BOOLEAN' },
    { name: 'absent week still reaches digest', a: { includeToday: false }, reason: 'SNAPSHOT_DIGEST_NOT_STRING' },
  ];
  const expected = { status: 'rejected', code: 'GENERATION_ARGUMENT_INVALID' };
  // Execute the actual receipt projection, so an internal reason cannot silently enter the journal.
  const source = readFileSync(new URL('./coachFirstHandler.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('handler.ts', source, ts.ScriptTarget.Latest, true);
  let receiptExpression;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'receipts.push') receiptExpression = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(receiptExpression);
  const receipt = r => {
    const receipts = [];
    vm.runInNewContext(compile(receiptExpression), { receipts, r, call: { name: 'generate_week' } });
    return plain(receipts);
  };
  for (const fixture of fixtures) await t.test(fixture.name, async () => {
    const db = { from: stop }, reasons = [], observations = [];
    const baseline = await generation.generateCoachFirstWeek(db, 'u', fixture.a, 'turn:1', today, stop);
    const diagnosed = await generation.generateCoachFirstWeek(db, 'u', fixture.a, 'turn:1', today, stop, reason => reasons.push(reason));
    assert.deepEqual(plain(baseline), expected); assert.deepEqual(plain(diagnosed), expected);
    assert.deepEqual(reasons, [fixture.reason]);
    assert.deepEqual(plain(await generation.generateCoachFirstWeek(db, 'u', fixture.a, 'turn:1', today, stop, stop)), expected);
    // Inject downstream validation failures to retain coverage of the internal diagnostic channel.
    const dispatch = tools.coachFirstTools(database(), 'u', input(secret), 'turn',
      (_a, id, diagnostic) => generation.generateCoachFirstWeek(db, 'u', fixture.a, id, today, stop, diagnostic), e => observations.push(e));
    const args = await generationReadArgs(dispatch); observations.length = 0;
    const result = await dispatch({ name: 'generate_week', arguments: args }, 3);
    assert.deepEqual(plain(result), { ...expected, operationId: 'turn:3' });
    assert.deepEqual(receipt(result), receipt({ ...baseline, operationId: 'turn:3' }));
    assert.equal(Object.hasOwn(result, 'requirements'), false);
    assert.deepEqual(plain(observations), [{ route: 'coach_first', policy: 'normal', tool: 'generate_week',
      authority: 'weekly_generation_authorities', status: 'rejected', operationId: 'turn:3',
      failureCode: expected.code, failureStage: 'validation', failureReason: fixture.reason }]);
    for (const forbidden of [secret, week, '2026-09-25', 'arguments', 'requirements', 'payload', 'snapshotDigest', 'message'])
      assert.ok(!JSON.stringify(observations).includes(forbidden), forbidden);
  });
  // Preserve the existing undefined !== undefined peculiarity: omitted week passes this validator.
  let reads = 0;
  const reasons = [];
  const result = await generation.generateCoachFirstWeek({ from() { reads++; throw Error('synthetic unavailable DB'); } },
    'u', { includeToday: false, snapshotDigest: secret }, 'turn:1', today, stop, reason => reasons.push(reason));
  assert.ok(reads > 0); assert.deepEqual(reasons, []);
  assert.deepEqual(plain(result), { status: 'conflict', code: 'GENERATION_AVAILABILITY_CHANGED' });
});

test('generate_week rejection diagnostics are allowlisted and preserve the functional result', async t => {
  const secret = 'PRIVATE_ARGUMENT_REQUIREMENTS_ERRORS_MESSAGE_PROMPT_SESSION_TOKEN';
  const cases = [
    { name: 'argument validation', result: { status: 'rejected', code: 'GENERATION_ARGUMENT_INVALID' },
      code: 'GENERATION_ARGUMENT_INVALID', stage: 'validation' },
    { name: 'target validation', result: { status: 'rejected', code: 'GENERATION_WEEK_INVALID' },
      code: 'GENERATION_WEEK_INVALID', stage: 'target_validation' },
    { name: 'known preflight', result: { status: 'rejected', requirements: {
      code: 'WEEKLY_REGENERATION_NO_OP', reason: 'NO_REMAINING_MANAGED_DAYS', payload: secret } },
      code: 'WEEKLY_REGENERATION_NO_OP', stage: 'preflight', reason: 'NO_REMAINING_MANAGED_DAYS' },
    { name: 'allowlisted error only', result: { status: 'rejected', requirements: {
      code: 'WEEKLY_CONTEXT_INVALID', errors: [secret, 'FUTURE_COMPLETION_NOT_ALLOWED'], message: secret, stack: secret } },
      code: 'WEEKLY_CONTEXT_INVALID', stage: 'preflight', reason: 'FUTURE_COMPLETION_NOT_ALLOWED' },
    { name: 'unknown reason', result: { status: 'rejected', requirements: {
      code: 'GOAL_MISSING', reason: secret, errors: [secret], error: { message: secret } } },
      code: 'GOAL_MISSING', stage: 'preflight' },
    { name: 'known read stage', result: { status: 'rejected', requirements: {
      code: 'PRESCRIPTION_CONTEXT_READ_FAILED:usuarios', reason: secret } },
      code: 'PRESCRIPTION_CONTEXT_READ_FAILED:usuarios', stage: 'preflight' },
    ...[secret, 'CALENDAR_SCOPE_INVALID:' + secret, 'PRESCRIPTION_CONTEXT_READ_FAILED:private_table',
      'toString', null].map(code => ({ name: 'unknown preflight ' + code,
      result: { status: 'rejected', requirements: { code, reason: 'NO_REMAINING_MANAGED_DAYS', errors: [secret] } },
      code: 'UNCLASSIFIED_PREFLIGHT_REJECTION', stage: 'preflight' })),
    { name: 'missing diagnostic', result: { status: 'rejected' }, code: 'UNCLASSIFIED_PREFLIGHT_REJECTION', stage: 'preflight' },
  ];
  for (const fixture of cases) await t.test(fixture.name, async () => {
    const observations = [], db = database(), before = plain(fixture.result);
    if (fixture.result.requirements) Object.freeze(fixture.result.requirements);
    Object.freeze(fixture.result);
    let args;
    const dispatch = tools.coachFirstTools(db, 'u', input(secret), 'turn', async (received, operationId) => {
      assert.deepEqual(plain(received), { week, includeToday: false, snapshotDigest: args.snapshotDigest });
      assert.equal(operationId, 'turn:3'); return fixture.result;
    }, e => observations.push(e));
    args = await generationReadArgs(dispatch); observations.length = 0;
    const result = await dispatch({ name: 'generate_week', arguments: args }, 3);
    // Existing dispatcher semantics: copy generation result and append the same operationId.
    assert.deepEqual(plain(result), { ...before, operationId: 'turn:3' });
    assert.equal(result.requirements, fixture.result.requirements);
    assert.deepEqual(plain(fixture.result), before);
    assert.deepEqual(plain(observations), [{ route: 'coach_first', policy: 'normal', tool: 'generate_week',
      authority: 'weekly_generation_authorities', status: 'rejected', operationId: 'turn:3',
      failureCode: fixture.code, failureStage: fixture.stage, ...(fixture.reason ? { failureReason: fixture.reason } : {}) }]);
    const logged = JSON.stringify(observations);
    for (const forbidden of [secret, 'arguments', 'requirements', 'errors', 'message', 'stack', 'payload'])
      assert.ok(!logged.includes(forbidden), forbidden);
    assert.equal(db.writes.length, 0);
  });
});

test('Planner partial diagnostics use closed structured causes without changing results or receipts', async t => {
  const secret = 'PRIVATE_PROMPT_SESSION_RESTRICTION_MESSAGE_STACK';
  const fixtures = [
    ...['WEEKLY_CONTEXT_INVALID', 'WEEKLY_CONTRACT_UNSATISFIABLE', 'STRATEGY_PROPOSAL_INVALID']
      .map(code => [{ ok: false, code, errors: [secret] }, code]),
    ...['EXISTING_DAYS_INVALID', 'FUTURE_COMPLETION_NOT_ALLOWED'].map(reason =>
      [{ ok: false, code: 'WEEKLY_CONTEXT_INVALID', errors: [secret, reason] }, reason]),
    ...['EXTERNAL_DAY_AMBIGUOUS', 'EXTERNAL_PROTECTED_CONFLICT', 'PROTECTED_RECOVERY_UNRESOLVED',
      'PROTECTED_RECOVERY_INFEASIBLE'].map(reason =>
      [{ ok: false, code: 'WEEKLY_CONTRACT_UNSATISFIABLE', errors: [secret, reason] }, reason]),
    ...['LONGITUDINAL_TARGET_UNRESOLVED', 'LONGITUDINAL_READ_FAILED', 'LONGITUDINAL_TARGET_INVALID',
      'LONGITUDINAL_ANCHOR_READ_FAILED', 'LONGITUDINAL_LEGACY_POSITION_AMBIGUOUS', 'LONGITUDINAL_DECISION_INVALID']
      .map(code => [{ ok: false, code }, 'LONGITUDINAL_TARGET_FAILED']),
    ...[undefined, {}, { weeklyContractVersion: 1 }, { weeklyContractVersion: '2' }]
      .map(estructura => [{ ok: true, estructura }, 'WEEKLY_CONTRACT_VERSION_INVALID']),
    // A failed Planner without a valid version is not evidence of a version failure.
    ...[undefined, null, {}, { ok: false }, { ok: true, estructura: { weeklyContractVersion: 2 } },
      { ok: false, code: secret, errors: ['EXTERNAL_DAY_AMBIGUOUS'] },
      { ok: false, code: 'LONGITUDINAL_PRIVATE_FAILURE' },
      { ok: false, code: 'LONGITUDINAL_READ_FAILED:' + secret },
      { ok: false, message: 'STRATEGY_PROPOSAL_INVALID', error: 'LONGITUDINAL_READ_FAILED' },
      { ok: false, code: 'toString' }].map(p => [p, 'UNKNOWN_PLANNER_REJECTION']),
    [{ ok: false, code: 'WEEKLY_CONTEXT_INVALID', errors: ['EXISTING_DAYS_INVALID:' + secret] }, 'WEEKLY_CONTEXT_INVALID'],
    [{ ok: false, code: 'WEEKLY_CONTEXT_INVALID', errors: ['EXTERNAL_DAY_AMBIGUOUS'] }, 'WEEKLY_CONTEXT_INVALID'],
    [{ ok: false, code: 'WEEKLY_CONTEXT_INVALID', errors: ['FUTURE_COMPLETION_NOT_ALLOWED', 'EXISTING_DAYS_INVALID'] }, 'EXISTING_DAYS_INVALID'],
  ];
  const ast = ts.createSourceFile('handler.ts', readFileSync(new URL('./coachFirstHandler.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  let receiptExpression;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'receipts.push') receiptExpression = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(receiptExpression);
  const receipt = r => {
    const receipts = [];
    vm.runInNewContext(compile(receiptExpression), { receipts, r, call: { name: 'generate_week' } });
    return plain(receipts);
  };
  for (const [index, [planner, reason]] of fixtures.entries()) await t.test(index + ': ' + reason, async () => {
    if (planner) { Object.assign(planner, { payload: secret, message: secret, stack: secret }); Object.freeze(planner); }
    const response = Object.freeze({ status: 'partial', code: 'PLANNER_NOT_ADMITTED', requirements: planner });
    const observations = [], db = database(); let calls = 0;
    const dispatch = tools.coachFirstTools(db, 'u', input(secret), 'turn', async () => { calls++; return response; }, e => observations.push(e));
    const args = await generationReadArgs(dispatch); observations.length = 0;
    const result = await dispatch({ name: 'generate_week', arguments: args }, 3);
    const expected = { ...response, operationId: 'turn:3' };
    assert.deepEqual(plain(result), plain(expected));
    assert.equal(result.requirements, planner);
    assert.deepEqual(receipt(result), receipt(expected));
    assert.equal(calls, 1); assert.equal(db.writes.length, 0);
    assert.deepEqual(plain(observations), [{ route: 'coach_first', policy: 'normal', tool: 'generate_week',
      authority: 'weekly_generation_authorities', status: 'partial', operationId: 'turn:3',
      failureCode: 'PLANNER_NOT_ADMITTED', failureReason: reason }]);
    for (const value of [secret, week, args.snapshotDigest, 'requirements', 'errors', 'payload', 'message', 'stack'])
      assert.ok(!JSON.stringify(observations).includes(value), value);
  });
});

test('generate_week diagnostics do not apply to other statuses or policy rejections', async () => {
  for (const status of ['committed', 'partial', 'unknown', 'conflict']) {
    const observations = [], response = { status, code: 'GENERATION_ARGUMENT_INVALID' };
    const dispatch = tools.coachFirstTools(database(), 'u', input('request'), 'turn', async () => response, e => observations.push(e));
    const args = await generationReadArgs(dispatch); observations.length = 0;
    assert.deepEqual(plain(await dispatch({ name: 'generate_week', arguments: args }, 3)), { ...response, operationId: 'turn:3' });
    assert.ok(!('failureCode' in observations[0]));
  }
  const observations = [];
  const dispatch = tools.coachFirstTools(database(), 'u', input('request'), 'turn', async () => {
    throw Error('generation must not run');
  }, e => observations.push(e), 'read_only');
  const result = await dispatch({ name: 'generate_week', arguments: {} }, 1);
  assert.equal(result.code, 'COACH_FIRST_READ_ONLY');
  assert.ok(!('failureCode' in observations[0]));
});

test('read failures log only allowlisted diagnostics while preserving the exact Coach result',async t=>{
  const secret='PRIVATE_USER_PLAN_PROFILE_SQL_TOKEN_STACK';
  const cases=[
    {name:'arguments',args:{extra:secret},code:'READ_INVALID',stage:'validation'},
    {name:'range',args:{date:'1900-01-01'},code:'READ_RANGE_INVALID',stage:'validation',reason:'DATE_OUT_OF_RANGE'},
    {name:'limit',args:{limit:61},code:'READ_LIMIT_INVALID',stage:'validation'},
    {name:'size',args:{resource:'reported_events'},setup(db){db.tables.usuarios[0].perfil.reported_events=[{description:secret.repeat(5000)}];},
      code:'READ_SIZE_LIMIT',stage:'read_result'},
    {name:'propagated prescription table failure',setup(db){db.from=()=>{throw new Error('PRESCRIPTION_CONTEXT_READ_FAILED:session_modification_events');};
    },code:'PRESCRIPTION_CONTEXT_READ_FAILED',stage:'session_modification_events'},
    {name:'longitudinal read failure',setup(db){
      const from=db.from.bind(db);
      db.from=table=>{
        const q=from(table);
        if(table==='usuarios')q.then=(resolve,reject)=>Promise.resolve({data:null,error:{message:secret,code:secret}}).then(resolve,reject);
        return q;
      };
    },code:'LONGITUDINAL_READ_FAILED',stage:'planning_loader'},
    {name:'profile',args:{resource:'reported_events'},setup(db){db.tables.usuarios[0].perfil=secret;},code:'COACH_FIRST_PROFILE_UNAVAILABLE',stage:'profile'},
    {name:'reported events',args:{resource:'reported_events'},setup(db){db.tables.usuarios[0].perfil.reported_events={secret};},code:'REPORTED_EVENTS_INVALID',stage:'reported_events'},
    {name:'canonical read',args:{resource:'week'},setup(db){db.from=()=>{throw new Error(secret);};},
      code:'UNEXPECTED_READ_ERROR',stage:'canonical_read'},
    ...[new Error(secret),new Error('PRESCRIPTION_CONTEXT_READ_FAILED:'+secret),
      new Error('READ_SIZE_LIMIT '+secret),{message:secret,code:'READ_SIZE_LIMIT',stack:secret},
      {get message(){throw new Error(secret);}},null,secret].map((error,index)=>({
        name:'unexpected planning error '+index,setup(db){db.from=()=>{throw error;};},
        code:'UNEXPECTED_READ_ERROR',stage:'planning_loader',
      })),
    {name:'unexpected profile error',args:{resource:'reported_events'},setup(db){
      const from=db.from.bind(db);
      db.from=table=>{const q=from(table),select=q.select;
        q.select=(fields,...rest)=>{if(table==='usuarios'&&fields==='perfil')throw new Error(secret);return select(fields,...rest);};return q;};
    },code:'UNEXPECTED_READ_ERROR',stage:'canonical_read'},
  ];
  for(const fixture of cases)await t.test(fixture.name,async()=>{
    for(const policy of ['normal','read_only']){
      const db=database(),observations=[];fixture.setup?.(db);
      const dispatch=tools.coachFirstTools(db,'u',input(secret),'turn',()=>{throw Error('unexpected generation');},e=>observations.push(e),policy);
      const args={resource:'planning',...fixture.args};
      const result=await dispatch({name:'read_context',arguments:args},1);
      assert.deepEqual(plain(result),{status:'rejected',code:'TOOL_UNAVAILABLE'});
      assert.deepEqual(plain(observations),[{route:'coach_first',policy,tool:'read_context',authority:'canonical_read_projection',
        status:'rejected',operationId:'turn:1',resource:args.resource,failureCode:fixture.code,failureStage:fixture.stage,
        ...(fixture.reason?{failureReason:fixture.reason}:{})}]);
      assert.ok(!JSON.stringify(observations).includes(secret));
      assert.ok(!JSON.stringify(observations).includes('errorMessage'));
      assert.ok(!JSON.stringify(observations).includes('stack'));
      assert.equal(db.writes.length,0);
    }
  });
});

test('successful planning read has no failure diagnostics and no previous failure leaks to the next call',async()=>{
  const db=database(),observations=[];
  const dispatch=tools.coachFirstTools(db,'u',input('consulta'),'turn',()=>{throw Error('unexpected generation');},e=>observations.push(e));
  await dispatch({name:'read_context',arguments:{resource:'planning',limit:61}},1);
  const result=await dispatch({name:'read_context',arguments:{resource:'planning'}},2);
  assert.equal(result.status,'read');assert.equal(result.data.position.value.bloque,'acumulacion');
  assert.ok(!('failureCode' in result));assert.ok(!('failureStage' in result));
  assert.deepEqual(plain(observations[1]),{route:'coach_first',policy:'normal',tool:'read_context',authority:'canonical_read_projection',
    status:'read',operationId:'turn:2',resource:'planning'});
  assert.equal(db.writes.length,0);
});

function planningFixture() {
  const db=database();
  Object.assign(db.tables.usuarios[0].ciclo_actual,{blockId:'current-block',objetivo:'Desarrollar continuidad',
    decision:{source:'longitudinal_coach',reason:'Decisión guardada',targetWeekStart:week,decidedAt:week,previousBlockId:'previous-block'},
    positions:[{weekStart:'2026-09-14',bloque:'intensificacion',semana:4,totalSemanas:4,blockId:'previous-block',
      decision:{source:'canonical_legacy',anchoredAt:'2026-09-14'}}]});
  db.tables.block_outcomes=[
    {user_codigo:'u',fecha_fin:'2026-09-13',tipo_bloque:'acumulacion',resultado_global:'bueno'},
    {user_codigo:'u',fecha_fin:'2026-09-20',tipo_bloque:'intensificacion',resultado_global:'regular',adherencia:75,sesiones_completadas:12,lesiones:false},
    {user_codigo:'u',fecha_fin:'2026-09-27',tipo_bloque:'future'},
    {user_codigo:'other',fecha_fin:today,tipo_bloque:'foreign'},
  ];
  return db;
}

test('planning reads current and historical canonical positions, provenance and dated recorded outcomes',async()=>{
  const authority=load('../planning/longitudinalAuthority');
  for(const args of [{},{date:'2026-09-16'},{week:'2026-09-14'},{date:'2026-09-16',week}]){
    const db=planningFixture(),before=plain(db.tables),r=await dispatchFor(db)({name:'read_context',arguments:{resource:'planning',...args}},1);
    const date=args.date??args.week??today,target=date===today?week:'2026-09-14';
    const canonical=authority.longitudinalProjection(db.tables.usuarios[0].ciclo_actual,target);
    assert.equal(r.status,'read');assert.equal(r.coverage.date,date);assert.equal(r.coverage.week,target);
    assert.equal(r.data.asOfDate,date);assert.equal(r.data.targetWeekStart,target);
    assert.equal(r.data.position.status,'available');
    for(const key of ['weekStart','blockId','bloque','semana','totalSemanas'])assert.equal(r.data.position.value[key],canonical[key]);
    assert.equal(r.data.position.source,canonical.source);
    assert.equal(r.data.position.value.decision.source,canonical.decision.source);
    assert.equal(r.data.storedCycle.value.blockId,'current-block');
    assert.equal(r.data.storedCycle.value.objetivo,'Desarrollar continuidad');
    assert.equal(r.data.storedCycle.semantics,'CURRENT_STORED_STATE_NOT_HISTORICAL_SNAPSHOT');
    assert.equal(r.data.latestRecordedOutcome.status,'available');
    assert.equal(r.data.latestRecordedOutcome.value.fecha_fin,date===today?'2026-09-20':'2026-09-13');
    assert.deepEqual(plain(r.data.transition),{status:'unknown',reason:'not_exposed'});
    assert.deepEqual(plain(db.tables),before);assert.equal(db.writes.length,0);
    assert.deepEqual(db.reads,['usuarios','block_outcomes']);
  }
});

test('planning separates absent position/outcome from unavailable outcome storage without inferring completion',async()=>{
  for(const scenario of ['no-outcome','no-position','no-cycle','outcome-unavailable']){
    const db=planningFixture();
    if(scenario==='no-outcome')db.tables.block_outcomes=[];
    if(scenario==='no-cycle')db.tables.usuarios[0].ciclo_actual=null;
    if(scenario==='outcome-unavailable'){
      const from=db.from.bind(db);db.from=table=>{if(table==='block_outcomes')throw Error('storage unavailable');return from(table);};
    }
    const date=scenario==='no-position'?'2026-09-07':today;
    const r=await dispatchFor(db)({name:'read_context',arguments:{resource:'planning',date}},1);
    assert.equal(r.status,'read');assert.equal(db.writes.length,0);
    if(['no-position','no-cycle'].includes(scenario)){
      assert.equal(r.data.position.status,'unknown');assert.equal(r.data.position.reason,'LONGITUDINAL_TARGET_UNRESOLVED');
      assert.equal(r.data.position.value,null);
    }
    if(scenario==='no-cycle')assert.equal(r.data.storedCycle.status,'unknown');
    if(['no-outcome','no-position'].includes(scenario)){
      assert.equal(r.data.latestRecordedOutcome.status,'unknown');
      assert.equal(r.data.latestRecordedOutcome.reason,'NO_RECORDED_OUTCOME_AS_OF_DATE');
      assert.equal(r.data.latestRecordedOutcome.value,null);
    }
    if(scenario==='outcome-unavailable')assert.equal(r.data.latestRecordedOutcome.status,'unavailable');
  }
});

test('planning replaces a real oversized prescription context with a bounded read and never invokes writers or full context',async t=>{
  const db=planningFixture();
  db.tables.usuarios[0].workout_history=Array.from({length:90},(_,i)=>({
    fecha:new Date(Date.parse(today)-i*86400000).toISOString().slice(0,10),tipo:'carrera',workout_id:'fixture-'+i,
    duracion:'40 min',distancia:'7 km',rpe:5}));
  const athlete=await load('../athlete/loadAthletePrescriptionContext').loadAthletePrescriptionContext(db,'u',{asOfDate:today});
  const old={status:'read',data:{athlete,reportedEvents:store.reportedEventProjection(db.tables.usuarios[0].perfil)},coverage:{date:today,week,limit:14}};
  assert.ok(JSON.stringify(old).length>120000);
  const before=plain(db.tables),budget=load('../chat/coachPlanningRead').COACH_PLANNING_READ_MAX_BYTES;
  const forbidden=()=>{throw Error('unexpected full loader/writer/generation');};
  const guarded=sportsRuntime({Date:Clock,Error},(_path,module)=>({...module,
    ...Object.fromEntries(['ensureLongitudinalTarget','loadAthletePrescriptionContext','loadWeeklyCoachingSupplement','generateCoachFirstWeek']
      .filter(k=>typeof module[k]==='function').map(k=>[k,forbidden]))}));
  const from=db.from.bind(db);
  db.from=table=>{assert.ok(['usuarios','block_outcomes'].includes(table));const q=from(table),select=q.select;
    q.update=forbidden;q.insert=forbidden;q.delete=forbidden;
    q.select=(fields,...rest)=>{if(table==='usuarios')assert.equal(fields,'ciclo_actual');return select(fields,...rest);};return q;};
  for(const policy of ['normal','read_only']){
    const dispatch=guarded('../chat/coachFirstTools').coachFirstTools(db,'u',input('consulta'),'turn',forbidden,()=>{},policy);
    const result=await dispatch({name:'read_context',arguments:{resource:'planning'}},1);
    assert.equal(result.status,'read');const bytes=Buffer.byteLength(JSON.stringify(result),'utf8');
    assert.ok(bytes<budget);assert.equal(result.data.limits.maxSerializedBytes,budget);
    assert.ok(!('athlete' in result.data));assert.ok(!('reportedEvents' in result.data));
    t.diagnostic(`${policy}: old=${Buffer.byteLength(JSON.stringify(old),'utf8')} bytes, bounded=${bytes}, budget=${budget}`);
  }
  assert.deepEqual(plain(db.tables),before);assert.equal(db.writes.length,0);
});

test('planning bounded fields withstand oversized nested data, escaped text and Unicode within 16 KiB',async t=>{
  const budget=load('../chat/coachPlanningRead').COACH_PLANNING_READ_MAX_BYTES;
  for(const character of ['\u0000','😀','漢','"']){
    const db=planningFixture(),c=db.tables.usuarios[0].ciclo_actual;
    const d={source:character.repeat(96).slice(0,96),reason:character.repeat(100000),
      targetWeekStart:character.repeat(32).slice(0,32),anchoredAt:character.repeat(32).slice(0,32),
      decidedAt:character.repeat(32).slice(0,32),planningRunId:character.repeat(96).slice(0,96),previousBlockId:character.repeat(96).slice(0,96),
      previousCycle:{huge:character.repeat(100000)}};
    Object.assign(c,{bloque:character.repeat(96).slice(0,96),blockId:character.repeat(96).slice(0,96),objetivo:character.repeat(100000),decision:d});
    db.tables.block_outcomes=[{user_codigo:'u',fecha_fin:today,tipo_bloque:c.bloque,resultado_global:c.bloque,arbitrary:{huge:character.repeat(100000)}}];
    const r=await dispatchFor(db)({name:'read_context',arguments:{resource:'planning'}},1);
    assert.equal(r.status,'read');assert.equal(r.data.limits.truncated,true);
    const bytes=Buffer.byteLength(JSON.stringify(r),'utf8');assert.ok(bytes<budget,`${bytes} exceeds budget`);
    assert.ok(!JSON.stringify(r).includes('previousCycle'));assert.ok(!JSON.stringify(r).includes('arbitrary'));
    t.diagnostic(`bounded adversarial text: ${bytes} bytes`);
  }
  const db=planningFixture();db.tables.usuarios[0].ciclo_actual.blockId='x'.repeat(100000);
  const r=await dispatchFor(db)({name:'read_context',arguments:{resource:'planning'}},1);
  assert.equal(r.data.position.value.blockId,null);assert.equal(r.data.limits.truncated,true);
});

test('planning read leaves other resource results unchanged',async()=>{
  const db=planningFixture(),reads=load('../chat/coachFirstReads').coachFirstReads(db,'u',today);
  const resources=['session','week','availability','state','restrictions','goals','reported_events','history','load'];
  const before=[];for(const resource of resources)before.push(plain(await reads.read({resource})));
  await reads.read({resource:'planning'});reads.invalidate();
  for(const [i,resource] of resources.entries())assert.deepEqual(plain(await reads.read({resource})),before[i]);
  assert.equal(db.writes.length,0);
});

test('temporal rejection reasons preserve nullish precedence and never disclose input values',async t=>{
  const shift=n=>new Date(Date.parse(today)+n*86400000).toISOString().slice(0,10);
  const secret='PRIVATE_TEMPORAL_MESSAGE_PROFILE_STACK';
  const cases=[
    ...['date','week'].flatMap(field=>[
      ...[today+'T12:00:00Z','2026-W39','2026-W39-1','',secret,123,false,{},' '+today].map(value=>({
        name:field+' format '+JSON.stringify(value),args:{[field]:value},reason:`INVALID_${field.toUpperCase()}_FORMAT`})),
      {name:field+' impossible day',args:{[field]:'2026-02-30'},reason:`INVALID_${field.toUpperCase()}_VALUE`},
      {name:field+' impossible month',args:{[field]:'2026-13-01'},reason:`INVALID_${field.toUpperCase()}_VALUE`},
      ...[-367,367].map(n=>({name:field+' range '+n,args:{[field]:shift(n)},reason:field.toUpperCase()+'_OUT_OF_RANGE'})),
    ]),
    {name:'empty date takes precedence over valid week',args:{date:'',week},reason:'INVALID_DATE_FORMAT'},
    {name:'null date uses invalid week',args:{date:null,week:'2026-W39'},reason:'INVALID_WEEK_FORMAT'},
    {name:'invalid server fallback',args:{date:null,week:null},timestamp:secret,reason:'SERVER_TODAY_INVALID'},
  ];
  for(const fixture of cases)await t.test(fixture.name,async()=>{
    for(const policy of ['normal','read_only']){
      const observations=[],i=input(secret),db=database();if(fixture.timestamp)i.timestamp=fixture.timestamp;
      const dispatch=tools.coachFirstTools(db,'u',i,'turn',()=>{throw Error('unexpected generation');},e=>observations.push(e),policy);
      const r=await dispatch({name:'read_context',arguments:{resource:'planning',...fixture.args}},1);
      assert.deepEqual(plain(r),{status:'rejected',code:'TOOL_UNAVAILABLE'});
      assert.deepEqual(plain(observations),[{route:'coach_first',policy,tool:'read_context',authority:'canonical_read_projection',
        status:'rejected',operationId:'turn:1',resource:'planning',failureCode:'READ_RANGE_INVALID',failureStage:'validation',failureReason:fixture.reason}]);
      const logged=JSON.stringify(observations);
      for(const value of [secret,...Object.values(fixture.args)])if(typeof value==='string'&&value.length>4)assert.ok(!logged.includes(value));
      assert.ok(!logged.includes('stack'));assert.ok(!logged.includes('errorMessage'));
      assert.deepEqual(db.reads,[]);assert.equal(db.writes.length,0);
    }
  });
});

test('temporal valid dates, weeks, nullish defaults and inclusive 366-day boundaries retain their projections',async()=>{
  const shift=n=>new Date(Date.parse(today)+n*86400000).toISOString().slice(0,10);
  const args=[{}, {date:undefined,week:undefined}, {date:null}, {date:null,week:null}, {date:today}, {week},
    {week:today}, {date:null,week}, {date:today,week:'invalid ignored week'},
    ...['date','week'].flatMap(field=>[-366,366].map(n=>({[field]:shift(n)})))];
  const projections=[];
  for(const a of args){
    const db=planningFixture(),observations=[],i=input('actual');i.timestamp='2026-09-21T23:30:00Z';
    const dispatch=tools.coachFirstTools(db,'u',i,'turn',()=>{throw Error('unexpected generation');},e=>observations.push(e));
    const r=await dispatch({name:'read_context',arguments:{resource:'planning',...a}},1);
    const selected=a.date??a.week??today;
    assert.equal(r.status,'read');assert.equal(r.coverage.date,selected);assert.equal(r.data.asOfDate,selected);
    assert.ok(!('failureReason' in observations[0]));assert.equal(db.writes.length,0);
    if(selected===today)projections.push(plain(r.data));
  }
  for(const p of projections)assert.deepEqual(p,projections[0]);
});

test('temporal failureReason rejects untrusted free text even on a known error code',async()=>{
  const secret='PRIVATE_REASON_TOKEN_SQL_STACK',observations=[];
  const db={from(){throw {message:'READ_RANGE_INVALID',failureReason:secret,stack:secret};}};
  const dispatch=tools.coachFirstTools(db,'u',input(secret),'turn',()=>{},e=>observations.push(e));
  assert.deepEqual(plain(await dispatch({name:'read_context',arguments:{resource:'planning'}},1)),{status:'rejected',code:'TOOL_UNAVAILABLE'});
  assert.equal(observations[0].failureCode,'READ_RANGE_INVALID');assert.ok(!('failureReason' in observations[0]));
  assert.ok(!JSON.stringify(observations).includes(secret));
});

test('current planning request traverses the native envelope and actual handler with no date/week',async()=>{
  const message='Antes de planificar nada nuevo, dime en qué ciclo, bloque y semana de mi planificación estoy ahora mismo, cuál fue el último bloque que completé y qué tendría que ocurrir para avanzar al siguiente bloque. Consulta mis datos de planificación actuales antes de responder. No modifiques todavía mi plan.';
  for(const policy of ['normal','read_only']){
    const db=planningFixture(),authId='11111111-1111-4111-8111-111111111111';
    Object.assign(db.tables.usuarios[0],{id:'22222222-2222-4222-8222-222222222222',auth_user_id:authId});
    const cycle=plain(db.tables.usuarios[0].ciclo_actual);let rounds=0;
    const handle=authenticatedHandler(db,{getUser:async()=>({data:{user:{id:authId,email_confirmed_at:today}},error:null})},async(_url,options)=>{
      const request=JSON.parse(options.body);
      for(const clause of ['date and week are optional','For CURRENT context (now/today/actual/ahora), OMIT BOTH date and week',
        'server supplies today in Atlantic/Canary','Use date only when the user requests another date, exactly YYYY-MM-DD',
        'Use week only when another week is needed, exactly YYYY-MM-DD, preferably the Monday',
        'Never send timestamps, ISO week notation (YYYY-Www), or empty strings','±366 days from server today',
        'Never calculate date/week from metadata.timestamp or copy metadata.timestamp into them'])assert.ok(request.system.includes(clause),clause);
      if(rounds++===0){
        assert.equal(JSON.parse(request.messages[0].content).originalMessage,message);
        return nativeTurn({answer:null,calls:[{name:'read_context',arguments:{resource:'planning'}}]});
      }
      const result=JSON.parse(request.messages.at(-1).content).toolResult;
      assert.equal(result.status,'read');assert.equal(result.coverage.date,today);assert.equal(result.data.asOfDate,today);
      assert.equal(result.data.position.value.blockId,'current-block');assert.ok(!('failureReason' in result));
      return nativeTurn({answer:'Consulta realizada sin modificar el plan.',calls:[]});
    },policy);
    const response=await handle(new Request('http://localhost/api/chat',{method:'POST',headers:{Authorization:'Bearer verified-token'},
      body:JSON.stringify({action:'coach_first',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',message,messageId:'current-planning-envelope'})}),()=>{throw Error('unexpected generation');});
    const r=await response.json();assert.equal(r.ok,true);assert.equal(rounds,2);
    assert.deepEqual(plain(db.tables.usuarios[0].ciclo_actual),cycle);assert.equal(db.writes.length,0);
  }
});

test('A/B: flag defaults OFF; simple Coach gets original message, no dispatcher/read/writer',async()=>{
  assert.equal(load('../chat/coachFirstFlag').coachFirstEnabled(),false);
  const i=input('  ¿por qué descansar?\nNo cambies nada.  '); let calls=0;
  const r=await loop.runCoachFirstLoop(i,{complete:async messages=>{calls++;assert.equal(JSON.parse(messages[0].content).originalMessage,i.message);
    return {answer:'El descanso permite recuperarte.',calls:[]};},dispatch:()=>{throw Error('unexpected tool');}});
  assert.equal(calls,1);assert.equal(r.ok,true);assert.equal(r.results.length,0);
});

test('C/L: real availability and event writers preserve both operations and pending context',async()=>{
  const db=database(), i=input('Esta semana puedo hacer Box martes y jueves. Carrera lunes, miércoles, viernes y domingo. El sábado quiero descansar. El domingo tengo una carrera de 5 km.');
  i.pending={kind:'availability',id:'pending-1'};
  const snapshot=await availability.readAvailabilityConfirmation(db,'u',week);
  const actions=[{name:'update_availability',arguments:{operation:'replace',week,snapshotDigest:snapshot.snapshotDigest,
    availability:{box:['martes','jueves'],carrera:['lunes','miercoles','viernes','domingo']}}},
    {name:'record_athlete_data',arguments:{kind:'reported_event',description:'Carrera',date:'2026-09-27',details:{distance:{value:5,unit:'km'}},status:'reported'}}];
  let n=0;
  const r=await loop.runCoachFirstLoop(i,{complete:async messages=>{if(!n++){const payload=JSON.parse(messages[0].content);assert.equal(payload.originalMessage,i.message);assert.equal(payload.pending.id,'pending-1');return {answer:'',calls:actions};}
    return {answer:'Disponibilidad y evento registrados.',calls:[]};},dispatch:dispatchFor(db,i)});
  assert.equal(r.ok,true);assert.deepEqual(plain(r.results.map(x=>x.status)),['committed','committed']);
  const p=db.tables.usuarios[0].perfil;
  assert.deepEqual(p.weekly_availability[week].availability,actions[0].arguments.availability);
  assert.ok(Object.values(p.weekly_availability[week].availability).every(v=>!v.includes('sabado')));
  assert.equal(p.reported_events[0].details.distance.value,5);assert.equal(p.reported_events[0].date,'2026-09-27');
  assert.equal(db.tables.usuarios[0].objetivo_principal,'crossfit');
});

test('D/E/F: patch preserves omitted disciplines, [] means zero, invalid history falls back',async()=>{
  const db=database();db.tables.usuarios[0].perfil.weekly_availability={[week]:{broken:true}};
  const before=await availability.readAvailabilityConfirmation(db,'u',week);assert.equal(before.ok,true);
  assert.deepEqual(plain(before.availability.box),['martes','jueves']);
  const r=await availability.updateStructuredChatAvailability(db,'u',{operation:'patch',week,snapshotDigest:before.snapshotDigest,availability:{box:[]}});
  assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(plain(r.availability.box),[]);
  assert.deepEqual(plain(r.availability.carrera),['lunes','miercoles','viernes','domingo']);
});

test('Availability snapshot confirm is read-only; dated exception can be removed without losing base',async()=>{
  const db=database();let s=await availability.readAvailabilityConfirmation(db,'u',week);
  assert.equal((await availability.updateStructuredChatAvailability(db,'u',{operation:'confirm',week,snapshotDigest:s.snapshotDigest})).ok,true);
  assert.equal(db.writes.length,0);
  let r=await availability.updateStructuredChatAvailability(db,'u',{operation:'exception',week,snapshotDigest:s.snapshotDigest,date:today,unavailable:true});
  assert.equal(r.ok,true);assert.deepEqual(plain(r.availability.box),['jueves']);
  r=await availability.updateStructuredChatAvailability(db,'u',{operation:'exception',week,snapshotDigest:r.snapshotDigest,date:today,unavailable:false});
  assert.equal(r.ok,true);assert.deepEqual(plain(r.availability.box),['martes','jueves']);
});

test('G: local adaptation uses real action authority, CAS/readback, no completion/reviewer/longitudinal reads',async()=>{
  const db=database(), run=dispatchFor(db,input('Hoy no puedo hacer jerk pesado, me molesta el hombro. Cámbiame la sesión.'));
  const result=await run({name:'update_session',arguments:{date:today,sessionId:db.tables.weekly_plan[0].sessions[1].session_id,
    expectedRevision:1,reason:'Evitar la carga que produce molestia',state:'REST'}},1);
  assert.equal(result.status,'committed',JSON.stringify(result));assert.equal(db.tables.weekly_plan[0].revision,2);
  assert.equal(db.tables.weekly_plan[0].sessions[1].completada,false);
  assert.ok(!db.reads.includes('running_execution_records'));assert.ok(!db.reads.includes('physiology_records'));
  assert.equal(db.tables.athlete_state_events.length,0);
});

test('G: external target and completed target cannot be adapted',async()=>{
  for(const state of ['external','completed']){const db=database(),target=db.tables.weekly_plan[0].sessions[1];
    if(state==='external')target.owner='external';else target.completada=true;
    const r=await dispatchFor(db)({name:'update_session',arguments:{date:today,sessionId:target.session_id,expectedRevision:1,reason:'Cambio',state:'REST'}},1);
    assert.equal(r.status,'rejected');assert.equal(db.writes.length,0);}
});

test('H: external execution preserves date/measurements and never completes Forge',async()=>{
  const db=database(),before=JSON.stringify(db.tables.weekly_plan);
  const r=await dispatchFor(db)({name:'record_execution',arguments:{date:today,discipline:'box',description:'Trabajo por mi cuenta',durationMinutes:35,rpe:6}},1);
  assert.equal(r.status,'committed');assert.equal(JSON.stringify(db.tables.weekly_plan),before);
  const e=db.tables.usuarios[0].workout_history[0];assert.equal(e.fecha,today);assert.equal(e.duracion,35);assert.equal(e.external,true);assert.equal(e.operationId,'turn:1');
});

test('I: linked completion requires declared association and authorized target',async()=>{
  for(const associated of [false,true]){const db=database(),target=db.tables.weekly_plan[0].sessions[1];
    const r=await dispatchFor(db,input('He realizado esta sesión; reduje la carga.'))({name:'record_execution',arguments:{
      date:today,discipline:'box',description:'Sesión realizada con menos carga',sessionId:target.session_id,expectedRevision:1,associationConfirmed:associated}},1);
    assert.equal(r.status,associated?'committed':'rejected',JSON.stringify(r));assert.equal(db.tables.weekly_plan[0].sessions[1].completada,associated);}
});

test('J: conversation cannot clear a restriction',async()=>{
  const db=database(),r=await dispatchFor(db,input('ya estoy bien'))({name:'transition_restriction',arguments:{}},1);
  assert.equal(r.status,'confirmation_required');assert.equal(db.writes.length,0);
});

test('N: durable turn CAS permits one claimant, blocks changed payload and uncertain replay',async()=>{
  const db=database();const claims=await Promise.all([store.claimCoachTurn(db,'u','id',{message:'a'}),store.claimCoachTurn(db,'u','id',{message:'a'})]);
  assert.equal(claims.filter(r=>r.status==='committed').length,1);
  assert.equal((await store.claimCoachTurn(db,'u','id',{message:'b'})).status,'conflict');
  assert.equal((await store.claimCoachTurn(db,'u','id',{message:'a'})).status,'already_claimed');
  const uncertain=database();uncertain.uncertain=true;
  assert.equal((await store.claimCoachTurn(uncertain,'u','id',{message:'a'})).status,'unknown');
  assert.equal((await store.claimCoachTurn(uncertain,'u','id',{message:'a'})).status,'already_claimed');
});

test('N: unknown mutation stops remaining tools and never retries provider',async()=>{
  let writes=0,providers=0;
  const r=await loop.runCoachFirstLoop(input('varias operaciones'),{complete:async()=>{providers++;return {answer:'',calls:[
    {name:'record_athlete_data',arguments:{}},{name:'generate_week',arguments:{}}]};},dispatch:async()=>{writes++;return{status:'unknown'};}});
  assert.equal(r.ok,false);assert.equal(writes,1);assert.equal(providers,1);
});

test('events support uncatalogued descriptions and missing date without creating details',async()=>{
  const db=database();const r=await store.recordReportedEvent(db,'u',{kind:'reported_event',description:'Encuentro sin modalidad conocida',status:'tentative'},
    {messageId:'m',message:'reporte',operationId:'o',timestamp:today});
  assert.equal(r.status,'committed');assert.equal('date' in r.event,false);assert.equal('details' in r.event,false);
});

test('production wiring: shared authenticated entry, early web return, server excludes legacy and shadow',()=>{
  const web=readFileSync('app/FormaPro.tsx','utf8'),route=readFileSync('app/api/chat/route.ts','utf8');
  const start=web.indexOf('const enviar=async'),branch=web.indexOf('if (coachFirstEnabled())',start),shadow=web.indexOf('void observeSemanticShadow',start);
  assert.ok(branch>start&&branch<shadow);assert.ok(web.slice(branch,shadow).includes('return;'));
  assert.ok(route.includes("body.action === 'coach_first' || body.action === 'enviar_mensaje_coach'"));
  assert.ok(route.includes('legacyConversationOperations.has(body.action)'));
  assert.ok(readFileSync('app/api/semantic-intake-shadow/route.ts','utf8').includes('!coachFirstEnabled()'));
  const handler=readFileSync('lib/chat/coachFirstHandler.ts','utf8');
  assert.ok(handler.indexOf('verifySupabasePrincipal(request, auth)')<handler.indexOf('conversationSession(db'));
  assert.ok(handler.includes('resolveAuthenticatedAthlete(db, principal)'));
});

test('incident: text (including fences) is never parsed as a Coach decision',async()=>{
  const invalidTexts = ['', 'Respuesta directa.', '```json\n{"answer":"Respuesta","calls":[]}\n```', '{"answer":"unfinished'];
  for (const raw of invalidTexts) {
    let completions=0,dispatches=0;const events=[];
    await assert.rejects(loop.runCoachFirstLoop(input('offline fixture'),{
      complete:async()=>{completions++;return raw;},
      dispatch:async()=>{dispatches++;throw Error('unexpected tool');},observe:e=>events.push(e),
    }),{name:'Error',message:'COACH_FIRST_OUTPUT_INVALID'});
    assert.equal(completions,1);assert.equal(dispatches,0);assert.equal(events.length,1);
    assert.equal(events[0].coachCalls,1);assert.equal(events[0].tools,0);assert.equal(events[0].reads,0);
    assert.equal(events[0].unknownOrPartial,false);assert.equal(events[0].casConflict,false);
  }
  await assert.rejects(loop.runCoachFirstLoop(input('offline fixture'),{
    complete:async()=>({answer:'Respuesta',calls:'invalid'}),dispatch:async()=>{throw Error('unexpected tool');},
  }),{name:'Error',message:'COACH_FIRST_OUTPUT_INVALID'});
});

test('K: generation passes one event snapshot through Analyzer, Weekly, Builder and final save',async()=>{
  const db=database();await store.recordReportedEvent(db,'u',{kind:'reported_event',description:'Carrera 5 km',date:'2026-09-27',status:'reported'},
    {messageId:'m',message:'evento',operationId:'e',timestamp:today});
  const runtime=sportsRuntime({Date:Clock,console:{info(){},warn(){},log(){}}},(path,module)=>{
    if(path.endsWith('weeklyGenerationPreflight.ts'))return {...module,resolveWeeklyGenerationPreflight:async()=>({canContinue:true})};
    if(path.endsWith('weeklyGeneration.ts'))return {...module,beginWeeklyGeneration:async()=>({token:'server-token',planningRunId:'run',currentWeek:week,nextWeek:'2026-09-28',snapshots:{[week]:db.tables.weekly_plan[0]}})};
    return module;
  });
  const generation=runtime('../chat/coachFirstGeneration'),s=await availability.readAvailabilityConfirmation(db,'u',week),seen=[];
  const r=await generation.generateCoachFirstWeek(db,'u',{week,includeToday:true,snapshotDigest:s.snapshotDigest},'op',today,async(action,args,context)=>{
    seen.push({action,digest:context.reportedEvents.digest,text:generation.coachFirstPlanningText(context)});
    if(action==='analizar_bloque_semana')return {ok:true,analisis:{tipo_semana:'acumulacion'}};
    if(action==='planificar_semana')return {ok:true,estructura:{weeklyContractVersion:2,calendarReceipt:'receipt',contractDigest:'contract',contextDigest:'context',strategy:{adaptacion_principal:'Mantener'},
      sessions:days.map((dia,i)=>({dia,tipo:i===1?'box':'descanso'}))}};
    if(action==='construir_sesion_dia'){assert.equal(args.contractDigest,'contract');assert.equal(args.contextDigest,'context');return {ok:true,sesion:db.tables.weekly_plan[0].sessions[1]};}
    return {ok:true,commitConfirmed:true};
  });
  assert.equal(r.status,'committed',JSON.stringify(r));assert.equal(seen.length,4);assert.equal(new Set(seen.map(s=>s.digest)).size,1);
  assert.ok(seen.every(s=>s.text.includes('Carrera 5 km')));assert.equal(r.analyzerAuxiliaryEffects,'not_persisted_coach_first');
});

test('K/N: event revision changed during generation prevents final save, no stage replay',async()=>{
  const db=database(),s=await availability.readAvailabilityConfirmation(db,'u',week),seen=[];
  const runtime=sportsRuntime({Date:Clock,console:{info(){},warn(){},log(){}}},(path,module)=>{
    if(path.endsWith('weeklyGenerationPreflight.ts'))return {...module,resolveWeeklyGenerationPreflight:async()=>({canContinue:true})};
    if(path.endsWith('weeklyGeneration.ts'))return {...module,beginWeeklyGeneration:async()=>({token:'t',currentWeek:week,nextWeek:'2026-09-28',snapshots:{[week]:null}})};
    return module;
  });
  const r=await runtime('../chat/coachFirstGeneration').generateCoachFirstWeek(db,'u',{week,includeToday:true,snapshotDigest:s.snapshotDigest},'op',today,async action=>{
    seen.push(action);db.tables.usuarios[0].perfil.reported_events=[{id:'new'}];return {ok:true,analisis:{}};
  });
  assert.equal(r.status,'unknown');assert.deepEqual(seen,['analizar_bloque_semana']);
});

test('G: current restrictions block a technically structured prohibited adaptation',async()=>{
  const db=database();db.tables.athlete_coaching_notes=[{user_codigo:'u',movement:'push_press',constraint_level:'hard',status:'pending',valid_until:null}];
  const r=await dispatchFor(db,input('Cambia la sesión.'))({name:'update_session',arguments:{date:today,
    sessionId:db.tables.weekly_plan[0].sessions[1].session_id,expectedRevision:1,state:'TRAIN',reason:'Cambio',discipline:'box',
    intent:{kind:'open_coach',version:1,discipline:'box',adaptationId:'strength',stimulusId:'fuerza_maxima',pattern:'vertical_push',role:'PRIMARY',method:{kind:'coach_defined',label:'Fuerza'}},
    proposal:{schemaVersion:2,stimulusId:'fuerza_maxima',structureId:'strength_sets',blocks:[{blockType:'main',movements:[{movementId:'push_press',prescription:{doseInstruction:'Tres series de cinco repeticiones con carga cómoda y dos minutos de descanso.'}}]}]}}},1);
  assert.equal(r.code,'CHAT_ACTION_RESTRICTION_CONFIRMATION',JSON.stringify(r));assert.equal(db.writes.length,0);
});

test('Availability scope extension and stale snapshot cannot write',async()=>{
  for(const mode of ['scope','stale']){const db=database(),s=await availability.readAvailabilityConfirmation(db,'u',week);
    const r=await availability.updateStructuredChatAvailability(db,'u',{operation:'patch',week,snapshotDigest:mode==='stale'?'stale':s.snapshotDigest,
      availability:mode==='scope'?{cycling:['lunes']}:{box:['lunes']}});
    assert.equal(r.ok,false);assert.equal(db.writes.length,0);}
});

test('G: executable local TRAIN adaptation succeeds through reused contract and validators',async()=>{
  const db=database();
  const r=await dispatchFor(db)({name:'update_session',arguments:{date:today,
    sessionId:db.tables.weekly_plan[0].sessions[1].session_id,expectedRevision:1,state:'TRAIN',reason:'Trabajo tolerable',discipline:'box',
    intent:{kind:'open_coach',version:1,discipline:'box',adaptationId:'aerobic',stimulusId:'aerobic',pattern:'cyclic',role:'SUPPORTING',method:{kind:'coach_defined',label:'Trabajo tolerable'}},
    proposal:{schemaVersion:2,stimulusId:'aerobic',structureId:'Continuo libre',blocks:[{blockType:'main',movements:[{movementId:'bike',prescription:{durationSeconds:1200,doseInstruction:'Mantén un esfuerzo cómodo, RPE 3-4.'}}]}]}}},1);
  assert.equal(r.status,'committed',JSON.stringify(r));assert.equal(db.tables.weekly_plan[0].sessions[1].completada,false);
  assert.ok(db.tables.weekly_plan[0].sessions[1].structuredPrescription);
});

test('rollback blocks affected legacy planning, preserves unaffected weeks and stored reports',async()=>{
  const db=database();assert.equal(await store.legacyPlanningCanReadReports(db,'u',week),true);
  db.tables.usuarios[0].perfil.reported_events=[{description:'Evento',date:'2026-09-27',status:'reported'}];
  assert.equal(await store.legacyPlanningCanReadReports(db,'u',week),false);
  assert.equal(await store.legacyPlanningCanReadReports(db,'u','2026-10-05'),true);
  db.tables.usuarios[0].perfil.reported_events.push({description:'Sin fecha',status:'tentative'});
  assert.equal(await store.legacyPlanningCanReadReports(db,'u','2026-10-05'),false);assert.equal(db.writes.length,0);
});

const nativeTurn = decision => Response.json({stop_reason:'tool_use',content:[{type:'tool_use',id:'toolu_fixture',name:'submit_coach_turn',input:decision}]});
test('native envelope rejects absent, duplicate, wrong tool, refusal and truncation without text fallback',()=>{
  const read=load('../chat/coachFirstOutput').readCoachFirstOutput;
  const block={type:'tool_use',id:'toolu_fixture',name:'submit_coach_turn',input:{answer:'ok',calls:[]}};
  for(const output of [null,{stop_reason:'end_turn',content:[{type:'text',text:'```json\n{"answer":"ok","calls":[]}\n```'}]},
    {stop_reason:'max_tokens',content:[block]},{stop_reason:'refusal',content:[block]},
    {stop_reason:'tool_use',content:[]},{stop_reason:'tool_use',content:[block,block]},
    {stop_reason:'tool_use',content:[{...block,name:'read_context'}]}]){
    assert.throws(()=>read(output),{message:'COACH_FIRST_OUTPUT_INVALID'});
  }
  assert.deepEqual(read({stop_reason:'tool_use',content:[{type:'text',text:'Ignored Markdown ```'},block]}),block.input);
});

// Deterministic transport/source fixtures, NOT a semantic evaluator of model decisions.
// The provider is scripted: these verify that the actual system instruction reaches it,
// source distinctions survive reads, and neither history nor repeated reads are forced.
// A live evaluation must separately assess whether the model chooses evidence or uncertainty.
test('evidence discipline: source and progressive-read contract fixtures',async t=>{
  const recorded={fecha:'2026-09-18',tipo:'carrera',duracion:30,notas:'Rodaje registrado'};
  const fixtures=[
    {name:'planned is not performed',message:'¿Cómo retomo esta semana?',resources:['week','history'],
      answer:'Hay una sesión planificada; el registro disponible corresponde a un rodaje anterior.',
      check(results){assert.equal(results[0].data.sessions[1].completada,false);
        assert.deepEqual(results[0].data.sessions[1].reportedExecution,[]);assert.deepEqual(results[1].data.records,[recorded]);}},
    {name:'adapted is not performed',message:'¿El ajuste de la sesión cambia lo que hice?',resources:['week'],
      setup(db){const s=db.tables.weekly_plan[0].sessions[1];s.titulo='Prescripción adaptada';
        s.chatPrescriptionHistory=[{id:'adapted',original:{titulo:'Prescripción original',tipo:'box'}}];},
      answer:'La adaptación cambia la prescripción; no demuestra que la hayas realizado.',
      check(results){const s=results[0].data.sessions[1];assert.equal(s.titulo,'Prescripción adaptada');
        assert.equal(s.originalPrescription.titulo,'Prescripción original');assert.equal(s.completada,false);assert.deepEqual(s.reportedExecution,[]);}},
    {name:'previous assistant is not independent evidence',message:'¿Qué antecedente usarías para recomendarme entrenar?',resources:['history'],
      prior:'Tu última sesión fue ayer.',setup(db){db.tables.usuarios[0].historial=[{role:'assistant',content:this.prior}];},
      answer:'El historial consultado contiene un rodaje registrado; la afirmación anterior no lo sustituye.',
      check(results){assert.deepEqual(results[0].data.records,[recorded]);}},
    {name:'empty history does not prove inactivity',message:'¿Cuánto tiempo llevo sin entrenar?',resources:['history'],
      setup(db){db.tables.usuarios[0].workout_history=[];},
      answer:'No encuentro entrenamientos registrados en esta fuente. ¿Cuándo entrenaste por última vez?',
      check(results){assert.deepEqual(results[0].data.records,[]);assert.equal(results[0].data.semantics,'LEGACY_RECORDED_NOT_VERIFIED');}},
    {name:'history supports latest recorded workout with coverage limits',message:'¿Cuál es el último entrenamiento registrado?',resources:['history'],
      answer:'El último entrenamiento registrado en la fuente consultada es un rodaje de 30 minutos.',
      check(results){assert.deepEqual(results[0].data.records,[recorded]);assert.equal(results[0].data.truncated,false);
        assert.equal(results[0].data.semantics,'LEGACY_RECORDED_NOT_VERIFIED');assert.equal(results[0].coverage.limit,14);}},
    {name:'sufficient evidence already read needs no redundant read',message:'Resume el entrenamiento registrado y su duración.',resources:['history'],
      answer:'El registro indica carrera durante 30 minutos.',check(results){assert.deepEqual(results[0].data.records,[recorded]);}},
    {name:'greeting needs no history',message:'Hola',resources:[],answer:'Hola, ¿en qué puedo ayudarte?',check(results){assert.deepEqual(results,[]);}},
    {name:'general guidance needs no history',message:'¿Para qué sirve un calentamiento?',resources:[],
      answer:'Sirve para preparar progresivamente el cuerpo para el esfuerzo.',check(results){assert.deepEqual(results,[]);}},
  ];
  for(const fixture of fixtures)await t.test(fixture.name,async()=>{
    const db=database(),authId='11111111-1111-4111-8111-111111111111',observations=[];
    Object.assign(db.tables.usuarios[0],{id:'22222222-2222-4222-8222-222222222222',auth_user_id:authId,workout_history:[recorded]});
    fixture.setup?.(db);let rounds=0;
    const handle=authenticatedHandler(db,{getUser:async()=>({data:{user:{id:authId,email_confirmed_at:today}},error:null})},async(_url,options)=>{
      const request=JSON.parse(options.body);rounds++;
      assert.equal(request.system,loop.COACH_FIRST_INSTRUCTION);
      assert.deepEqual(request.tools,[plain(load('../chat/coachFirstOutput').COACH_FIRST_OUTPUT_TOOL)]);
      if(rounds===1){
        if(fixture.prior)assert.deepEqual(request.messages[0],{role:'assistant',content:fixture.prior});
        assert.equal(JSON.parse(request.messages.at(-1).content).originalMessage,fixture.message);
        if(fixture.resources.length)return nativeTurn({answer:null,calls:fixture.resources.map(resource=>({name:'read_context',arguments:{resource}}))});
      }else{
        assert.equal(rounds,2,'existing evidence must be usable without another provider/read round');
        const results=request.messages.slice(-fixture.resources.length).map(m=>JSON.parse(m.content).toolResult);
        assert.ok(results.every(r=>r.status==='read'));fixture.check(results);
      }
      return nativeTurn({answer:fixture.answer,calls:[]});
    },'read_only',[],observations);
    const r=await (await handle(new Request('http://localhost/api/chat',{method:'POST',headers:{Authorization:'Bearer token'},
      body:JSON.stringify({action:'coach_first',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',message:fixture.message,messageId:'evidence-fixture-001'})}),
      ()=>{throw Error('unexpected planning');})).json();
    assert.equal(r.ok,true);assert.equal(r.answer,fixture.answer);assert.equal(rounds,fixture.resources.length?2:1);
    assert.deepEqual(r.results.map(x=>x.name),fixture.resources.map(()=>'read_context'));
    assert.deepEqual(observations.filter(x=>x.tool==='read_context').map(x=>x.resource),fixture.resources);
    if(!fixture.resources.length){fixture.check(r.results);assert.equal(db.reads.length,1,'only identity read, no implicit context');}
  });
});

test('native rounds read progressive context and answer afterwards, preserving multiple calls',async()=>{
  for(const resources of [['state'],['state','week']]){
    const db=database(),authId='11111111-1111-4111-8111-111111111111',observations=[];
    Object.assign(db.tables.usuarios[0],{id:'22222222-2222-4222-8222-222222222222',auth_user_id:authId});
    let requests=0;
    const handle=authenticatedHandler(db,{getUser:async()=>({data:{user:{id:authId,email_confirmed_at:today}},error:null})},async(_url,options)=>{
      const request=JSON.parse(options.body);requests++;
      assert.deepEqual(request.tool_choice,{type:'tool',name:'submit_coach_turn',disable_parallel_tool_use:true});
      if(requests===1)return nativeTurn({answer:null,calls:resources.map(resource=>({name:'read_context',arguments:{resource}}))});
      const returned=request.messages.slice(-resources.length).map(m=>JSON.parse(m.content).toolResult);
      assert.ok(returned.every(r=>r.name==='read_context' && r.status==='read'));
      assert.equal(returned[0].data.specialty,'crossfit');
      return nativeTurn({answer:'Respuesta después de leer contexto.',calls:[]});
    },'read_only',[],observations);
    const result=await (await handle(new Request('http://localhost/api/chat',{method:'POST',headers:{Authorization:'Bearer verified-token'},
      body:JSON.stringify({action:'coach_first',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',message:'Consulta offline',messageId:'read-native-fixture'})}),()=>{throw Error('unexpected planning');})).json();
    assert.equal(result.ok,true);assert.equal(requests,2);assert.equal(result.coachCalls,2);
    assert.equal(result.results.length,resources.length);assert.equal(result.answer,'Respuesta después de leer contexto.');
    assert.ok(observations.some(e=>e.marker==='COACH_FIRST_OPERATION' && e.reads===resources.length));
    assert.ok(db.writes.every(w=>w.table==='usuarios' && Object.keys(w.patch).join()==='perfil'));
  }
});

test('structured loop retains round and total tool limits',async()=>{
  let calls=0,dispatches=0;
  const complete=async()=>{calls++;return {answer:null,calls:[{name:'read_context',arguments:{resource:'state'}}]};};
  const result=await loop.runCoachFirstLoop(input('offline'),{complete,dispatch:async()=>{dispatches++;return {status:'read'};}});
  assert.equal(result.ok,false);assert.equal(calls,8);assert.equal(dispatches,8);
  dispatches=0;
  await assert.rejects(loop.runCoachFirstLoop(input('offline'),{complete:async()=>({answer:null,calls:Array(8).fill({name:'read_context',arguments:{resource:'state'}})}),
    dispatch:async()=>{dispatches++;return {status:'read'};}}),{message:'COACH_FIRST_TOOL_INVALID'});
  assert.equal(dispatches,24);
});
function authenticatedHandler(db, auth, provider, policy, errors = [], observations = []) {
  // Provider-focused fixtures. The real SQL/ownership protocol is exercised in conversationSession.test.mjs.
  db.rpc = async (_name, {p_operation, p_payload}) => {
    const row=db.tables.usuarios[0]; row.historial ??= [];
    if(p_operation==='begin') {
      row.perfil.coach_first_turns ??= {};
      if(row.perfil.coach_first_turns[p_payload.id])return {data:{ok:false,status:'already_claimed',code:'TURN_NOT_REPLAYED'}};
      row.perfil.coach_first_turns[p_payload.id]={digest:p_payload.digest,status:'claimed'};
      return {data:{ok:true,status:'committed',historial:plain(row.historial),epoch:today+'T12:00:00Z'}};
    }
    const persisted=['completed','terminal'].includes(p_payload.status);
    if(persisted) row.historial=[...row.historial,{role:'user',content:p_payload.message},{role:'assistant',content:p_payload.answer}].slice(-15);
    Object.assign(row.perfil.coach_first_turns[p_payload.id],{status:p_payload.status,receipts:p_payload.receipts,persisted});
    return {data:{ok:persisted,persisted,status:p_payload.status,historial:plain(row.historial)}};
  };
  const identity={exports:{}};
  vm.runInNewContext(compile(readFileSync('lib/auth/athleteIdentity.ts','utf8')),{
    module:identity,exports:identity.exports,require:name=>name==='node:crypto'?crypto:{},
  });
  const handler={exports:{}};
  vm.runInNewContext(compile(readFileSync('lib/chat/coachFirstHandler.ts','utf8')),{
    module:handler,exports:handler.exports,Response,Date:Clock,AbortSignal,console:{info:(marker,event)=>observations.push({marker,...event}),error:(marker,event)=>errors.push({marker,...event})},
    process:{env:{ANTHROPIC_API_KEY:'offline-placeholder',...(policy === undefined ? {} : {FORGE_COACH_FIRST_POLICY:policy})}},fetch:provider,
    require(name){if(name==='../auth/athleteIdentity')return identity.exports;
      if(name==='../auth/supabaseServer')return {identityDependencies:()=>({db,auth})};
      if(name==='../diagnostics/orchestratorTrace')return load(name);
      return load('../chat/'+name.slice(2));},
  });
  return handler.exports.handleCoachFirst;
}

test('text-only/truncated provider responses fail closed without logging their content',async()=>{
  const privateText='PRIVATE_TOKEN_MESSAGE_ANSWER_CONVERSATION';
  for (const stopReason of ['max_tokens',privateText]) {
    const db=database(),authId='11111111-1111-4111-8111-111111111111',observations=[],errors=[];
    Object.assign(db.tables.usuarios[0],{id:'22222222-2222-4222-8222-222222222222',auth_user_id:authId});
    const raw=' \n```json\n'+privateText+'\n```\t';let calls=0;
    const handle=authenticatedHandler(db,{getUser:async()=>({data:{user:{id:authId,email_confirmed_at:today}},error:null})},async()=>{
      calls++;return Response.json({stop_reason:stopReason,content:[{type:'text',text:raw},
        {type:'thinking',thinking:privateText},{type:'text',text:''}]});
    },'read_only',errors,observations);
    const response=await handle(new Request('http://localhost/api/chat',{method:'POST',headers:{Authorization:'Bearer verified-token'},
      body:JSON.stringify({action:'coach_first',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',message:privateText,messageId:'message-raw-001'})}),()=>{throw Error('unexpected planning');});
    assert.equal(response.status,200);assert.equal((await response.json()).code,'COACH_FIRST_UNAVAILABLE');assert.equal(calls,1);
    assert.equal(observations.filter(e=>e.marker==='COACH_FIRST_RAW_INVALID').length,0);
    assert.equal(errors[0].errorMessage,'COACH_FIRST_OUTPUT_INVALID');
    assert.ok(!JSON.stringify([...observations,...errors]).includes(privateText));
    assert.ok(!JSON.stringify([...observations,...errors]).includes('offline-placeholder'));
  }
});

test('structured invalid batches and empty terminal answers reject before dispatch',async()=>{
  const valid={name:'read_context',arguments:{resource:'state'}};
  for(const decision of [null,[],{answer:null,calls:[]},{answer:42,calls:[]},{answer:'x',calls:Array(9).fill(valid)},
    {answer:'x',calls:[valid,{name:'read_context',arguments:'not an object'}]},{answer:'x',calls:[{...valid,extra:true}]}]){
    let calls=0;
    await assert.rejects(loop.runCoachFirstLoop(input('offline'),{complete:async()=>decision,dispatch:async()=>{calls++;}}),
      e=>['COACH_FIRST_OUTPUT_INVALID','COACH_FIRST_TOOL_INVALID'].includes(e.message));
    assert.equal(calls,0);
  }
});

test('handler logs correlated sanitized exceptions without changing unknown response or retrying',async()=>{
  for (const scenario of ['syntax','transport','unsafe','http']) {
    const db=database(),authId='11111111-1111-4111-8111-111111111111',errors=[];
    Object.assign(db.tables.usuarios[0],{id:'22222222-2222-4222-8222-222222222222',auth_user_id:authId});
    let calls=0;
    const secret='PRIVATE_USER_CONVERSATION_COOKIE_TOKEN_KEY';
    const handle=authenticatedHandler(db,{getUser:async()=>({data:{user:{id:authId,email_confirmed_at:today}},error:null})},async()=>{
      calls++;
      if(scenario==='transport')throw Object.assign(new Error('fetch failed'),{code:'ECONNRESET',status:503,cause:{token:secret}});
      if(scenario==='unsafe')throw {name:secret,message:secret,code:secret,status:secret,stack:secret};
      if(scenario==='http')return new Response(secret,{status:401});
      return Response.json({content:[{type:'text',text:secret}]});
    },'read_only',errors);
    const messageId='cef852f8-e86b-4973-9d6b-d3d4e1f09699';
    const response=await handle(new Request('http://localhost/api/chat',{method:'POST',headers:{Authorization:'Bearer verified-token'},
      body:JSON.stringify({action:'coach_first',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',message:secret,messageId,conversation:[{role:'user',content:secret}]})}),()=>{throw Error('unexpected planning');});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{route:'coach_first',status:'unknown',code:'COACH_FIRST_UNAVAILABLE',persisted:false,retryable:false,
      answer:'No puedo confirmar el resultado del turno. No lo he reintentado.'});
    assert.equal(calls,1);assert.equal(errors.length,1);
    const log=errors[0];assert.equal(log.marker,'COACH_FIRST_ERROR');assert.equal(log.messageId,messageId);assert.equal(log.claimed,true);
    assert.equal(log.stage,scenario==='syntax'?'provider_structured_output':scenario==='http'?'provider_http':'provider_fetch');
    assert.ok(!JSON.stringify(log).includes(secret));assert.ok(!JSON.stringify(log).includes('offline-placeholder'));
    if(scenario==='syntax'){assert.equal(log.errorName,'Error');assert.equal(log.errorMessage,'COACH_FIRST_OUTPUT_INVALID');}
    if(scenario==='transport'){assert.equal(log.errorMessage,'fetch failed');assert.equal(log.errorCode,'ECONNRESET');assert.equal(log.errorStatus,503);}
  }
});

test('M/B/N: actual handler verifies Supabase principal, binds athlete, calls Coach once and refuses replay',async()=>{
  const db=database(), authId='11111111-1111-4111-8111-111111111111';
  Object.assign(db.tables.usuarios[0],{id:'22222222-2222-4222-8222-222222222222',auth_user_id:authId});
  let providers=0,verifications=0;
  const handle=authenticatedHandler(db,{getUser:async token=>{verifications++;assert.equal(token,'verified-token');return{data:{user:{id:authId,email_confirmed_at:today}},error:null};}},async(_url,options)=>{
    providers++;const payload=JSON.parse(options.body);assert.equal(JSON.parse(payload.messages[0].content).originalMessage,'  pregunta intacta  ');
    assert.deepEqual(payload.tool_choice,{type:'tool',name:'submit_coach_turn',disable_parallel_tool_use:true});
    assert.equal(payload.tools[0].input_schema.properties.calls.maxItems,8);
    assert.equal(payload.model,'claude-sonnet-4-5');
    return nativeTurn({answer:'Respuesta.',calls:[]});
  });
  const request=(body={},authorized=true)=>new Request('http://localhost/api/chat',{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer verified-token'}:{})},
    body:JSON.stringify({action:'coach_first',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',message:'  pregunta intacta  ',messageId:'unique-message-id',...body})});
  const planning=()=>{throw Error('unexpected planning');};
  assert.equal((await handle(request({},false),planning)).status,401);assert.equal(db.writes.length,0);
  assert.equal((await handle(request({codigo:'OTHER'}),planning)).status,403);assert.equal(db.writes.length,0);
  const result=await (await handle(request(),planning)).json();assert.equal(result.ok,true);assert.equal(providers,1);
  assert.equal((await (await handle(request(),planning)).json()).code,'TURN_NOT_REPLAYED');assert.equal(providers,1);
  assert.equal(verifications,3);assert.ok(db.reads.every(t=>t==='usuarios'));
});

test('read-only policy rejects every mutation and future tool before any authority or database access',async()=>{
  let authorities=0,accesses=0;
  const guarded=sportsRuntime({Date:Clock,Error},(path,module)=>{
    const names=['applyChatCoachActions','recordExternalExecution','updateStructuredChatAvailability','recordReportedEvent'];
    return {...module,...Object.fromEntries(names.filter(n=>typeof module[n]==='function').map(n=>[n,()=>{authorities++;throw Error('authority reached');}]))};
  })('../chat/coachFirstTools');
  const dispatch=guarded.coachFirstTools({from(){accesses++;throw Error('database reached');}},'u',input('consulta'),'turn',
    async()=>{authorities++;throw Error('generation reached');},()=>{},'read_only');
  for(const name of ['update_availability','update_session','record_execution','record_athlete_data','transition_restriction','generate_week','future_mutation']){
    const r=await dispatch({name,arguments:{}},1);assert.equal(r.status,'rejected');assert.equal(r.reason,'read_only_policy');
  }
  assert.equal(authorities,0);assert.equal(accesses,0);
});

test('read-only allows canonical reads; normal default and explicit normal preserve generation capability; invalid policy fails closed',async()=>{
  const db=database();let generated=0;
  const dispatch=tools.coachFirstTools(db,'u',input('consulta'),'turn',async()=>{generated++;return{status:'committed'};},()=>{},'read_only');
  const r=await dispatch({name:'read_context',arguments:{resource:'week',week}},1);
  assert.equal(r.status,'read');assert.equal(r.data.week_start,week);assert.equal(db.writes.length,0);
  for(const policy of [undefined,'normal']){
    const normal=tools.coachFirstTools(db,'u',input('consulta'),'turn',async()=>{generated++;return{status:'committed'};},()=>{},policy);
    const args = await generationReadArgs(normal);
    assert.equal((await normal({name:'generate_week',arguments:args},3)).status,'committed');
  }
  assert.equal(generated,2);
  for(const invalid of ['', 'READ_ONLY', 'invalid', null])assert.throws(()=>tools.resolveCoachFirstPolicy(invalid),/POLICY_INVALID/);
  assert.equal(tools.resolveCoachFirstPolicy(undefined),'normal');
});

test('authenticated handler selects read-only from server, ignores client elevation, persists conversation and journal only',async()=>{
  const db=database(),authId='11111111-1111-4111-8111-111111111111';
  Object.assign(db.tables.usuarios[0],{id:'22222222-2222-4222-8222-222222222222',auth_user_id:authId});
  const before=plain(db.tables);let calls=0;
  const handle=authenticatedHandler(db,{getUser:async()=>({data:{user:{id:authId,email_confirmed_at:today}},error:null})},async(_url,options)=>{
    const messages=JSON.parse(options.body).messages;
    if(calls++)assert.equal(JSON.parse(messages.at(-1).content).toolResult.reason,'read_only_policy');
    return nativeTurn(calls===1?{answer:null,calls:[{name:'record_athlete_data',arguments:{kind:'reported_event',description:'Evento',status:'reported'}}]}:{answer:'No he guardado cambios.',calls:[]});
  },'read_only');
  const response=await handle(new Request('http://localhost/api/chat',{method:'POST',headers:{Authorization:'Bearer token'},
    body:JSON.stringify({action:'coach_first',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',message:'consulta',messageId:'policy-test-message',mode:'normal',policy:'normal'})}),()=>{throw Error('planning reached');});
  const r=await response.json();assert.equal(r.ok,true);assert.equal(r.results[0].reason,'read_only_policy');assert.equal(calls,2);
  assert.ok(db.tables.usuarios[0].perfil.coach_first_turns);
  const after=plain(db.tables);delete after.usuarios[0].perfil.coach_first_turns;
  assert.equal(after.usuarios[0].historial.length,2);delete after.usuarios[0].historial;assert.deepEqual(after,before);
  assert.ok(db.writes.every(w=>w.table==='usuarios'&&Object.keys(w.patch).length===1&&'perfil' in w.patch));
});

test('A/B: actual POST blocks every legacy chat writer after the Auth boundary while ON',async()=>{
  const route={exports:{}},flag=load('../chat/coachFirstFlag');let routed=0;
  const forbidden=()=>{throw Error('legacy reached');};
  vm.runInNewContext(compile(readFileSync('app/api/chat/route.ts','utf8')),{
    module:route,exports:route.exports,console,process:{env:{}},
    require(name){
      if(name==='@supabase/supabase-js')return{createClient:()=>({from:forbidden})};
      if(name==='next/server')return {NextResponse:Response,NextRequest:Request};
      if(name==='@/lib/auth/chatIdentity')return {authorizeChatRequest:async req=>req.json()};
      if(name==='@/lib/auth/athleteIdentity')return {IdentityError:class extends Error {}};
      if(name==='@/lib/chat/coachFirstFlag')return {...flag,coachFirstEnabled:()=>true};
      if(name==='@/lib/chat/coachFirstHandler')return {handleCoachFirst:async()=>{routed++;return Response.json({route:'coach_first'});}};
      return new Proxy({},{get:()=>forbidden});
    },
  });
  for(const action of [...flag.legacyConversationOperations,undefined]){
    const r=await route.exports.POST(new Request('http://localhost/api/chat',{method:'POST',body:JSON.stringify({action})}));
    assert.equal(r.status,409);assert.equal((await r.json()).code,'COACH_FIRST_ROUTE_REQUIRED');
  }
  for(const action of ['coach_first','enviar_mensaje_coach'])await route.exports.POST(new Request('http://localhost/api/chat',{method:'POST',body:JSON.stringify({action})}));
  assert.equal(routed,2);
});

test('Analyzer actual branch computes analysis but suppresses both auxiliary writes, even on provider failure',async()=>{
  const source=readFileSync('app/api/chat/route.ts','utf8'),ast=ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true);
  function find(n){if(ts.isIfStatement(n)&&n.expression.getText(ast)==='action === "analizar_bloque_semana"')return n;
    return ts.forEachChild(n,find);}
  const body=find(ast).thenStatement.getText(ast);
  for(const fails of [false,true]){
    const db=database();db.tables.usuarios[0].athlete_development=[{nombre_visible:'Antigua',estado:'activa',detectado:'2025-01-01'}];
    db.tables.athlete_coaching_notes=[{id:'note',status:'pending',issue:'Observación'}];
    const context={week,includeToday:true,availability:{box:['martes']},availabilityDigest:'availability',operationId:'op',reportedEvents:{digest:'event-digest',records:[{description:'Encuentro',status:'reported'}]}};
    const execute=vm.runInNewContext(compile(`async function execute() ${body}\nexports.execute=execute;`),{
      exports:{},Date:Clock,console:{log(){},error(){}},supabase:db,codigo:'u',apiKey:'offline-placeholder',
      coachFirstPlanning:context,coachFirstPlanningText:load('../chat/coachFirstGeneration').coachFirstPlanningText,
      getCanonicalRestrictions:async()=>({restrictions:[],reassessments:[]}),
      strategyDemandIds:()=>[],loadAthletePrescriptionContext:async()=>({}),resolveCompletionDate:load('../planning/recordCompletion').resolveCompletionDate,
      generarEstadoCanonico:async()=>({ciclo:{}}),buildFocusContext:async()=>({esModoFocus:false}),
      buildExposureReport:()=>({exposiciones:[]}),exposureReportToPromptText:()=>'',agregarExposicionPorPatron:()=>({}),agregarExposicionPorModalidad:()=>({}),
      loadEventContext:async()=>({authority:{}}),eventAuthorityText:()=>'',boundEventAnalysis:v=>v,normalizeStrategyProposal:v=>v,
      calcularFrecuenciaRealRelativa:()=>0,aplicarTrainingFrequencySafetyNet:()=>({diasEntrenoSugeridos:3,corregido:false}),
      NextResponse:Response,require:()=>({MOVEMENT_LIBRARY:{}}),fetch:async(_url,options)=>{
        assert.ok(JSON.parse(options.body).messages[0].content.includes('event-digest'));
        if(fails)throw Error('offline transport failure');
        return Response.json({content:[{text:JSON.stringify({coaching_notes_incorporadas:['note'],dias_entreno_sugeridos:3})}]});
      },
    });
    const response=await execute();assert.equal(response.status,fails?500:200);assert.equal(db.writes.length,0);
    assert.equal(db.tables.usuarios[0].athlete_development[0].estado,'activa');assert.equal(db.tables.athlete_coaching_notes[0].status,'pending');
  }
});

test('N: post-write session readback transport failure is unknown, never committed or retried',async()=>{
  const db=database(),from=db.from.bind(db);
  db.from=table=>{if(table==='weekly_plan'&&db.writes.some(w=>w.table==='weekly_plan'))throw Error('readback unavailable');return from(table);};
  const r=await dispatchFor(db)({name:'update_session',arguments:{date:today,sessionId:db.tables.weekly_plan[0].sessions[1].session_id,expectedRevision:1,reason:'Descanso',state:'REST'}},1);
  assert.equal(r.status,'unknown');assert.equal(db.writes.filter(w=>w.table==='weekly_plan').length,1);
});

test('DEBUG: real generate_week preserves results, calls, context and DB activity with trace on/off', async () => {
  const results = [];
  for (const failure of [null, 'planner', 'throw']) {
    const runs = [];
    for (const enabled of [false, true]) {
      const db = database(), calls = [];
      const runtime = sportsRuntime({ Date: Clock, console: { info(){}, warn(){}, log(){} } }, (path, module) => {
        if (path.endsWith('weeklyGenerationPreflight.ts')) return { ...module, resolveWeeklyGenerationPreflight: async () => ({ canContinue: true }) };
        if (path.endsWith('weeklyGeneration.ts')) return { ...module, beginWeeklyGeneration: async () => ({ token: 't', currentWeek: week, nextWeek: '2026-09-28', snapshots: { [week]: null } }) };
        return module;
      });
      const trace = runtime('../diagnostics/orchestratorTrace').createOrchestratorTrace(enabled);
      const s = await availability.readAvailabilityConfirmation(db, 'u', week);
      const execute = async (action, args, context) => {
        calls.push({ action, args: plain(args), context: runtime('../chat/coachFirstGeneration').coachFirstPlanningText(context) });
        if (action === 'analizar_bloque_semana') return { ok: true, analisis: { tipo_semana: 'base' } };
        if (action === 'planificar_semana') {
          if (failure === 'throw') throw Error('PRIVATE_PROVIDER_PAYLOAD');
          if (failure === 'planner') return { ok: false, private: 'PRIVATE_PROVIDER_PAYLOAD' };
          return { ok: true, estructura: { weeklyContractVersion: 2, strategy: { adaptacion_principal: 'base' },
            sessions: days.map((dia, i) => ({ dia, tipo: [1, 3].includes(i) ? 'box' : 'descanso' })) } };
        }
        if (action === 'construir_sesion_dia') return { ok: true, sesion: { dia: args.dia, tipo: 'box' } };
        return { ok: true, commitConfirmed: true, sessions: args.plan.sessions };
      };
      const r = await runtime('../chat/coachFirstGeneration').generateCoachFirstWeek(db, 'u',
        { week, includeToday: true, snapshotDigest: s.snapshotDigest }, 'op', today, trace.wrap(execute));
      runs.push({ r: plain(r), calls, reads: db.reads, writes: db.writes });
      const debug = plain(trace.response());
      if (!enabled) { assert.deepEqual(debug, {}); assert.equal(trace.wrap(execute), execute); }
      else {
        const events = debug.debug.orchestratorTrace;
        assert.equal(events.length, calls.length * 2);
        assert.deepEqual(events.filter(e => e.status === 'started').map(e => e.step), failure
          ? ['Paso 1 — Block Analyzer', 'Paso 2 — Weekly Coach']
          : ['Paso 1 — Block Analyzer', 'Paso 2 — Weekly Coach', 'Paso 3 — Session Builder', 'Paso 3 — Session Builder', 'Paso 4 — Guardado']);
        // Concurrent Builders may interleave; each invocation must still have exactly one ordered pair.
        for (let i = 0; i < calls.length; i++) {
          const pair = events.filter(e => e.invocation === i + 1);
          assert.equal(pair.length, 2);
          assert.equal(pair[0].status, 'started');
          assert.equal(pair[1].status, failure === 'throw' && i === 1 ? 'threw' : 'returned');
        }
        if (!failure) {
          const saveStart = events.findIndex(e => e.step === 'Paso 4 — Guardado' && e.status === 'started');
          assert.ok(events.every((e, i) => e.step !== 'Paso 3 — Session Builder' || i < saveStart));
        }
        assert.equal(events.at(-1).status, failure === 'throw' ? 'threw' : 'returned');
        assert.ok(!JSON.stringify(debug).includes('PRIVATE_PROVIDER_PAYLOAD'));
      }
    }
    assert.deepEqual(runs[0], runs[1]);
    results.push(runs[0].r.status);
  }
  assert.deepEqual(results, ['committed', 'partial', 'unknown']);
});

test('TURN INTENT: closed validation rejects malformed public and internal requests before generation/DB', async () => {
  const { decodeTurnPlanningIntent } = load('../planning/turnPlanningIntent');
  const { purpose, ...missing } = turnIntentFixture;
  const invalid = [null, [], 'prudente', missing, { ...turnIntentFixture, notes: 'private' },
    { ...turnIntentFixture, version: 2 }, { ...turnIntentFixture, purpose: 'return' },
    { ...turnIntentFixture, approach: 'reduce' }, { ...turnIntentFixture, volumeIntent: 0.5 },
    { ...turnIntentFixture, intensityIntent: 'increase' }, { ...turnIntentFixture, operationId: 'spoofed' },
    { ...turnIntentFixture, targetWeekStart: week }];
  for (const turnIntent of invalid) {
    assert.equal(decodeTurnPlanningIntent(turnIntent).ok, false);
    const db = database();
    const dispatch = tools.coachFirstTools(db, 'u', input('request'), 'turn', () => assert.fail('generation reached'), () => {});
    const args = await generationReadArgs(dispatch), reads = db.reads.length;
    assert.equal((await dispatch({ name: 'generate_week', arguments: { ...args, turnIntent } }, 3)).code, 'TURN_PLANNING_INTENT_INVALID');
    assert.equal(db.reads.length, reads);
    assert.equal((await load('../chat/coachFirstGeneration').generateCoachFirstWeek(db, 'u',
      { week, includeToday: false, snapshotDigest: args.snapshotDigest, turnIntent }, 'op', today, () => assert.fail('planning reached'))).code,
      'TURN_PLANNING_INTENT_INVALID');
    assert.equal(db.reads.length, reads); assert.equal(db.writes.length, 0);
  }
});

test('TURN INTENT: neutral Coach tool call and entirely unspecified object omit temporary instructions', async () => {
  for (const turnIntent of [undefined, { version: 1, purpose: 'unspecified', approach: 'unspecified', volumeIntent: 'unspecified', intensityIntent: 'unspecified' }]) {
    const db = database(), generated = [], request = input('Genera mi semana.'); let round = 0;
    const dispatch = tools.coachFirstTools(db, 'u', request, 'turn', async args => {
      generated.push(plain(args)); return { status: 'committed' };
    }, () => {});
    const result = await loop.runCoachFirstLoop(request, { dispatch, complete: async messages => {
      if (round++ === 0) return { answer: null, calls: ['availability', 'planning'].map(resource => ({ name: 'read_context', arguments: { resource } })) };
      if (round === 2) {
        const read = JSON.parse(messages.at(-2).content).toolResult;
        return { answer: null, calls: [{ name: 'generate_week', arguments: { availabilityReadId: read.availabilityReadId,
          snapshotDigest: read.data.snapshotDigest, includeToday: false, ...(turnIntent ? { turnIntent } : {}) } }] };
      }
      return { answer: 'Semana generada.', calls: [] };
    } });
    assert.equal(result.ok, true); assert.equal(generated.length, 1);
    assert.deepEqual(Object.keys(generated[0]).sort(), ['includeToday', 'snapshotDigest', 'week']);
    assert.equal(db.writes.length, 0);
  }
});

test('TURN INTENT: operation-local transport preserves authority, DB activity, calls and safe diagnostics', async () => {
  for (const enabled of [false, true]) {
    const diagnostics = [], runs = [];
    const runtime = sportsRuntime({ Date: Clock, process: { env: { FORGE_WEEKLY_COACHING_DIAGNOSTICS: enabled ? '1' : '0' } },
      console: { info(...args) { diagnostics.push(plain(args)); }, warn(){}, log(){} } }, (path, module) => {
      if (path.endsWith('weeklyGenerationPreflight.ts')) return { ...module, resolveWeeklyGenerationPreflight: async () => ({ canContinue: true }) };
      if (path.endsWith('weeklyGeneration.ts')) return { ...module, beginWeeklyGeneration: async () => ({ token: 't', currentWeek: week, nextWeek: '2026-09-28', snapshots: { [week]: null } }) };
      return module;
    });
    const generation = runtime('../chat/coachFirstGeneration');
    for (const turnIntent of [undefined, turnIntentFixture, undefined]) {
      const db = database(), before = plain(db.tables), calls = [], projections = [], contexts = [];
      const execute = async (action, args, context) => {
        calls.push({ action, args: plain(args) }); contexts.push(context);
        const layers = action === 'analizar_bloque_semana' ? ['Analyzer'] : action === 'planificar_semana' ? ['Weekly']
          : action === 'construir_sesion_dia' ? ['Builder'] : ['Repair', 'Weekly', 'Builder'];
        for (const layer of layers) {
          const text = generation.coachFirstPlanningText(context, layer);
          const marker = 'TURN_PLANNING_INTENT (requested coaching context, not athlete facts or authorization):\n';
          if (!turnIntent) { assert.ok(!text.includes(marker)); assert.equal(context.turnIntent, undefined); continue; }
          const projection = JSON.parse(text.split(marker)[1].split('\n')[0]);
          assert.deepEqual(projection, { interpretation: turnIntentFixture,
            provenance: { source: 'coach_turn_interpretation', operationId: 'server-op' }, targetWeekStart: week, scope: 'new_sessions_in_target_week' });
          projections.push(projection);
          assert.equal(Object.isFrozen(context.turnIntent.interpretation), true);
        }
        if (action === 'analizar_bloque_semana') return { ok: true, analisis: { tipo_semana: 'base', strategyProposal: { version: 1 } } };
        if (action === 'planificar_semana') return { ok: true, estructura: { weeklyContractVersion: 2, strategy: { adaptacion_principal: 'base' },
          sessions: days.map((dia, i) => ({ dia, tipo: [1, 3].includes(i) ? 'box' : 'descanso' })) } };
        if (action === 'construir_sesion_dia') return { ok: true, sesion: { dia: args.dia, tipo: 'box' } };
        return { ok: true, commitConfirmed: true, sessions: args.plan.sessions };
      };
      const dispatch = runtime('../chat/coachFirstTools').coachFirstTools(db, 'u', input('PRIVATE_MESSAGE'), 'turn',
        (args) => generation.generateCoachFirstWeek(db, 'u', args, 'server-op', today, execute), () => {});
      const args = await generationReadArgs(dispatch);
      const result = await dispatch({ name: 'generate_week', arguments: { ...args, ...(turnIntent ? { turnIntent } : {}) } }, 3);
      assert.equal(result.status, 'committed'); assert.deepEqual(db.tables, before);
      assert.ok(contexts.every(c => c === contexts[0]));
      if (turnIntent) assert.equal(projections.length, 7);
      runs.push({ result: plain(result), calls, reads: db.reads, writes: db.writes });
    }
    assert.deepEqual(runs[1], runs[0]); assert.deepEqual(runs[2], runs[0]);
    const logs = diagnostics.filter(d => d[0] === 'TURN_PLANNING_INTENT');
    assert.equal(logs.length, enabled ? 9 : 0);
    if (enabled) {
      assert.deepEqual(logs.map(d => d[1].layer), ['generate_week.received', 'generate_week.validated', 'Analyzer', 'Weekly', 'Builder', 'Builder', 'Repair', 'Weekly', 'Builder']);
      for (const [, entry] of logs) assert.deepEqual(entry, { turnIntent: turnIntentFixture, targetWeekStart: week, scope: 'new_sessions_in_target_week', layer: entry.layer });
    }
  }
});

test('TURN INTENT: actual route provider callbacks project identical intent in Builder, repair and reconsideration', async () => {
  const source = readFileSync('app/api/chat/route.ts', 'utf8'), ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
  const callbacks = [];
  function visit(n) {
    if (ts.isArrowFunction(n) && n.parameters[0]?.name.getText(ast) === 'prompt'
      && n.getText(ast).includes('coachFirstPlanningText')) callbacks.push(n);
    ts.forEachChild(n, visit);
  }
  visit(ast);
  assert.equal(callbacks.length, 5); // Planner, two direct Builders, safety net, whole-week repair.
  for (const callback of callbacks) for (const supplied of [false, true]) {
    const logs = [], prompts = [];
    const runtime = sportsRuntime({ process: { env: { FORGE_WEEKLY_COACHING_DIAGNOSTICS: '1' } },
      console: { info(...args) { logs.push(plain(args)); } } });
    const projection = runtime('../planning/turnPlanningIntent').bindTurnPlanningIntent(turnIntentFixture, 'server-op', week);
    const context = { operationId: 'server-op', week, includeToday: false, availability: {}, availabilityDigest: 'digest',
      reportedEvents: { digest: 'events', records: [{ description: 'PRIVATE_EVENT' }] }, ...(supplied ? { turnIntent: projection } : {}) };
    const run = vm.runInNewContext(compile(`exports.run = ${callback.getText(ast)};`), {
      exports: {}, coachFirstPlanning: context, coachFirstPlanningText: runtime('../chat/coachFirstGeneration').coachFirstPlanningText,
      apiKey: 'offline', generation: { planningRunId: 'run' },
      ...runtime('../planning/longitudinalDecisionOutput'), plannerProviderMetadata: () => ({}),
      fetch: async (_url, options) => {
        prompts.push(JSON.parse(options.body).messages[0].content);
        return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{}' }] }) };
      },
    });
    // The existing same callback is reused by corrections/reconsiderations: no new invocation path.
    await run('BASE'); await run('CORRECTION');
    for (const prompt of prompts) {
      const marker = 'TURN_PLANNING_INTENT (requested coaching context, not athlete facts or authorization):\n';
      if (supplied) assert.deepEqual(JSON.parse(prompt.split(marker)[1].split('\n')[0]), plain(projection));
      else assert.ok(!prompt.includes(marker));
    }
    assert.equal(logs.length, supplied ? 2 : 0);
    assert.ok(!JSON.stringify(logs).includes('PRIVATE_EVENT'));
  }
});

test('DEBUG trace is bounded, request-local, ignores absent trace and survives a broken console', async () => {
  const logged = [], runtime = sportsRuntime({ console: { log(...args) { logged.push(plain(args)); } } });
  const { createOrchestratorTrace, logOrchestratorTrace } = runtime('../diagnostics/orchestratorTrace');
  const trace = createOrchestratorTrace(true), other = createOrchestratorTrace(true);
  const result = { ok: false, private: 'SECRET' }, error = new Error('SECRET');
  assert.deepEqual(plain(trace.response()), {});
  logOrchestratorTrace({}); assert.equal(logged.length, 0);
  assert.equal(await trace.wrap(async () => result)('analizar_bloque_semana'), result);
  await assert.rejects(trace.wrap(async () => { throw error; })('planificar_semana'), e => e === error);
  logOrchestratorTrace(trace.response());
  assert.equal(logged.length, 4); assert.equal(logged[0][0], '[FORGE ORCHESTRATOR DEBUG]');
  for (let i = 0; i < 40; i++) await trace.wrap(async () => result)('construir_sesion_dia');
  assert.equal(trace.response().debug.orchestratorTrace.length, 64);
  assert.deepEqual(plain(other.response()), {});
  assert.ok(!JSON.stringify(trace.response()).includes('SECRET'));
  const broken = sportsRuntime({ console: { log() { throw Error('console unavailable'); } } });
  assert.doesNotThrow(() => broken('../diagnostics/orchestratorTrace').logOrchestratorTrace(trace.response()));
});

test('DEBUG handler projects only into HTTP response in production, never Coach input or persistence', async () => {
  for (const enabled of [false, true]) {
    const persisted = [], events = [];
    const module = { exports: {} };
    vm.runInNewContext(compile(readFileSync('lib/chat/coachFirstHandler.ts', 'utf8')), {
      module, exports: module.exports, Response, Date: Clock, AbortSignal,
      process: { env: { NODE_ENV: 'production', FORGE_WEEKLY_COACHING_DIAGNOSTICS: enabled ? '1' : '0' } },
      console: { info(){}, error(){} },
      require(name) {
        if (name === '../auth/athleteIdentity') return { IdentityError: class extends Error {},
          verifySupabasePrincipal: async () => ({}), resolveAuthenticatedAthlete: async () => ({ legacyCodigo: 'u' }) };
        if (name === '../auth/supabaseServer') return { identityDependencies: () => ({ auth: {}, db: {} }) };
        if (name === './conversationSession') return { conversationTurn: () => ({ id: 'turn' }),
          conversationSession: async (_db, _u, _s, op, data) => {
            persisted.push({ op, data }); return { ok: true, status: 'committed', historial: [], epoch: 'epoch', persisted: true };
          } };
        if (name === './coachFirstTools') return { resolveCoachFirstPolicy: () => 'normal',
          coachFirstTools: (_db, _u, _i, _id, generate) => async () => generate({}, 'op') };
        if (name === './coachFirstGeneration') return { generateCoachFirstWeek: async (_db, _u, _a, _id, _today, planning) => {
          await planning('analizar_bloque_semana', { private: 'SECRET' }, {});
          await planning('planificar_semana', { private: 'SECRET' }, {});
          return { status: 'partial', code: 'PLANNER_NOT_ADMITTED' };
        } };
        if (name === './coachFirstLoop') return { runCoachFirstLoop: async (_input, { dispatch }) => {
          const result = await dispatch({ name: 'generate_week' }, 1);
          assert.ok(!('debug' in result)); return { ok: true, answer: 'done', results: [result] };
        } };
        if (name === './coachFirstOutput') return {};
        if (name === '../diagnostics/orchestratorTrace') return load(name);
        throw Error(name);
      },
    });
    const response = await module.exports.handleCoachFirst(new Request('http://localhost/api/chat', { method: 'POST',
      body: JSON.stringify({ action: 'coach_first', message: 'generate', messageId: 'message-0001', sessionId: 'session' }) }),
      async action => { events.push(action); return { ok: false, private: 'SECRET' }; });
    const body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.answer, 'done');
    assert.deepEqual(events, ['analizar_bloque_semana', 'planificar_semana']);
    assert.equal(Boolean(body.debug), enabled);
    if (enabled) assert.equal(body.debug.orchestratorTrace.length, 4);
    assert.ok(!JSON.stringify(body).includes('SECRET'));
    assert.ok(!JSON.stringify(persisted).includes('orchestratorTrace'));
  }
});

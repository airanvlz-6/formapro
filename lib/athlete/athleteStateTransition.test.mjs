import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';

const logs = [], load = sportsRuntime({ console: { info: (...args) => logs.push(plain(args)) } });
const { transitionAthleteState: transition } = load('../athlete/athleteStateTransition');
const canonical = load('../athlete/getCanonicalRestrictions').getCanonicalRestrictions;
const start = 'resolver_restriccion_atleta', finish = 'completar_reevaluacion_atleta';
const now = new Date('2026-09-13T12:00:00Z');
function database(state = 'restricted', fail = '') {
  const rows = { athlete_state_events: state ? [{ id: 's1', user_codigo: 'synthetic', estado: state, activo: true, motivo: 'private reason', fecha_inicio: '2026-09-01' }] : [],
    athlete_coaching_notes: [
      { id: 'n1', user_codigo: 'synthetic', constraint_level: 'hard', status: 'pending', movement: 'private movement', issue: 'private issue', valid_until: null },
      { id: 'n2', user_codigo: 'synthetic', constraint_level: 'reassessment', status: 'considerada', valid_until: null },
      { id: 'n3', user_codigo: 'other', constraint_level: 'reassessment', status: 'pending', valid_until: null },
      { id: 'n4', user_codigo: 'synthetic', constraint_level: 'reassessment', status: 'resuelta', valid_until: null },
    ] };
  const writes = [];
  return { rows, writes, from(table) {
    const filters = []; let operation = 'read', patch, single = false;
    const q = { select() { return q; }, eq(k,v) { filters.push(r => r[k] === v); return q; },
      in(k,vs) { filters.push(r => vs.includes(r[k])); return q; }, order() { return q; }, range() { return q; },
      update(value) { operation = 'update'; patch = value; return q; }, insert(value) { operation = 'insert'; patch = value; return q; },
      maybeSingle() { single = true; return q; }, then(resolve,reject) { return Promise.resolve().then(() => {
        if (fail === `${table}:${operation}`) return { data: null, error: { message: 'private DB error' } };
        let matched = rows[table].filter(r => filters.every(f => f(r)));
        if (operation !== 'read') writes.push({ table, operation, patch: plain(patch), ids: matched.map(r => r.id) });
        if (operation === 'update') matched.forEach(r => Object.assign(r, patch));
        if (operation === 'insert') { const row = { id: `s${rows[table].length+1}`, ...patch }; rows[table].push(row); matched = [row]; }
        if (single && matched.length > 1) return { data: null, error: { message: 'multiple rows' } };
        return { data: structuredClone(single ? matched[0] ?? null : matched), error: null };
      }).then(resolve,reject); } };
    return q;
  } };
}
test('restricted -> reassessment preserves history and hard -> reassessment remains canonical', async () => {
  const db = database(); logs.length = 0;
  const result = await transition(db, 'synthetic', start, false, now);
  assert.equal(result.nuevoEstado, 'reassessment');
  assert.equal(db.rows.athlete_state_events[0].activo, false);
  assert.equal(db.rows.athlete_state_events[0].fecha_fin, '2026-09-13');
  assert.equal(db.rows.athlete_state_events[1].estado, 'reassessment');
  const context = await canonical(db, 'synthetic', now);
  assert.equal(context.restrictions.length, 0); assert.equal(context.reassessments.length, 2);
  assert.equal(context.active, true); assert.equal(db.rows.athlete_coaching_notes.length, 4);
  assert.deepEqual(logs, [['ATHLETE_STATE_TRANSITION', { user: 'synthetic', from: 'restricted', to: 'reassessment', action: start }]]);
  assert.doesNotMatch(JSON.stringify(logs), /private|motivo|issue|reason_description/);
});
test('reassessment + resolver is a strict no-write no-op, including repeated calls', async () => {
  const db = database('reassessment'), before = structuredClone(db.rows);
  for (let n=0;n<3;n++) assert.equal((await transition(db, 'synthetic', start, false, now)).motivo, 'ya_en_reevaluacion');
  assert.deepEqual(db.rows, before); assert.equal(db.writes.length, 0);
});
test('explicit completion closes reassessment notes to existing resuelta status without deletion', async () => {
  const db = database(); await transition(db, 'synthetic', start, false, now);
  const result = await transition(db, 'synthetic', finish, true, now);
  assert.equal(result.nuevoEstado, 'normal');
  assert.equal(db.rows.athlete_state_events.length, 2); assert.ok(db.rows.athlete_state_events.every(s => !s.activo));
  assert.equal(db.rows.athlete_coaching_notes.length, 4);
  assert.equal(db.rows.athlete_coaching_notes[0].status, 'resuelta');
  assert.equal(db.rows.athlete_coaching_notes[1].status, 'resuelta');
  assert.equal(db.rows.athlete_coaching_notes[2].status, 'pending');
  const context = await canonical(db, 'synthetic', now);
  assert.equal(context.state, null); assert.equal(context.active, false);
  assert.equal(context.restrictions.length, 0); assert.equal(context.reassessments.length, 0);
});
for (const state of [null, 'normal', 'restricted']) test(`completion cannot advance ${state}`, async () => {
  const db = database(state), before = structuredClone(db.rows);
  assert.equal((await transition(db, 'synthetic', finish, true, now)).resuelto, false);
  assert.equal(db.writes.length, 0); assert.deepEqual(db.rows, before);
});
test('completion requires explicit boolean confirmation; dates never finish reassessment', async () => {
  const db = database('reassessment');
  for (const confirmation of [false, undefined, 'true']) assert.equal((await transition(db, 'synthetic', finish, confirmation, now)).code, 'ATHLETE_STATE_CONFIRMATION_REQUIRED');
  assert.equal(db.writes.length, 0);
});
test('completion leaves independent hard and soft notes unchanged', async () => {
  const db = database('reassessment');
  await transition(db, 'synthetic', finish, true, now);
  assert.equal(db.rows.athlete_coaching_notes[0].constraint_level, 'hard');
  assert.equal(db.rows.athlete_coaching_notes[0].status, 'pending');
  const context = await canonical(db, 'synthetic', now);
  assert.equal(context.restrictions.length, 1); assert.equal(context.reassessments.length, 0);
});
test('concurrent starts cannot append two reassessment events', async () => {
  const db = database();
  const results = await Promise.all([transition(db,'synthetic',start,false,now), transition(db,'synthetic',start,false,now)]);
  assert.equal(results.filter(r => r.resuelto).length, 1);
  assert.equal(db.rows.athlete_state_events.filter(s => s.activo).length, 1);
  assert.equal(db.rows.athlete_state_events.length, 2);
});
for (const failure of ['athlete_state_events:read', 'athlete_state_events:update', 'athlete_state_events:insert', 'athlete_coaching_notes:update'])
  test(`DB failure ${failure} never reports success or loses hard notes`, async () => {
    const db = database('restricted', failure);
    const result = await transition(db,'synthetic',start,false,now);
    assert.equal(result.ok, false); assert.doesNotMatch(JSON.stringify(result), /private/);
    assert.equal(db.rows.athlete_coaching_notes[0].constraint_level, 'hard');
  });
test('failed completion notes write reports partial failure and leaves canonical protective notes', async () => {
  const db = database('reassessment', 'athlete_coaching_notes:update');
  const result = await transition(db,'synthetic',finish,true,now);
  assert.equal(result.ok, false); assert.equal(result.partial, true);
  assert.equal((await canonical(db,'synthetic',now)).reassessments.length, 1);
});

// Execute the real HTTP branches, not a duplicate action dispatcher.
const source = readFileSync('app/api/chat/route.ts','utf8');
const root = ts.createSourceFile('route.ts',source,99,true);
function find(n,p) { if(p(n)) return n; return ts.forEachChild(n,c=>find(c,p)); }
for (const action of [start,finish]) test(`actual HTTP ${action} delegates the explicit action with no LLM`, async () => {
  const node = find(root,n=>ts.isIfStatement(n)&&n.expression.getText(root)===`action === "${action}"`);
  const code = ts.transpileModule(`async function run() ${node.thenStatement.getText(root)}; run;`,{compilerOptions:{target:99,module:1}}).outputText;
  const db = database(action===start?'restricted':'reassessment');
  const run = vm.runInNewContext(code,{ supabase:db,codigo:'synthetic',action,datos:{confirmado:true},transitionAthleteState:transition,
    NextResponse:{json:(body,init)=>({body,status:init.status})},fetch(){throw new Error('LLM forbidden')} });
  const r = await run(); assert.equal(r.status,200); assert.equal(r.body.resuelto,true);
});

import test, {before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {sportsRuntime, compile} from '../sports/trainingContractTestRuntime.mjs';
import {workoutSqlTestDatabase} from './workoutSqlTestDatabase.mjs';

// FORGE CORE-REG V2 / COACH MOBILE — proves obtener_plan_semana_v2 and getAthleteContext project
// canonical running_execution_records evidence exactly like obtener_plan_semana (non-v2), via the
// SAME reused projectWorkoutPlans/readWorkouts — never a reimplementation, never a weekly_plan write.
const runtime = sportsRuntime();
const registry = runtime('../execution/workoutRegistry');
const {projectWorkoutPlans} = runtime('../execution/workoutProjections');
const {resolveCompletionDate} = runtime('../planning/recordCompletion');
const activity = runtime('../execution/workoutActivity');
const {resolveCurrentWeekState} = runtime('../planning/resolveCurrentWeekState');
const athlete = 'synthetic-plan-v2-athlete';
// The real handler resolves "today" via Atlantic/Canary wall-clock time (new Date(), not an
// injectable parameter), so the fixture's week MUST be the athlete's actual current civil week —
// computed with the exact same civilWeekStart() the production resolver uses, not a second
// ad-hoc algorithm — for resolveCurrentWeekState to find this row as PLAN_ACTIVE for "today".
const {civilWeekStart} = runtime('../planning/civilCalendar');
const todayStr = new Date().toLocaleDateString('en-CA', {timeZone:'Atlantic/Canary'});
const week = civilWeekStart(todayStr);
const today = todayStr;
const planId = 'f3b6b2f0-1f2d-4e8a-9a8a-9a1c2e3d4f5a';
const sessionId = 'bf7a8c11-2222-4e8a-9a8a-9a1c2e3d4f5b';
const days = ['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
const fixture = () => ({id:planId,user_codigo:athlete,week_start:week,sessions:days.map((dia,i) => ({
  session_id:i ? `slot-${i}` : sessionId,dia,tipo:'box',titulo:'Prescripción',descripcion:'Trabajo prescrito',completada:false,
}))});
const workout = (relation='performed',slot=sessionId) => ({executedOn:week,discipline:'box',title:'Trabajo realizado',
  description:'Descripción factual del entrenamiento',prescription:{planId,sessionId:slot,relation}});
let sql, db;
before(async()=>{
  sql = new PGlite();
  await sql.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE weekly_plan(id text PRIMARY KEY,user_codigo text,week_start text,sessions jsonb);
    CREATE TABLE usuarios(codigo text PRIMARY KEY,workout_history jsonb,modo_entrada text);`);
  for(const file of ['b32c-running-execution-records','core-reg-1-workouts','core-reg-pagination'])
    await sql.exec(readFileSync(`docs/sql/${file}.sql`,'utf8'));
  db = workoutSqlTestDatabase(sql);
});
beforeEach(async()=>{
  await sql.exec('TRUNCATE running_execution_records,weekly_plan,usuarios');
  await sql.query('INSERT INTO weekly_plan VALUES ($1,$2,$3,$4)',[planId,athlete,week,JSON.stringify(fixture().sessions)]);
  await sql.query('INSERT INTO usuarios VALUES ($1,$2,$3)',[athlete,'[]','planificacion']);
});
after(async()=>{await sql.close();});
const create = (id='create',data=workout()) => registry.recordWorkout(db,athlete,{requestId:id,confirmed:true,workout:data},today);

// Execute the real obtener_plan_semana_v2 branch, not a hand-copied reimplementation.
const source = ts.createSourceFile('route.ts',readFileSync('app/api/chat/route.ts','utf8'),99,true);
let branch;
function visit(node) {
  if(ts.isIfStatement(node) && node.expression.getText(source) === 'action === "obtener_plan_semana_v2"') branch=node;
  ts.forEachChild(node,visit);
}
visit(source); assert.ok(branch);
async function readPlanV2(database=db, codigo=athlete) {
  const run=vm.runInNewContext(compile(`async function run(){${branch.getText(source)}};run;`),{
    action:'obtener_plan_semana_v2',codigo,supabase:database,
    readWorkouts:registry.readWorkouts,projectWorkoutPlans,resolveCompletionDate,resolveCurrentWeekState,
    describeWeekActivity:activity.describeWeekActivity,prescribedSessionDate:activity.prescribedSessionDate,
    Date,
    NextResponse:{json:(body,options)=>({body,status:options?.status??200})},
  });
  return run();
}

test('A: recordWorkout vinculado -> obtener_plan_semana_v2 -> forge_context.execution === completed',async()=>{
  const {record}=await create();
  const response=await readPlanV2();
  assert.equal(response.status,200);
  const session=response.body.sessions.find(s=>s.session_id===sessionId);
  assert.ok(session,'session_id must be exposed in the v2 response');
  assert.equal(session.forge_context.execution,'completed');
  assert.equal(response.body.planId,planId);
  assert.ok(record.executionId);
});

test('B: weekly_plan permanece byte-for-byte sin modificar',async()=>{
  const before=(await sql.query('SELECT * FROM weekly_plan')).rows;
  await create();
  await readPlanV2();
  assert.deepEqual((await sql.query('SELECT * FROM weekly_plan')).rows,before);
});

test('C: recordWorkout sin prescription -> ninguna sesion pasa a completed',async()=>{
  const unlinked={executedOn:week,discipline:'box',title:'Sin vincular',description:'Entreno libre sin prescripcion'};
  await create('unlinked',unlinked);
  const response=await readPlanV2();
  for(const s of response.body.sessions) assert.notEqual(s.forge_context.execution,'completed');
});

test('session_id and planId are always present in the v2 response shape',async()=>{
  const response=await readPlanV2();
  assert.equal(response.body.planId,planId);
  for(const s of response.body.sessions) assert.ok(typeof s.session_id==='string' && s.session_id.length>0);
});

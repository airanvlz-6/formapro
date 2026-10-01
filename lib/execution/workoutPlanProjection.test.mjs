import test, {before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {PGlite} from '@electric-sql/pglite';
import {sportsRuntime, compile, plain} from '../sports/trainingContractTestRuntime.mjs';
import {workoutSqlTestDatabase} from './workoutSqlTestDatabase.mjs';

const runtime = sportsRuntime();
const registry = runtime('../execution/workoutRegistry');
const {projectWorkoutPlans} = runtime('../execution/workoutProjections');
const {resolveCompletionDate} = runtime('../planning/recordCompletion');
const athlete = 'synthetic-plan-athlete', week = '2026-09-28', today = '2026-10-01';
const planId = '49a685c2-7354-4ed0-8316-b1e5c2c51fcd';
const sessionId = '826e3a9d-453f-4208-84ec-1ff37ba57e30';
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
    CREATE TABLE usuarios(codigo text PRIMARY KEY,workout_history jsonb);`);
  for(const file of ['b32c-running-execution-records','core-reg-1-workouts','core-reg-pagination'])
    await sql.exec(readFileSync(`docs/sql/${file}.sql`,'utf8'));
  db = workoutSqlTestDatabase(sql);
});
beforeEach(async()=>{
  await sql.exec('TRUNCATE running_execution_records,weekly_plan,usuarios');
  await sql.query('INSERT INTO weekly_plan VALUES ($1,$2,$3,$4)',[planId,athlete,week,JSON.stringify(fixture().sessions)]);
});
after(async()=>{await sql.close();});
const create = (id='create',data=workout()) => registry.recordWorkout(db,athlete,{requestId:id,confirmed:true,workout:data},today);
const edit = (r,data) => registry.updateWorkout(db,athlete,{requestId:`edit-${r.revision}`,confirmed:true,
  executionId:r.executionId,expectedRevision:r.revision,workout:data},today);
const project = async(plan=fixture()) => projectWorkoutPlans([plan],await registry.readWorkouts(db,athlete,true))[0];

// Execute the real route branch with local SQL and canonical readers, not a copied route implementation.
const source = ts.createSourceFile('route.ts',readFileSync('app/api/chat/route.ts','utf8'),99,true);
let branch;
function visit(node) {
  if(ts.isIfStatement(node) && node.expression.getText(source) === 'action === "obtener_plan_semana"') branch=node;
  ts.forEachChild(node,visit);
}
visit(source); assert.ok(branch);
async function readPlan(database=db, codigo=athlete, requestedWeek=week) {
  const run=vm.runInNewContext(compile(`async function run(){${branch.getText(source)}};run;`),{
    action:'obtener_plan_semana',datos:{week_start:requestedWeek},codigo,supabase:database,
    readWorkouts:registry.readWorkouts,projectWorkoutPlans,resolveCompletionDate,
    NextResponse:{json:(body,options)=>({body,status:options?.status??200})},
  });
  return run();
}

// Render the real Plan counter and selected session card; only lifecycle/state/transport are replaced.
function renderPlan(plan) {
  const states=[true,plan,null,null,week,false,true,'',null,0,false]; let index=0;
  const module={exports:{}};
  const page=readFileSync('app/plan/page.tsx','utf8')+'\nexport { PlanContent };';
  vm.runInNewContext(ts.transpileModule(page,{compilerOptions:{target:99,module:1,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
    module,exports:module.exports,require(name){
      if(name==='react/jsx-runtime')return jsxRuntime;
      if(name==='react')return {useEffect(){},useState(){return [states[index++],()=>{}];}};
      if(name==='../auth/AuthenticatedSurface')return {default:()=>null};
      if(name==='@/lib/auth/authenticatedFetch')return {authenticatedFetch(){assert.fail('NO_NETWORK');}};
      if(name==='@/lib/sports/planPresentation')return runtime('planPresentation');
      if(name==='@/lib/sports/sessionPresentation')return runtime('sessionPresentation');
      throw Error('Unexpected dependency '+name);
    },
  });
  return renderToStaticMarkup(module.exports.PlanContent({codigo:athlete}));
}

test('Plan route: exact performed execution projects 1/7 and completed card without writing weekly_plan',async()=>{
  const before=(await sql.query('SELECT * FROM weekly_plan')).rows;
  const {record}=await create(); db.reads.length=0;
  const response=await readPlan(); assert.equal(response.status,200);
  const session=response.body.plan.sessions[0];
  assert.equal(session.completada,true);assert.equal(session.descripcion_real,record.data.description);
  assert.equal(session.titulo_real,record.data.title);
  assert.deepEqual(plain(session.canonicalExecutions),[{executionId:record.executionId,revision:1,executedOn:week}]);
  assert.match(renderPlan(response.body.plan),/>1\/7</);assert.match(renderPlan(response.body.plan),/✅ Completada/);
  assert.equal(db.reads.filter(r=>r.table==='weekly_plan').length,1);
  assert.deepEqual((await sql.query('SELECT * FROM weekly_plan')).rows,before);
});

test('replaced remains real workout evidence but does not complete original prescription',async()=>{
  await create('replacement',workout('replaced'));
  const plan=(await readPlan()).body.plan;
  assert.equal(plan.sessions[0].completada,false);assert.equal(plan.sessions[0].descripcion_real,null);
  assert.deepEqual(plain(plan.sessions[0].canonicalExecutions),[]);
  assert.match(renderPlan(plan),/>0\/7</);assert.doesNotMatch(renderPlan(plan),/✅ Completada/);
  assert.equal((await registry.readWorkouts(db,athlete))[0].data.prescription.relation,'replaced');
});

test('tombstone supersedes performed revision and clears stale managed completion',async()=>{
  const {record}=await create();
  await registry.deleteWorkout(db,athlete,{requestId:'delete',confirmed:true,executionId:record.executionId,expectedRevision:1},today);
  const stale=fixture();stale.sessions[0].completada=true;stale.sessions[0].descripcion_real='Stale projection';
  const result=await project(stale);assert.equal(result.sessions[0].completada,false);
  assert.equal(result.sessions[0].descripcion_real,null);assert.equal(stale.sessions[0].completada,true);
  assert.equal((await readPlan()).body.plan.sessions[0].completada,false);
});

for(const change of ['relinked','unlinked','replaced'])test(`${change}: only current revision counts; historical references never complete`,async()=>{
  const {record}=await create();const data=workout(change==='replaced'?'replaced':'performed',change==='relinked'?'slot-1':sessionId);
  if(change==='unlinked')delete data.prescription;
  await edit(record,data);
  const rows=await registry.readWorkouts(db,athlete,true);
  assert.equal(rows.length,1);assert.equal(rows[0].revision,2);
  assert.ok(rows[0].prescriptionReferences.some(p=>p.sessionId===sessionId));
  const plan=(await readPlan()).body.plan;assert.equal(plan.sessions[0].completada,false);
  assert.equal(plan.sessions[1].completada,change==='relinked');
  assert.match(renderPlan(plan),change==='relinked'?/>1\/7</:/>0\/7</);
  assert.equal((await sql.query('SELECT count(*) n FROM running_execution_records')).rows[0].n,2);
});

test('two performed executions complete one session only; deleting one preserves the other',async()=>{
  const a=await create('a');await create('b');
  let plan=(await readPlan()).body.plan;assert.equal(plan.sessions[0].canonicalExecutions.length,2);
  assert.match(renderPlan(plan),/>1\/7</);
  await registry.deleteWorkout(db,athlete,{requestId:'delete-a',confirmed:true,executionId:a.record.executionId,expectedRevision:1},today);
  plan=(await readPlan()).body.plan;assert.equal(plan.sessions[0].canonicalExecutions.length,1);assert.match(renderPlan(plan),/>1\/7</);
});

test('unmanaged legacy sessions preserve prior state, description and evidence',async()=>{
  const legacy=fixture();Object.assign(legacy.sessions[2],{completada:true,descripcion_real:'Legacy evidence',chatExecutionEvidence:[{operationId:'old'}]});
  const before=plain(legacy);await create();const result=await project(legacy);
  assert.deepEqual(plain(result.sessions[2]),before.sessions[2]);assert.deepEqual(plain(legacy),before);
  assert.match(renderPlan(result),/>2\/7</);
});

test('exact plan/session identity, athlete scope and execution date independent of prescribed date',async()=>{
  await create('later',{...workout(),executedOn:'2026-09-30'});
  assert.equal((await readPlan()).body.plan.sessions[0].completada,true);
  assert.equal((await project({...fixture(),id:'another-plan'})).sessions[0].completada,false);
  assert.equal((await readPlan(db,'another-athlete')).body.plan,null);
});

test('canonical read failure returns 503, never a successful misleading legacy count',async()=>{
  const failed={from(table){if(table==='weekly_plan')return db.from(table);throw Error('offline failure');}};
  const response=await readPlan(failed);assert.equal(response.status,503);assert.equal(response.body.code,'WORKOUT_READ_FAILED');
});

test('missing week avoids canonical reads; invalid week keeps existing validation',async()=>{
  db.reads.length=0;assert.equal((await readPlan(db,athlete,'2026-09-21')).body.plan,null);
  assert.equal(db.reads.filter(r=>r.table==='workout_read_rows').length,0);
  assert.equal((await readPlan(db,athlete,'2026-09-29')).status,400);
});

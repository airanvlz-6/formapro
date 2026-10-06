import test, {before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {sportsRuntime, compile} from '../sports/trainingContractTestRuntime.mjs';
import {workoutSqlTestDatabase} from '../execution/workoutSqlTestDatabase.mjs';

// FORGE COACH MOBILE — proves getAthleteContext.ts's planSemanal construction applies the SAME
// canonical projection (projectWorkoutPlans/readWorkouts) as obtener_plan_semana_v2, so a linked
// recordWorkout shows the session as completed in the factual context sent to the Coach — the LLM
// writes nothing. We extract the real planSemanal statements from the real file via the TypeScript
// AST (not a hand-copied reimplementation) and execute them in isolation, injecting a `supabase`
// stub, to avoid the module's top-level createClient()/network fetch() for estadoCanonico.
const runtime = sportsRuntime();
const registry = runtime('../execution/workoutRegistry');
const {projectWorkoutPlans} = runtime('../execution/workoutProjections');
const athlete = 'synthetic-coach-athlete';
const {civilWeekStart} = runtime('../planning/civilCalendar');
// getAthleteContext.ts resolves "today"/weekStart via Europe/Madrid, a pre-existing, separately
// flagged inconsistency with the Atlantic/Canary used elsewhere — out of scope to fix here, so the
// test fixture must match THIS file's own timezone, not civilWeekStart's Atlantic/Canary callers.
const todayMadrid = new Date().toLocaleDateString('en-CA', {timeZone:'Europe/Madrid'});
const week = civilWeekStart(todayMadrid);
const today = todayMadrid;
const planId = '7c9e1a20-aaaa-4e8a-9a8a-9a1c2e3d4f5c';
const sessionId = '7c9e1a20-bbbb-4e8a-9a8a-9a1c2e3d4f5d';
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

// Extract the real "planSemanal — requiere query separada..." statement block from the real
// source file, between its marker comment and the blockOutcomes query that follows it.
const fileText = readFileSync('lib/mobile/getAthleteContext.ts','utf8');
const startMarker = '// planSemanal — requiere query separada';
const endMarker = '// blockOutcomes — replica EXACTA';
const startIdx = fileText.indexOf(startMarker);
const endIdx = fileText.indexOf(endMarker);
assert.ok(startIdx>=0 && endIdx>startIdx);
const block = fileText.slice(startIdx,endIdx);

async function resolvePlanSemanal(database=db, codigo=athlete) {
  const run=vm.runInNewContext(compile(`async function run(){${block} return planSemanal;};run;`),{
    supabase:database, readWorkouts:registry.readWorkouts, projectWorkoutPlans, codigo,
    Date,
  });
  return run();
}

test('G: Coach Mobile recibe la sesion como completada tras una ejecucion vinculada',async()=>{
  await create();
  const planSemanal = await resolvePlanSemanal();
  assert.ok(planSemanal,'planSemanal must resolve for the current week fixture');
  const session = planSemanal.sessions.find(s=>s.session_id===sessionId);
  assert.equal(session.completada,true);
});

test('Coach Mobile: unlinked execution does not complete any session',async()=>{
  await create('unlinked',{executedOn:week,discipline:'box',title:'Libre',description:'Sin vincular'});
  const planSemanal = await resolvePlanSemanal();
  for(const s of planSemanal.sessions) assert.notEqual(s.completada,true);
});

test('Coach Mobile: weekly_plan stays unmodified after projection',async()=>{
  const before=(await sql.query('SELECT * FROM weekly_plan')).rows;
  await create();
  await resolvePlanSemanal();
  assert.deepEqual((await sql.query('SELECT * FROM weekly_plan')).rows,before);
});

import test, {before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {sportsRuntime, compile} from '../sports/trainingContractTestRuntime.mjs';
import {workoutSqlTestDatabase} from './workoutSqlTestDatabase.mjs';

// FORGE PROGRESO / ADHERENCIA — proves calcular_adherencia counts canonical
// running_execution_records evidence (test D), preserves recent legacy workout_history inside the
// 7/28-day windows during the transition (test E), and never double-counts an execution that is
// represented in BOTH legacy workout_history and canonical running_execution_records (test F) —
// via the exact same executionId/workout_id/operationId dedup idiom already used by
// lib/core/recentTrainingEvidence.ts, not a new ad-hoc reimplementation.
const runtime = sportsRuntime();
const registry = runtime('../execution/workoutRegistry');
const {resolveCompletionDate} = runtime('../planning/recordCompletion');
const {projectWorkoutPlans} = runtime('../execution/workoutProjections');
const activity = runtime('../execution/workoutActivity');
const calendar = runtime('../planning/civilCalendar');
const athlete = 'synthetic-adherencia-athlete', today = new Date().toISOString().slice(0,10);
let sql, db;
before(async()=>{
  sql = new PGlite();
  await sql.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE weekly_plan(id text PRIMARY KEY,user_codigo text,week_start text,sessions jsonb);
    CREATE TABLE usuarios(codigo text PRIMARY KEY,workout_history jsonb,perfil jsonb,ciclo_actual jsonb);`);
  for(const file of ['b32c-running-execution-records','core-reg-1-workouts','core-reg-pagination'])
    await sql.exec(readFileSync(`docs/sql/${file}.sql`,'utf8'));
  db = workoutSqlTestDatabase(sql);
});
beforeEach(async()=>{
  await sql.exec('TRUNCATE running_execution_records,weekly_plan,usuarios');
});
after(async()=>{await sql.close();});
const create = (id,data) => registry.recordWorkout(db,athlete,{requestId:id,confirmed:true,workout:data},today);
const daysAgo = (n) => new Date(Date.now()-n*86400000).toISOString().slice(0,10);

const source = ts.createSourceFile('route.ts',readFileSync('app/api/chat/route.ts','utf8'),99,true);
let branch;
function visit(node) {
  if(ts.isIfStatement(node) && node.expression.getText(source) === 'action === "calcular_adherencia"') branch=node;
  ts.forEachChild(node,visit);
}
visit(source); assert.ok(branch);
async function adherencia(database=db, codigo=athlete) {
  const run=vm.runInNewContext(compile(`async function run(){${branch.getText(source)}};run;`),{
    action:'calcular_adherencia',codigo,supabase:database,
    readWorkouts:registry.readWorkouts,resolveCompletionDate,currentExecutions:activity.currentExecutions,projectWorkoutPlans,
    prescribedAdherence:activity.prescribedAdherence,addCivilDays:calendar.addCivilDays,civilWeekStart:calendar.civilWeekStart,
    NextResponse:{json:(body,options)=>({body,status:options?.status??200})},
  });
  return run();
}

test('D: calcular_adherencia contabiliza una ejecucion de running_execution_records',async()=>{
  await sql.query('INSERT INTO usuarios VALUES ($1,$2,$3,$4)',[athlete,'[]',JSON.stringify({dias:'3 dias'}),JSON.stringify({semana:1})]);
  await create('a',{executedOn:daysAgo(1),discipline:'box',title:'Hoy',description:'Entreno canonico reciente'});
  const response=await adherencia();
  assert.equal(response.status,200);
  assert.ok(response.body.adherencia7 > 0, 'a canonical execution within 7 days must count');
});

test('E: no se pierde historico legacy relevante de las ventanas 7/28 dias',async()=>{
  const legacy=[{fecha:daysAgo(2),tipo:'carrera',workout_id:'legacy-1'}];
  await sql.query('INSERT INTO usuarios VALUES ($1,$2,$3,$4)',[athlete,JSON.stringify(legacy),JSON.stringify({dias:'3 dias'}),JSON.stringify({semana:1})]);
  // No canonical executions at all — only legacy. A clean cutover that stops reading
  // workout_history would silently regress this athlete's recent adherencia to zero.
  const response=await adherencia();
  assert.ok(response.body.adherencia7 > 0, 'recent legacy workout_history evidence must still count inside the 7-day window');
});

test('F: no existe doble conteo si la misma ejecucion aparece en legacy + canonical',async()=>{
  const {record}=await create('a',{executedOn:daysAgo(1),discipline:'box',title:'Dup',description:'Representada en ambas fuentes'});
  // Simulate a legacy row referencing the SAME execution via workout_id, as recentTrainingEvidence's
  // dedup idiom expects during the transition window.
  const legacy=[{fecha:daysAgo(1),tipo:'box',workout_id:record.executionId}];
  await sql.query('INSERT INTO usuarios VALUES ($1,$2,$3,$4)',[athlete,JSON.stringify(legacy),JSON.stringify({dias:'7 dias'}),JSON.stringify({semana:1})]);
  const response=await adherencia();
  // 7 planned days, 1 real execution counted once -> ceil(1/7*100) = 14, never 28 (double count).
  assert.equal(response.body.adherencia7, 14);
});

test('unrelated-only legacy entries and zero evidence yield zero adherencia, never an error',async()=>{
  await sql.query('INSERT INTO usuarios VALUES ($1,$2,$3,$4)',[athlete,'[]',JSON.stringify({dias:'3 dias'}),JSON.stringify({semana:1})]);
  const response=await adherencia();
  assert.equal(response.status,200);
  assert.equal(response.body.adherencia7,0);
  assert.equal(response.body.diasSemana,3);
});

import test, {before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {sportsRuntime, compile} from '../sports/trainingContractTestRuntime.mjs';
import {workoutSqlTestDatabase} from './workoutSqlTestDatabase.mjs';

// PLAN vs EXECUTION. PLAN = what Forge wanted; EXECUTION = what the athlete really did.
// `completada` / forge_context.execution answer "was the PRESCRIBED session performed?" (only a
// linked relation='performed' execution). `dayTrained` answers "did the athlete train that civil
// day?" from EVERY current canonical execution. Real route branches run against real SQL views.
const runtime = sportsRuntime();
const registry = runtime('../execution/workoutRegistry');
const {projectWorkoutPlans} = runtime('../execution/workoutProjections');
const activity = runtime('../execution/workoutActivity');
const calendar = runtime('../planning/civilCalendar');
const {resolveCompletionDate} = runtime('../planning/recordCompletion');
const {resolveCurrentWeekState} = runtime('../planning/resolveCurrentWeekState');
const {calcularFrecuenciaRealRelativa} = runtime('../sports/trainingFrequencySafetyNet');
const athlete = 'synthetic-semantics-athlete';
const today = new Date().toLocaleDateString('en-CA', {timeZone:'Atlantic/Canary'});
const week = calendar.civilWeekStart(today);
const planId = 'a1b2c3d4-0000-4000-8000-000000000001';
const days = ['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
const key = s => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const todayIndex = calendar.calendarDays.indexOf(key(new Date(today+'T12:00:00Z').toLocaleDateString('es-ES',{weekday:'long',timeZone:'UTC'})));
const todaySessionId = `slot-${todayIndex}`;
const sessions = (overrides={}) => days.map((dia,i) => ({session_id:`slot-${i}`,dia,tipo:'box',titulo:'Prescripción',
  descripcion:'Trabajo prescrito',completada:false,...(i === todayIndex ? overrides : {})}));
const link = (relation='performed',sessionId=todaySessionId) => ({planId,sessionId,relation});
const workout = (extra={}) => ({executedOn:today,discipline:'box',title:'Trabajo realizado',description:'Descripción factual del entrenamiento',...extra});
let sql, db;
before(async()=>{
  sql = new PGlite();
  await sql.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE weekly_plan(id text PRIMARY KEY,user_codigo text,week_start text,sessions jsonb);
    CREATE TABLE usuarios(codigo text PRIMARY KEY,workout_history jsonb,modo_entrada text,perfil jsonb,ciclo_actual jsonb);
    CREATE TABLE readiness_checkins(user_codigo text,fecha text,readiness_score int);`);
  for(const file of ['b32c-running-execution-records','core-reg-1-workouts','core-reg-pagination'])
    await sql.exec(readFileSync(`docs/sql/${file}.sql`,'utf8'));
  db = workoutSqlTestDatabase(sql);
});
const seed = async (sessionOverrides={}, history=[]) => {
  await sql.exec('TRUNCATE running_execution_records,weekly_plan,usuarios,readiness_checkins');
  await sql.query('INSERT INTO weekly_plan VALUES ($1,$2,$3,$4)',[planId,athlete,week,JSON.stringify(sessions(sessionOverrides))]);
  await sql.query('INSERT INTO usuarios VALUES ($1,$2,$3,$4,$5)',[athlete,JSON.stringify(history),'planificacion',JSON.stringify({dias:'3 dias'}),JSON.stringify({semana:1})]);
};
beforeEach(async()=>seed());
after(async()=>{await sql.close();});
const create = (id,data=workout()) => registry.recordWorkout(db,athlete,{requestId:id,confirmed:true,workout:data},today);

const source = ts.createSourceFile('route.ts',readFileSync('app/api/chat/route.ts','utf8'),99,true);
const branches = {};
(function visit(node){
  if(ts.isIfStatement(node)){const e=node.expression.getText(source);
    if(/^action === "(obtener_today_state|obtener_plan_semana_v2|calcular_adherencia)"$/.test(e)) branches[e.slice(12,-1)]=node;}
  ts.forEachChild(node,visit);
})(source);
for(const name of ['obtener_today_state','obtener_plan_semana_v2','calcular_adherencia']) assert.ok(branches[name],name);
const respond = {json:(body,options)=>({body,status:options?.status??200})};
const captured = {};
async function runBranch(name, extra={}) {
  return vm.runInNewContext(compile(`async function run(){${branches[name].getText(source)}};run;`),{
    action:name,codigo:athlete,supabase:db,Date,NextResponse:respond,
    readWorkouts:registry.readWorkouts,projectWorkoutPlans,resolveCompletionDate,resolveCurrentWeekState,
    describeWeekActivity:activity.describeWeekActivity,describeDayActivity:activity.describeDayActivity,
    prescribedSessionDate:activity.prescribedSessionDate,combineActualActivity:activity.combineActualActivity,
    currentExecutions:activity.currentExecutions,prescribedAdherence:activity.prescribedAdherence,
    addCivilDays:calendar.addCivilDays,civilWeekStart:calendar.civilWeekStart,calcularFrecuenciaRealRelativa,
    prepareCanonicalReadiness:async()=>({ok:true,points:[],baselines:{},physiology:{}}),
    calcularReadiness:(_p,frequency)=>{captured.frequency=frequency;return {estado:'READY',score:50,resumenTexto:'',dataCompleteness:1,missingSignals:[],contribuyentes:[]};},
    scoreAForgeState:()=>'READY',combinarConCheckinSubjetivo:()=>({hayDiscrepancia:false,mensajeDiscrepancia:''}),
    contextualSessionIntensity:()=>null,evaluarRelevanciaContextual:()=>({nivel:'ninguno',mensaje:'',ofrecerRevision:false}),
    legacyDurationMinutes:()=>60,...extra})();
}
const todayState = () => runBranch('obtener_today_state');
const planV2 = () => runBranch('obtener_plan_semana_v2');
const weeklyPlanRows = async () => (await sql.query('SELECT * FROM weekly_plan')).rows;

test('A: prescribed performed -> prescribed session completed AND day trained',async()=>{
  await create('a',workout({prescription:link()}));
  const {body}=await todayState();
  assert.equal(body.todaySession.completada,true);
  assert.equal(body.todaySession.planId,planId);
  assert.equal(body.todaySession.sessionId,todaySessionId);
  assert.equal(body.activity.dayTrained,true);
  assert.equal(body.activity.prescribedSessionPerformed,true);
  assert.equal(body.activity.executions[0].relation,'performed');
  const v2=(await planV2()).body;
  assert.equal(v2.sessions.find(s=>s.session_id===todaySessionId).forge_context.execution,'completed');
});

test('B: prescribed session + different FREE workout -> not completed, day trained, counts as real activity',async()=>{
  await create('b',workout({title:'Otra cosa',description:'Entreno libre distinto de lo prescrito'}));
  const {body}=await todayState();
  assert.equal(body.todaySession.completada,false);
  assert.equal(body.activity.dayTrained,true);
  assert.equal(body.activity.prescribedSessionPerformed,false);
  assert.equal(body.activity.executions[0].relation,'free');
  assert.equal(body.recentActivity.titulo,'Otra cosa');
  assert.equal(captured.frequency,1/3,'a free execution counts toward real frequency/readiness');
  const v2=(await planV2()).body;
  assert.equal(v2.sessions.find(s=>s.session_id===todaySessionId).forge_context.execution,'planned');
  const day=v2.weekActivity.find(d=>d.date===today);
  assert.deepEqual([day.dayTrained,day.prescribedSessionPerformed],[true,false]);
});

test('B2: replaced keeps the prescription unperformed but is real activity',async()=>{
  await create('b2',workout({prescription:link('replaced')}));
  const {body}=await todayState();
  assert.equal(body.todaySession.completada,false);
  assert.equal(body.activity.dayTrained,true);
  assert.equal(body.activity.executions[0].relation,'replaced');
});

test('C: rest day + free workout -> day trained, nothing prescribed to complete, unplanned',async()=>{
  await seed({tipo:'descanso',titulo:'Descanso'});
  await create('c');
  const {body}=await todayState();
  assert.equal(body.activity.dayTrained,true);
  assert.equal(body.activity.restDay,true);
  assert.equal(body.activity.unplannedTraining,true);
  assert.equal(body.activity.prescribedSessionPerformed,false);
  assert.equal(body.todaySession.completada,false);
});

test('C2: day with NO prescribed session + workout -> day trained, no prescription to complete',async()=>{
  const activityOnEmptyDay = activity.describeDayActivity({date:today,records:[]});
  assert.equal(activityOnEmptyDay.dayTrained,false);
  const rec = (await create('c2')).record;
  const d = activity.describeDayActivity({date:today,records:[rec],prescribed:[]});
  assert.deepEqual([d.dayTrained,d.unplannedTraining,d.prescribedSessionPerformed,d.restDay,d.prescribedSessions.length],[true,true,false,false,0]);
});

test('D: prescribed day + no execution -> not completed, day not trained',async()=>{
  const {body}=await todayState();
  assert.equal(body.todaySession.completada,false);
  assert.equal(body.activity.dayTrained,false);
  assert.equal(body.activity.executionCount,0);
  assert.equal(body.activity.prescribedSessionPerformed,false);
  assert.equal(body.recentActivity,null);
  const v2=(await planV2()).body;
  assert.ok(v2.weekActivity.every(d=>d.dayTrained===false));
});

test('E: two executions same day -> day counted once, both executions remain for load/history',async()=>{
  await create('e1',workout({title:'Mañana',description:'Primera ejecución del día'}));
  await create('e2',workout({title:'Tarde',description:'Segunda ejecución del día'}));
  const {body}=await todayState();
  assert.equal(body.activity.dayTrained,true);
  assert.equal(body.activity.executionCount,2);
  const records = await registry.readWorkouts(db,athlete,false);
  assert.equal(records.length,2);
  assert.deepEqual([...activity.trainedDays(records)],[today]);
  assert.equal(activity.combineActualActivity(records,[]).history.length,2);
  assert.equal(captured.frequency,2/3);
  const adh=(await runBranch('calcular_adherencia')).body;
  assert.equal(adh.activity.trainedDays7,1);
  assert.equal(adh.activity.executions7,2);
});

test('F: performed with modifications/comments stays linked as performed and keeps what really happened',async()=>{
  const {record}=await create('f',workout({prescription:link(),title:'Hice menos y distinto',description:'Acorté el bloque principal',
    result:'3 de 5 rondas',observations:'Cambié sentadilla por peso muerto',discomfort:'Rodilla derecha molesta',rpe:9,durationSeconds:2400}));
  assert.equal(record.data.prescription.relation,'performed');
  assert.equal(record.data.observations,'Cambié sentadilla por peso muerto');
  assert.equal(record.data.discomfort,'Rodilla derecha molesta');
  assert.equal(record.data.rpe,9);
  const {body}=await todayState();
  assert.equal(body.todaySession.completada,true,'linked performed completes the session without comparing it to the prescription');
  assert.equal(body.activity.executions[0].title,'Hice menos y distinto');
  assert.equal(body.recentActivity.titulo,'Hice menos y distinto');
  assert.equal((await planV2()).body.sessions.find(s=>s.session_id===todaySessionId).forge_context.execution,'completed');
});

test('G: a free execution never completes any prescribed session, even on its own date',async()=>{
  await create('g');
  const v2=(await planV2()).body;
  assert.ok(v2.sessions.every(s=>s.forge_context.execution==='planned'));
  const adh=(await runBranch('calcular_adherencia')).body;
  assert.equal(adh.prescribed.last7.performed,0);
  assert.equal(adh.activity.executions7,1,'but it is counted as real activity');
});

test('H: reading and recording never write weekly_plan',async()=>{
  const before=await weeklyPlanRows();
  await create('h1',workout({prescription:link()}));
  await create('h2',workout({title:'Libre',description:'Entreno libre posterior'}));
  await todayState(); await planV2(); await runBranch('calcular_adherencia');
  assert.deepEqual(await weeklyPlanRows(),before);
});

test('I: idempotency unchanged — same request replays, different body conflicts',async()=>{
  const first=await create('same',workout({prescription:link()}));
  assert.equal(first.status,'committed');
  const replay=await create('same',workout({prescription:link()}));
  assert.equal(replay.status,'already_applied');
  assert.equal(replay.record.executionId,first.record.executionId);
  await assert.rejects(create('same',workout({title:'Otro título',prescription:link()})),e=>e.code==='WORKOUT_REQUEST_CONFLICT'&&e.status===409);
  assert.equal((await registry.readWorkouts(db,athlete,false)).length,1);
});

test('J: legacy compatibility — unmanaged legacy completada and workout_history still count; deleted executions do not',async()=>{
  const legacySessions=sessions({completada:true});
  await sql.query('UPDATE weekly_plan SET sessions=$1',[JSON.stringify(legacySessions)]);
  const legacyHistory=[{fecha:today,tipo:'box',workout_id:'legacy-1'}];
  await sql.query('UPDATE usuarios SET workout_history=$1',[JSON.stringify(legacyHistory)]);
  let {body}=await todayState();
  assert.equal(body.todaySession.completada,true,'legacy completed flag survives while no canonical link manages that session');
  assert.equal(captured.frequency,1/3,'legacy history still counts');
  assert.equal(body.activity.dayTrained,false,'dayTrained is canonical-only: legacy entries carry no verified civil execution date');
  // deleting a performed link suppresses the stale flag and removes the activity
  const {record}=await create('j',workout({prescription:link()}));
  await registry.deleteWorkout(db,athlete,{requestId:'j-del',confirmed:true,executionId:record.executionId,expectedRevision:record.revision},today);
  ({body}=await todayState());
  assert.equal(body.todaySession.completada,false);
  assert.equal(body.activity.dayTrained,false);
});

test('adherence: free execution is activity but never prescribed completion; performed raises both',async()=>{
  const prior=calendar.addCivilDays(week,-7);
  const priorSessions=days.map((dia,i)=>({session_id:`prior-${i}`,dia,tipo:i===6?'descanso':'box',titulo:'Previa',completada:false}));
  await sql.query('INSERT INTO weekly_plan VALUES ($1,$2,$3,$4)',['prior-plan',athlete,prior,JSON.stringify(priorSessions)]);
  await create('p-free',workout({executedOn:calendar.addCivilDays(prior,1),title:'Libre',description:'Libre en día prescrito'}));
  await create('p-perf',workout({executedOn:calendar.addCivilDays(prior,2),title:'Cumplida',description:'Cumple la sesión del miércoles',
    prescription:{planId:'prior-plan',sessionId:'prior-2',relation:'performed'}}));
  const adh=(await runBranch('calcular_adherencia')).body;
  assert.equal(adh.prescribed.last28.performed,1);
  assert.ok(adh.prescribed.last28.planned>=6,'rest day excluded, only due training sessions counted');
  assert.equal(adh.activity.trainedDays28,2);
  assert.ok('adherencia7' in adh && 'adherencia28' in adh && 'adherenciaBloque' in adh && 'diasSemana' in adh,'legacy contract preserved');
});

test('totals: canonical total does not depend on legacy workout_history alone, without double counting',async()=>{
  const {record}=await create('t',workout());
  const records=await registry.readWorkouts(db,athlete,false);
  const legacy=[{fecha:today,workout_id:record.executionId},{fecha:'2026-01-01',workout_id:'old'}];
  const combined=activity.combineActualActivity(records,legacy);
  assert.equal(combined.totalExecutions,2);
  assert.equal(combined.canonical.length,1);
  assert.equal(combined.legacyUnique.length,1);
  assert.equal(activity.combineActualActivity(records,undefined).totalExecutions,1);
});

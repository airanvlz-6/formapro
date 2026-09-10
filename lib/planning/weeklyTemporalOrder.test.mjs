import { numericPolicyFixture } from '../sports/runningDoseV2TestFixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {sportsRuntime,fakeDatabase,compile,plain} from '../sports/trainingContractTestRuntime.mjs';
const load=sportsRuntime({console:{log(){},warn(){},info(){}}},numericPolicyFixture);
const preflight=load('../planning/weeklyGenerationPreflight');
const prepare=load('../planning/prepareAllowedWeeklyPlanContract');
const availabilityApi=load('chatAvailability');
const days=load('../planning/weeklyCalendar').calendarDays;
const week='2026-09-07',today='2026-09-08';
const availability={box:['martes','jueves','viernes','sabado'],carrera:['lunes','miercoles','domingo']};
function fixture(blocked=false){
 const tables={usuarios:{modo_entrada:'coach',categoria:'funcional',especialidad:'funcional_crossfit',objetivo_principal:{descripcion:'CrossFit Games'},
  perfil:{},workout_history:[],ciclo_actual:{bloque:'deload'},distribucion_semanal:availability},
  athlete_training_sources:Object.entries(availability).map(([disciplina,dias])=>({disciplina,dias,owner:'forge',activo:true})),
  weekly_plan:[],physiology_records:[],session_modification_events:[],athlete_state_events:[],
  athlete_coaching_notes:blocked?Object.keys(load('movementLibrary').MOVEMENT_LIBRARY).map(movement=>({movement,status:'pending',constraint_level:'hard'})):[]};
 const db=fakeDatabase(tables),from=db.from.bind(db);db.tables=tables;
 db.from=t=>{const q=from(t);q.update=q.insert=()=>{throw Error('NO_WRITES')};if(['weekly_plan','physiology_records'].includes(t))q.maybeSingle=async()=>({data:null,error:null});return q;};
 const snapshot={sessions:days.map((dia,i)=>({dia,tipo:i===1?'box':'descanso',completada:i===1}))};
 return {db,snapshot};
}
const request=(f,temporalIntent)=>({targetWeekStart:week,today,snapshot:f.snapshot,temporalIntent});
for(const blocked of [false,true])test(`T1 T4: completed Tuesday, temporal null precedes feasibility blocked=${blocked}`,async()=>{
 const f=fixture(blocked),before=JSON.stringify(f);
 const r=await preflight.resolveWeeklyGenerationPreflight(f.db,'fixture',request(f,null));
 assert.equal(r.code,'TEMPORAL_DECISION_REQUIRED');assert.equal(r.temporalDecision,null);assert.equal(r.canContinue,false);
 assert.deepEqual(plain(r.preflightRequirement.options.map(o=>o.value)),[true,false]);
 assert.ok(!f.db.calls.includes('athlete_coaching_notes'));assert.ok(!f.db.calls.includes('weekly_plan_generation_log'));
 assert.equal(JSON.stringify({...f,db:{...f.db,calls:[]}}),JSON.stringify({...JSON.parse(before),db:{...JSON.parse(before).db,calls:[]}}));
});
for(const includeToday of [true,false])test(`T2 T3 T9: explicit ${includeToday} evaluates real contract and retains no-prescription`,async()=>{
 for(const blocked of [false,true]){
  const f=fixture(blocked),r=await preflight.resolveWeeklyGenerationPreflight(f.db,'fixture',request(f,includeToday));
  assert.equal(r.temporalDecision.includeToday,includeToday);assert.equal(r.temporalStatus,'TEMPORAL_DECISION_RESOLVED');
  assert.equal(r.preflightRequirement,undefined);assert.equal(r.canContinue,!blocked);
  if(blocked)assert.equal(r.code,'NO_NEW_EXECUTABLE_PRESCRIPTION');
  else {
   const c=await prepare.prepareAllowedWeeklyPlanContract(f.db,'fixture',{...request(f),empezarHoy:includeToday,strategyVersion:1});
   assert.equal(c.ok,true);assert.equal(c.contract.dayOptions.martes[0].protected,true);
   const domain=Object.fromEntries(days.map(d=>[d,[...new Set(c.contract.dayOptions[d].map(o=>o.state))]]));
   assert.deepEqual(plain(domain),{lunes:['REST'],martes:['TRAIN'],miercoles:['REST','RECOVERY'],jueves:['REST','TRAIN'],viernes:['REST','TRAIN'],sabado:['REST','TRAIN'],domingo:['REST','RECOVERY']});
  }
 }
});
test('T3: excluding today skips unavailable tomorrow using existing calendar enumeration',async()=>{
 const f=fixture();f.db.tables.athlete_training_sources[1].dias=['domingo'];
 const c=await prepare.prepareAllowedWeeklyPlanContract(f.db,'fixture',{...request(f),empezarHoy:false,strategyVersion:1});
 assert.equal(c.ok,true);assert.deepEqual(plain(c.contract.dayOptions.miercoles.map(o=>o.state)),['REST']);
 assert.ok(c.contract.dayOptions.jueves.some(o=>o.state==='TRAIN'));
});
test('T5 T6: future/outside interval and fully completed current week never ask',async()=>{
 const f=fixture();
 for(const date of ['2026-09-06','2026-09-14']){
  const r=await preflight.resolveWeeklyGenerationPreflight(f.db,'fixture',{targetWeekStart:week,today:date,snapshot:null});
  assert.equal(r.preflightRequirement,undefined);
 }
 const done=fixture();done.snapshot.sessions.forEach(s=>s.completada=true);
 const r=await preflight.resolveWeeklyGenerationPreflight(done.db,'fixture',{...request(done),today:'2026-09-13'});
 assert.equal(r.code,'WEEKLY_REGENERATION_NO_OP');assert.equal(r.preflightRequirement,undefined);
});
test('T7: confirmed availability is reused; changed availability requires reconfirmation before feasibility',async()=>{
 const f=fixture(),q=await availabilityApi.readAvailabilityConfirmation(f.db,'fixture');
 const r=await preflight.resolveWeeklyGenerationPreflight(f.db,'fixture',{...request(f,false),confirmedAvailabilityDigest:q.snapshotDigest});
 assert.equal(r.canContinue,true);assert.equal(r.preflightRequirement,undefined);
 f.db.tables.athlete_training_sources[0].dias=['jueves'];
 const changed=await preflight.resolveWeeklyGenerationPreflight(f.db,'fixture',{...request(f,false),confirmedAvailabilityDigest:q.snapshotDigest});
 assert.equal(changed.code,'AVAILABILITY_CONFIRMATION_STALE');assert.equal(changed.preflightRequirement.kind,'availability');assert.equal(changed.canContinue,false);
});
const ui=ts.createSourceFile('FormaPro.tsx',readFileSync('app/FormaPro.tsx','utf8'),99,true,ts.ScriptKind.TSX);
function find(n,p){return p(n)?n:ts.forEachChild(n,c=>find(c,p));}
const declaration=name=>find(ui,n=>ts.isVariableDeclaration(n)&&n.name.getText(ui)===name).initializer.getText(ui);
class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-09-08T12:00:00Z']));}static now(){return Date.parse('2026-09-08T12:00:00Z');}}
test('T1 T7 T8 T10: actual UI transport pins target and snapshot, asks before building, then completes ordered flow',async()=>{
 const f=fixture(),q=await availabilityApi.readAvailabilityConfirmation(f.db,'fixture');
 const actions=[],requests=[],messages=[];let waiting=false;
 const generation={currentWeek:week,nextWeek:'2026-09-14',token:'same-token',snapshots:{[week]:f.snapshot}};
 const ctx={codigoUsuario:'fixture',Date:FixedDate,structuredClone,console:{log(){},error(){}},planBlockLabel:load('planPresentation').planBlockLabel,
  weeklyPlanningContinuationRef:{current:null},availabilityConfirmationRef:{current:q.snapshotDigest},weeklyTemporalIntentRef:{current:{}},
  memoriaCoach:{},debilidades:[],estadoFisiologico:{},estadoCanonico:{},historialFisiologico:[],distribucionSemanal:availability,cicloActual:{semana:1},historial:[],
  noWeeklyPrescription:load('../planning/weeklyRegeneration').noWeeklyPrescription,weeklyGenerationOutcomeMessage:load('../planning/weeklyRegeneration').weeklyGenerationOutcomeMessage,
  setMensajes:fn=>{messages.splice(0,messages.length,...fn(messages));},setEsperandoConfirmacionDisponibilidad(){},setEsperandoConfirmacionEmpezarHoy:v=>{waiting=v;},
  setGenerandoSemana(){},setHistorial(){},aplicarTodasLasReglas(){},validarIntegridadSemana:()=>({valido:true,diasCorregir:[]}),cargarPlanSemanal:async()=>{},
  fetch:async(_url,init)=>{const b=JSON.parse(init.body);actions.push(b.action);requests.push(b);let r;
   switch(b.action){
    case 'preparar_generacion_semana':r={ok:true,generation};break;
    case 'check_week_closure':r={ok:true,yaCerrada:false};break;
    case 'preflight_generacion_semana':r=await preflight.resolveWeeklyGenerationPreflight(f.db,'fixture',{...request(f,b.datos.temporalIntent),temporalReply:b.datos.temporalReply,confirmedAvailabilityDigest:b.datos.confirmedAvailabilityDigest});break;
    case 'analizar_bloque_semana':r={ok:true,analisis:{tipo_semana:'deload'}};break;
    case 'planificar_semana':r={ok:true,estructura:{weeklyContractVersion:1,calendarReceipt:'calendar',strategy:{adaptacion_principal:'Technique'},sessions:days.map((dia,i)=>i===0||i===1?{...f.snapshot.sessions[i],weeklyProtected:true}:i===3?{dia,tipo:'box',stimulusId:'tecnica'}:{dia,tipo:'descanso'})}};break;
    case 'construir_sesion_dia':r={ok:true,sesion:{dia:b.datos.dia,tipo:'box'}};break;
    case 'guardar_plan_semana':r={ok:true};break;
    case 'actualizar_usuario':r={ok:true};break;
    default:throw Error('Unexpected '+b.action);
   }return {ok:true,json:async()=>r};
  }};
 const run=vm.runInNewContext(compile(`const apiCall=${declaration('apiCall')};const orquestarGeneracionSemana=${declaration('orquestarGeneracionSemana')};const dispararGeneracion=${declaration('dispararGeneracion')};dispararGeneracion;`),ctx);
 await run('Genera mi semana',false,true);
 assert.equal(waiting,true);assert.ok(!messages.some(m=>m.content.includes('Construyendo')));
 assert.deepEqual(actions,['preparar_generacion_semana','check_week_closure','preflight_generacion_semana']);
 assert.equal(ctx.weeklyPlanningContinuationRef.current.targetWeekStart,week);
 await run('Próximo día disponible',true,true);
 assert.equal(actions.filter(a=>a==='preparar_generacion_semana').length,1);assert.equal(actions.filter(a=>a==='check_week_closure').length,1);
 assert.equal(actions.includes('obtener_confirmacion_disponibilidad'),false);
 for(const r of requests.filter(r=>r.action==='preflight_generacion_semana')){assert.equal(r.datos.targetWeekStart,week);assert.equal(r.datos.generationToken,'same-token');assert.equal(r.datos.confirmedAvailabilityDigest,q.snapshotDigest);}
 assert.deepEqual(actions.slice(3,8),['preflight_generacion_semana','analizar_bloque_semana','planificar_semana','construir_sesion_dia','guardar_plan_semana']);
 assert.ok(messages.findIndex(m=>m.content.includes('próximo día disponible'))<messages.findIndex(m=>m.content.includes('Construyendo')));
 assert.ok(messages.some(m=>m.content.includes('Semana generada y guardada')));
});

test('T2 T3: existing includeToday authority changes an uncompleted today only after an explicit answer',async()=>{
 const f=fixture();f.snapshot.sessions[1].completada=false;
 for(const includeToday of [true,false]){
  const r=await preflight.resolveWeeklyGenerationPreflight(f.db,'fixture',request(f,includeToday));assert.equal(r.canContinue,true);
  const c=await prepare.prepareAllowedWeeklyPlanContract(f.db,'fixture',{...request(f),empezarHoy:includeToday,strategyVersion:1});
  assert.equal(c.ok,true);
  assert.equal(c.contract.dayOptions.martes.some(o=>o.state==='TRAIN'&&!o.protected),includeToday);
  if(!includeToday)assert.equal(c.contract.dayOptions.martes[0].state,'UNAVAILABLE');
 }
});

test('direct Planner request cannot default missing temporal authority to true',async()=>{
 const source=ts.createSourceFile('route.ts',readFileSync('app/api/chat/route.ts','utf8'),99,true);
 const branch=find(source,n=>ts.isIfStatement(n)&&n.expression.getText(source)==='action === "planificar_semana"').thenStatement;
 for(const value of [undefined,null,'true']){
  const f=fixture();let planner=0;
  const execute=vm.runInNewContext(compile(`async function run() ${branch.getText(source)};run;`),{
   datos:{weeklyContractVersion:1,targetWeekStart:week,empezarHoy:value},codigo:'fixture',supabase:f.db,
   resolveWeeklyGeneration:()=>({currentWeek:week,nextWeek:'2026-09-14',snapshots:{[week]:f.snapshot}}),
   resolveCompletionDate:()=>({date:today}),resolveWeeklyGenerationPreflight:preflight.resolveWeeklyGenerationPreflight,
   planBoundedWeek:async()=>{planner++;throw Error('NO_PLANNER');},NextResponse:{json:body=>body},
  });
  const r=await execute();assert.equal(r.code,'TEMPORAL_DECISION_REQUIRED');assert.equal(planner,0);
 }
});

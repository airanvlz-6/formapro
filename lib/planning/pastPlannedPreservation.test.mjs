import test from 'node:test';
import assert from 'node:assert/strict';
import {sportsRuntime,plain} from '../sports/trainingContractTestRuntime.mjs';
import {fixture,contract,proposal} from '../sports/runningExecutionReuseFixture.mjs';
import {withPlanIdentity} from './planningTestRuntime.mjs';
const load=sportsRuntime({console:{log(){},info(){},warn(){}}});
const prep=load('../planning/prepareAllowedWeeklyPlanContract'), calendar=load('../planning/weeklyCalendar');
const authority=load('../planning/weeklyCalendarAuthority'), week='2026-09-07', today='2026-09-11';
// Extra text/metadata are test sentinels, not reconstructed production content.
function wednesday() {return {dia:'miercoles',tipo:'carrera',titulo:'Prescripción histórica de resistencia específica',
  descripcion:'Contenido original del fixture, no ejecución',por_que:'Objetivo específico HM',duracion_min:87,completada:false,actual:null,
  metadata:{retained:['all','nested','fields']},structuredPrescription:{schemaVersion:2,sessionRole:'PRIMARY',references:[],
    objective:{intent:{kind:'adaptation',goalId:'half_marathon',adaptationId:'resistencia_especifica',methodId:'running_specific',role:'PRIMARY',pattern:'run'}},
    proposal:{schemaVersion:2,stimulusId:'resistencia_especifica',structureId:'continuo_carrera',blocks:[{blockType:'main',movements:[
      {movementId:'rodaje_largo',prescription:{durationSeconds:5220,intensity:{kind:'rpe',value:3}}}]}]}}};}
function setup() {
  const f=fixture({date:today,week,include:[]}),u=f.tables.usuarios;
  u.perfil.dias=6;u.distribucion_semanal={carrera:['lunes','miercoles','viernes','sabado'],box:['martes']};
  u.workout_history=u.workout_history.filter(r=>r.fecha<week);
  const old=withPlanIdentity({user_codigo:'u',week_start:week,week_number:1,total_weeks_block:4,block_name:'HM',status:'active',sessions:[
    {dia:'lunes',tipo:'carrera',titulo:'Carrera',descripcion:'Plan original',completada:true,titulo_real:'Carrera realizada',descripcion_real:'Ejecución conocida'},
    {dia:'martes',tipo:'box',titulo:'Fuerza',descripcion:'Plan original',completada:true,titulo_real:'Fuerza realizada',descripcion_real:'Ejecución conocida'},
    wednesday(),
    {dia:'jueves',tipo:'sin_registrar',titulo:'Sin registrar',descripcion:'Sin prescripción conocida',completada:false,actual:null},
    {...wednesday(),dia:'viernes',titulo:'Futuro reemplazable'},
    {...wednesday(),dia:'sabado',titulo:'Futuro reemplazable'},
    {dia:'domingo',tipo:'descanso',titulo:'Descanso',descripcion:'Descanso',completada:false},
  ]});old.revision=6;
  f.tables.weekly_plan=[old];f.request.snapshot=old;f.request.empezarHoy=true;
  f.request.strategyProposal={version:1,preferredAdaptations:['resistencia_especifica','umbral','economia_carrera','base_aerobica','potencia','cadena_posterior','fuerza_general']};
  const duration=load('../athlete/runningHabitualDeclarations').habitualRunningFact('habitualEasyRunningDurationMinutes',50,today+'T12:00:00Z');
  u.perfil.runningHabitualDeclarations={habitualEasyRunningDurationMinutes:duration};
  const confirm=()=>{u.perfil.runningHabitualConfirmation=load('../athlete/runningHabitualConfirmation').issueRunningHabitualConfirmation('u',{planningRunId:f.request.planningRunId,targetWeekStart:week},duration);};confirm();
  // Real loaders with an in-memory DB boundary; no network or SQL.
  const from=f.db.from.bind(f.db);
  f.db.from=table=>{const q=from(table);if(table==='weekly_plan'){
    const eq=q.eq.bind(q),filters={};q.eq=(key,value)=>{filters[key]=value;return eq(key,value);};
    q.maybeSingle=async()=>({data:f.tables.weekly_plan.find(p=>!filters.week_start||p.week_start===filters.week_start)??null,error:null});
  }return q;};
  return {f,old,confirm};
}

test('A past EXECUTED, B past PLANNED_ONLY, C UNREGISTERED, D future replaceable remain distinct',()=>{
  const planned=wednesday(),unknown={dia:'jueves',tipo:'sin_registrar',completada:false,actual:null};
  assert.equal(calendar.isProtectedCalendarSession({tipo:'carrera',completada:true},true,true),true);
  assert.equal(calendar.isProtectedCalendarSession(planned,true,true),true);
  assert.equal(calendar.isProtectedCalendarSession(unknown,true,true),true);
  assert.equal(calendar.isProtectedCalendarSession(planned,true,false),false);
  for(const blank of [{tipo:'carrera',completada:false},{tipo:'carrera',titulo:' ',descripcion:''},{tipo:'carrera',structuredPrescription:{schemaVersion:2}}])
    assert.equal(calendar.isProtectedCalendarSession(blank,true,true),false);
  assert.equal(calendar.isProtectedCalendarSession({tipo:'carrera',titulo:'Prescripción legacy',completada:false},true,true),true);
  assert.equal(planned.completada,false);assert.equal(planned.actual,null);
});

test('old predicate reproduces exact degradation in real loader; corrected loader preserves known past content',async()=>{
  const {f,old}=setup(),before=plain(old);
  const oldLoad=sportsRuntime({console:{log(){},info(){},warn(){}}},(path,api)=>path.endsWith('weeklyCalendar.ts')?{...api,
    isProtectedCalendarSession:(s,active=false,past=false)=>s.completada===true||((!active||past)&&['REST','RECOVERY','UNAVAILABLE'].includes(api.calendarState(s)))}:api);
  const broken=await oldLoad('../planning/prepareAllowedWeeklyPlanContract').loadWeeklyPlanningContext(f.db,'u',f.request);
  assert.equal(broken.ok,true,JSON.stringify(broken));assert.deepEqual(plain(broken.fixedSessions.miercoles),{dia:'miercoles',tipo:'sin_registrar',titulo:'Sin registrar',
    por_que:'Día anterior al inicio de esta planificación',descripcion:'No aplica — esta planificación comienza a partir de hoy.'});
  assert.deepEqual(plain(load('sessionAuthority').admitSessionContent(broken.fixedSessions.miercoles,'u',week,{pastDay:true})),
    {...plain(broken.fixedSessions.miercoles),completada:false});
  const good=await prep.loadWeeklyPlanningContext(f.db,'u',f.request);assert.equal(good.ok,true);
  for(const [i,day] of ['lunes','martes','miercoles','jueves'].entries())assert.deepEqual(plain(good.fixedSessions[day]),before.sessions[i]);
  assert.equal(good.input.fixed.miercoles.state,'TRAIN');assert.equal(good.input.fixed.jueves.state,'UNAVAILABLE');
  assert.equal(good.fixedSessions.viernes,undefined);assert.equal(good.fixedSessions.sabado,undefined);
  assert.deepEqual(plain(old),before);
});

test('FORGE12 snapshot → fixed calendar → signed survivors → assembly → real CAS payload preserves complete planned-only Wednesday',async()=>{
  const {f,old,confirm}=setup(),before=plain(old);
  const generation=await load('../planning/weeklyGeneration').beginWeeklyGeneration(f.db,'u',today);
  assert.deepEqual(plain(generation.snapshots[week]),before);
  f.request.snapshot=generation.snapshots[week];f.request.planningRunId=generation.planningRunId;confirm();
  const planned=await prep.planBoundedWeek(f.db,'u',f.request,async prompt=>{
    const c=JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1]);
    return JSON.stringify({contractVersion:1,contextDigest:c.contextDigest,selections:calendar.calendarDays.map(day=>{
      const options=c.dayOptions[day],o=day==='viernes'?options.find(o=>o.intent?.methodId==='running_base'):options.find(o=>o.protected||o.state==='REST');
      assert.ok(o,day);return {day,optionId:o.optionId};
    })});
  },generation.token);
  assert.equal(planned.ok,true,JSON.stringify(planned));
  const {sessions,calendarReceipt}=planned.estructura;
  assert.deepEqual(plain(sessions.filter(s=>!s.weeklyProtected&&s.tipo==='carrera').map(s=>s.dia)),['viernes']);
  assert.deepEqual(plain(sessions[2]),{...before.sessions[2],weeklyProtected:true});
  const evidence=authority.verifyWeeklyCalendarReceipt(calendarReceipt,'u',week,true);
  assert.equal(evidence.admittedSlots[2].protectedSessionDigest,authority.weeklyDigest(before.sessions[2]));
  const admission=authority.weeklySaveAdmission(calendarReceipt,'u',week,before.sessions);
  assert.deepEqual(plain(admission.survivorIndices),[0,1,2,3]);
  const c=await contract(f,'running_base','viernes',sessions[4].intent);let builders=0;
  const generated=await load('sessionGeneration').generateContractSession(c,[],async()=>{builders++;return JSON.stringify(proposal(c));});
  assert.equal(generated.ok,true,JSON.stringify(generated));assert.equal(builders,1);
  const rows=sessions.map(s=>s.weeklyProtected?s:s.dia==='viernes'?load('structuredSession').renderContractSession(c,proposal(c)):
    load('sessionAuthority').admitSessionContent(s,'u',week,{pastDay:false}));
  // Even omission/hostile client replacement cannot override the signed server survivor.
  rows[2]={dia:'miercoles',tipo:'sin_registrar',titulo:'Hostile',descripcion:'Replacement'};
  const candidateApi=load('../planning/prepareWeeklyCandidate');
  const entries=candidateApi.prepareWeeklyEntries(rows,generation.snapshots[week],admission.survivorIndices);
  const assembled=entries.map(e=>candidateApi.entrySession(e,generation.snapshots[week]));
  assert.deepEqual(plain(assembled[2]),before.sessions[2]);
  const fresh=await authority.assertFreshWeeklyAuthority(f.db,'u',week,calendarReceipt,generation.token);
  let repairCalls=0;const whole=await load('../planning/enforceWholeWeek').enforceWholeWeek('u',week,assembled,[],calendarReceipt,fresh,async()=>{repairCalls++;return '{}';});
  assert.equal(whole.ok,true,JSON.stringify(whole));assert.equal(repairCalls,0);
  assert.ok(!whole.result.diagnostics.some(d=>['WEEK_EXACT_DUPLICATE','WEEK_REPAIR_FAILED'].includes(d.code)));
  const prepared=candidateApi.admitWeeklyCandidate({...before,sessions:whole.sessions},entries,generation.snapshots[week]);
  assert.equal(prepared.noOp,false);
  const command={source:'weekly_orchestrator',operationType:'regenerate_week',target:{userCodigo:'u',weekStart:week},expectedRevision:6};
  const validation=await load('../planning/planMutation').validatePlanMutation({command,candidate:prepared.candidate,
    context:{existingPlan:generation.snapshots[week],identityProof:prepared.identityProof},changeSet:{operationType:'regenerate_week',affectedDays:['viernes','sabado'],changedFields:['sessions']}});
  assert.equal(validation.status,'ready_for_commit',JSON.stringify(validation));
  let payload;const sink={from(table){assert.equal(table,'weekly_plan');const q={update(v){payload=plain(v);return q;},eq(){return q;},select(){return q;},
    maybeSingle:async()=>({data:{id:old.id,user_codigo:'u',week_start:week,revision:payload.revision},error:null})};return q;}};
  const persisted=await load('../planning/planPersistence').mutatePlanWithCAS(sink,validation.mutation);
  assert.equal(persisted.status,'committed');assert.equal(payload.revision,7);
  for(let i=0;i<4;i++)assert.deepEqual(payload.sessions[i],before.sessions[i]);
  const wed=payload.sessions[2];assert.equal(wed.completada,false);assert.equal(wed.actual,null);
  assert.equal(Object.hasOwn(wed,'titulo_real'),false);assert.equal(Object.hasOwn(wed,'descripcion_real'),false);
  assert.equal(payload.sessions[3].tipo,'sin_registrar');assert.equal(payload.sessions[4].structuredPrescription.proposal.blocks[0].movements[0].prescription.durationSeconds,3000);
  assert.equal(payload.sessions[5].tipo,'descanso');assert.equal(payload.sessions[6].tipo,'descanso');
  const baseline=load('../athlete/runningDoseEvidence').projectRunningDoseBaseline({},[{week_start:week,sessions:payload.sessions}],[],today);
  assert.equal(baseline.coverage.completedRunningSessions,1);
  assert.equal(baseline.evidence.find(e=>e.date==='2026-09-09').kind,'PLANNED_ONLY');
  assert.equal(baseline.metrics.longestRecentRunDurationSeconds.value,null);
  assert.ok(!baseline.metrics.recentMethodExposure.some(e=>e.methodId==='running_specific'));
  f.tables.weekly_plan=[{...old,...payload}];f.request.snapshot=f.tables.weekly_plan[0];
  const after=await prep.loadWeeklyPlanningContext(f.db,'u',f.request);assert.equal(after.ok,true);
  assert.deepEqual(plain(after.input.doseCapabilities.entries.filter(e=>e.prescriptionAllowed).map(e=>e.methodId)),['running_base']);
  for(const e of after.input.doseCapabilities.entries.filter(e=>e.methodId!=='running_base'))assert.equal(e.longitudinalDose.selectedDose,null);
  assert.deepEqual(plain(generation.snapshots[week]),before);
});

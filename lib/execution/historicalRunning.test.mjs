import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sportsRuntime, plain, fakeDatabase, equippedProfileFixture } from '../sports/trainingContractTestRuntime.mjs';
const load=sportsRuntime({console:{info(){},log(){},warn(){}}});
const h=load('../execution/historicalRunning'),store=load('../execution/runningExecutionStore');
const reconcile=load('../execution/runningExecution').reconcileRunningExecutions;
const today='2026-09-10',empty=reconcile([]);
const legacy=(extra={})=>({workout_id:'run-1',fecha:'2026-09-08',tipo:'Rodaje largo',duracion:'85 min',distancia:'12.3 km',fc_media:140,fc_max:160,...extra});
const modern=(id='modern-1',date='2026-09-09',extra={})=>store.sealRunningExecution('u',{sourceActivityId:id,occurredAt:date,
  quantities:{totalDuration:{value:45,unit:'minutes'},totalDistance:{value:7,unit:'kilometers'}},completeness:'FULL',...extra},today);
const merge=(rows=[],records=[])=>h.mergeRunningHistory('u',rows,reconcile(records.map(r=>r.record)),today);
test('1 modern-only retains primary provenance, quantities and explicit completion',()=>{
  const r=merge([],[modern()]);assert.equal(r.records.length,1);assert.equal(r.records[0].completion,'FULL');assert.equal(r.summaries.all.duration.value,2700);
  assert.equal(r.records[0].provenance,'MODERN_STRUCTURED');
});
test('2 legacy-only retains history with distinct unverified provenance',()=>{
  const r=merge([legacy()]);assert.equal(r.records.length,1);assert.equal(r.records[0].provenance,'LEGACY_STRUCTURED');assert.equal(r.records[0].completion,'UNKNOWN');
});
test('3 non-overlapping modern and legacy counts and sums once',()=>{
  const r=merge([legacy()],[modern()]);assert.equal(r.summaries.all.executedSessions,2);assert.equal(r.summaries.all.duration.value,7800);
});
test('4 identical source activity/workout ID favors modern without merging legacy quantities',()=>{
  const r=merge([legacy({fecha:'2026-09-09',workout_id:'modern-1'})],[modern()]);
  assert.equal(r.records.length,1);assert.equal(r.summaries.all.duration.value,2700);assert.equal(r.records[0].metrics.averageHr,undefined);
  assert.equal(r.records[0].sourceRecords.length,2);
});
test('4b explicit plan association reconciles only its matching reference',()=>{
  const r=merge([legacy({fecha:'2026-09-09'})],[modern('m','2026-09-09',{planSessionId:'run-1'})]);assert.equal(r.records.length,1);
});
test('5 duplicate workout_id unifies complementary structured evidence',()=>{
  const r=merge([legacy(),legacy({distancia:undefined,fc_media:undefined})]);assert.equal(r.summaries.all.executedSessions,1);assert.equal(r.summaries.all.distance.value,12300);
});
test('6 safety_net plus richer same-day row is not added to totals',()=>{
  const r=merge([{fecha:'2026-09-08',tipo:'carrera',source:'safety_net_deterministico',duracion:null,notas:'corrí'},legacy()]);
  assert.equal(r.summaries.all.executedSessions,1);assert.equal(r.summaries.all.duration.value,5100);
  assert.ok(r.records.some(r=>r.diagnostics.includes('POSSIBLE_OVERLAP_EXCLUDED_FROM_TOTALS')));
});
for(const [name,input,field,value] of [
  ['7 duration string',{duracion:'1.5 h'},'totalDurationSeconds',5400],
  ['7 duration structured',{duracion_total:{value:30,unit:'minutes'},duracion:undefined},'totalDurationSeconds',1800],
  ['7 duration explicit unit',{duracion:45,duracion_unidad:'min'},'totalDurationSeconds',2700],
  ['7 work duration',{duracion_trabajo:'20 min'},'workDurationSeconds',1200],
  ['8 distance',{distancia:{value:10,unit:'kilometers'}},'distanceMeters',10000],
  ['9 average HR',{fc_media:145},'averageHr',145],['9 maximum HR',{fc_max:175},'maximumHr',175],
  ['pace',{ritmo:'5:30 min/km'},'paceSecondsPerKm',330],['RPE',{rpe:6},'rpe',6]])
 test(name,()=>assert.equal(merge([legacy(input)]).records[0].metrics[field].value,value));
test('10 missing remains missing, legacy sensation stays reported context',()=>{
  const r=merge([{workout_id:'x',fecha:today,tipo:'carrera',sensacion:'buena'}]).records[0];assert.deepEqual(plain(r.metrics),{});assert.equal(r.sensation,'buena');
});
test('11/12 notes and LLM analysis cannot supply metrics, improvement, phase or method',()=>{
  const r=merge([{workout_id:'x',fecha:today,tipo:'carrera',notas:'Rodaje largo 1h25, 12.3km',analisis:'mejora, control perfecto, semana 9 intensificación'}]);
  assert.deepEqual(plain(r.records[0].metrics),{});assert.equal(r.records[0].hint,null);assert.equal(r.records[0].methodId,null);
  assert.doesNotMatch(JSON.stringify(r),/control perfecto|intensificación|mejora/);
});
test('13 invalid, contradictory or unitless metrics are excluded',()=>{
  const r=merge([legacy({duracion:45,distancia:-10,fc_media:300,fc_max:NaN,rpe:20,ritmo:'rápido'})]).records[0];assert.deepEqual(plain(r.metrics),{});
  const conflict=merge([legacy({duracion_trabajo:'100 min',fc_media:170,fc_max:160})]).records[0];assert.equal(conflict.metrics.totalDurationSeconds,undefined);assert.equal(conflict.metrics.averageHr,undefined);
});
test('13b duplicate quantities conflict rather than choosing newest/richest',()=>{
  const r=merge([legacy(),legacy({duracion:'90 min'})]);assert.equal(r.summaries.all.duration.value,null);assert.equal(r.summaries.all.executedSessions,1);
});
test('complementary duplicate fields cannot create contradictory totals or HR',()=>{
  const rows=[legacy({duracion:'30 min',fc_media:180,fc_max:undefined}),legacy({duracion:undefined,duracion_trabajo:'40 min',fc_media:undefined,fc_max:160})];
  const r=merge(rows).records[0];assert.equal(r.metrics.totalDurationSeconds,undefined);assert.equal(r.metrics.workDurationSeconds,undefined);assert.equal(r.metrics.averageHr,undefined);
});
test('identity namespaces cannot collide with date-shaped workout IDs',()=>{
  const r=merge([legacy({workout_id:'date:2026-09-08'}),legacy({workout_id:undefined})]);
  assert.equal(r.records.length,2);assert.equal(new Set(r.records.map(r=>r.executionId)).size,2);assert.equal(r.summaries.all.executedSessions,1);
});
test('explicit non-running discipline overrides a running-like type',()=>{
  assert.equal(merge([legacy({disciplina:'box',tipo:'intervalos'})]).records.length,0);
});
test('14 arbitrary legacy FULL flag is not modern completion authority',()=>{
  assert.equal(merge([legacy({completada:true,completeness:'FULL'})]).records[0].completion,'UNKNOWN');
});
test('15/16 recent counts/totals distinguish 7d,28d and all retained months',()=>{
  const r=merge([legacy({fecha:'2026-06-01',workout_id:'june'}),legacy({fecha:'2026-08-20',workout_id:'aug'}),legacy()]);
  assert.equal(r.summaries['7'].executedSessions,1);assert.equal(r.summaries['28'].executedSessions,2);assert.equal(r.summaries.all.executedSessions,3);
  assert.equal(r.summaries['28'].duration.value,10200);assert.equal(r.coverage.firstDate,'2026-06-01');
});
test('17/18 longest and quality exposure describe labels, not adaptation',()=>{
  const r=merge([legacy(),legacy({workout_id:'intervals',fecha:today,tipo:'intervalos',duracion:'40 min'})]);
  assert.equal(r.summaries['7'].longestDuration.value,5100);assert.equal(r.summaries['7'].lastLongRunDate,'2026-09-08');
  assert.equal(r.summaries['7'].qualityExposure.length,1);assert.equal(r.summaries['7'].qualityExposure[0].provenance,'LEGACY_STRUCTURED');
});
test('ambiguous same-day rows never multiply frequency or conflicting quantities',()=>{
  const r=merge([legacy({workout_id:undefined}),legacy({workout_id:undefined,duracion:'90 min'})]);
  assert.equal(r.summaries.all.executedSessions,1);assert.equal(r.summaries.all.duration.value,null);assert.equal(r.records[0].identity,'DATE_ONLY');
});
test('different explicit workouts on same day are not collapsed by date',()=>{
  assert.equal(merge([legacy(),legacy({workout_id:'run-2'})]).summaries.all.executedSessions,2);
});
test('conflicting dates and modern conflicts cannot fall back to legacy quantities',()=>{
  const conflict=merge([legacy(),legacy({fecha:'2026-09-09'})]);assert.equal(conflict.summaries.all.executedSessions,0);
  const m=modern('run-1','2026-09-08'), changed=modern('run-1','2026-09-08',{completeness:'PARTIAL'});
  const r=merge([legacy()],[m,changed]);assert.equal(r.summaries.all.duration.value,null);assert.equal(r.summaries.all.executedSessions,0);
});
test('20/21 ownership is separate from existence of historical evidence',()=>{
  const history=merge([legacy()]);
  for(const scope of [{mode:'supervision',prescriptionAllowed:false,managedDisciplines:[],externalDisciplines:['carrera']},
    {mode:'focus',prescriptionAllowed:true,managedDisciplines:['box'],externalDisciplines:['carrera'],focusDiscipline:'box'}]){
    const r=h.scopeRunningHistory(history,scope);assert.equal(r.managedProgressionEvidence,false);assert.equal(r.history.records.length,1);
  }
  const r=h.scopeRunningHistory(history,{mode:'coach',prescriptionAllowed:true,managedDisciplines:['carrera'],externalDisciplines:[]});
  assert.equal(r.managedProgressionEvidence,true);assert.equal(r.numericalProgressionAuthorized,false);
});
test('19/22 real loader retains June–September legacy history and D1 event context',async()=>{
  const event=load('../athlete/eventAuthority').declareTargetEvent('u','crossfit','2026-11-15',today,null,today+'T12:00:00Z');
  const tables={usuarios:{codigo:'u',modo_entrada:'coach',categoria:'box',especialidad:'funcional_crossfit',objetivo_principal:'crossfit',
    perfil:{...equippedProfileFixture(),dias:3,targetEvent:event},distribucion_semanal:{box:['lunes','miercoles','viernes']},
    workout_history:[legacy({fecha:'2026-06-10',workout_id:'june'}),legacy()]},weekly_plan:[],running_execution_records:[],
    session_modification_events:[],physiology_records:[],athlete_state_events:[],athlete_coaching_notes:[],athlete_training_sources:[]};
  const db=fakeDatabase(tables),ctx=await load('../athlete/loadAthletePrescriptionContext').loadAthletePrescriptionContext(db,'u',{asOfDate:today});
  assert.equal(ctx.runningHistory.records.length,2);assert.equal(ctx.runningDoseBaseline.structuredExecutions.records.length,0);
  const before=load('../planning/canonicalWeekStrategy').buildCanonicalWeekStrategy(ctx,{mode:'coach',prescriptionAllowed:true,managedDisciplines:['box'],externalDisciplines:[]},3).eventAuthority;
  const planned=await load('../planning/prepareAllowedWeeklyPlanContract').prepareAllowedWeeklyPlanContract(db,'u',{targetWeekStart:'2026-09-14',today,empezarHoy:false,snapshot:null,strategyVersion:1});
  assert.equal(planned.ok,true,JSON.stringify(planned));assert.equal(planned.runningHistoryContext.history.records.length,2);
  assert.equal(planned.runningHistoryContext.managedProgressionEvidence,false);assert.equal(planned.contract.strategy.eventAuthority.digest,before.digest);
});
test('modern reader retains historical months without changing current B3 conflict window',async()=>{
  const old=modern('old','2026-06-01'), oldConflict=modern('old','2026-06-01',{completeness:'PARTIAL'}),recent=modern();
  const db=fakeDatabase({running_execution_records:[old,oldConflict,recent]});
  const r=await store.readRunningExecutionViews(db,'u',{startDate:'2026-08-14',endDate:today});
  assert.equal(r.window.conflicts.length,0);assert.equal(r.history.conflicts.length,1);assert.equal(r.window.records.length,1);
});
test('read-time bridge never mutates sources or invokes writes/LLM',()=>{
  const rows=[legacy()],before=JSON.stringify(rows);merge(rows);assert.equal(JSON.stringify(rows),before);
  const code=readFileSync('lib/execution/historicalRunning.ts','utf8');assert.doesNotMatch(code,/fetch\(|\.insert\(|\.update\(|\.upsert\(/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import { sportsRuntime, plain, fakeDatabase, contractFixture, compile, equippedProfileFixture } from '../sports/trainingContractTestRuntime.mjs';
const load = sportsRuntime({console:{log(){},info(){},warn(){}}});
const model = load('../execution/runningExecution'), store = load('../execution/runningExecutionStore');
const date = '2026-09-09', athlete = 'fixture-athlete';
const minutes = value => ({value,unit:'minutes'});
const report = (extra={}) => ({sourceActivityId:'activity-a',occurredAt:date,completeness:'FULL',quantities:{totalDuration:minutes(45)},...extra});
const method = methodId => ({methodId,pattern:'run'});
const validate = r => model.validateRunningExecution(r,athlete,date);
const threshold = (extra={}) => report({method:method('running_threshold'),quantities:{mainWorkDuration:minutes(24)},
  structure:{mode:'intervals',bouts:[0,1,2].map(boutIndex=>({boutIndex,movementId:'series_umbral',duration:minutes(8),completed:true})),
    recoveries:[0,1].map(afterBout=>({afterBout,duration:{value:0,unit:'seconds'},completed:true}))},...extra});
const intent = (id='running_threshold') => ({kind:'adaptation',methodId:id,adaptationId:load('goalTransferModel').transferMethod(id).adaptationId,
  goalId:'half_marathon',pattern:'run',role:'PRIMARY',blockPhase:'intensification',blockWeek:1,weaknessId:null});
const baseline = records => ({...load('../athlete/runningDoseBaseline').resolveRunningDoseBaseline(date,[]),structuredExecutions:model.reconcileRunningExecutions(records)});
const admission = records => load('runningDoseEvidenceAuthority').admitRunningDoseEvidence(baseline(records));
const compatible = (records,id='running_threshold') => load('runningDoseCompatibility').resolveCompatibleRunningDoseEvidence(admission(records),intent(id));
function database(initial=[]) {
  const rows=structuredClone(initial), calls=[];
  return {rows,calls,from(table){
    calls.push(table); assert.equal(table,'running_execution_records');
    return {async insert(value){ const duplicate=rows.some(r=>r.user_codigo===value.user_codigo && r.execution_id===value.execution_id && r.content_digest===value.content_digest);
      if(!duplicate) rows.push(structuredClone(value)); return {error:duplicate?{code:'23505'}:null}; },
      select(){let user; const q={eq(k,v){assert.equal(k,'user_codigo');user=v;return q;},order(){return q;},limit(){return q;},then(yes,no){return Promise.resolve({data:rows.filter(r=>r.user_codigo===user),error:null}).then(yes,no);}};return q;}};
  }};
}
test('A B E: completion and planned 45 minutes/threshold bouts never create actual quantities',()=>{
  const p={week_start:'2026-09-07',sessions:[{dia:'miercoles',tipo:'carrera',completada:true,session_id:'planned',
    structuredPrescription:{objective:{intent:intent()},durationSeconds:2700,blocks:threshold().structure}}]};
  const b=load('../athlete/runningDoseEvidence').projectRunningDoseBaseline({perfil:{}},[p],[],date);
  assert.equal(b.metrics.longestRecentRunDurationSeconds.value,null);
  assert.equal(b.metrics.recentMethodExposure[0].executedMainWorkSeconds,null);
  assert.equal(b.structuredExecutions,undefined);
});
test('C: completed-as-prescribed is explicitly unavailable; no blanket confirmation upgrade',()=>{
  assert.throws(()=>validate(report({completedAsPrescribed:true})),/FIELD_NOT_ALLOWED/);
  assert.throws(()=>validate(report({structuredPrescription:{durationSeconds:2700}})),/FIELD_NOT_ALLOWED/);
});
test('D O: modified actual 35 minutes and actual method stay distinct from immutable planned association',()=>{
  const planned={methodId:'running_threshold',duration:2700}; const original=JSON.stringify(planned);
  const r=validate(report({completeness:'MODIFIED',planSessionId:'plan-1',method:method('running_recovery'),quantities:{totalDuration:minutes(35)}}));
  assert.equal(r.quantities.totalDurationSeconds,2100); assert.equal(r.executionIdentity.methodId,'running_recovery');
  assert.equal(r.planAssociation.semantics,'REPORTED_PLAN_ASSOCIATION'); assert.equal(JSON.stringify(planned),original);
  assert.equal(compatible([r]).structuredMethodExecution.records.length,0);
});
test('F: explicit threshold main/bouts/recoveries admitted as self-report, never measured or numeric policy',()=>{
  const r=validate(threshold()), a=admission([r]), e=compatible([r]);
  assert.equal(e.structuredMethodExecution.status,'AVAILABLE');
  assert.equal(e.structuredMethodExecution.records[0].quantities.mainWorkDurationSeconds,1440);
  assert.equal(e.structuredMethodExecution.records[0].structure.bouts.length,3);
  assert.equal(e.structuredMethodExecution.authority,'STRUCTURED_SELF_REPORTED');
  assert.equal(a.basis.windows['28'].observedDuration.value,null);
  assert.equal(load('runningMethodDoseAuthority').resolveRunningMethodDose(e,intent()).status,'UNRESOLVED');
});
test('G H I: total is not main, main is not bouts, absent recovery differs from zero',()=>{
  const total=validate(report({method:method('running_threshold'),quantities:{totalDuration:minutes(40)}}));
  assert.equal(total.quantities.mainWorkDurationSeconds,undefined);
  assert.ok(compatible([total]).structuredMethodExecution.missing.includes('MAIN_WORK_UNKNOWN'));
  const main=validate(threshold({structure:undefined})); assert.equal(main.structure,undefined);
  const noRest=threshold(); delete noRest.structure.recoveries;
  assert.ok(compatible([validate(noRest)]).structuredMethodExecution.missing.includes('RECOVERY_UNKNOWN'));
  assert.equal(validate(threshold()).structure.recoveries[0].durationSeconds,0);
});
test('J: ambiguous legacy units excluded, explicit minutes/meters normalized only',()=>{
  assert.throws(()=>validate(report({quantities:{totalDuration:{value:45}}})),/UNIT_UNKNOWN/);
  assert.throws(()=>validate(report({quantities:{totalDuration:45}})),/OBJECT_REQUIRED/);
  assert.equal(validate(report({quantities:{totalDistance:{value:5,unit:'kilometers'}}})).quantities.totalDistanceMeters,5000);
});
test('K: contradictory same-identity reports persist as conflict, deterministic duplicates collapse',async()=>{
  const db=database(); assert.equal((await store.writeRunningExecution(db,athlete,report(),date)).ok,true);
  assert.equal((await store.writeRunningExecution(db,athlete,report(),date)).code,'EXECUTION_ALREADY_RECORDED');
  assert.equal((await store.writeRunningExecution(db,athlete,report({quantities:{totalDuration:minutes(35)}}),date)).code,'EXECUTION_CONFLICT');
  const result=await store.readRunningExecutions(db,athlete); assert.equal(result.records.length,0);assert.equal(result.conflicts.length,1);
  assert.equal(db.rows.length,2);
});
test('L M: namespaces and source IDs distinguish same date; plan association never merges activities',()=>{
  const identity=load('../execution/executionIntegrity').executionIdentity;
  assert.notEqual(identity(athlete,'healthkit','1'),identity(athlete,'garmin','1'));
  const a=validate(report({planSessionId:'plan-1'})), b=validate(report({sourceActivityId:'activity-b',planSessionId:'plan-1'}));
  assert.equal(model.reconcileRunningExecutions([a,b]).records.length,2);
  assert.notEqual(identity('other','forge_manual','1'),identity(athlete,'forge_manual','1'));
});
test('N: partial execution contains actual bouts only, never expands to planned count',()=>{
  const input=threshold({completeness:'PARTIAL',quantities:{mainWorkDuration:minutes(16)}});
  input.structure.bouts=input.structure.bouts.slice(0,2); input.structure.recoveries=input.structure.recoveries.slice(0,1);
  const r=validate(input), e=compatible([r]).structuredMethodExecution;
  assert.equal(r.structure.bouts.length,2);assert.equal(r.quantities.mainWorkDurationSeconds,960);
  assert.equal(e.integrityStatus,'INCOMPLETE_EXECUTION');assert.equal(e.status,'PARTIAL');
});
test('ambiguous identity, unknown method and absent quantity remain independent',async()=>{
  const r=validate(report({sourceActivityId:undefined,quantities:{}}));assert.equal(r.executionId,null);
  assert.equal(r.executionIdentity.status,'UNKNOWN');assert.deepEqual(plain(r.quantities),{});
  assert.equal(model.reconcileRunningExecutions([r]).ambiguousCount,1);
  await assert.rejects(store.writeRunningExecution(database(),athlete,report({sourceActivityId:undefined}),date),/IDENTITY_AMBIGUOUS/);
});
test('server boundary rejects spoofed authority, identifiers, units, method and free text',()=>{
  for(const k of ['authority','verification','provenance','source','athleteId','codigo','user_codigo','title','notes','plannedMethodId'])
    assert.throws(()=>validate(report({[k]:'forged'})),/FIELD_NOT_ALLOWED/);
  for(const value of [-1,Infinity,NaN,'45']) assert.throws(()=>validate(report({quantities:{totalDuration:{value,unit:'minutes'}}})));
  assert.throws(()=>validate(report({occurredAt:'2026-02-31'})),/DATE_INVALID/);
  assert.throws(()=>validate(report({occurredAt:'2099-01-01'})),/DATE_INVALID/);
  assert.throws(()=>validate(report({method:method('box_power')})),/METHOD_INVALID/);
});
test('inconsistent structure/completeness/total rejected without filling any unknown quantity',()=>{
  assert.throws(()=>validate(threshold({quantities:{mainWorkDuration:minutes(25)}})),/MAIN_STRUCTURE_CONFLICT/);
  assert.throws(()=>validate(report({quantities:{mainWorkDuration:minutes(45),totalDuration:minutes(35)}})),/TOTAL_CONFLICT/);
  const r=threshold(); r.structure.bouts[0].completed=false;assert.throws(()=>validate(r),/COMPLETENESS_CONFLICT/);
  const duplicate=threshold(); duplicate.structure.bouts.push(duplicate.structure.bouts[0]);assert.throws(()=>validate(duplicate),/BOUT_DUPLICATE/);
  assert.throws(()=>validate(report({method:method('running_vo2'),structure:{mode:'continuous',bouts:[]}})),/METHOD_STRUCTURE_INCOMPATIBLE/);
  const tooShort=threshold({quantities:{totalDuration:minutes(25),mainWorkDuration:minutes(24)}});
  tooShort.structure.recoveries.forEach(r=>r.duration=minutes(2));
  assert.throws(()=>validate(tooShort),/TOTAL_CONFLICT/);
  delete tooShort.quantities.mainWorkDuration;tooShort.quantities.totalDuration=minutes(20);
  assert.throws(()=>validate(tooShort),/TOTAL_CONFLICT/);
});
test('economy jump actual repetitions remain distinct from timed run efforts',()=>{
  const r=validate(report({method:{methodId:'running_economy',pattern:'jump'},quantities:{},structure:{mode:'technical',
    bouts:[{boutIndex:0,movementId:'bounding',repetitions:7,completed:true}],recoveries:[]}}));
  assert.equal(r.structure.bouts[0].repetitions,7); assert.equal(r.structure.bouts[0].durationSeconds,undefined);
  assert.equal(r.executionIdentity.variant,'jump');
});
test('storage signatures bind athlete and exact facts; arbitrary persisted payloads fail closed',async()=>{
  const row=store.sealRunningExecution(athlete,report(),date);
  const altered=structuredClone(row);altered.record.quantities.totalDurationSeconds=999;
  await assert.rejects(store.readRunningExecutions(database([altered]),athlete),/STORED_INTEGRITY_INVALID/);
  const other=structuredClone(row);other.user_codigo='other';
  await assert.rejects(store.readRunningExecutions(database([other]),'other'),/STORED_INTEGRITY_INVALID/);
  assert.equal((await store.readRunningExecutions(database([row]),athlete)).records.length,1);
});
test('real context read -> B31 -> admission -> compatible method evidence; no plan/legacy promotion',async()=>{
  const sealed=store.sealRunningExecution(athlete,threshold(),date);
  const db=fakeDatabase({usuarios:{especialidad:'carrera',objetivo_principal:'half_marathon',perfil:{duracion:'90 min'}},weekly_plan:[],session_modification_events:[],
    running_execution_records:[sealed]});
  const context=await load('../athlete/loadAthletePrescriptionContext').loadAthletePrescriptionContext(db,athlete,{asOfDate:date});
  assert.equal(context.runningDoseEvidenceAdmission.basis.structuredExecutions.records.length,1);
  assert.equal(context.runningDoseEvidenceAdmission.basis.windows['28'].observedDuration.value,null);
  const e=load('runningDoseCompatibility').resolveCompatibleRunningDoseEvidence(context.runningDoseEvidenceAdmission,intent());
  assert.equal(e.structuredMethodExecution.status,'AVAILABLE');
  assert.ok(!JSON.stringify(e.structuredMethodExecution).includes('athleteScope'));
});
function capability(records=[],withContext=true,profile={}){
  const athleteContext=load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({especialidad:'carrera',objetivo_principal:'half_marathon',perfil:{duracion:'90 min',...profile}});
  const scope={mode:'coach',prescriptionAllowed:true,managedDisciplines:['carrera'],externalDisciplines:[]};
  const contexts={carrera:contractFixture({discipline:'carrera',prescriptionScope:scope,availableDays:['lunes'],exposureContext:{source:'legacy_completed_weekly_rows',report:{disciplina:'carrera',exposiciones:[],estimulosSubexpuestos:[],estimulosSobreexpuestos:[]},limitations:[]}})};
  const c=load('doseCapabilityProfile').buildDoseCapabilityProfile(admission(records),scope,{goalId:'half_marathon',blockPhase:'intensification',blockWeek:1,
    ...(withContext?{athlete:athleteContext,contexts}:{})});
  return {c,scope,contexts,athleteContext};
}
test('P Q R: independent intensity resolution, policy/evidence/composition blockers; NOT_EVALUATED preserved',()=>{
  const entry=capability().c.entries.find(e=>e.methodId==='running_threshold');
  assert.equal(entry.intensityStatus,'RESOLVED');assert.equal(entry.timeStatus,'NOT_EVALUATED');assert.equal(entry.weeklyContextStatus,'NOT_EVALUATED');
  for(const b of ['DOSE_EVIDENCE_MISSING','DOSE_POLICY_NOT_ESTABLISHED','DOSE_COMPOSITION_NOT_ESTABLISHED','NO_COMPATIBLE_EXECUTION']) assert.ok(entry.blockers.includes(b));
  assert.equal(capability([],false).c.entries.find(e=>e.methodId==='running_threshold').intensityStatus,'NOT_EVALUATED');
  assert.equal(capability().c.entries.find(e=>e.methodId==='running_economy').intensityStatus,'UNRESOLVED');
  const available=capability([validate(threshold())]).c.entries.find(e=>e.methodId==='running_threshold');
  assert.equal(available.evidenceStatus,'STRUCTURED_EXECUTION_AVAILABLE');assert.equal(available.prescriptionAllowed,false);
  assert.ok(available.blockers.includes('DOSE_POLICY_NOT_ESTABLISHED'));assert.ok(!available.blockers.includes('DOSE_EVIDENCE_MISSING'));
});
test('S: weekly deferred demand preserves simultaneous blockers before Planner',()=>{
  const {c,scope,contexts,athleteContext}=capability();
  const strategy=load('../planning/canonicalWeekStrategy').buildCanonicalWeekStrategy(athleteContext,scope,3);
  // Explicit catalog demand fixture: real candidate filtering still runs.
  strategy.goal.id='half_marathon';strategy.methods=['running_threshold'];strategy.adaptations=[{id:'umbral',role:'PRIMARY',weaknessIds:[],requiredPattern:null}];
  const r=load('../planning/allowedWeeklyPlanContract').buildAllowedWeeklyPlanContract({targetWeekStart:'2026-09-14',prescriptionScope:scope,contexts,
    allowed:{carrera:['lunes']},fixed:{},maxExecutableDays:1,completeNewWeek:true,doseCapabilities:c,strategy});
  assert.equal(r.ok,false);assert.ok(r.deferredDoseDemands[0].blockers.includes('DOSE_POLICY_NOT_ESTABLISHED'));
  assert.ok(r.deferredDoseDemands[0].blockers.includes('DOSE_EVIDENCE_MISSING'));
});
test('T: all five numeric selectors remain null even with compatible execution',async()=>{
  for(const p of load('runningMethodDosePolicies').RUNNING_METHOD_DOSE_POLICIES.filter(p=>p.methodId!=='running_base')) assert.equal(p.selectDose,null);
  const authority=load('runningMethodDoseAuthority').resolveRunningMethodDose(compatible([validate(threshold())]),intent());
  const {contexts,athleteContext}=capability(); const dc=load('sessionDoseContext').buildSessionDoseContext(athleteContext,intent(),null,[],true);
  const built=load('allowedTrainingContract').buildAllowedTrainingContract({...contexts.carrera,targetDay:'lunes',stimulus:'umbral',intent:intent(),doseContext:dc});
  assert.equal(built.ok,true,JSON.stringify(built)); built.contract.runningMethodDose=authority;
  let calls=0;const r=await load('sessionGeneration').generateContractSession(built.contract,[],async()=>{calls++;return '';});
  assert.equal(r.code,'RUNNING_METHOD_DOSE_UNRESOLVED');assert.equal(calls,0);
});
test('P: threshold reference can execute while dose evidence and policy remain missing',()=>{
  const {c,contexts,athleteContext}=capability([],true,{...equippedProfileFixture(),ritmo_umbral:'5:00 min/km'});
  const dc=load('sessionDoseContext').buildSessionDoseContext(athleteContext,intent(),null,[],true);
  const built=load('allowedTrainingContract').buildAllowedTrainingContract({...contexts.carrera,targetDay:'lunes',stimulus:'umbral',intent:intent(),doseContext:dc});
  assert.equal(built.ok,true);const intensity=load('methodIntensityAuthority').resolveMethodIntensity(built.contract);
  assert.equal(intensity.status,'RESOLVED');assert.equal(intensity.targets[0].primary.kind,'reference');
  const e=c.entries.find(e=>e.methodId==='running_threshold');assert.equal(e.intensityStatus,'RESOLVED');
  assert.ok(e.blockers.includes('DOSE_EVIDENCE_MISSING'));assert.ok(e.blockers.includes('DOSE_POLICY_NOT_ESTABLISHED'));
});
test('concurrent immutable reports dedupe and conflicts exclude self-reported aggregates',async()=>{
  const db=database();await Promise.all([store.writeRunningExecution(db,athlete,report(),date),store.writeRunningExecution(db,athlete,report(),date)]);
  assert.equal(db.rows.length,1);
  await store.writeRunningExecution(db,athlete,report({quantities:{totalDuration:minutes(35)}}),date);
  const evidence=await store.readRunningExecutions(db,athlete);
  const a=load('runningDoseEvidenceAuthority').admitRunningDoseEvidence({...baseline([]),structuredExecutions:evidence});
  assert.equal(a.basis.selfReportedTotals['28'].duration.value,null);
  assert.equal(compatible([validate(report()),validate(report({quantities:{totalDuration:minutes(35)}}))]).structuredMethodExecution.status,'CONFLICT');
});
test('failed storage and read caps fail closed without silently dropping factual conflicts',async()=>{
  const failed={from(){return {select(){const q={eq(){return q;},order(){return q;},limit(){return Promise.resolve({data:null,error:{code:'failure'}});}};return q;}};}};
  await assert.rejects(store.readRunningExecutions(failed,athlete),/READ_FAILED/);
  const row=store.sealRunningExecution(athlete,report(),date);
  await assert.rejects(store.readRunningExecutions(database(Array.from({length:1001},()=>row)),athlete),/READ_CAP_EXCEEDED/);
});
test('specific variants and economy patterns cannot leak execution across methods',()=>{
  const hm=validate(report({method:{methodId:'running_specific',pattern:'run',variant:'half_marathon:run'},quantities:{mainWorkDuration:minutes(35)},structure:{mode:'continuous',bouts:[]}}));
  const a=admission([hm]), api=load('runningDoseCompatibility');
  assert.equal(api.resolveCompatibleRunningDoseEvidence(a,intent('running_specific')).structuredMethodExecution.records.length,1);
  assert.equal(api.resolveCompatibleRunningDoseEvidence(a,{...intent('running_specific'),goalId:'10k'}).structuredMethodExecution.records.length,0);
  assert.equal(compatible([hm],'running_threshold').structuredMethodExecution.records.length,0);
});
test('self-reported totals preserve zero/missing and generic totals never become method main work',()=>{
  const a=admission([validate(report({quantities:{totalDuration:{value:0,unit:'seconds'}}}))]);
  assert.equal(a.basis.selfReportedTotals['28'].duration.value,0);assert.equal(a.basis.selfReportedTotals['28'].distance.value,null);
  assert.equal(a.basis.windows['28'].observedDuration.value,null);
  assert.equal(compatible([validate(report())]).structuredMethodExecution.integrityStatus,'IDENTITY_UNKNOWN');
});
test('window retains all versions of a relevant identity but ignores unrelated old conflicts',async()=>{
  const old=store.sealRunningExecution(athlete,report({sourceActivityId:'old',occurredAt:'2025-01-01'}),date);
  const oldConflict=store.sealRunningExecution(athlete,report({sourceActivityId:'old',occurredAt:'2025-01-02'}),date);
  const current=store.sealRunningExecution(athlete,report(),date), contradictoryDate=store.sealRunningExecution(athlete,report({occurredAt:'2025-01-01'}),date);
  const window={startDate:'2026-08-13',endDate:date};
  assert.equal((await store.readRunningExecutions(database([old,oldConflict,current]),athlete,window)).conflicts.length,0);
  const scoped=await store.readRunningExecutions(database([old,oldConflict,current,contradictoryDate]),athlete,window);
  assert.equal(scoped.conflicts.length,1);assert.equal(scoped.records.length,0);
});
test('SQL grants append/read only to service and no client access; existing tables untouched',()=>{
  const sql=readFileSync('docs/sql/b32c-running-execution-records.sql','utf8');
  assert.match(sql,/enable row level security/i);assert.match(sql,/revoke all .* from anon, authenticated/i);
  assert.match(sql,/primary key \(user_codigo, execution_id, content_digest\)/i);
  assert.match(sql,/revoke update, delete .* from service_role/i);
  assert.doesNotMatch(sql,/(alter|update|delete from) (public\.)?(usuarios|weekly_plan)\b/i);
});
test('authenticated handler rejects client identity, unauthenticated requests and forged authority',async()=>{
  const cache=new Map(); const db=database();
  const authId='00000000-0000-4000-8000-000000000001';
  const dataDb={from(table){if(table!=='usuarios')return db.from(table);const q={select(){return q;},eq(){return q;},async limit(){return {data:[{id:'00000000-0000-4000-8000-000000000002',auth_user_id:authId,codigo:athlete}],error:null};}};return q;}};
  function module(file){const path=resolve(file);if(cache.has(path))return cache.get(path).exports;const m={exports:{}};cache.set(path,m);
    vm.runInNewContext(compile(readFileSync(path,'utf8')),{module:m,exports:m.exports,Request,Response,URL,Buffer,structuredClone,
      process:{env:{SUPABASE_SERVICE_ROLE_KEY:'isolated-sports-test-key'}},require(n){if(n==='server-only')return {};if(n==='node:crypto')return crypto;return module(resolve(dirname(path),n+'.ts'));}});return m.exports;}
  const handler=module('lib/execution/runningExecutionHandler.ts').handleRunningExecution;
  let authCalls=0;const deps=()=>({db:dataDb,auth:{async getUser(){authCalls++;return {data:{user:{id:authId,email_confirmed_at:date}},error:null};}}});
  const request=async(body,header='Bearer test')=>{const r=await handler(new Request('https://fixture.invalid',{method:'POST',headers:header?{authorization:header}:{},body:JSON.stringify(body)}),deps);return {status:r.status,...await r.json()};};
  assert.equal((await request(report(),null)).status,401);assert.equal(authCalls,0);
  assert.equal((await request(report({codigo:'other'}))).code,'EXECUTION_FIELD_NOT_ALLOWED');
  assert.equal((await request(report({verification:'verified_actual'}))).code,'EXECUTION_FIELD_NOT_ALLOWED');
  assert.equal((await request(report())).ok,true);assert.equal(db.rows[0].user_codigo,athlete);
});

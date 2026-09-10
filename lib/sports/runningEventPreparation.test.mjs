import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime } from './trainingContractTestRuntime.mjs';
const load=sportsRuntime({console:{log(){},warn(){},info(){}}});
const d=load('runningEventPreparation'),e=load('../athlete/eventAuthority');
const h=load('../execution/historicalRunning'),r=load('../execution/runningExecution');
const scope={mode:'coach',prescriptionAllowed:true,managedDisciplines:['carrera'],externalDisciplines:[]};
const date='2026-09-10';
const event=e.declareTargetEvent('u','half_marathon','2026-11-15',date,null,date+'T12:00:00Z');
const stamp=days=>new Date(Date.parse(date)-days*86400000).toISOString().slice(0,10);
const row=(days,tipo,i)=>({fecha:stamp(days),tipo,workout_id:'fixture-'+i,duracion:50});
const established=Array.from({length:12},(_,week)=>['rodaje_z2','rodaje_largo_z2','series'].map((kind,i)=>row(week*7+i,kind,week+'-'+i))).flat();
const input=(rows=established,today=date,s=scope)=>({eventAuthority:e.resolveEventAuthority({stored:event},'half_marathon',s,today,'u'),runningHistory:h.mergeRunningHistory('u',rows,r.reconcileRunningExecutions([]),today),scope:s,referenceDate:today});
test('12 active weeks differ from isolated, stale and easy-only histories without numeric dose',()=>{
 const a=d.decideRunningEventPreparation(input([row(1,'rodaje_z2',1),row(2,'rodaje_regenerativo',2),row(3,'series',3)]));
 const b=d.decideRunningEventPreparation(input());
 const c=d.decideRunningEventPreparation(input([row(56,'rodaje_z2',1),row(57,'series',2),row(58,'rodaje_largo_z2',3)]));
 const f=d.decideRunningEventPreparation(input(established.map(x=>({...x,tipo:'rodaje_z2'}))));
 assert.equal(a.longitudinalState,'DEVELOPING');assert.equal(b.longitudinalState,'ESTABLISHED_CURRENT');assert.equal(c.longitudinalState,'STALE');assert.equal(f.longitudinalState,'DEVELOPING');
 for(const x of [a,b,c,f]){assert.equal(x.preparationState,'BASE_BUILD');assert.equal(x.daysRemaining,66);assert.equal(x.evidenceSummary.numericDoseCoverage,'UNKNOWN');}
 assert.equal(b.constraints.quality,'ALLOWED');assert.equal(a.constraints.quality,'FORBIDDEN');assert.equal(c.longitudinalDecision,'REPEAT');
});
for(const [today,state] of [['2026-10-24','SPECIFIC_BUILD'],['2026-10-25','TAPER'],['2026-11-07','TAPER'],['2026-11-08','RACE_WEEK'],['2026-11-15','RACE_WEEK'],['2026-11-16','POST_EVENT']])
 test('real D1 boundary '+today,()=>{const x=d.decideRunningEventPreparation(input(established,today));assert.equal(x.preparationState,state);assert.ok(x.daysRemaining>=0);if(['TAPER','RACE_WEEK','POST_EVENT'].includes(state)){assert.equal(x.constraints.overload,'FORBIDDEN');assert.equal(x.constraints.quality,'FORBIDDEN');}});
test('scope and restriction forbid quality eligibility',()=>{
 const s={mode:'supervision',prescriptionAllowed:false,managedDisciplines:[],externalDisciplines:['carrera']};
 const x=d.decideRunningEventPreparation(input(established,date,s));assert.equal(x.longitudinalDecision,'BLOCKED');assert.equal(d.runningEventMethodAllowed(x,'running_threshold'),false);
 const restricted=d.decideRunningEventPreparation({...input(),restrictions:{active:true}});assert.equal(restricted.longitudinalDecision,'REDUCE');assert.equal(restricted.constraints.quality,'FORBIDDEN');
});
test('availability and history invalidate decision digest',()=>{
 const a=input(),base=d.decideRunningEventPreparation(a);
 assert.notEqual(base.decisionDigest,d.decideRunningEventPreparation({...a,availability:['lunes']}).decisionDigest);
 assert.notEqual(base.decisionDigest,d.decideRunningEventPreparation(input([])).decisionDigest);
});
test('weekly selector rejects omission of a required recovery purpose',()=>{
 const decision=d.decideRunningEventPreparation({...input(),restrictions:{active:true}});
 const days=['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
 const contract={contractVersion:1,contextDigest:'fixture',frequencyPolicy:{minExecutableDays:1,maxExecutableDays:3,requireGenuineRest:true},runningEventPreparation:decision,
 dayOptions:Object.fromEntries(days.map(day=>[day,[{optionId:day,state:day==='lunes'?'TRAIN':'REST',discipline:day==='lunes'?'box':undefined}]]))};
 const result=load('../planning/allowedWeeklyPlanContract').validateWeeklySelection(contract,{contractVersion:1,contextDigest:'fixture',selections:days.map(day=>({day,optionId:day}))});
 assert.equal(result.ok,false);assert.ok(result.errors.includes('D3_REQUIRED_RECOVERY_MISSING'));
});
test('B3 acknowledges PROGRESS without fabricating a selector or dose',()=>{
 const authority=load('runningMethodDoseAuthority');const decision={...d.decideRunningEventPreparation(input()),longitudinalDecision:'PROGRESS'};
 const missing=authority.resolveLongitudinalRunningDose({status:'UNRESOLVED',dose:null},decision);assert.equal(missing.numericProgressionAuthorized,false);assert.equal(missing.selectedDose,null);
 const safe={selectedTarget:{minimum:2700,maximum:2700}};
 const resolved=authority.resolveLongitudinalRunningDose({status:'RESOLVED',dose:safe},decision);assert.equal(resolved.numericProgressionAuthorized,false);assert.equal(resolved.reason,'PROGRESSION_SELECTOR_NOT_ESTABLISHED');assert.equal(resolved.selectedDose.selectedTarget.maximum,2700);
});

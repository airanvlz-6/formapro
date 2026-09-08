import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, contractFixture, plain, fakeDatabase, equippedProfileFixture, completeDoseFixture } from '../sports/trainingContractTestRuntime.mjs';

// Synthetic catalog relations exercise engine semantics; none assert a real sports equivalence.
const relation = (extra={}) => ({id:'fixture_technique_strength',fromAdaptationId:'tecnica',fromDiscipline:'box',toMethodId:'box_max_strength',
  transferKind:'EQUIVALENT',applicableStrategies:['crossfit'],applicablePhases:['deload'],requiredAvailabilityPermission:'SAME_DISCIPLINE',priority:1,...extra});
function setup({blocked=true,relations=[relation()],forceAll=false,throwLogger=false}={}){
 const logs=[],calls=[];
 const load=sportsRuntime({console:{log(){},warn(){},info:(...args)=>{if(throwLogger)throw Error('LOGGER');logs.push(args);}}},(path,exports)=>path.replaceAll('\\','/').endsWith('/trainingFeasibility.ts')?{
  ...exports,evaluateTrainingFeasibility(input){calls.push(input);const r=exports.evaluateTrainingFeasibility(input);return forceAll?{...r,feasible:false,errors:['MOVEMENT_POOL_EMPTY']}:r;}
 }:exports);
 load('goalTransferModel').METHOD_TRANSFER_RELATIONS.push(...structuredClone(relations));
 const scope={mode:'coach',prescriptionAllowed:true,managedDisciplines:['box','carrera'],externalDisciplines:[]};
 const allowed={box:['jueves'],carrera:[]};
 const restrictions=load('../athlete/getCanonicalRestrictions').projectCanonicalRestrictions([],blocked?[{id:'fixture',movement:'',status:'pending',constraint_level:'hard',prohibits_impact:true}]:[],'2026-09-08');
 const contexts=Object.fromEntries(scope.managedDisciplines.map(discipline=>{
  const c=contractFixture({discipline,prescriptionScope:scope,availableDays:allowed[discipline],restrictionsSnapshot:restrictions});c.exposureContext.report.disciplina=discipline;return [discipline,c];
 }));
 const profile=load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({objetivo_principal:'crossfit',ciclo_actual:{bloque:'deload'}});
 const input={targetWeekStart:'2026-09-07',prescriptionScope:scope,contexts,allowed,maxExecutableDays:5,completeNewWeek:false,fixed:{},
  strategy:load('../planning/canonicalWeekStrategy').buildCanonicalWeekStrategy(profile,scope,5),regeneration:{pendingManagedDays:['jueves']}};
 return {load,input,logs,calls,build:()=>load('../planning/allowedWeeklyPlanContract').buildAllowedWeeklyPlanContract(input)};
}
const transferred=r=>Object.values(r.contract.dayOptions).flat().filter(o=>o.intent?.transfer);
test('T1 T13: exact viable ignores transfers and preserves legacy contract byte-for-byte',()=>{
 const a=setup({blocked:false}),b=setup({blocked:false,relations:[]});
 assert.deepEqual(plain(a.build()),plain(b.build()));assert.equal(a.calls.length,b.calls.length);
});
test('T2: exact infeasible admits a synthetic same-discipline transfer through real feasibility',()=>{
 const f=setup(),r=f.build();assert.equal(r.ok,true);assert.ok(transferred(r).length>0);
 assert.ok(transferred(r).every(o=>o.discipline==='box'&&o.intent.transfer.fromAdaptationId==='tecnica'));
 assert.ok(f.calls.some(c=>c.intent.transfer));
});
test('T3: no executable when exact and authorized alternatives are infeasible',()=>{
 const f=setup({forceAll:true});assert.equal(f.build().code,'NO_NEW_EXECUTABLE_PRESCRIPTION');
 assert.ok(f.calls.some(c=>c.intent.transfer));
});
for(const extra of [{applicableStrategies:['10k']},{applicablePhases:['realization']}])test(`T4: strategy/phase exclusion ${JSON.stringify(extra)}`,()=>{
 const f=setup({relations:[relation(extra)]});assert.equal(f.build().code,'NO_NEW_EXECUTABLE_PRESCRIPTION');assert.ok(!f.calls.some(c=>c.intent.transfer));
 const details=f.logs.filter(e=>e[0].startsWith('WEEKLY_TRANSFER_CANDIDATE_DETAIL ')).map(e=>JSON.parse(e[0].split('WEEKLY_TRANSFER_CANDIDATE_DETAIL ')[1]));
 assert.ok(details.some(d=>d.feasibilityResult==='NOT_EVALUATED'&&(!d.phaseEligible||!d.strategyEligible)));
});
for(const permission of [false,true])test(`T5 T6: cross-training requires explicit directed canonical day permission=${permission}`,()=>{
 const f=setup({relations:[relation({id:'fixture_cross',fromAdaptationId:'recuperacion_activa',fromDiscipline:'carrera',toMethodId:'box_aerobic',requiredAvailabilityPermission:'CROSS_TRAINING'})]});
 f.input.allowed={box:[],carrera:['miercoles']};f.input.contexts.box.availableDays=[];f.input.contexts.carrera.availableDays=['miercoles'];f.input.regeneration.pendingManagedDays=['miercoles'];
 if(permission)f.input.transferPermissions={version:1,source:'canonical_availability',crossTraining:[{day:'miercoles',fromDiscipline:'carrera',toDiscipline:'box'}]};
 const r=f.build();assert.equal(r.ok,permission);
 if(permission){assert.ok(transferred(r).every(o=>o.discipline==='box'));assert.ok(f.calls.some(c=>c.intent.transfer&&c.targetDay==='miercoles'));}
 else assert.ok(!f.calls.some(c=>c.intent.transfer));
});
test('T7: unknown compatibility stays excluded in the transferred method',()=>{
 const f=setup({relations:[relation({toMethodId:'box_weightlifting'})]});
 assert.equal(f.build().code,'NO_NEW_EXECUTABLE_PRESCRIPTION');assert.ok(f.calls.some(c=>c.intent.transfer));
});
test('T8 T10: duplicates and catalog order cannot duplicate or reorder transfer options',()=>{
 const a=relation(),b=relation({id:'fixture_other',priority:2}),c=relation({id:'fixture_partial',transferKind:'PARTIAL',priority:3});
 const x=setup({relations:[a,b,a,c]}),y=setup({relations:[c,a,b,a]});
 assert.deepEqual(plain(x.build()),plain(y.build()));
 const calls=x.calls.filter(c=>c.intent.transfer);assert.equal(new Set(calls.map(c=>c.intent.transfer.provenance+':'+c.intent.methodId+':'+c.intent.pattern)).size,calls.length);
});
test('T9: cycles never recurse; oversized and conflicting catalogs fail closed',()=>{
 const f=setup({relations:[relation(),relation({id:'fixture_reverse',fromAdaptationId:'fuerza_maxima',toMethodId:'box_technique'})]});
 assert.equal(f.build().ok,true);assert.ok(!f.calls.some(c=>c.intent.transfer?.relationId==='fixture_reverse'));
 assert.deepEqual(plain(setup({relations:Array(129).fill(relation())}).build()).errors,['TRANSFER_CATALOG_INVALID']);
 assert.deepEqual(plain(setup({relations:[relation(),relation({priority:2})]}).build()).errors,['TRANSFER_CATALOG_INVALID']);
});
for(const kind of ['EQUIVALENT','MAINTENANCE','PARTIAL'])test(`T11: ${kind} coverage is explicit and only equivalent satisfies full coverage`,()=>{
 const f=setup({relations:[relation({transferKind:kind})]}),r=f.build();assert.equal(r.ok,true);
 const coverage=r.contract.strategy.transferCoverage.find(c=>c.adaptationId==='tecnica');assert.ok(coverage.statuses.includes('TRANSFER_'+kind));
 assert.equal(r.contract.strategy.coverage.some(c=>c.adaptationId==='tecnica'),kind==='EQUIVALENT');
 if(kind!=='EQUIVALENT')assert.ok(coverage.statuses.includes('DEFERRED'));
 const selected=Object.fromEntries(Object.entries(r.contract.dayOptions).map(([day,options])=>[day,options.find(o=>o.intent?.transfer)||options[0]]));
 assert.ok(f.load('../planning/planningDiagnostics').strategyDiagnostic(r.contract.strategy,selected).dailyIntents.some(i=>i.transfer?.provenance==='TRANSFER_'+kind));
});
test('T12: direct Builder cannot accept an unsigned transfer and fabricated relation fails validation',async()=>{
 const f=setup(),r=f.build(),intent=transferred(r)[0].intent;let reads=0,llm=0;
 const built=await f.load('sessionAuthority').generateTrainingSession({from(){reads++;throw Error('NO_READ');}},'fixture',
  {targetWeekStart:'2026-09-07',day:'jueves',discipline:'box',stimulus:'fuerza_maxima',intent},async()=>{llm++;return '';});
 assert.equal(built.code,'TRANSFER_REQUIRES_WEEKLY_AUTHORITY');assert.equal(reads+llm,0);
 assert.equal(f.load('goalTransferModel').validateStrategicIntent({...intent,transfer:{...intent.transfer,relationId:'invented'}}),false);
});
test('T14: current production catalog is empty and deload still has only the two exact methods',()=>{
 const f=setup({blocked:false,relations:[]});f.input.allowed.carrera=['miercoles'];f.input.contexts.carrera.availableDays=['miercoles'];
 const r=f.build();assert.equal(r.ok,true);
 assert.deepEqual([...new Set(Object.values(r.contract.dayOptions).flat().flatMap(o=>o.intent?[o.intent.methodId]:[]))].sort(),['box_technique','running_recovery']);
});
test('transfer logger failure changes neither candidates nor feasibility call count',()=>{
 const a=setup(),b=setup({throwLogger:true});assert.deepEqual(plain(a.build()),plain(b.build()));assert.equal(a.calls.length,b.calls.length);
});
test('T12: real signed weekly transfer reaches Builder unchanged; altered provenance rejects before LLM',async()=>{
 const f=setup(),{load}=f;
 const data={usuarios:{modo_entrada:'coach',categoria:'box',especialidad:'crossfit',objetivo_principal:'crossfit',ciclo_actual:{bloque:'deload'},
  perfil:{...equippedProfileFixture(),dias:5},workout_history:[],distribucion_semanal:{box:['jueves']}},athlete_training_sources:[],
  athlete_state_events:[],athlete_coaching_notes:[{id:'fixture',status:'pending',constraint_level:'hard',prohibits_impact:true}],weekly_plan:[],physiology_records:[],session_modification_events:[]};
 const db=fakeDatabase(data),from=db.from.bind(db);db.from=t=>{const q=from(t);if(['weekly_plan','physiology_records'].includes(t))q.maybeSingle=async()=>({data:null,error:null});return q;};
 const plan=await load('../planning/prepareAllowedWeeklyPlanContract').planBoundedWeek(db,'fixture',
  {targetWeekStart:'2026-09-07',today:'2026-09-06',empezarHoy:false,snapshot:null,strategyVersion:1},async prompt=>{
   const c=JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1]);return JSON.stringify({contractVersion:1,contextDigest:c.contextDigest,
    selections:Object.entries(c.dayOptions).map(([day,options])=>({day,optionId:(options.find(o=>o.intent?.transfer)||options[0]).optionId}))});
  },'fixture-token');
 assert.equal(plan.ok,true,JSON.stringify(plan));const p=plan.estructura,slot=p.sessions.find(s=>s.dia==='jueves');
 const receipt=load('../planning/weeklyCalendarAuthority').verifyWeeklyCalendarReceipt(p.calendarReceipt,'fixture','2026-09-07',true);
 assert.deepEqual(plain(receipt.admittedSlots.find(s=>s.day==='jueves').intent),plain(slot.intent));
 const request={targetWeekStart:'2026-09-07',day:'jueves',discipline:slot.discipline,stimulus:slot.stimulusId,intent:slot.intent,
  weekly:{receipt:p.calendarReceipt,generationToken:'fixture-token',optionId:slot.optionId}};
 const compose=async prompt=>{const c=JSON.parse(prompt.split('CONTRACT:\n')[1].split('\n')[0]);
  const movement=c.allowedMovementIds.find(id=>load('movementLibrary').MOVEMENT_LIBRARY[id].movement_pattern===c.intent.pattern);
  return JSON.stringify(completeDoseFixture(c,{stimulusId:c.stimulusId,structureId:c.allowedStructureIds[0],blocks:['warmup','main','cooldown'].map(blockType=>({blockType,movements:[{movementId:movement,prescription:{reps:5}}]}))}));};
 const result=await load('sessionAuthority').generateTrainingSession(db,'fixture',request,compose);
 assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(plain(result.trainingContract.intent.transfer),plain(slot.intent.transfer));
 let calls=0;const altered=structuredClone(request);altered.intent.transfer.provenance='TRANSFER_PARTIAL';
 const bad=await load('sessionAuthority').generateTrainingSession(db,'fixture',altered,async()=>{calls++;return '';});assert.equal(bad.ok,false);assert.equal(calls,0);
 load('goalTransferModel').METHOD_TRANSFER_RELATIONS.splice(0);
 const stale=await load('sessionAuthority').generateTrainingSession(db,'fixture',request,async()=>{calls++;return '';});assert.equal(stale.ok,false);assert.equal(calls,0);
});

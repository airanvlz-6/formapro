import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, fakeDatabase, equippedProfileFixture, plain } from './trainingContractTestRuntime.mjs';
const load = sportsRuntime({console:{info(){},log(){},warn(){}}});
const methods = ['running_recovery','running_long_run','running_threshold','running_vo2'];
const movement = ['regenerativo','rodaje_largo','series_umbral','series_vo2max'];
export function execution(method, date='2026-09-09') {
  const index=methods.indexOf(method), seconds=[1200,3000,1200,180][index], reps=method==='running_vo2'?4:1;
  return {sourceActivityId:method+'-'+date,occurredAt:date,method:{methodId:method,pattern:'run'},completeness:'FULL',
    quantities:{totalDuration:{value:seconds*reps+(reps-1)*120,unit:'seconds'},mainWorkDuration:{value:seconds*reps,unit:'seconds'}},
    structure:{mode:reps===1?'continuous':'intervals',bouts:Array.from({length:reps},(_,i)=>({boutIndex:i,movementId:movement[index],duration:{value:seconds,unit:'seconds'},completed:true})),
      ...(reps===1?{}:{recoveries:Array.from({length:reps-1},(_,i)=>({afterBout:i,duration:{value:120,unit:'seconds'},mode:'passive',completed:true}))})}};
}
export function fixture({date='2026-09-10',week='2026-09-14',include=methods,goal='half_marathon'}={}) {
  const binding={planningRunId:'b3-reuse',targetWeekStart:week};
  const duration=load('../athlete/runningHabitualDeclarations').habitualRunningFact('habitualEasyRunningDurationMinutes',45,date+'T12:00:00Z');
  const historical=[['2026-07-01','carrera z2',48],['2026-07-09','z2_intervalos',44],['2026-07-12','rodaje_largo_progresivo',70],['2026-07-23','intervalos_z3_cortos'],
    ['2026-07-30','carrera_series'],['2026-08-02','carrera_larga',85],['2026-08-09','rodaje_largo_z2',103],['2026-08-17','rodaje_z2'],['2026-08-21','rodaje_z2'],
    ['2026-08-24','rodaje_z2',52],['2026-08-26','series',62],['2026-08-28','rodaje_regenerativo',35],['2026-08-30','carrera',75],['2026-08-31','rodaje Z2',49],['2026-09-06','carrera',92],['2026-09-08','carrera',50]]
    .map(([fecha,tipo,duracion])=>({fecha,tipo,duracion,workout_id:'fixture-'+fecha,notas:'5000 metros 45 minutos',analisis:'1800 seconds'}));
  const perfil={...equippedProfileFixture(),dias:3,duracion:'90 min',
    targetEvent:load('../athlete/eventAuthority').declareTargetEvent('u',goal,'2026-11-15','2026-09-10',null,'2026-09-10T12:00:00Z'),
    runningHabitualDeclarations:{habitualEasyRunningDurationMinutes:duration},
    runningHabitualConfirmation:load('../athlete/runningHabitualConfirmation').issueRunningHabitualConfirmation('u',binding,duration)};
  const recordDate=new Date(Date.parse(date)-86400000).toISOString().slice(0,10);
  const tables={usuarios:{codigo:'u',modo_entrada:'coach',categoria:'carrera',especialidad:'carrera',objetivo_principal:goal,perfil,
    distribucion_semanal:{carrera:['lunes','miercoles','viernes']},workout_history:historical},weekly_plan:[],
    running_execution_records:include.map(m=>load('../execution/runningExecutionStore').sealRunningExecution('u',execution(m,recordDate),date)),
    session_modification_events:[],physiology_records:[],athlete_state_events:[],athlete_coaching_notes:[],athlete_training_sources:[]};
  return {tables,db:fakeDatabase(tables),request:{...binding,today:date,empezarHoy:false,snapshot:null,strategyVersion:1}};
}
export async function context(f) {
  return load('../planning/prepareAllowedWeeklyPlanContract').loadWeeklyPlanningContext(f.db,'u',f.request);
}
export async function contract(f, method, targetDay='lunes', slotIntent) {
  const ctx=await context(f), athlete=await load('../athlete/loadAthletePrescriptionContext').loadAthletePrescriptionContext(f.db,'u',{asOfDate:f.request.today,runningHabitualInteraction:f.request});
  const m=load('goalTransferModel').transferMethod(method);
  const intent=slotIntent ?? {kind:'adaptation',methodId:method,adaptationId:m.adaptationId,role:method==='running_recovery'?'MAINTENANCE':'PRIMARY',pattern:'run',
    goalId:f.tables.usuarios.objetivo_principal,blockPhase:'unknown',blockWeek:null,weaknessId:null};
  const built=load('allowedTrainingContract').buildAllowedTrainingContract({...ctx.input.contexts.carrera,targetDay,stimulus:m.stimulusId,intent,
    doseContext:load('sessionDoseContext').buildSessionDoseContext(athlete,intent,null,[],true)});
  assert.equal(built.ok,true,JSON.stringify(built));
  const c=built.contract,b3=load('runningMethodDoseAuthority');
  c.runningMethodDose=b3.resolveRunningMethodDose(b3.resolveCompatibleRunningDoseEvidence(athlete.runningDoseEvidenceAdmission,intent),intent);
  c.intensityAuthority=load('methodIntensityAuthority').resolveMethodIntensity(c);
  return c;
}
export function proposal(c) {
  const d=c.runningMethodDose.dose, id=d.allowedMovementIds[0], s=d.structureConstraints;
  return {schemaVersion:2,stimulusId:c.stimulusId,structureId:d.structures[0],blocks:[{blockType:'main',movements:[{movementId:id,prescription:{
    durationSeconds:s.mode==='intervals'?s.bout.range.minimum:d.selectedTarget.minimum,
    ...(s.mode==='intervals'?{sets:s.efforts.minimum,restSeconds:s.recoverySeconds.minimum}:{}),
    intensity:c.intensityAuthority.targets.find(t=>t.movementId===id)?.primary}}]}]};
}
for (const method of methods) test(method+' canonical exact reuse reaches Builder',async()=>{
  const f=fixture({goal:method==='running_vo2'?'10k':'half_marathon'}), c=await contract(f,method);
  assert.equal(c.runningMethodDose.status,'RESOLVED',JSON.stringify(c.runningMethodDose));assert.equal(c.intensityAuthority.status,'RESOLVED',JSON.stringify(c.intensityAuthority));
  let calls=0;const p=proposal(c),result=await load('sessionGeneration').generateContractSession(c,[],async prompt=>{calls++;assert.match(prompt,/runningMethodDose/);return JSON.stringify(p);});
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(calls,1);
  const increased=structuredClone(p);increased.blocks[0].movements[0].prescription.durationSeconds+=60;
  assert.equal(load('structuredSession').validateSessionAgainstTrainingContract(c,increased).ok,false);
});
test('wife HM legacy exposure remains established and quantitatively unknown for all new methods',async()=>{
  const ctx=await context(fixture({include:[]}));assert.equal(ctx.runningEventPreparation.longitudinalState,'ESTABLISHED_CURRENT');
  for(const method of methods) { const e=ctx.input.doseCapabilities.entries.find(e=>e.methodId===method);assert.equal(e.prescriptionAllowed,false);assert.equal(e.longitudinalDose.selectedDose,null); }
  assert.equal(ctx.input.doseCapabilities.entries.find(e=>e.methodId==='running_base').longitudinalDose.selectedDose.maximumAuthorized,2700);
});
test('normal and taper weeks compose with actual canonical loader and bounded options',async()=>{
  for(const taper of [false,true]) {
    const f=fixture(taper?{date:'2026-10-25',week:'2026-10-26'}:{});
    const prepared=await load('../planning/prepareAllowedWeeklyPlanContract').prepareAllowedWeeklyPlanContract(f.db,'u',f.request);
    assert.equal(prepared.ok,true,JSON.stringify(prepared));
    const wanted=taper?['running_base','running_recovery']:['running_base','running_threshold','running_long_run'];
    const selected=Object.entries(prepared.contract.dayOptions).map(([day,options])=>{
      const i=['lunes','miercoles','viernes'].indexOf(day),method=i>=0?wanted[i]:undefined;
      const option=method?options.find(o=>o.intent?.methodId===method):options.find(o=>o.state==='REST');assert.ok(option,day+':'+method+JSON.stringify(options));
      return {day,optionId:option.optionId};
    });
    const result=await load('../planning/allowedWeeklyPlanContract').composeBoundedWeek(prepared.contract,async()=>JSON.stringify({contractVersion:1,contextDigest:prepared.contract.contextDigest,selections:selected}));
    assert.equal(result.ok,true,JSON.stringify(result));
    for (const selection of selected) {
      const option=prepared.contract.dayOptions[selection.day].find(o=>o.optionId===selection.optionId);
      if (!option.intent) continue;
      const c=await contract(f,option.intent.methodId,selection.day,option.intent);
      const built=await load('sessionGeneration').generateContractSession(c,[],async()=>JSON.stringify(proposal(c)));
      assert.equal(built.ok,true,JSON.stringify(built));
    }
    if(taper) {const c=await contract(f,'running_recovery');assert.equal(c.runningEventPreparation.constraints.recovery,'REQUIRED');
      assert.equal((await load('sessionGeneration').generateContractSession(c,[],async()=>JSON.stringify(proposal(c)))).ok,true);}
  }
});
test('missing recovery explicitly blocks taper; missing long run remains optional',async()=>{
  const f=fixture({date:'2026-10-25',week:'2026-10-26',include:[]});
  const result=await load('../planning/prepareAllowedWeeklyPlanContract').prepareAllowedWeeklyPlanContract(f.db,'u',f.request);
  assert.equal(result.ok,false);assert.ok(result.errors.includes('D3_REQUIRED_RECOVERY_UNAVAILABLE'));
  assert.equal(result.missingAuthorityRequest.kind,'NEEDS_METHOD_EXECUTION');assert.equal(result.missingAuthorityRequest.methodId,'running_recovery');
  const normal=await load('../planning/prepareAllowedWeeklyPlanContract').prepareAllowedWeeklyPlanContract(fixture({include:[]}).db,'u',fixture({include:[]}).request);
  assert.equal(normal.ok,true);assert.ok(Object.values(normal.contract.dayOptions).flat().every(o=>o.intent?.methodId!=='running_long_run'));
});
test('reuse preserves dose under PROGRESS and rejects changed evidence/quantities',async()=>{
  const c=await contract(fixture(),'running_threshold'),api=load('runningMethodDoseAuthority');
  const progressed=api.resolveLongitudinalRunningDose(c.runningMethodDose,{...c.runningEventPreparation,longitudinalDecision:'PROGRESS'});
  assert.equal(progressed.numericProgressionAuthorized,false);assert.equal(progressed.reason,'PROGRESSION_SELECTOR_NOT_ESTABLISHED');assert.deepEqual(plain(progressed.selectedDose),plain(c.runningMethodDose.dose));
  for(const mutate of [e=>e.structuredMethodExecution.records[0].date='2020-01-01',e=>e.structuredMethodExecution.records[0].verification='INVALID',
    e=>e.structuredMethodExecution.records[0].executionIdentity.methodId='running_base',e=>e.structuredMethodExecution.records[0].quantities.mainWorkDurationSeconds+=1,
    e=>e.structuredMethodExecution.records[0].completeness='PARTIAL',e=>e.structuredMethodExecution.records.push({...e.structuredMethodExecution.records[0],executionId:'different'})]) {
    const e=structuredClone(c.runningMethodDose.evidence);mutate(e);assert.notEqual(api.resolveRunningMethodDose(e,c.intent).status,'RESOLVED');
  }
  const forged=structuredClone(c);forged.runningMethodDose.dose.maximumAuthorized+=60;assert.equal(api.validRunningMethodDose(forged),false);
});
test('unitless quantity and narrative cannot enter modern canonical execution',()=>{
  for(const field of ['notas','analisis']) {const input=execution('running_recovery');input[field]='45 minutes';assert.throws(()=>load('../execution/runningExecution').validateRunningExecution(input,'u','2026-09-10'));}
  const input=execution('running_recovery');input.quantities.totalDuration=1200;assert.throws(()=>load('../execution/runningExecution').validateRunningExecution(input,'u','2026-09-10'));
});
test('D3 forbids a resolved dose, and unresolved C2 prevents Builder',async()=>{
  const c=await contract(fixture(),'running_threshold');assert.equal(c.runningMethodDose.status,'RESOLVED');
  const noIntensity=structuredClone(c);delete noIntensity.intensityAuthority;let calls=0;
  assert.equal((await load('sessionGeneration').generateContractSession(noIntensity,[],async()=>{calls++;return JSON.stringify(proposal(c));})).ok,false);assert.equal(calls,0);
  c.runningEventPreparation.constraints.quality='FORBIDDEN';c.intensityAuthority=load('methodIntensityAuthority').resolveMethodIntensity(c);
  assert.equal((await load('sessionGeneration').generateContractSession(c,[],async()=>{calls++;return '{}';})).ok,false);assert.equal(calls,0);
});
test('HM quality allowed plus resolved VO2 dose still cannot bypass unresolved C2 goal compatibility',async()=>{
  const ctx=await context(fixture()),e=ctx.input.doseCapabilities.entries.find(e=>e.methodId==='running_vo2');
  assert.equal(e.weeklyIntensityEligibility,'ALLOWED');assert.ok(e.longitudinalDose.selectedDose);assert.equal(e.intensityStatus,'UNRESOLVED');assert.equal(e.prescriptionAllowed,false);
});
test('conflicting signed canonical quantities block reuse through the actual loader',async()=>{
  const f=fixture(),input=execution('running_recovery');
  input.quantities.totalDuration.value=1300;input.quantities.mainWorkDuration.value=1300;input.structure.bouts[0].duration.value=1300;
  f.tables.running_execution_records.push(load('../execution/runningExecutionStore').sealRunningExecution('u',input,'2026-09-10'));
  const c=await contract(f,'running_recovery');assert.equal(c.runningMethodDose.status,'CONFLICT');assert.equal(c.runningMethodDose.dose,null);
});
test('interval reps, work, recovery, active recovery and added preparation cannot be invented',async()=>{
  const c=await contract(fixture({goal:'10k'}),'running_vo2');
  for (const field of ['sets','durationSeconds','restSeconds']) {
    const p=proposal(c);p.blocks[0].movements[0].prescription[field]+=1;
    assert.equal(load('structuredSession').validateSessionAgainstTrainingContract(c,p).ok,false,field);
  }
  const p=proposal(c);p.blocks.push({...structuredClone(p.blocks[0]),blockType:'cooldown'});
  assert.equal(load('structuredSession').validateSessionAgainstTrainingContract(c,p).ok,false);
  const e=structuredClone(c.runningMethodDose.evidence);e.structuredMethodExecution.records[0].structure.recoveries[0].mode='active';
  assert.equal(load('runningMethodDoseAuthority').resolveRunningMethodDose(e,c.intent).status,'UNRESOLVED');
});
test('reuse is valid through day 27, stale on day 28, independent of a widened admission window',async()=>{
  const c=await contract(fixture(),'running_threshold'),e=structuredClone(c.runningMethodDose.evidence);e.window.startDate='2020-01-01';
  const r=e.structuredMethodExecution.records[0],api=load('runningMethodDoseAuthority');
  r.date='2026-08-14';assert.equal(api.resolveRunningMethodDose(e,c.intent).status,'RESOLVED');
  r.date='2026-08-13';assert.equal(api.resolveRunningMethodDose(e,c.intent).status,'UNRESOLVED');
  r.date='2026-09-11';assert.equal(api.resolveRunningMethodDose(e,c.intent).status,'UNRESOLVED');
});
test('dedicated long-run selector satisfies required category and captures modern exposure without relabelling easy',async()=>{
  const f=fixture(),ctx=await context(f);ctx.input.runningEventPreparation.constraints.longRun='REQUIRED';
  const built=load('../planning/allowedWeeklyPlanContract').buildAllowedWeeklyPlanContract(ctx.input);assert.equal(built.ok,true,JSON.stringify(built));
  const athlete=await load('../athlete/loadAthletePrescriptionContext').loadAthletePrescriptionContext(f.db,'u',{asOfDate:'2026-09-10'});
  assert.equal(athlete.runningHistory.records.find(r=>r.methodId==='running_long_run').exposure,'long_run');
  assert.equal(athlete.runningHistory.records.find(r=>r.methodId==='running_recovery').exposure,'recovery');
});

export async function productProof() {
  const legacy=await context(fixture({include:[]}));
  const proof={version:1,fixtureNote:'Synthetic signed canonical executions are separate from the established wife HM history. Legacy quantities remain unknown. No production data or LLM.',
    wife:{referenceDate:'2026-09-10',eventDate:'2026-11-15',decision:legacy.runningEventPreparation,
      matrix:legacy.input.doseCapabilities.entries.filter(e=>['running_base',...methods].includes(e.methodId))},weeks:[]};
  for(const taper of [false,true]) {
    const f=fixture(taper?{date:'2026-10-25',week:'2026-10-26'}:{}), ctx=await context(f);
    const prepared=await load('../planning/prepareAllowedWeeklyPlanContract').prepareAllowedWeeklyPlanContract(f.db,'u',f.request);assert.equal(prepared.ok,true);
    const wanted=taper?['running_base','running_recovery']:['running_base','running_threshold','running_long_run'];
    const selections=Object.entries(prepared.contract.dayOptions).map(([day,options])=>{
      const method=wanted[['lunes','miercoles','viernes'].indexOf(day)];
      return {day,optionId:(method?options.find(o=>o.intent?.methodId===method):options.find(o=>o.state==='REST')).optionId};
    });
    const selected=load('../planning/allowedWeeklyPlanContract').validateWeeklySelection(prepared.contract,{contractVersion:1,contextDigest:prepared.contract.contextDigest,selections});assert.equal(selected.ok,true);
    const sessions=[];
    for(const s of selections) {
      const option=prepared.contract.dayOptions[s.day].find(o=>o.optionId===s.optionId);if(!option.intent)continue;
      const c=await contract(f,option.intent.methodId,s.day,option.intent),p=proposal(c);let calls=0;
      const generated=await load('sessionGeneration').generateContractSession(c,[],async()=>{calls++;return JSON.stringify(p);});assert.equal(generated.ok,true,JSON.stringify(generated));
      sessions.push({day:s.day,optionId:s.optionId,builderCalls:calls,contract:c,proposal:p,validation:load('structuredSession').validateSessionAgainstTrainingContract(c,p)});
    }
    proof.weeks.push({kind:taper?'TAPER':'NORMAL_HM_BUILD',decision:ctx.runningEventPreparation,capabilities:ctx.input.doseCapabilities,
      weeklyContract:prepared.contract,selections,selectionValid:selected.ok,sessions});
  }
  const vo2=await contract(fixture({goal:'10k'}),'running_vo2');
  proof.vo2={contract:vo2,proposal:proposal(vo2),validation:load('structuredSession').validateSessionAgainstTrainingContract(vo2,proposal(vo2))};
  return plain(proof);
}

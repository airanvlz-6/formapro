import test from 'node:test';
import assert from 'node:assert/strict';
import { plain } from './trainingContractTestRuntime.mjs';
import {load, methods, fixture, context, contract, proposal, execution} from './runningExecutionReuseFixture.mjs';
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
  for(const method of methods) { const e=ctx.input.doseCapabilities.entries.find(e=>e.methodId===method);assert.equal(e.prescriptionAllowed,method!=='running_vo2');assert.equal(e.longitudinalDose.selectedDose,null); }
  assert.equal(ctx.input.doseCapabilities.entries.find(e=>e.methodId==='running_base').longitudinalDose.selectedDose,null);
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
      return {day,optionId:option.optionId,decision:{role:option.state==='REST'?'RECOVERY':'PRIMARY',reason:'Fixture: continuidad con ejecución compatible.'}};
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
test('coach can prescribe recovery without exact execution reuse; long run remains optional',async()=>{
  const f=fixture({date:'2026-10-25',week:'2026-10-26',include:[]});
  const result=await load('../planning/prepareAllowedWeeklyPlanContract').prepareAllowedWeeklyPlanContract(f.db,'u',f.request);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.ok(Object.values(result.contract.dayOptions).flat().some(o=>o.intent?.methodId==='running_recovery'));
  const normal=await load('../planning/prepareAllowedWeeklyPlanContract').prepareAllowedWeeklyPlanContract(fixture({include:[]}).db,'u',fixture({include:[]}).request);
  assert.equal(normal.ok,true);assert.ok(Object.values(normal.contract.dayOptions).flat().some(o=>o.intent?.methodId==='running_long_run'));
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
  assert.equal(e.weeklyIntensityEligibility,'ALLOWED');assert.equal(e.longitudinalDose.selectedDose,null);assert.equal(e.intensityStatus,'UNRESOLVED');assert.equal(e.prescriptionAllowed,false);
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
      return {day,optionId:(method?options.find(o=>o.intent?.methodId===method):options.find(o=>o.state==='REST')).optionId,decision:{role:method?'PRIMARY':'RECOVERY',reason:'Fixture: continuidad con ejecución compatible.'}};
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

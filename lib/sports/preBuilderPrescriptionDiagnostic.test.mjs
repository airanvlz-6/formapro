import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import { sportsRuntime, plain, compile } from './trainingContractTestRuntime.mjs';

const load = sportsRuntime({console:{info(){},log(){},warn(){}}});
const emit = load('preBuilderPrescriptionDiagnostic').emitPreBuilderPrescriptionDiagnostic;
const resolve = load('prescriptionDataSufficiency').resolvePrescriptionDataSufficiency;
const runId='ef5762ed-cd17-44d6-9468-e804899f227b';
const contract={targetDay:'domingo',discipline:'carrera',stimulusId:'fuerza_corredor',
  prescriptionScope:{managedDisciplines:['carrera']},allowedMovementIds:['goblet_squat'],
  intent:{kind:'adaptation',methodId:'runner_support_strength',adaptationId:'fuerza_general',pattern:'squat'}};
const context={version:1,signals:{},location:null,maxHrMethod:'unknown'};
const candidate=(id,signals={})=>({movementId:id,decision:resolve({...context,signals},[],{movementId:id,discipline:'carrera'})});
function observe(candidates,selected=candidates[0],errors=['INTENT_POOL_EMPTY'],c=contract){
  const lines=[];emit(c,candidates,selected,selected?.decision.questions[0],errors,runId,line=>lines.push(JSON.parse(line)));return lines;
}
test('squat unknown: goblet identity and selected dumbbell requirement remain linked',()=>{
  const [summary,detail]=observe([candidate('goblet_squat')]);
  assert.equal(summary.selectedMovementId,'goblet_squat');
  assert.deepEqual(summary.selectedRequirementIds.values,['equipment.mancuerna']);
  assert.equal(detail.movementId,'goblet_squat');assert.equal(detail.sufficiencyStatus,'missing_required_data');
});
test('OR equipment group reports the production-selected option, without choosing again',()=>{
  for(const signals of [{},{'equipment.mancuerna':{state:'unavailable'}},{'equipment.kettlebell':{state:'available'}}]){
    const c=candidate('goblet_squat',signals), lines=observe([c]);
    assert.deepEqual(lines[1].missingRequirementIds.values,plain(c.decision.missingSignals.map(s=>s.signal)));
    assert.deepEqual(lines[0].selectedRequirementIds.values,plain(c.decision.questions[0]?.signalIds??[]));
  }
});
test('sufficient and insufficient candidates preserve input order and identity',()=>{
  const candidates=[candidate('walking_lunge'),candidate('goblet_squat'),candidate('single_leg_rdl')];
  const before=plain(candidates), lines=observe(candidates,candidates[1]);
  assert.deepEqual(lines.slice(1).map(d=>d.movementId),candidates.map(c=>c.movementId));
  assert.equal(lines[1].sufficiencyStatus,'sufficient');assert.deepEqual(plain(candidates),before);
});
test('non-equipment error retained without claiming equipment causality or alternative viability',()=>{
  const [s]=observe([candidate('walking_lunge')],undefined,['SESSION_DOSE_TIME_INFEASIBLE']);
  assert.deepEqual(s.preparedErrorCodes.values,['SESSION_DOSE_TIME_INFEASIBLE']);
  assert.equal(s.globalEquipmentNecessity,'NOT_ESTABLISHED');assert.equal(s.alternativeIntentViability,'NOT_ESTABLISHED');
  assert.equal(s.stage,'SESSION_CONTRACT_REBUILD_REJECTED');assert.equal(s.builderInvoked,false);
  assert.equal(s.doseAuthorityStage,'NOT_EVALUATED');assert.ok(!('dosePolicyId' in s));assert.ok(!('feasible' in s));
});
test('catalog allowlists reject arbitrary IDs, states, errors and free text',()=>{
  const c=candidate('goblet_squat');c.movementId='PRIVATE_SENTINEL';
  c.decision.missingSignals=[{signal:'PRIVATE_SENTINEL',state:'PRIVATE_SENTINEL',reason:'PRIVATE_SENTINEL'}];
  c.decision.questions=[{signalIds:['PRIVATE_SENTINEL'],text:'PRIVATE_SENTINEL',questionToken:'PRIVATE_SENTINEL'}];
  const dirty={...contract,discipline:'PRIVATE_SENTINEL',targetDay:'PRIVATE_SENTINEL',stimulusId:'PRIVATE_SENTINEL',
    allowedMovementIds:['PRIVATE_SENTINEL'],prescriptionScope:{managedDisciplines:['PRIVATE_SENTINEL']},
    intent:{kind:'adaptation',methodId:'PRIVATE_SENTINEL',adaptationId:'PRIVATE_SENTINEL',pattern:'PRIVATE_SENTINEL'},
    userCodigo:'PRIVATE_SENTINEL',profile:'PRIVATE_SENTINEL',prompt:'PRIVATE_SENTINEL',signature:'PRIVATE_SENTINEL'};
  const serialized=JSON.stringify(observe([c],c,['PRIVATE_SENTINEL'],dirty));
  assert.ok(!serialized.includes('PRIVATE_SENTINEL'));assert.ok(serialized.includes('UNKNOWN_PREPARED_ERROR'));
  assert.ok(serialized.includes('UNKNOWN_REQUIREMENT'));assert.ok(serialized.includes('UNKNOWN_STATE'));
});
test('details and nested lists are capped with explicit truncation metadata',()=>{
  const c=candidate('goblet_squat');c.decision.missingSignals=Array(40).fill({signal:'equipment.mancuerna',state:'unknown'});
  const lines=observe(Array(40).fill(c));assert.equal(lines.length,33);
  assert.equal(lines[0].totalCount,40);assert.equal(lines[0].emittedCount,32);assert.equal(lines[0].truncated,true);
  assert.equal(lines[1].signalStates.values.length,32);assert.equal(lines[1].signalStates.truncated,true);
});
test('logger and serialization exceptions are contained',()=>{
  assert.doesNotThrow(()=>emit(contract,[candidate('goblet_squat')],undefined,undefined,[],runId,()=>{throw Error('sink');}));
  const runtime=sportsRuntime({JSON:{...JSON,stringify(){throw Error('serialize');}}});
  assert.doesNotThrow(()=>runtime('preBuilderPrescriptionDiagnostic').emitPreBuilderPrescriptionDiagnostic(contract,[candidate('goblet_squat')],undefined,undefined,[],runId));
});

// Frozen pre-change selection boundary for a differential test of the real server function.
const oldSelection=`const decisions = ids.map(movementId => resolvePrescriptionDataSufficiency(doseContext.sufficiency!, doseContext.references,
        { movementId, discipline: base.contract.discipline })).filter(d => d.status === 'missing_required_data')
        .sort((a, b) => Number(!a.questions.length) - Number(!b.questions.length) || a.missingSignals.length - b.missingSignals.length);
      const sufficiency = decisions[0], question = sufficiency?.questions[0];
      `;
async function executeBoundary(legacy=false,logging='normal'){
  const calls=[],logs=[];
  const ids=['walking_lunge','goblet_squat','single_leg_rdl'];
  const base={...contract,allowedMovementIds:ids,targetWeekStart:'2026-09-07'};
  const dep={
    '../athlete/getCanonicalRestrictions':{getCanonicalRestrictions:async()=>{calls.push('restrictions');return {asOfDate:'2026-09-10'};}},
    './prepareSessionTrainingContract':{prepareSessionTrainingContract:async()=>{calls.push('base');return {ok:true,contract:base};}},
    '../athlete/loadAthletePrescriptionContext':{loadAthletePrescriptionContext:async()=>{calls.push('canonical');return {};}},
    './sessionDoseContext':{buildSessionDoseContext:()=>{calls.push('dose');return {sufficiency:context,references:[]};}},
    './allowedTrainingContract':{buildAllowedTrainingContract:input=>{calls.push(['rebuild',plain(input)]);return {ok:false,errors:['INTENT_POOL_EMPTY']};}},
    './prescriptionIntent':{intentMatchingMovementIds:()=>{calls.push('intentIds');return ids;}},
    './prescriptionDataSufficiency':{resolvePrescriptionDataSufficiency:(...args)=>{calls.push(['sufficiency',args[2].movementId]);return resolve(...args);}},
    '../athlete/prescriptionAnswers':{issuePrescriptionQuestion:(...args)=>{calls.push(['question',plain(args)]);return 'TEST_TOKEN';}},
    './equipmentAuthorityDiagnostic':{emitEquipmentAuthorityDiagnostic:()=>{calls.push('equipmentDiagnostic');}},
    './preBuilderPrescriptionDiagnostic':{emitPreBuilderPrescriptionDiagnostic:(...args)=>{
      const emitter=logging==='serialization'?sportsRuntime({JSON:{stringify(){throw Error('serialize');}}})('preBuilderPrescriptionDiagnostic').emitPreBuilderPrescriptionDiagnostic:emit;
      emitter(...args,line=>{if(logging==='throw')throw Error('sink');logs.push(JSON.parse(line));});}},
    './sessionGeneration':{generateContractSession:()=>{calls.push('builder');throw Error('unexpected builder');}},
  };
  let source=readFileSync('lib/sports/sessionAuthority.ts','utf8');
  if(legacy){const start=source.indexOf('const candidates = ids.map'),end=source.indexOf('return { ok: false as const, code: \'PRESCRIPTION_DATA_MISSING\'',start);
    assert.ok(start>0&&end>start);source=source.slice(0,start)+oldSelection+source.slice(end);}
  const m={exports:{}};
  vm.runInNewContext(compile(source),{module:m,exports:m.exports,Buffer,structuredClone,require:n=>n==='node:crypto'?crypto:dep[n]??{},process:{env:{}}});
  const db={from:table=>{calls.push(['read',table]);return {select(){return this;},eq(){return this;},async single(){return {data:{perfil:{}},error:null};}};}};
  const result=await m.exports.generateTrainingSession(db,'TEST_ONLY',{day:'domingo',targetWeekStart:'2026-09-07',discipline:'carrera'},async()=>{calls.push('provider');return '';},'',runId);
  return {calls,result:plain(result),logs};
}
test('real rejection boundary is behaviorally identical to pre-change selection, including failed sinks',async()=>{
  const before=await executeBoundary(true);
  assert.equal(before.result.code,'PRESCRIPTION_DATA_MISSING');
  for(const mode of ['normal','throw','serialization']){
    const after=await executeBoundary(false,mode);
    assert.deepEqual(after.calls,before.calls);assert.deepEqual(after.result,before.result);
    assert.equal(after.calls.filter(c=>Array.isArray(c)&&c[0]==='sufficiency').length,3);
    assert.ok(!after.calls.includes('builder')&&!after.calls.includes('provider'));
    if(mode==='normal'){assert.equal(after.logs[0].selectedMovementId,'goblet_squat');assert.deepEqual(after.logs.slice(1).map(d=>d.movementId),['walking_lunge','goblet_squat','single_leg_rdl']);}
  }
});

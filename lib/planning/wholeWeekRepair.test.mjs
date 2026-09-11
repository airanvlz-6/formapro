import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {sportsRuntime,contractFixture,plain} from '../sports/trainingContractTestRuntime.mjs';
const load=sportsRuntime(),sessions=load('structuredSession'),adapter=load('../planning/wholeWeekAdapter'),enforce=load('../planning/enforceWholeWeek').enforceWholeWeek;
const sessionAuthority=load('sessionAuthority'),week='2026-09-07';
const sign=(value,domain)=>{const payload=Buffer.from(JSON.stringify(value)).toString('base64url');return payload+'.'+createHmac('sha256','isolated-sports-test-key').update(domain+payload).digest('base64url');};
function fixture({days=['martes','jueves'],movement='back_squat',stimulus='fuerza_maxima',pattern='squat'}={}){
  const intent={kind:'main_pattern',pattern};
  const doseContext=load('sessionDoseContext').buildSessionDoseContext(load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({}),intent);
  const contracts=days.map(targetDay=>{
    const r=load('allowedTrainingContract').buildAllowedTrainingContract(contractFixture({targetWeekStart:week,targetDay,stimulus,intent,doseContext}));
    assert.equal(r.ok,true,JSON.stringify(r));return r.contract;
  });
  const evidence={codigo:'u',week,expires:Date.now()+60000,protocolVersion:2,contractDigest:'contract',contextDigest:'context',prescriptionScope:contracts[0].prescriptionScope,
    admittedSlots:contracts.map((c,i)=>({day:c.targetDay,state:'TRAIN',discipline:c.discipline,stimulusId:c.stimulusId,intent,optionId:String(i),targetDate:`2026-09-${i?10:'08'}`}))};
  const receipt=sign(evidence,'forge-week-calendar-v1:');
  const proposals=contracts.map(c=>({schemaVersion:2,stimulusId:c.stimulusId,structureId:'strength_sets',blocks:[
    {blockType:'warmup',movements:[{movementId:movement,prescription:{durationSeconds:120,intensity:{kind:'rpe',value:3}}}]},
    {blockType:'main',movements:[{movementId:movement,prescription:{sets:4,reps:5,restSeconds:120,intensity:{kind:'rpe',value:7}}}]}]}));
  const rows=contracts.map((c,i)=>sessions.renderContractSession(c,proposals[i]));
  const sources=rows.map((r,i)=>({...r,sessionReceipt:sign({userCodigo:'u',expiresAt:Date.now()+60000,contract:contracts[i],proposal:proposals[i],weekly:{calendarReceipt:receipt,optionId:String(i)}},'forge-session-contract-v1:')}));
  return {rows,sources,receipt,authority:{evidence,contexts:{}},contracts,proposals};
}
test('real adapter rejects individually admitted duplicates after all siblings are collected',()=>{
  const f=fixture();for(let i=0;i<2;i++)assert.equal(sessions.validateSessionAgainstTrainingContract(f.contracts[i],f.proposals[i]).ok,true);
  const r=adapter.validateAdmittedWholeWeek(week,f.rows,f.authority.evidence);assert.equal(r.status,'repair_required');
  assert.ok(r.diagnostics.some(d=>d.code==='WEEK_EXACT_DUPLICATE'));assert.equal(r.concentration.exposure.byPattern.squat.sessions,2);
});
test('one real signed-contract repair changes dose and revalidates the complete week',async()=>{
  const f=fixture();let calls=0;
  const r=await enforce('u',week,f.rows,f.sources,f.receipt,f.authority,async prompt=>{
    calls++;assert.match(prompt,/WHOLE_WEEK_DIAGNOSTICS/);const proposal=plain(f.proposals[1]);proposal.blocks[1].movements[0].prescription.reps=6;return JSON.stringify(proposal);
  });
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.result.status,'pass');assert.equal(r.repairCount,1);assert.equal(calls,1);
  assert.equal(f.rows[1].structuredPrescription.proposal.blocks[1].movements[0].prescription.reps,5);
  assert.equal(r.sessions[1].structuredPrescription.proposal.blocks[1].movements[0].prescription.reps,6);
  sessionAuthority.verifySessionReceipt(r.sessionEvidence[1].sessionReceipt,r.sessionEvidence[1],'u',week,f.receipt);
});
test('unchanged duplicate fails closed after local and one targeted stage',async()=>{
  const f=fixture();let calls=0;const r=await enforce('u',week,f.rows,f.sources,f.receipt,f.authority,async()=>{calls++;return JSON.stringify(f.proposals[1]);});
  assert.equal(r.ok,false);assert.equal(r.code,'WEEK_REPAIR_FAILED');assert.equal(calls,2);assert.equal(r.orchestration.targetedRegenerationCount,1);
});
test('repair exception is retained in the stage trace and still produces no candidate',async()=>{
  const f=fixture(),r=await enforce('u',week,f.rows,f.sources,f.receipt,f.authority,async()=>{throw new Error('LLM_REQUEST_FAILED');});
  assert.equal(r.ok,false);assert.equal(r.code,'WEEK_REPAIR_FAILED');
  assert.equal(r.orchestration.stages[0].failedReasons[0].reason,'LLM_REQUEST_FAILED');
  assert.equal(r.orchestration.stages[1].failedReasons[0].reason,'LLM_REQUEST_FAILED');
  assert.equal(r.sessions,undefined);
});
for(const [name,mutate] of [
  ['intent',p=>{p.blocks[1].movements[0].movementId='bench_press';}],
  ['scope',p=>{p.stimulusId='base_aerobica';p.structureId='continuo_carrera';p.blocks[1].movements[0].movementId='rodaje_z2';}],
  ['equipment pool',p=>{p.blocks[1].movements[0].movementId='invented_machine';}],
  ['time budget',p=>{p.blocks[1].movements[0].prescription={sets:100,reps:100,restSeconds:28800,intensity:{kind:'rpe',value:8}};}],
])test(`repair cannot break ${name}`,async()=>{
  const f=fixture();let calls=0;const r=await enforce('u',week,f.rows,f.sources,f.receipt,f.authority,async()=>{calls++;const p=plain(f.proposals[1]);mutate(p);return JSON.stringify(p);});
  assert.equal(r.ok,false);assert.equal(calls,2);assert.equal(r.code,'WEEK_REPAIR_FAILED');
});
test('protected sessions are never repair targets',async()=>{
  const f=fixture();f.authority.evidence.admittedSlots[1].protected=true;let calls=0;
  const r=await enforce('u',week,f.rows,f.sources,f.receipt,f.authority,async()=>{calls++;const p=plain(f.proposals[0]);p.blocks[1].movements[0].prescription.reps=6;return JSON.stringify(p);});
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(calls,1);assert.deepEqual(plain(r.sessions[1]),plain(f.rows[1]));
});
test('forged source receipt cannot be used for bounded repair',async()=>{
  const f=fixture();f.sources.forEach(s=>s.sessionReceipt+='x');let calls=0;
  const r=await enforce('u',week,f.rows,f.sources,f.receipt,f.authority,async()=>{calls++;return '{}';});assert.equal(r.ok,false);assert.equal(calls,0);
});
test('adapter uses actual catalogue impact and prescribed intensity, never title keywords',()=>{
  const f=fixture();f.rows[0].titulo='high impact VO2 max';
  const input=adapter.wholeWeekInput(week,f.rows,f.authority.evidence);assert.equal(input.sessions[0].impact,'not_high');assert.deepEqual(plain(input.sessions[0].demanding),[]);
});
test('adapter requires strategy, exact transfer method and main-block pattern for primary coverage',()=>{
  const f=fixture(),intent={kind:'adaptation',goalId:'max_strength',adaptationId:'fuerza_maxima',methodId:'box_max_strength',role:'PRIMARY',pattern:'squat',blockPhase:'unknown',blockWeek:null,weaknessId:null};
  const evidence={...f.authority.evidence,strategy:{goal:{id:'max_strength'},methods:['box_max_strength'],adaptations:[{id:'fuerza_maxima',role:'PRIMARY',requiredPattern:null,weaknessIds:[]}],
    coverage:[{id:'adaptation:fuerza_maxima',adaptationId:'fuerza_maxima'}],deferred:[]}};
  const row=plain(f.rows[0]);row.structuredPrescription.objective.intent=intent;row.structuredPrescription.sessionRole='PRIMARY';
  const valid=adapter.validateAdmittedWholeWeek(week,[row],evidence);assert.equal(valid.status,'pass');assert.equal(valid.coverage[0].sessionIds.length,1);
  row.structuredPrescription.proposal.blocks[1].movements[0].movementId='bench_press';
  const invalid=adapter.validateAdmittedWholeWeek(week,[row],evidence);assert.equal(invalid.status,'invalid');assert.ok(invalid.diagnostics.some(d=>d.code==='WEEK_PRIMARY_ADAPTATION_MISSING'));
});
test('recovery contradiction is derived from structured RPE, not declared explanation',()=>{
  const f=fixture();f.rows[0].structuredPrescription.sessionRole='RECOVERY';f.rows[0].structuredPrescription.proposal.blocks[1].movements[0].prescription.intensity.value=9;
  assert.ok(adapter.validateAdmittedWholeWeek(week,f.rows,f.authority.evidence).diagnostics.some(d=>d.code==='WEEK_SESSION_ROLE_CONTRADICTION'));
});
test('week receipt reuses HMAC infrastructure and binds content and repair count',()=>{
  const f=fixture(),result=adapter.validateAdmittedWholeWeek(week,[f.rows[0]],{...f.authority.evidence,admittedSlots:[f.authority.evidence.admittedSlots[0]]});
  const receipt=load('../planning/weeklyCalendarAuthority').issueWholeWeekReceipt('u',week,f.receipt,f.rows,result,1);
  const [p,s]=receipt.split('.');assert.equal(s,createHmac('sha256','isolated-sports-test-key').update('forge-week-calendar-v1:'+p).digest('base64url'));
  const payload=JSON.parse(Buffer.from(p,'base64url'));assert.equal(payload.repairCount,1);assert.equal(payload.version,1);assert.equal(payload.status,'pass');
});

test('RDL duplicate changes only one allowed proposal and preserves the original signed contract',async()=>{
  const f=fixture({movement:'rdl',stimulus:'cadena_posterior',pattern:'hinge'});
  const r=await enforce('u',week,f.rows,f.sources,f.receipt,f.authority,async()=>{
    const p=plain(f.proposals[1]);p.blocks[1].movements[0].prescription.reps=8;return JSON.stringify(p);
  });
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.repairCount,1);assert.equal(r.orchestration.targetedRegenerationCount,0);
  assert.deepEqual(plain(r.sessions[0]),plain(f.rows[0]));
  const decoded=s=>JSON.parse(Buffer.from(s.sessionReceipt.split('.')[0],'base64url'));
  assert.deepEqual(decoded(r.sessionEvidence[1]).contract,decoded(f.sources[1]).contract);assert.notEqual(r.sessionEvidence[1].sessionReceipt,f.sources[1].sessionReceipt);
});
test('four exact horizontal-push exposures repair three redundancies, not a universal chest limit',async()=>{
  const f=fixture({days:['lunes','martes','jueves','sabado'],movement:'bench_press',pattern:'horizontal_push'});let calls=0;
  const r=await enforce('u',week,f.rows,f.sources,f.receipt,f.authority,async prompt=>{
    calls++;const p=JSON.parse(prompt.split('REJECTED_PROPOSAL:\n')[1].split('\nWHOLE_WEEK_DIAGNOSTICS:')[0]);p.blocks[1].movements[0].prescription.reps=5+calls;return JSON.stringify(p);
  });
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(calls,3);assert.equal(r.orchestration.targetedRegenerationCount,0);
  assert.deepEqual(plain(r.sessions[0]),plain(f.rows[0]));assert.ok(r.result.diagnostics.some(d=>d.code==='WEEK_PATTERN_CONCENTRATION'));
});
test('real targeted regeneration succeeds after an ineffective local proposal',async()=>{
  const f=fixture();let calls=0;const r=await enforce('u',week,f.rows,f.sources,f.receipt,f.authority,async prompt=>{
    calls++;const p=plain(f.proposals[1]);if(prompt.includes('STAGE:targeted'))p.blocks[1].movements[0].prescription.reps=7;return JSON.stringify(p);
  });
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(calls,2);assert.equal(r.orchestration.targetedRegenerationCount,1);
  sessionAuthority.verifySessionReceipt(r.sessionEvidence[1].sessionReceipt,r.sessionEvidence[1],'u',week,f.receipt);
});

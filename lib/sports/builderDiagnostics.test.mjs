import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, contractFixture, plain, equippedProfileFixture } from './trainingContractTestRuntime.mjs';
const logs=[];
const load=sportsRuntime({console:{info:(...args)=>logs.push(args)}});
const c=load('allowedTrainingContract').buildAllowedTrainingContract(contractFixture()).contract;
const generate=load('sessionGeneration').generateContractSession;
const proposal=()=>({stimulusId:c.stimulusId,structureId:c.allowedStructureIds[0],blocks:['warmup','main','cooldown'].map(blockType=>({blockType,
  movements:[{movementId:c.allowedMovementIds[0],prescription:{reps:5,sets:3,restSeconds:0}}]}))});
const invalidDose=()=>{const p=proposal();p.blocks[1].movements[0].prescription.reps=-1;return JSON.stringify(p);};
test('contract rejection projection preserves types and identities without unrelated values',()=>{
 logs.length=0;
 const trace=load('builderDiagnostics').builderTrace(c,'00000000-0000-4000-8000-000000000004');
 const secret='excluded-private-content';
 const p={stimulusId:' técnica\n',finalDecision:{kind:'session_decision',version:'1',stimulus:null,patterns:['a',2],extra:secret},
   developmentIntent:[{areaId:'a',areaRevision:'2',intendedRole:'supporting',rationale:'test',extra:secret}],blocks:[secret]};
 const authority={contractVersion:5,coachingGuidance:undefined,finalDecision:null,developmentAreas:{areas:[
   {areaId:'a',revision:2,objective:secret,strategy:secret,evidenceRefs:[secret],confirmation:secret},
   {areaId:'b',revision:3}],digest:secret},history:secret};
 const before=structuredClone({p,authority}),summary=plain(trace.summary());
 trace.contractRejection(2,'validateSessionAgainstTrainingContract','DEVELOPMENT_INTENT_INVALID',p,authority);
 assert.equal(logs.length,1);assert.equal(logs[0][0],'SESSION_DEVELOPMENT_INTENT_INVALID_DETAIL');
 const d=JSON.parse(logs[0][1]);
 assert.equal(d.proposal.stimulusId.value,p.stimulusId);
 assert.equal(d.proposal.finalDecision.fields.version.type,'string');assert.equal(d.proposal.finalDecision.fields.version.value,'1');
 assert.equal(d.proposal.finalDecision.fields.stimulus.type,'null');
 assert.equal(d.proposal.finalDecision.fields.patterns.length,2);
 assert.equal(d.proposal.finalDecision.fields.patterns.items[1].value,2);
 assert.deepEqual(d.proposal.finalDecision.fields.extra,{present:true,type:'string'});
 assert.deepEqual(d.contract.coachingGuidance,{present:true,type:'undefined'});
 assert.deepEqual(d.contract.finalDecision,{present:true,type:'null'});
 assert.equal(d.contract.developmentAreas.fields.areas.length,2);
 assert.equal(d.contract.developmentAreas.fields.areas.items[0].fields.revision.value,2);
 assert.equal(d.contract.developmentAreas.emptySnapshotFallback,false);
 assert.ok(!JSON.stringify(d).includes(secret));assert.equal(d.proposal.blocks,undefined);
 assert.deepEqual({p,authority},before);assert.deepEqual(plain(trace.summary()),summary);
 for(const snapshot of [{},{developmentAreas:undefined},{developmentAreas:null}]){
   trace.contractRejection(1,'admitFinalDecision','FINAL_SESSION_DECISION_INVALID',{},snapshot);
   const event=JSON.parse(logs.at(-1)[1]);
   assert.equal(event.contract.developmentAreas.present,Object.hasOwn(snapshot,'developmentAreas'));
   assert.equal(event.contract.developmentAreas.emptySnapshotFallback,true);
   assert.equal(event.contract.developmentAreas.effectiveAreaCount,0);
   assert.deepEqual(event.proposal.finalDecision,{present:false,type:'undefined'});
 }
 trace.contractRejection(1,'admitFinalDecision','FINAL_SESSION_DECISION_INVALID',{finalDecision:[]},{});
 assert.deepEqual(JSON.parse(logs.at(-1)[1]).proposal.finalDecision,{present:true,type:'array',length:0,items:[]});
 const count=logs.length;
 trace.contractRejection(1,'admitFinalDecision','FINAL_SESSION_REVISION_REASON_REQUIRED',p,authority);
 assert.equal(logs.length,count);
 assert.doesNotThrow(()=>trace.contractRejection(1,'admitFinalDecision','FINAL_SESSION_DECISION_INVALID',null,null));
});

for(const scenario of ['final','development','pass','other'])test(`contract diagnostic is observational: ${scenario}`,async()=>{
 const execute=async(mode)=>{
   const events=[],prompts=[];
   const runtime=sportsRuntime({console:{info:(name,payload)=>{
     if(!['SESSION_FINAL_DECISION_INVALID_DETAIL','SESSION_DEVELOPMENT_INTENT_INVALID_DETAIL'].includes(name))return;
     if(mode==='throw')throw new Error('logger failure');events.push({name,...JSON.parse(payload)});
   },warn(){},log(){},error(){}}},(path,module)=>path.endsWith('builderDiagnostics.ts')&&mode==='off'?{...module,
     builderTrace:(...args)=>({...module.builderTrace(...args),contractRejection(){}})}:module);
   const profile=runtime('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({perfil:{...equippedProfileFixture(),duracion:'60 min'}});
   const doseContext=runtime('sessionDoseContext').buildSessionDoseContext(profile,null,null,[],true,'coach');
   const built=runtime('allowedTrainingContract').buildAllowedTrainingContract(contractFixture({stimulus:'',doseContext,
     coachingGuidance:{kind:'weekly_guidance',version:2,stimulus:'Trabajo técnico'}}));
   assert.equal(built.ok,true,JSON.stringify(built));
   const contract=built.contract,before=structuredClone(contract);
   const p={schemaVersion:2,stimulusId:'Trabajo técnico',structureId:'strength_sets',
     finalDecision:{kind:'session_decision',version:1,stimulus:'Trabajo técnico'},
     blocks:[{blockType:'main',movements:[{movementId:'goblet_squat',prescription:{doseInstruction:'3 series técnicas'}}]}]};
   if(scenario==='final')p.finalDecision.version='1';
   if(scenario==='development')p.developmentIntent=[{areaId:'unknown',areaRevision:2,intendedRole:'supporting',rationale:'test'}];
   if(scenario==='other')p.finalDecision.stimulus=p.stimulusId='Revised without reason';
   const original=structuredClone(p);
   const result=await runtime('sessionGeneration').generateContractSession(contract,[],async prompt=>{prompts.push(prompt);return JSON.stringify(p);},'',
     '00000000-0000-4000-8000-000000000005');
   assert.deepEqual(contract,before);assert.deepEqual(p,original);
   return {events,prompts,result:JSON.parse(JSON.stringify(result),(key,value)=>key==='builderInvocationId'?'random-id':value)};
 };
 const baseline=await execute('off'),observed=await execute('on'),throwing=await execute('throw');
 assert.deepEqual(observed.result,baseline.result);assert.deepEqual(throwing.result,baseline.result);
 assert.deepEqual(observed.prompts,baseline.prompts);assert.deepEqual(throwing.prompts,baseline.prompts);
 assert.equal(baseline.events.length,0);assert.equal(throwing.events.length,0);
 assert.equal(observed.result.ok,scenario==='pass');
 assert.equal(observed.events.length,['final','development'].includes(scenario)?2:0);
 for(const [i,event] of observed.events.entries()){
   assert.equal(event.attempt,i+1);assert.equal(event.day,'martes');
   assert.equal(event.planningRunId,'00000000-0000-4000-8000-000000000005');
   assert.equal(event.builderInvocationId,observed.events[0].builderInvocationId);
   assert.equal(event.stage,scenario==='final'?'admitFinalDecision':'validateSessionAgainstTrainingContract');
   assert.equal(event.contract.finalDecision.present,scenario==='development');
   if(scenario==='development')assert.equal(event.contract.finalDecision.fields.stimulus.value,'Trabajo técnico');
   assert.ok(!JSON.stringify(observed.result).includes(event.name));
   assert.ok(observed.prompts.every(p=>!p.includes(event.name)&&!p.includes('emptySnapshotFallback')));
 }
});
const duplicateMovement=()=>{const p=proposal();p.blocks[1].movements.push(structuredClone(p.blocks[1].movements[0]));return JSON.stringify(p);};
for(const recover of [true,false])test(`intrablock duplicate gets exactly one directed retry; recovery=${recover}`,async()=>{
 let calls=0;const r=await generate(c,[],async prompt=>{
   calls++;
   if(calls===2){const correction=JSON.parse(prompt.split('REPAIR_CONSTRAINTS:\n')[1]);
     assert.deepEqual(correction.previousErrors,['DUPLICATE_MOVEMENT']);assert.equal(correction.scope,'within_each_block');
     assert.match(prompt,/DUPLICATE_MOVEMENT:1:/);
   }else assert.ok(!prompt.includes('REPAIR_CONSTRAINTS:'));
   return calls===2&&recover?JSON.stringify(proposal()):duplicateMovement();
 });
 assert.equal(calls,2);assert.equal(r.ok,recover);assert.equal(r.diagnostics.attempts[0].retryEligible,true);
 assert.equal(r.diagnostics.attempts[0].retryReason,'duplicate_movement_retry');
 assert.equal(r.diagnostics.retryExhausted,!recover);
 if(!recover){assert.equal(r.code,'SESSION_PROPOSAL_INVALID');assert.equal(r.session,undefined);}
});
test('shape duplicate key is block-local and independent of dose; work-phase blocks remain unsupported',()=>{
 const shape=load('structuredSession').checkSessionShape;
 assert.equal(shape(proposal()).ok,true); // same ID in warmup, main and cooldown
 for(const differentDose of [false,true]){const p=JSON.parse(duplicateMovement());if(differentDose)p.blocks[1].movements[1].prescription.reps=9;
   assert.ok(shape(p).violations.some(v=>v.startsWith('DUPLICATE_MOVEMENT:1:')));
 }
 const p=proposal();p.blocks[0].blockType='strength';p.blocks[1].blockType='metcon';assert.ok(shape(p).violations.includes('BLOCK_INVALID:0'));
});
test('valid attempt records PASS and one attempt without changing proposal',async()=>{
 const r=await generate(c,[],async()=>JSON.stringify(proposal()));assert.equal(r.ok,true);assert.equal(r.diagnostics.attemptCount,1);
 assert.equal(r.diagnostics.attempts[0].result,'pass');assert.deepEqual(plain(r.proposal),proposal());
});
for(const raw of ['{}','malformed private-response HMAC-secret'])test(`generic parse/shape is terminal: ${raw.slice(0,2)}`,async()=>{
 let calls=0;const r=await generate(c,[],async()=>{calls++;return raw;});assert.equal(calls,1);assert.equal(r.code,'SESSION_PROPOSAL_INVALID');
 assert.equal(r.diagnostics.attempts[0].retryEligible,false);assert.equal(r.diagnostics.retryExhausted,false);
 assert.equal(r.diagnostics.finalStage,raw==='{}'?'checkSessionShape':'parseStructuredSession');
 assert.equal(r.diagnostics.attempts[0].failures[0].EXPECTED,'unknown');
});
test('DOSE retry records failure then pass, with original diagnostic-directed prompt',async()=>{
 let calls=0;const r=await generate(c,[],async prompt=>{calls++;if(calls===2)assert.match(prompt,/DOSE_INVALID:reps/);return calls===1?invalidDose():JSON.stringify(proposal());});
 assert.equal(calls,2);assert.equal(r.ok,true);assert.equal(r.diagnostics.attempts[0].retryEligible,true);assert.equal(r.diagnostics.attemptCount,2);
 assert.equal(r.diagnostics.retryExhausted,false);assert.equal(r.diagnostics.attempts[0].failures[0].FAILED_FIELD,'reps');
});
test('two rejected doses expose exhausted retry and final violations',async()=>{
 const r=await generate(c,[],async()=>invalidDose());assert.equal(r.ok,false);assert.equal(r.diagnostics.attemptCount,2);
 assert.equal(r.diagnostics.retryExhausted,true);assert.deepEqual(plain(r.diagnostics.finalViolations),['DOSE_INVALID:reps']);
 assert.equal(r.diagnostics.attempts[1].retryEligible,false);
});
test('provider metadata is safe and never grants acceptance to malformed output',async()=>{
 logs.length=0;const secret='private-response HMAC-secret';
 const r=await generate(c,[],async()=>({text:secret,planningRunId:'00000000-0000-4000-8000-000000000001',metadata:{stopReason:'max_tokens',outputTokens:2400,contentBlockCount:1,contentBlockTypes:['text',secret]}}),'private-prompt');
 assert.equal(r.ok,false);assert.equal(r.diagnostics.attempts[0].provider.truncationIndicated,true);
 assert.equal(r.diagnostics.planningRunId,'00000000-0000-4000-8000-000000000001');
 const text=JSON.stringify({logs,diagnostics:r.diagnostics});for(const value of [secret,'private-prompt','CONTRACT:','restrictionsSnapshot'])assert.ok(!text.includes(value));
 assert.deepEqual(plain(load('builderDiagnostics').safeViolations(['MOVEMENT_UNKNOWN:'+secret,'DOSE_INVALID:reps'])),['MOVEMENT_UNKNOWN','DOSE_INVALID:reps']);
});
test('provider failure retains run identity and cannot leak exception text or stale metadata',async()=>{
 let calls=0;const runId='00000000-0000-4000-8000-000000000002';
 const r=await generate(c,[],async()=>{if(++calls===1)return {text:invalidDose(),metadata:{stopReason:'end_turn',outputTokens:100}};
   throw new Error('secret-provider-error');},'',runId);
 assert.equal(r.diagnostics.planningRunId,runId);assert.equal(r.diagnostics.attemptCount,2);
 assert.equal(r.diagnostics.finalStage,'provider');assert.deepEqual(plain(r.diagnostics.attempts[1].provider),{});
 assert.ok(!JSON.stringify(r.diagnostics).includes('secret-provider-error'));
});

test('minimal prescription diagnostic preserves rejection, accepted normalization and original input',()=>{
 const api=load('structuredSession');
 for(const dose of [undefined,null,[],[{}],42,false,'','   ',{reps:5},'3 series técnicas']){
   const p={...proposal(),schemaVersion:2,finalDecision:{kind:'session_decision',version:1,stimulus:c.stimulusId}};
   if(dose===undefined)delete p.blocks[1].movements[0].prescription;else p.blocks[1].movements[0].prescription=dose;
   const before=structuredClone(p),details=[];
   const baseline=api.checkSessionShape(p,true);
   const observed=api.checkSessionShape(p,true,undefined,d=>details.push(d));
   assert.deepEqual(plain(observed),plain(baseline));assert.deepEqual(p,before);
   assert.deepEqual(plain(api.checkSessionShape(p,true,undefined,()=>{throw new Error('logger unavailable');})),plain(baseline));
   if(baseline.ok){assert.equal(details.length,0);continue;}
   assert.deepEqual(plain(baseline.violations),['MOVEMENT_PRESCRIPTION_SHAPE_INVALID']);
   assert.equal(details.length,1);const d=details[0];
   assert.equal(d.proposalPath,'blocks[1].movements[0].prescription');
   assert.equal(d.blockIndex,1);assert.equal(d.movementIndex,0);assert.equal(d.blockType,'main');
   assert.equal(d.received.typeof,typeof dose);assert.equal(d.received.isNull,dose===null);assert.equal(d.received.isArray,Array.isArray(dose));
 }
 // Existing dose alias handling remains identical and does not generate a rejection event.
 const p={schemaVersion:2,stimulusId:c.stimulusId,structureId:'strength_sets',blocks:[{blockType:'main',movements:[{movementId:'goblet_squat',dose:{reps:5}}]}]};
 const before=structuredClone(p),details=[];
 assert.deepEqual(plain(api.checkSessionShape(p,true,undefined,d=>details.push(d))),plain(api.checkSessionShape(p,true)));
 assert.equal(details.length,0);assert.deepEqual(p,before);
});

test('prescription diagnostic exposes bounded structure without free text, unknown keys or dose values',()=>{
 const summarize=load('sessionShapeDiagnostics').prescriptionShapeDiagnostic;
 const privateValue='private-athlete-secret',entry={movementId:'goblet_squat',name:privateValue,
   prescription:[{doseInstruction:privateValue}],dose:{sets:3,[privateValue]:privateValue},[privateValue]:privateValue};
 const before=structuredClone(entry),d=summarize(entry,entry.prescription,2,'main',4);
 assert.equal(d.movementId,'goblet_squat');assert.ok(d.parentKeys.includes('prescription'));
 assert.ok(d.originalDose.keys.includes('sets'));assert.ok(d.originalDose.keys.includes('[redacted-key]'));
 assert.deepEqual(plain(d.received.itemTypes),['object']);assert.equal(d.received.length,1);
 assert.equal(d.movementIdentity.name.typeof,'string');
 assert.ok(!JSON.stringify(d).includes(privateValue));assert.deepEqual(entry,before);
 const bounded=summarize({movementId:privateValue,prescription:Array(100).fill(privateValue),...Object.fromEntries(Array.from({length:100},(_,i)=>['private_'+i,i]))},[],0,'private block',0);
 assert.equal(bounded.movementId,null);assert.equal(bounded.blockType,'other');
 assert.equal(bounded.parentKeys.length,32);assert.equal(bounded.originalPrescription.itemTypes.length,8);
 assert.ok(!JSON.stringify(bounded).includes('private'));
});

for(const discipline of ['box','carrera'])test(`Builder ${discipline}: log-only diagnostic leaves both retry prompts, result and contract unchanged`,async()=>{
 const execute=async (observe,throwLog=false)=>{
   const events=[],prompts=[];
   const runtime=sportsRuntime({console:{info:(name,...args)=>{if(name==='SESSION_PRESCRIPTION_SHAPE_INVALID'){
     if(throwLog)throw new Error('log transport unavailable');events.push(args[0]);}},warn(){},log(){},error(){}}},
     (path,module)=>path.endsWith('structuredSession.ts')&&!observe?{...module,
       parseStructuredSession:(raw,execution,shape)=>module.parseStructuredSession(raw,execution,shape)}:module);
   const profile=runtime('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({perfil:{...equippedProfileFixture(),duracion:'60 min'}});
   const doseContext=runtime('sessionDoseContext').buildSessionDoseContext(profile,null,null,[],true,'coach');
   const input=contractFixture({discipline,stimulus:'',doseContext,
     coachingGuidance:{kind:'weekly_guidance',version:2,stimulus:'Trabajo técnico'}});
   input.exposureContext.report.disciplina=discipline;
   const built=runtime('allowedTrainingContract').buildAllowedTrainingContract(input);
   assert.equal(built.ok,true,JSON.stringify(built));const contract=built.contract,before=structuredClone(contract);
   const raw=JSON.stringify({schemaVersion:2,stimulusId:'Trabajo técnico',structureId:'strength_sets',
     finalDecision:{kind:'session_decision',version:1,stimulus:'Trabajo técnico'},
     blocks:[{blockType:'main',movements:[{movementId:'goblet_squat',prescription:null}]}]});
   const result=await runtime('sessionGeneration').generateContractSession(contract,[],async prompt=>{prompts.push(prompt);return raw;},'',
     '00000000-0000-4000-8000-000000000003');
   assert.deepEqual(contract,before);assert.equal(result.code,'SESSION_PROPOSAL_INVALID');assert.equal(prompts.length,2);
   assert.deepEqual(plain(result.violations),['MOVEMENT_PRESCRIPTION_SHAPE_INVALID']);
   assert.match(prompts[1],/La primera propuesta fue rechazada: \["MOVEMENT_PRESCRIPTION_SHAPE_INVALID"\]/);
   assert.ok(!prompts[1].includes('REPAIR_SHAPE_DETAILS:'));assert.ok(!prompts[1].includes('originalPrescription'));
   return {events,prompts,result:JSON.parse(JSON.stringify(result),(key,value)=>key==='builderInvocationId'?'random-id':value)};
 };
 const baseline=await execute(false),observed=await execute(true),throwing=await execute(true,true);
 assert.deepEqual(observed.prompts,baseline.prompts);assert.deepEqual(throwing.prompts,baseline.prompts);
 assert.deepEqual(observed.result,baseline.result);assert.deepEqual(throwing.result,baseline.result);
 assert.equal(baseline.events.length,0);assert.equal(observed.events.length,2);
 for(const [i,event] of observed.events.entries()){
   assert.equal(event.attempt,i+1);assert.equal(event.discipline,discipline);assert.equal(event.day,'martes');
   assert.equal(event.planningRunId,'00000000-0000-4000-8000-000000000003');
   assert.equal(event.proposalPath,'blocks[0].movements[0].prescription');assert.equal(event.received.isNull,true);
 }
});

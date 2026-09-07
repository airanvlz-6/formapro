import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, contractFixture, plain } from './trainingContractTestRuntime.mjs';
const logs=[];
const load=sportsRuntime({console:{info:(...args)=>logs.push(args)}});
const c=load('allowedTrainingContract').buildAllowedTrainingContract(contractFixture()).contract;
const generate=load('sessionGeneration').generateContractSession;
const proposal=()=>({stimulusId:c.stimulusId,structureId:c.allowedStructureIds[0],blocks:['warmup','main','cooldown'].map(blockType=>({blockType,
  movements:[{movementId:c.allowedMovementIds[0],prescription:{reps:5,sets:3,restSeconds:0}}]}))});
const invalidDose=()=>{const p=proposal();p.blocks[1].movements[0].prescription.reps=-1;return JSON.stringify(p);};
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

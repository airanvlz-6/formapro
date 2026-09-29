import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';

const events=[];
let brokenLogger=false;
const load=sportsRuntime({Error,console:{info:(marker,event)=>{
  if(brokenLogger)throw Error('logger unavailable');events.push({marker,...plain(event)});
}}});
const api=load('../chat/generationTarget');
const target='2026-09-28',digest='snapshot';
const prepared={status:'prepared',targetWeekStart:target,generationTarget:{weekStart:target},snapshotDigest:digest,
  availabilityReadId:'fresh-read',canContinue:false,availability:{question:'Availability?',availability:{carrera:['lunes']}},
  requirements:{preflightRequirement:{kind:'availability',text:'Availability?'}}};
const pending=api.generationRequirement(prepared);
const receipt={tool:'prepare_generation',status:'prepared',generationTarget:{weekStart:target},availabilitySnapshotDigest:digest,pendingRequirement:pending};
function db(turns){return {from:()=>({select(){return this;},eq(){return this;},async single(){return {data:{perfil:{coach_first_turns:turns}},error:null};}})};}
const turn=(receipts,finishedAt='2026-09-28T12:00:00Z',persisted=true)=>({receipts,finishedAt,persisted});

test('canonical requirement projects only existing availability or temporal requirements',()=>{
  assert.deepEqual(plain(pending),{kind:'availability',targetWeekStart:target,snapshotDigest:digest});
  for(const result of [{...prepared,status:'rejected'},{...prepared,canContinue:true},
    {...prepared,requirements:{preflightRequirement:{kind:'other'}}}])assert.equal(api.generationRequirement(result),null);
});

test('durable lookup respects latest receipt, unrelated turns, clearing and uncertain generation attempts',async()=>{
  const first=turn([receipt]);
  assert.deepEqual(plain(await api.readPendingGenerationRequirement(db({first,chat:turn([],'2026-09-28T12:01:00Z')}),'u')),plain(pending));
  for(const barrier of [
    {...receipt,pendingRequirement:null},
    {tool:'prepare_generation',status:'prepared',generationTarget:{weekStart:target}},
    {tool:'generate_week',status:'partial'},
  ])assert.equal(await api.readPendingGenerationRequirement(db({first,last:turn([barrier],'2026-09-28T12:01:00Z')}),'u'),null);
  assert.equal(await api.readPendingGenerationRequirement(db({first,last:turn([{tool:'generate_week',status:'unknown'}],'2026-09-28T12:01:00Z',false)}),'u'),null);
  assert.deepEqual(plain(await api.readPendingGenerationRequirement(db({first,last:turn([{...receipt,pendingRequirement:null}],'2026-09-28T12:01:00Z',false)}),'u')),plain(pending));
});

test('corrupted durable target/digest/boolean cannot be silently consumed',async()=>{
  for(const patch of [{targetWeekStart:'2026-10-05'},{snapshotDigest:'different'},{includeToday:null},{kind:'unknown'},
    {turnIntent:{version:1}}])await assert.rejects(api.readPendingGenerationRequirement(db({first:turn([{...receipt,pendingRequirement:{...pending,...patch}}])}),'u'),{message:'GENERATION_PENDING_INVALID'});
});

test('READY dispatches exactly once; confirmed saving requires an actual verified receipt',async()=>{
  for(const saved of [{status:'committed',receipt:{verified:true}},{status:'committed'},{status:'partial'}]){
    const calls=[];const result=await api.advanceWeeklyGeneration({...prepared,canContinue:true,includeToday:true},async call=>{calls.push(call);return saved;});
    assert.equal(calls.length,1);assert.equal(calls[0].name,'generate_week');
    assert.equal(result.ok,Boolean(saved.receipt?.verified));
  }
  let calls=0;await api.advanceWeeklyGeneration(prepared,async()=>{calls++;});assert.equal(calls,0);
});

test('protocol diagnostics are fixed metadata only, logger failure cannot stop the transition',async()=>{
  events.length=0;
  await api.resumeWeeklyGeneration(pending,'PRIVATE_MESSAGE_SECRET',async()=>prepared);
  assert.equal(events.length,1);assert.equal(events[0].resolution,'ambiguous');
  assert.deepEqual(Object.keys(events[0]).sort(),['marker','targetWeek','fromRequirement','toRequirement','resolution'].sort());
  assert.ok(!JSON.stringify(events).includes('PRIVATE_MESSAGE_SECRET'));
  brokenLogger=true;
  try{const result=await api.advanceWeeklyGeneration(prepared,async()=>{throw Error('unexpected');});assert.equal(result.status,'clarification_required');}
  finally{brokenLogger=false;}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';
const request=sportsRuntime({AbortSignal,console})('../planning/weeklyProviderRequest').requestWeeklyProvider;
test('weekly provider retries only transient read-only calls, retains request and safe diagnostics',async()=>{
  for(const error of [429,503,529,Object.assign(Error('SECRET'),{name:'TimeoutError'}),Object.assign(Error('SECRET'),{cause:{code:'ECONNRESET'}})]){
    const logs=[],waits=[],bodies=[];let n=0;
    const result=await request({method:'POST',body:'PRIVATE_PROMPT'},'weekly',{
      fetch:async(_url,init)=>{bodies.push(init.body);assert.ok(init.signal);if(n++===0){if(typeof error!=='number')throw error;return {ok:false,status:error};}return {ok:true,status:200,json:async()=>({valid:true})};},
      wait:async ms=>waits.push(ms),observe:e=>logs.push(plain(e))});
    assert.equal(result.valid,true);assert.equal(n,2);assert.deepEqual(bodies,['PRIVATE_PROMPT','PRIVATE_PROMPT']);assert.deepEqual(waits,[500]);
    assert.equal(logs[0].retry,true);assert.equal(logs[1].reason,'SUCCESS');assert.equal(logs[0].timeoutMs,45000);
    assert.ok(!JSON.stringify(logs).includes('SECRET'));assert.ok(!JSON.stringify(logs).includes('PRIVATE_PROMPT'));
  }
});
test('weekly permanent failures never retry; exhausted transient errors remain LLM_REQUEST_FAILED',async()=>{
  for(const status of [400,401,403,429,503]){
    let calls=0;const logs=[];
    await assert.rejects(request({body:'PRIVATE'},'weekly',{fetch:async()=>{calls++;return {ok:false,status};},wait:async()=>{},observe:e=>logs.push(e)}),/LLM_REQUEST_FAILED/);
    assert.equal(calls,status===429||status===503?2:1);assert.equal(logs.at(-1).final,true);assert.equal(logs.at(-1).status,status);
  }
  let calls=0;
  await assert.rejects(request({},'weekly',{fetch:async()=>{calls++;return {ok:true,status:200,json:async()=>{throw new SyntaxError('PRIVATE');}};},wait:async()=>{},observe:()=>{}}),/LLM_REQUEST_FAILED/);
  assert.equal(calls,1);
  for(const code of ['WEEKLY_CONTRACT_INVALID','WEEKLY_JSON_INVALID','WEEKLY_SELECTION_INVALID']){
    let attempts=0;
    await assert.rejects(request({},'weekly',{fetch:async()=>{attempts++;throw new Error(code);},wait:async()=>{},observe:()=>{}}),/LLM_REQUEST_FAILED/);
    assert.equal(attempts,1);
  }
});

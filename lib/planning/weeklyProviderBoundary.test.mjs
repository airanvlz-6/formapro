import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sportsRuntime, compile, plain } from '../sports/trainingContractTestRuntime.mjs';

const source=ts.createSourceFile('route.ts',readFileSync('app/api/chat/route.ts','utf8'),ts.ScriptTarget.Latest,true);
function find(n){if(ts.isArrowFunction(n)&&n.parameters[0]?.name.getText(source)==='prompt'&&n.body.getText(source).includes('const output = await requestWeeklyProvider'))return n;return ts.forEachChild(n,find);}
// Execute the production callback, not a replacement adapter between fetch and Weekly.
const callback=find(source);
assert.ok(callback);
const secret='PRIVATE_ATHLETE_RESPONSE';
function setup(bodyFor, fault){
  const logs=[],responses=[];let calls=0;
  const load=sportsRuntime({console:{info:(marker,event)=>logs.push({marker,...plain(event)}),warn(){},error(){},log(){}}},(path,module)=>{
    const targets={completion_processing:['weeklyGuidanceOutput.ts','readWeeklyGuidanceOutput'],normalization:['weeklyPlannerTransport.ts','normalizeWeeklyPlannerTransport'],selection_validation:['openWeeklyCoachContract.ts','validateOpenWeeklySelection']};
    const target=targets[fault];
    if(target&&path.endsWith(target[0]))return {...module,[target[1]]:()=>{throw Object.assign(new TypeError(secret),{code:secret});}};
    if(fault==='completion_projection'&&path.endsWith('weeklyGuidanceOutput.ts'))return {...module,readWeeklyGuidanceOutput:output=>{const result=module.readWeeklyGuidanceOutput(output);Object.defineProperty(result,'weeklySelection',{get(){throw new RangeError(secret);}});return result;}};
    return module;
  });
  const days=plain(load('../planning/weeklyCalendar').calendarDays);
  const c=load('../planning/openWeeklyCoachContract').buildOpenWeeklyContract({openCoachVersion:2,targetWeekStart:'2026-09-28',
    prescriptionScope:{prescriptionAllowed:true,managedDisciplines:['box'],externalDisciplines:[]},allowed:{box:days},contexts:{box:{}},fixed:{}}).contract;
  const selection={contractVersion:3,contextDigest:c.contextDigest,selections:days.map(day=>({day,state:'REST'}))};
  const envelope={id:'synthetic',type:'message',role:'assistant',model:'synthetic',stop_reason:'tool_use',stop_sequence:null,usage:{input_tokens:320,output_tokens:180},
    content:[{type:'text',text:secret},{type:'tool_use',id:'tool-1',name:'submit_weekly_guidance',input:selection}]};
  const globals={apiKey:'synthetic',LONGITUDINAL_DECISION_MARKER:'LONGITUDINAL:',
    fetch:async()=>{calls++;const body=bodyFor(envelope,calls);const response=new Response(typeof body==='string'?body:JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});responses.push(response);return response;}};
  for(const name of ['requestWeeklyProvider'])globals[name]=load('../planning/weeklyProviderRequest')[name];
  for(const name of ['weeklyGuidanceTool','readWeeklyGuidanceOutput','WEEKLY_GUIDANCE_MAX_TOKENS'])globals[name]=load('../planning/weeklyGuidanceOutput')[name];
  globals.plannerProviderMetadata=load('../planning/weeklyPlannerDiagnostics').plannerProviderMetadata;
  const complete=vm.runInNewContext(compile(`(${callback.getText(source)})`),globals);
  return {logs,responses,calls:()=>calls,run:()=>load('../planning/allowedWeeklyPlanContract').composeBoundedWeek(c,complete)};
}

test('HTTP 200 Anthropic tool_use crosses native Response -> wrapper -> actual route callback -> Weekly admission',async()=>{
  const x=setup(e=>e),r=await x.run();assert.equal(r.ok,true,JSON.stringify(r));assert.equal(x.calls(),1);
  assert.ok(x.responses.every(r=>r.bodyUsed));
  const diagnostic=x.logs.find(e=>e.marker==='WEEKLY_PLANNER_DIAGNOSTIC');
  assert.equal(diagnostic.stopReason,'tool_use');assert.equal(diagnostic.outputTokens,180);assert.equal(diagnostic.contentBlockCount,2);
  assert.ok(!JSON.stringify(x.logs).includes(secret));
});

for(const [name,body,reason] of [
  ['empty body',()=>'', 'BODY_JSON_INVALID'],['invalid JSON',()=>'{private', 'BODY_JSON_INVALID'],
  ['missing content',()=>({stop_reason:'end_turn',usage:{output_tokens:5}}),'CONTENT_INVALID'],
  ['empty content',()=>({stop_reason:'end_turn',content:[]}),'CONTENT_INVALID'],
  ['non-array content',()=>({content:secret}),'CONTENT_INVALID'],
  ['missing tool_use',e=>({...e,stop_reason:'end_turn',content:[{type:'text',text:secret}]}),'TOOL_USE_MISSING'],
  ['truncated tool_use',e=>({...e,stop_reason:'max_tokens'}),'STOP_REASON_INVALID'],
  ['wrong tool',e=>({...e,content:[{type:'tool_use',id:'x',name:secret,input:{secret}}] }),'TOOL_USE_INVALID'],
])test(`HTTP 200 ${name}: safe response failure, no transport retry or admission`,async()=>{
  const x=setup(body),r=await x.run();assert.equal(r.ok,false);assert.deepEqual(plain(r.errors),['WEEKLY_PROVIDER_RESPONSE_INVALID']);assert.equal(x.calls(),1);
  const d=x.logs.find(e=>e.marker==='WEEKLY_PLANNER_DIAGNOSTIC');assert.equal(d.reason,'WEEKLY_PROVIDER_RESPONSE_INVALID');
  assert.equal(d.responseReason,reason);assert.equal(d.responseReceived,true);assert.equal(d.bodyParseable,reason!=='BODY_JSON_INVALID');
  if(name==='truncated tool_use'){assert.equal(d.stopReason,'max_tokens');assert.equal(d.outputTokens,180);assert.equal(d.toolUsePresent,true);}
  assert.ok(!JSON.stringify(x.logs).includes(secret));
});

test('HTTP 200 invalid selection retains the existing second proposal separately from transport retries',async()=>{
  const x=setup((e,n)=>n===1?{...e,content:[{...e.content[1],input:{...e.content[1].input,selections:[]}}]}:e);
  assert.equal((await x.run()).ok,true);assert.equal(x.calls(),2);
  const transport=x.logs.filter(e=>e.marker==='WEEKLY_PROVIDER_REQUEST');assert.ok(transport.every(e=>e.attempt===1&&!e.retry));
});

test('HTTP 200 valid tool but invalid Weekly proposal exhausts contract revisions, never provider error',async()=>{
  const x=setup(e=>({...e,content:[{...e.content[1],input:{...e.content[1].input,selections:[]}}]})),r=await x.run();
  assert.equal(r.ok,false);assert.equal(r.code,'WEEKLY_PLANNER_REJECTED');assert.equal(x.calls(),2);
  assert.ok(!r.errors.includes('WEEKLY_PROVIDER_RESPONSE_INVALID'));assert.ok(!r.errors.includes('LLM_REQUEST_FAILED'));
  const logs=x.logs.filter(e=>e.marker==='WEEKLY_PLANNER_DIAGNOSTIC');
  assert.ok(logs.every(e=>e.category==='weekly_contract'&&e.stage==='selection_validation'));
});

for(const stage of ['completion_processing','completion_projection','normalization','selection_validation'])test(`post-HTTP200 Forge exception at ${stage} is internal and safe`,async()=>{
  const x=setup(e=>e,stage),r=await x.run();assert.equal(r.ok,false);assert.equal(x.calls(),1);
  assert.deepEqual(plain(r.errors),['WEEKLY_INTERNAL_PROCESSING_ERROR']);assert.equal(r.stage,stage);assert.equal(r.category,'internal_processing');
  assert.equal(r.errorType,stage==='completion_projection'?'RangeError':'TypeError');
  assert.ok(x.logs.some(e=>e.marker==='WEEKLY_PROCESSING_DIAGNOSTIC'&&e.stage===stage&&e.errorCode==='WEEKLY_INTERNAL_PROCESSING_ERROR'));
  assert.ok(!JSON.stringify([r,x.logs]).includes(secret));assert.ok(!JSON.stringify([r,x.logs]).includes('stack'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {sportsRuntime,compile,plain,equippedProfileFixture,contractFixture} from '../sports/trainingContractTestRuntime.mjs';
const today='2026-09-21';
class FixedDate extends Date { constructor(...args){super(...(args.length?args:[today+'T12:00:00Z']));} }
const fixtureSource=readFileSync('lib/chat/groundedCoach.test.mjs','utf8');
const fixtureCode=fixtureSource.slice(fixtureSource.indexOf('function database('),fixtureSource.indexOf("test('temporary mutation"));
const route=ts.createSourceFile('route.ts',readFileSync('app/api/chat/route.ts','utf8'),ts.ScriptTarget.Latest,true);
function find(node,predicate){return predicate(node)?node:ts.forEachChild(node,child=>find(child,predicate));}
const adapter=find(route,n=>ts.isVariableDeclaration(n)&&n.name.getText(route)==='groundedReply').initializer.getText(route);
const report='PRIVATE_REPORT ¿Cómo afrontamos la semana?';
const answer='PRIVATE_ANSWER respuesta sintética';
const expected={
 success:[1,1,null], metadata_rejected:[1,1,null], plain_text:[2,0,'CHAT_RESPONSE_JSON_REQUIRED'],
 generation_failed:[1,0,'PRIVATE_ERROR'], timeout:[1,0,'PRIVATE_ERROR'], http_failed:[1,0,'CHAT_PROVIDER_FAILED'],
 deserialize_failed:[1,0,'PRIVATE_ERROR'], extract_failed:[1,0,'TypeError'],
 empty:[2,0,'CHAT_RESPONSE_JSON_REQUIRED'], bad_json:[2,0,'CHAT_RESPONSE_JSON_REQUIRED'], bad_answer:[2,0,'CHAT_ANSWER_INVALID'],
 review_rejected:[1,1,null], review_json:[1,1,null],
 review_failed:[1,1,null], repair_success:[2,1,null], prepare_failed:[0,0,'TypeError'],
};
const runtimes = new Map();
async function execute(mode,enabled,{brokenSink=false}={}){
 const logs=[],requests=[],timeouts=[];
 const key = String(enabled) + ':' + String(brokenSink);
 if (!runtimes.has(key)) {
  const sink = {logs};
  const load = sportsRuntime({Error,Date:FixedDate,process:{env:{SUPABASE_SERVICE_ROLE_KEY:'synthetic',FORGE_CHAT_COACH_DIAGNOSTICS:enabled?'1':'0'}},
   console:{info:(event,text)=>{if(brokenSink)throw Error('PRIVATE_SINK');sink.logs.push({event,...JSON.parse(text)});},log(){},warn(){}}});
  runtimes.set(key,{load,sink});
 }
 const {load,sink}=runtimes.get(key); sink.logs=logs;
 const db=new Function('load','today','equippedProfileFixture','contractFixture',fixtureCode+';return fixture();')(load,today,equippedProfileFixture,contractFixture);
 if(mode==='prepare_failed')db.tables.weekly_plan[0].sessions[4].dia=7;
 let generations=0,reviews=0;
 const originalError=new Error('PRIVATE_ERROR'); if(mode==='timeout')originalError.name='TimeoutError';
 const context={Error,supabase:db,codigo:'u',apiKey:'PRIVATE_KEY',runChatCoach:load('../chat/runChatCoach').runChatCoach,
  AbortSignal:{timeout:ms=>{timeouts.push(ms);return undefined;}},fetch:async(url,options)=>{
   const body=JSON.parse(options.body),review=body.system.startsWith('GROUNDING_REVIEW');
   requests.push({url,method:options.method,body,headers:options.headers});
   assert.deepEqual(plain(body.output_config.format), plain(load('../chat/coachOutputContract')[review?'COACH_REVIEW_FORMAT':'COACH_GENERATION_FORMAT']));
   if(review)reviews++;else generations++;
   if(!review&&['generation_failed','timeout'].includes(mode)||review&&mode==='review_failed')throw originalError;
   if(mode==='http_failed')return {ok:false};
   if(mode==='deserialize_failed')return {ok:true,json:async()=>{throw originalError;}};
   if(mode==='extract_failed')return {ok:true,json:async()=>({content:{}})};
   let raw;
   if(review)raw=mode==='review_json'?'{':JSON.stringify({supported:mode!=='review_rejected',unsupportedClaims:mode==='review_rejected'?['PRIVATE_CLAIM']:[]});
   else if(mode==='empty')raw='';
   else if(mode==='bad_json'||mode==='repair_success'&&generations===1)raw='{';
   else if(mode==='bad_answer')raw=JSON.stringify({answer:7});
   else if(mode==='plain_text')raw=answer;
   else raw=JSON.stringify({answer,grounding:[{fact:'today',value:mode==='metadata_rejected'?'PRIVATE_MISMATCH':today}],evidence:[],interpretation:'synthetic',decision:'synthetic'});
   return {ok:true,json:async()=>({content:[{type:'text',text:raw}]})};
  }};
 vm.createContext(context);vm.runInContext(compile('var groundedReply = '+adapter+';'),context);
 let result,error;
 try{result=await context.groundedReply(report);}catch(e){error=e;}
 const pipeline=logs.findLast(e=>e.event==='CHAT_COACHING_PIPELINE');
 const operations=logs.filter(e=>e.event==='CHAT_COACH_OPERATION');
 if(result){result=plain(result);delete result.pipeline.runId;}
 return {result,error,errorShape:error?{name:error.name,message:error.message}:null,originalErrorPreserved:error===originalError,
  operations,pipeline,requests:plain(requests),timeouts,generations,reviews,effects:plain(db.writes),tables:plain(db.tables)};
}
for(const [mode,[generations,reviews,terminal]] of Object.entries(expected))test('Coach diagnostics ON/OFF preserve '+mode,async()=>{
 const off=await execute(mode,false),on=await execute(mode,true);
 for(const field of ['result','errorShape','originalErrorPreserved','requests','timeouts','effects','tables'])assert.deepEqual(on[field],off[field],field);
 assert.equal(off.operations.length,0);assert.ok(on.operations.length);
 assert.equal(on.generations,generations);assert.equal(on.reviews,reviews);
 assert.ok(on.timeouts.every(ms=>ms===120000));
 if(terminal==='TypeError')assert.equal(on.error.name,'TypeError');else assert.equal(on.error?.message??null,terminal);
 if(['generation_failed','timeout','deserialize_failed'].includes(mode))assert.equal(on.originalErrorPreserved,true);
 assert.ok(on.operations.every(e=>e.runId===on.pipeline.runId));
 for(const start of on.operations.filter(e=>e.phase==='start')){
  assert.equal(on.operations.filter(e=>e.operationId===start.operationId&&e.phase!=='start').length,1,start.operation);
 }
 const has=(operation,phase,attempt)=>on.operations.some(e=>e.operation===operation&&e.phase===phase&&(attempt===undefined||e.attempt===attempt));
 assert.equal(on.pipeline.coachingResponseProduced,terminal===null);
 assert.deepEqual(on.pipeline.failures,[]);
 if(mode==='prepare_failed'){assert.ok(has('postGrounding.affectedFuturePlans','failure'));assert.ok(!has('generation.provider','start'));}
 if(['generation_failed','timeout','http_failed'].includes(mode))assert.ok(has('generation.provider.receive','failure',1));
 if(mode==='timeout')assert.ok(on.operations.some(e=>e.errorClass==='TimeoutError'));
 if(mode==='deserialize_failed')assert.ok(has('generation.provider.deserialize','failure',1));
 if(mode==='extract_failed')assert.ok(has('generation.provider.extractText','failure',1));
 if(mode==='bad_answer')assert.ok(has('answer.validate','failure',2));
 if(mode==='bad_json'||mode==='empty'||mode==='plain_text')assert.ok(has('response.parse','rejected',2));
 if(mode==='review_json')assert.ok(has('review.parse','failure',1));
 if(mode==='review_rejected')assert.ok(has('review.admit','rejected',1));
 if(mode==='review_failed')assert.ok(has('review.provider.receive','failure',1));
 if(mode==='metadata_rejected'){assert.ok(has('metadata.validate','rejected',1));assert.ok(has('answer.return','success',1));}
 if(mode==='repair_success'){assert.ok(has('repair','start',2));assert.ok(has('repair','success',2));}
 if(terminal===null)assert.ok(has('answer.return','success'));
 const allowed=new Set(['event','runId','operationId','operation','attempt','phase','durationMs','errorClass','errorCode']);
 for(const row of on.operations){
  assert.ok(Object.keys(row).every(k=>allowed.has(k)));assert.ok(row.durationMs>=0);
  assert.ok(['start','success','failure','rejected'].includes(row.phase));
 }
 assert.ok(!JSON.stringify(on.operations).includes('PRIVATE'));
});
test('broken diagnostic sink preserves success, failure and DB effects',async()=>{
 for(const mode of ['success','timeout']){
  const off=await execute(mode,false),broken=await execute(mode,true,{brokenSink:true});
  for(const key of ['result','errorShape','originalErrorPreserved','requests','effects','tables'])assert.deepEqual(broken[key],off[key]);
 }
});
test('coach trace sanitizes hostile errors and isolates interleaved runs',()=>{
 const events=[];const load=sportsRuntime({process:{env:{FORGE_CHAT_COACH_DIAGNOSTICS:'1'}},console:{info:(event,text)=>events.push({event,...JSON.parse(text)})}});
 const factory=load('../diagnostics/coachTrace').createCoachTrace;
 const one=factory('11111111-1111-4111-8111-111111111111'),two=factory('22222222-2222-4222-8222-222222222222');
 const a=one.start('prompt.build'),b=two.start('review.provider',2);
 let getterCalls=0;
 one.end(a,'failure',{get name(){getterCalls++;throw new Error('PRIVATE_GETTER');},get message(){getterCalls++;return 'PRIVATE_MESSAGE';}});
 assert.equal(getterCalls,0);
 assert.equal(events.filter(e=>e.runId.startsWith('222')&&e.phase!=='start').length,0);
 two.failFrom(0,{name:'PRIVATE_NAME',code:'PRIVATE_CODE',message:'PRIVATE_MESSAGE',cause:{token:'PRIVATE_TOKEN'}});
 assert.ok(!JSON.stringify(events).includes('PRIVATE'));
 assert.equal(events.findLast(e=>e.operationId===b).errorCode,'UNCLASSIFIED');
});

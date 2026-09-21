import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';
const load = sportsRuntime({Error});
const contract = load('../chat/coachOutputContract');
const {answerGroundedChat} = load('../chat/groundedCoach');
const envelope = {answer:'Propuesta provisional, sin confirmar guardado.',grounding:[{fact:'sample',value:null}],evidence:[],interpretation:'',decision:'',actions:[]};
const encode = e => {const {grounding,actions,...rest}=e;return {...rest,grounding:grounding.map(({fact,value})=>({fact,valueJson:JSON.stringify(value)})),actionsJson:actions.map(a=>JSON.stringify(a))};};
const raw = JSON.stringify(envelope);
for(const [name,input,ok] of [
 ['object',raw,true],['whitespace',' \n'+raw+'\n ',true],['fenced','```json\n'+raw+'\n```',true],['unlabelled','```\n'+raw+'\n```',true],
 ['prefix','Texto '+raw,false],['suffix',raw+' Texto',false],['truncated',raw.slice(0,-1),false],['multiple',raw+raw,false],['comma','{"answer":"x",}',false],
 ['array','[]',false],['null','null',false],['string','"x"',false],['two fences','```json\n'+raw+'\n```\n```json\n'+raw+'\n```',false],
]) test('strict generation document: '+name,()=>{
 if(ok)assert.deepEqual(plain(contract.parseCoachObject(input)),envelope);
 else assert.throws(()=>contract.parseCoachObject(input), /CHAT_RESPONSE_(JSON|OBJECT)_REQUIRED/);
});

// Validate the exact subset used by the static wire schemas, including all required keys.
function matches(schema,value){
 if(schema.type==='object')return value!==null&&typeof value==='object'&&!Array.isArray(value)&&schema.required.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>Object.hasOwn(schema.properties,k)&&matches(schema.properties[k],value[k]));
 if(schema.type==='array')return Array.isArray(value)&&value.every(v=>matches(schema.items,v));
 return typeof value===schema.type&&(!schema.enum||schema.enum.includes(value));
}
test('wire schema preserves heterogeneous facts and every action kind without restricting nested vocabulary',()=>{
 const values=[null,true,42,0,'texto " escapado',[],[1,{nested:[false,null]}],{}, {dynamic_key:{unknown_capability:['a',3]}}];
 const actions=[{kind:'adapt_session',state:'REST',reason:'Rest'}, {kind:'adapt_session',state:'TRAIN',intent:{kind:'open_coach',method:{label:'libre'}},proposal:{schemaVersion:2,blocks:[{movements:[{movementId:'unknown',prescription:{doseInstruction:'libre',custom:{a:[1]}}}]}]}}, {kind:'record_performed',quote:'Hecho',responseQuotes:[],discipline:'nueva'}, {kind:'record_response',quote:'Después'}];
 for(const value of values){const domain={...envelope,grounding:[{fact:'sample',value}],actions};const wire=encode(domain);
  assert.ok(matches(contract.COACH_GENERATION_FORMAT.schema,wire));assert.deepEqual(plain(contract.decodeCoachEnvelope(wire)),domain);
 }
 assert.equal(matches(contract.COACH_GENERATION_FORMAT.schema,{...encode(envelope),answer:42}),false);
 assert.equal(matches(contract.COACH_GENERATION_FORMAT.schema,{...encode(envelope),actionsJson:[{}]}),false);
 assert.ok(matches(contract.COACH_REVIEW_FORMAT.schema,{supported:false,unsupportedClaims:[{quote:'synthetic',kind:'unsupported_fact'}]}));
 assert.equal(matches(contract.COACH_REVIEW_FORMAT.schema,{supported:'true',unsupportedClaims:[]}),false);
 assert.equal(matches(contract.COACH_REVIEW_FORMAT.schema,{supported:true,unsupportedClaims:[],answer:'extra'}),false);
});
test('Production regression: incompatible first output, explicit repair, same schema, admitted wire output',async()=>{
 const calls=[];const result=await answerGroundedChat({facts:{sample:null},conversation:[]},'Reporte sintético',async(system,messages,options)=>{
  calls.push({system,messages,options});
  if(options.kind==='review')return '{"supported":true,"unsupportedClaims":[]}';
  return calls.length===1?'{"answer":':JSON.stringify(encode(envelope));
 });
 assert.equal(result.answer,envelope.answer);assert.equal(result.extractionVerified,true);
 assert.equal(calls.length,3);assert.equal(calls[0].options.outputFormat,contract.COACH_GENERATION_FORMAT);
 assert.equal(calls[1].options.outputFormat,calls[0].options.outputFormat);
 assert.equal(calls[2].options.outputFormat,contract.COACH_REVIEW_FORMAT);
 assert.match(calls[1].system,/Escapa comillas/);assert.deepEqual(calls[0].messages,calls[1].messages);
});
test('invalid metadata or encoded action is not authority and does not silence reviewed answer',async()=>{
 const wire=encode(envelope);wire.grounding[0].valueJson='{';wire.actionsJson=['{'];
 const r=await answerGroundedChat({facts:{sample:null},conversation:[]},'Reporte',async(s,m,o)=>o.kind==='review'?'{"supported":true,"unsupportedClaims":[]}':JSON.stringify(wire));
 assert.equal(r.answer,envelope.answer);assert.equal(r.extractionVerified,false);assert.deepEqual(plain(r.actions),[null]);
});
test('review cannot regenerate a valid answer and cannot authorize facts from an unclassified rejection',async()=>{
 let reviews=0,generations=0;const result=await answerGroundedChat({facts:{sample:null},conversation:[]},'Reporte',async(s,m,o)=>{
  if(o.kind==='review'){reviews++;return '{"supported":false,"unsupportedClaims":["synthetic"]}';}
  generations++;return JSON.stringify(encode(envelope));
 });assert.equal(reviews,1);assert.equal(generations,1);assert.ok(result.answer.includes(envelope.answer));assert.equal(result.extractionVerified,false);assert.equal(result.actionsAuthorized,false);
});

test('invalid encoded metadata cannot verify even when a fact has an undefined value',()=>{
 const wire=encode(envelope);wire.grounding[0].valueJson='{';
 assert.throws(()=>load('../chat/groundedCoach').validateChatDecision(JSON.stringify(wire),{sample:undefined},'Reporte'), /CHAT_CANONICAL_FACT_MISMATCH/);
});

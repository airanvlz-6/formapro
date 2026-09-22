import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';
import { fixtures, input, output, element, acceptedReview } from './semanticIntakeFixtures.mjs';
const load = sportsRuntime({ Error, Intl, Response, Request, TextDecoder, AbortSignal });
const { runSemanticIntakeShadow: run } = load('../chat/semanticIntakeShadow');
const contracts = load('../chat/semanticInterpretation');
const { selectContextRequirements } = load('../chat/contextRequirements');
const { handleSemanticShadow } = load('../chat/semanticShadowHandler');
const { observeSemanticShadow, shadowConversationSnapshot } = load('../chat/semanticShadowClient');
const byId = id => structuredClone(fixtures.find(f => f.id === id));
const field = (e, key) => e.fields.find(f => f.name === key)?.value;
const elements = r => [...r.intents, ...r.factCandidates, ...r.preferences];
function provider(f, review = acceptedReview, calls = []) {
  return async call => { calls.push(plain(call)); return call.kind === 'interpretation' ? JSON.stringify(f.expected) : review; };
}

for (const f of fixtures) test(`offline A-J contract ${f.id}: preserves every candidate, evidence and sufficient scope`, async () => {
  const before = JSON.stringify(f), calls = [], logs = [];
  const result = plain(await run(f.input, { enabled: true, complete: provider(f, acceptedReview, calls), diagnostic: d => logs.push(d) }));
  assert.equal(result.diagnostics.status, 'interpreted'); assert.equal(result.requirements.scope, f.expected.contextScope);
  assert.equal(result.requirements.authority, 'CONTEXT_ONLY'); assert.equal(result.requirements.loading, 'NOT_LOADED');
  const r = result.interpretation; assert.equal(r.authority, 'SHADOW_CANDIDATES_ONLY');
  assert.equal(elements(r).length, elements(f.expected).length);
  for (const e of elements(r)) {
    for (const evidence of [...e.evidence, ...e.fields.flatMap(f => f.evidence)]) {
      assert.equal(evidence.messageId, f.input.message.messageId); assert.deepEqual(evidence.actor, f.input.message.actor);
      assert.equal(evidence.reportedAt, f.input.message.reportedAt);
      assert.equal(f.input.message.text.slice(evidence.start, evidence.end), evidence.quote);
    }
    for (const field of e.fields) if (field.status === 'UNKNOWN') assert.equal(field.value, null);
  }
  assert.equal(calls.length, 2); assert.equal(JSON.parse(calls[0].content).message.text, f.input.message.text);
  assert.equal(JSON.stringify(f), before);
  const logged = JSON.stringify(logs); assert.ok(!logged.includes(f.input.message.text)); assert.ok(!logged.includes('fixture-athlete'));
  assert.ok(!logged.includes('fixture-message')); assert.equal(logs.length, 1);
  if (f.id === 'A') { assert.equal(field(r.factCandidates[0], 'movement'), 'split jerk'); assert.equal(field(r.factCandidates[0], 'diagnosis'), null); }
  if (f.id === 'B') { assert.equal(field(r.factCandidates[0], 'maximum'), 40); assert.equal(r.factCandidates[0].effectiveTime.startDate, '2026-09-25'); }
  if (f.id === 'C' || f.id === 'J') {
    assert.equal(field(r.factCandidates[0], 'distance'), f.id === 'C' ? 5 : 8);
    assert.equal(r.preferences[0].effectiveTime.startDate, '2026-09-26'); assert.equal(r.factCandidates[0].effectiveTime.startDate, '2026-09-27');
    assert.ok(r.intents.length); assert.ok(r.preferences.length);
  }
  if (f.id === 'D') { assert.deepEqual(r.preferences[0].contextReferenceIds, ['recent-event']); assert.equal(field(r.preferences[0], 'primaryGoalChange'), null); }
  if (f.id === 'F') { assert.equal(r.intents.length, 2); assert.deepEqual(r.intents[0].relatesTo, ['maintain']); }
  if (f.id === 'G') assert.equal(field(r.factCandidates[0], 'forgeSessionId'), null);
  if (f.id === 'H') assert.equal(field(r.factCandidates[0], 'readinessScore'), null);
  if (f.id === 'I') assert.equal(field(r.factCandidates[0], 'formalType'), null);
});

test('unknown race distance and discomfort details remain unknown without catalog inference', async () => {
  for (const [message, known, unknown] of [
    ['El domingo tengo una carrera.', {description:'carrera'}, ['distance','pace','priority','goal','formalType']],
    ['Me molesta el hombro haciendo split jerk.', {bodyArea:'hombro',movement:'split jerk'}, ['diagnosis','duration','severity','permanentRestriction']],
  ]) {
    const f = { input: input(message), expected: output('WEEK_CONTEXT', { factCandidates:[element(message,'observation','free_report','WEEK_CONTEXT',
      {...known,...Object.fromEntries(unknown.map(k=>[k,null]))})] }) };
    const r = await run(f.input,{enabled:true,complete:provider(f)});
    for(const k of unknown) assert.equal(field(r.interpretation.factCandidates[0],k),null);
  }
});
test('scope uncertainty escalates; every element contributes even when envelope scope is local', () => {
  const r = selectContextRequirements('LOCAL_SESSION', ['WEEK_CONTEXT'], [{id:'planning',minimumContextScope:'LONGITUDINAL_PLANNING'}]);
  assert.equal(r.scope,'LONGITUDINAL_PLANNING'); assert.equal(r.selection,'uncertainty_escalation');
  assert.ok(r.requested.includes('outcomes'));
  const local=selectContextRequirements('LOCAL_SESSION',[],[]);
  assert.ok(!local.requested.includes('cycle')); assert.ok(!local.requested.includes('relevantHistory'));
});
test('unknown domain vocabulary and ordinary novel language pass the same contract', async () => {
  const t='El finde participo en un encuentro de orientación acuática con mi hermana; el día aún no está cerrado.';
  const f={input:input(t),expected:output('WEEK_CONTEXT',{factCandidates:[element(t,'novel','aquatic_orienteering_gathering','WEEK_CONTEXT',{date:null})],
    unresolved:[{reason:'Fecha pendiente',evidence:[{quote:t}]}],requiresClarification:true})};
  const r=await run(f.input,{enabled:true,complete:provider(f)});assert.equal(r.diagnostics.status,'interpreted');
  assert.equal(r.interpretation.requiresClarification,true);
});

for(const [name,mutate] of [
  ['fabricated quote',f=>{f.expected.factCandidates[0].evidence[0].quote='invented';}],
  ['wrong span',f=>{f.expected.factCandidates[0].evidence[0].start=1;}],
  ['forged provenance',f=>{f.expected.factCandidates[0].evidence[0].actor='someone';}],
  ['unknown with invented value',f=>{f.expected.factCandidates[0].fields.find(v=>v.status==='UNKNOWN').valueJson='42';}],
  ['known field without evidence',f=>{f.expected.factCandidates[0].fields[0].evidence=[];}],
  ['invalid date',f=>{f.expected.factCandidates[0].effectiveTime.startDate='2026-02-30';}],
  ['missing reference',f=>{f.expected.factCandidates[0].contextReferenceIds=['made-up'];}],
  ['dangling relation',f=>{f.expected.factCandidates[0].relatesTo=['missing'];}],
  ['duplicate id',f=>{f.expected.preferences[0].id='event';}],
  ['extra write command',f=>{f.expected.actions=[{kind:'write'}];}],
  ['infinite JSON number',f=>{f.expected.factCandidates[0].fields[0].valueJson='1e999';}],
  ['known and unknown contradiction',f=>{f.expected.factCandidates[0].unknownFields.push('distance');}],
])test('reject structural evidence violation: '+name,async()=>{
  const f=byId('C');mutate(f);let calls=0;
  const r=await run(f.input,{enabled:true,complete:async()=>{calls++;return JSON.stringify(f.expected);}});
  assert.equal(r.diagnostics.status,'invalid_output');assert.equal(r.interpretation,null);assert.equal(calls,1);
  assert.equal(r.requirements.scope,'LONGITUDINAL_PLANNING');
});
for(const issue of ['UNSUPPORTED_CLAIM','MISSING_CLAUSE','REFERENCE_AMBIGUOUS','INSUFFICIENT_SCOPE','SPORTING_DECISION'])
test('semantic review veto remains shadow and conservative: '+issue,async()=>{
  const f=byId('J');
  if(issue==='MISSING_CLAUSE')f.expected.factCandidates=[];
  // Keep structural relations valid so this reaches the semantic review.
  f.expected.intents[0].relatesTo=[];
  const r=await run(f.input,{enabled:true,complete:provider(f,JSON.stringify({supported:issue!=='UNSUPPORTED_CLAIM',complete:issue!=='MISSING_CLAUSE',scopeSufficient:issue!=='INSUFFICIENT_SCOPE',issues:[issue]}))});
  assert.equal(r.diagnostics.status,'review_rejected');assert.equal(r.interpretation,null);assert.equal(r.requirements.selection,'failure_fallback');
});
test('off means no validation, calls, logs or context work',async()=>{
  const r=await run(null,{enabled:false,complete:()=>assert.fail(),diagnostic:()=>assert.fail()});
  assert.equal(r.diagnostics.status,'disabled');assert.equal(r.requirements,null);
});
test('invalid report civil date/timezone is not accepted as temporal reference',async()=>{
  for(const patch of [{reportedAt:'2026-02-30T10:00:00Z'},{timezone:'invented/timezone'},{reportedAt:'yesterday'}]) {
    const f=byId('A');Object.assign(f.input.message,patch);
    const r=await run(f.input,{enabled:true,complete:()=>assert.fail()});assert.equal(r.diagnostics.status,'invalid_input');
  }
});
test('runner exposes only interpretation requirements diagnostics and no executable action result',async()=>{
  const r=await run(byId('E').input,{enabled:true,complete:provider(byId('E'))});
  assert.deepEqual(Object.keys(r).sort(),['diagnostics','interpretation','mode','requirements']);
  assert.equal(r.interpretation.authority,'SHADOW_CANDIDATES_ONLY');
  // A production runtime import graph has no persistence/client/Coach authority dependency.
  const modules=['semanticIntakeShadow','semanticInterpretation','contextRequirements','semanticShadowHandler','semanticShadowProvider'];
  for(const name of modules) {
    const source=readFileSync(`lib/chat/${name}.ts`,'utf8');
    for(const forbidden of ['.from(','.rpc(','.update(','.insert(','runChatCoach(', 'applyChatCoachActions(', 'updateChatAvailability(', 'resolveWeeklyGenerationPreflight(']) assert.equal(source.includes(forbidden),false,`${name}: ${forbidden}`);
  }
});
test('provider failure and malformed review never escape to coaching or leak exception text',async()=>{
  for(const complete of [async()=>{throw Error('private report');},provider(byId('A'),'{')]){
    const logs=[];const r=await run(byId('A').input,{enabled:true,complete,diagnostic:v=>logs.push(v)});
    assert.equal(r.interpretation,null);assert.equal(r.requirements.scope,'LONGITUDINAL_PLANNING');assert.ok(!JSON.stringify(logs).includes('private'));
  }
});
test('metrics measure interpreter/review/context size without copying sensitive text, and logger failure is isolated',async()=>{
  let clock=0;const f=byId('C');const r=await run(f.input,{enabled:true,now:()=>clock+=10,complete:provider(f),diagnostic:()=>{throw Error('logger');}});
  assert.equal(r.diagnostics.interpreterMs,10);assert.equal(r.diagnostics.reviewMs,10);assert.equal(r.diagnostics.totalMs,50);
  assert.equal(r.diagnostics.interpretationContextCharacters,JSON.stringify(f.input.conversation).length);
  assert.ok(r.diagnostics.approximateInputTokens>0);assert.equal(r.diagnostics.status,'interpreted');
});
test('minimal reference context bounded, marked unverified, without loading history or canonical state',()=>{
  const c=plain(shadowConversationSnapshot(Array.from({length:40},(_,i)=>({role:i%2?'assistant':'user',content:'x'.repeat(2000)})),'availability'));
  assert.equal(c.references.length,2);assert.equal(c.references[0].text.length,1500);assert.equal(c.references[0].authority,'UNVERIFIED_CONTEXT');
  assert.ok(c.pendingQuestion);assert.equal(Object.keys(c).length,2);
});
test('client observation captures full input and pending question, ignores response and catches failure',async()=>{
  const f=byId('C');let sent;
  const deps={enabled:true,token:async()=> 'token',messageId:()=> 'stable',now:()=>f.input.message.reportedAt,timezone:()=> 'Atlantic/Canary',
    send:async(url,args)=>{assert.equal(url,'/api/semantic-intake-shadow');sent=JSON.parse(args.body);return {interpretation:'must not consume'};}};
  assert.equal(await observeSemanticShadow(f.input.message.text,[],'availability',deps),undefined);
  assert.equal(sent.message.text,f.input.message.text);assert.equal(sent.message.messageId,'stable');assert.equal(sent.conversation.pendingQuestion.kind,'availability');
  await observeSemanticShadow('text',[],null,{...deps,send:async()=>{throw Error('offline');}});
  await observeSemanticShadow('text',[],null,{...deps,enabled:false,token:()=>assert.fail()});
});
test('dedicated handler binds verified actor and has no database dependency; unauthorized/off never invoke model',async()=>{
  const f=byId('A'),calls=[];
  const req=()=>new Request('https://forge.invalid/api/semantic-intake-shadow',{method:'POST',body:JSON.stringify(f.input)});
  const r=await handleSemanticShadow(req(),{enabled:true,authenticate:async()=> 'verified-actor',complete:provider(f,acceptedReview,calls)});
  const result=await r.json();assert.equal(r.status,200);assert.equal(result.interpretation.factCandidates[0].evidence[0].actor.id,'verified-actor');
  assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(JSON.parse(calls[0].content).message.actor.id,'verified-actor');
  const off=await handleSemanticShadow(req(),{enabled:false,authenticate:()=>assert.fail(),complete:()=>assert.fail()});assert.equal((await off.json()).status,'disabled');
  const unauth=await handleSemanticShadow(req(),{enabled:true,authenticate:async()=>{throw Error('secret');},complete:()=>assert.fail()});assert.equal(unauth.status,401);
});
test('invalid/oversized shadow inputs rejected before provider',async()=>{
  for(const body of ['{',JSON.stringify({...byId('A').input,message:{...byId('A').input.message,text:'x'.repeat(16001)}}),'x'.repeat(120001)]){
    const r=await handleSemanticShadow(new Request('https://forge.invalid',{method:'POST',body}),{enabled:true,authenticate:async()=> 'actor',complete:()=>assert.fail()});
    assert.ok([400,413].includes(r.status));
  }
});
test('instrumentation occurs before pending branches and cannot replace productive API routing',()=>{
  const source=readFileSync('app/FormaPro.tsx','utf8');const send=source.slice(source.indexOf('const enviar=async('));
  assert.ok(send.indexOf('void observeSemanticShadow')<send.indexOf('if(pendingGoalQuestion)'));
  assert.ok(!send.includes('await observeSemanticShadow'));
  assert.ok(send.includes('action:"verificar_correccion_disponibilidad_deterministico"'));
  assert.ok(send.includes('coachGrounding:true'));
  const route=readFileSync('app/api/semantic-intake-shadow/route.ts','utf8');
  assert.ok(!route.includes('SERVICE_ROLE'));assert.ok(!route.includes('resolveAuthenticatedAthlete'));
});

test('provider uses existing structured-output transport; incomplete response rejected, no tools or retry',async()=>{
  const {semanticShadowProvider}=load('../chat/semanticShadowProvider');let body;
  const complete=semanticShadowProvider('test-key',async(url,req)=>{body=JSON.parse(req.body);return {ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:'{}'}]})};});
  await complete({kind:'interpretation',system:'system',content:'input',format:contracts.SEMANTIC_INTERPRETATION_FORMAT});
  // Resolve transport-only references: the accepted schema must remain exactly the same.
  const schema=body.output_config.format.schema;
  const expand=node=>{
    if(!node||typeof node!=='object')return node;
    if(Array.isArray(node))return node.map(expand);
    if(node.$ref)return expand(schema.$defs[node.$ref.slice('#/$defs/'.length)]);
    return Object.fromEntries(Object.entries(node).filter(([key])=>key!=='$defs').map(([key,value])=>[key,expand(value)]));
  };
  assert.deepEqual(expand(schema),plain(contracts.SEMANTIC_INTERPRETATION_FORMAT.schema));
  assert.equal(body.output_config.format.type,'json_schema');assert.equal(body.tools,undefined);
  for(const stop_reason of ['max_tokens','tool_use',undefined]) await assert.rejects(()=>semanticShadowProvider('key',async()=>({ok:true,json:async()=>({stop_reason,content:[{type:'text',text:'{}'}]})}))({kind:'review',system:'',content:'',format:contracts.SEMANTIC_REVIEW_FORMAT}));
});

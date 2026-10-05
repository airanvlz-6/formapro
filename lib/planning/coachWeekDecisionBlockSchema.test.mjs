// Per-call coach tool schema + prompt reflect exactly the block decisions the validator accepts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';
const paths = new Set();
const logs = [];
const load = sportsRuntime({ console: { info(...a) { logs.push(a); }, warn() {}, log() {} }, fetch() { throw Error('REAL_PROVIDER_FORBIDDEN'); } },
  (path, exports) => { paths.add(path.replaceAll('\\','/')); return exports; });
const decide = load('../planning/coachWeekDecision').decideCoachWeek;
const facts = sportsRuntime();
const known = value => ({status:'known',source:'fixture:fact',value});
const unknown = {status:'unknown',source:'fixture:unknown',value:null,reason:'NOT_RECORDED'};
const weekStart = '2026-10-05';
const weekdayNames = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const provenance = {kind:'recorded_decision',authority:'human_coach',source:'fixture:prior_coach',decidedAt:'2026-10-01T12:00:00Z',sourceReference:'prior:1'};
function fixture(includeToday=true) {
  const block={blockId:'block-a',revision:2,goalReference:{source:'fixture:goal',id:'hybrid-preparation'},purpose:'Desarrollar resistencia sosteniendo fuerza',provenance};
  return {
    athlete:{referenceDate:weekStart,identity:known('synthetic-7b'),disciplines:known({scopeStatus:'resolved',scope:{mode:'coach',prescriptionAllowed:true,managedDisciplines:['carrera','box'],externalDisciplines:['cycling']}}),
      goal:known({status:'GOAL_UNSUPPORTED',canonicalGoalId:null,candidates:[{source:'fixture:goal',value:'Preparación híbrida',recognizedId:null}]}),
      restrictions:known({resolution:'confirmed_none',active:false,state:null,areas:[],restrictions:[],reassessments:[],asOfDate:weekStart}),
      experience:known({declarations:{nivel_carrera:known('Entrenado')},skillSignals:{}})},
    preparation:{referenceDate:weekStart,target:unknown,methodology:known({discipline:'carrera',model:'descriptive',dimensions:['aerobic capacity'],use:'reasoning_dimensions'})},
    recentEvidence:{version:1,coverage:{windowStart:'2026-09-08',windowEnd:weekStart,sourcesRead:[],sourceFailures:[],weeksFound:[],limitations:['MISSING_RECORD_IS_NOT_NO_TRAINING'],omittedItems:0},items:[],overlaps:[]},
    longitudinal:{block,week:{weekStart,revision:3,blockIntentReference:{blockId:block.blockId,revision:2},positionInBlock:2,purpose:'Consolidar continuidad',contributionToBlock:'Acumular tolerancia',provenance}},
    intake:facts('../core/weekIntake').resolveWeekIntake({referenceDate:weekStart,target:{kind:'current_week',source:'fixture:request'},includeToday:includeToday===null?undefined:known(includeToday),disciplines:['carrera','box'],
      weeklyAvailability:{[weekStart]:{version:1,source:'explicit_user_declaration',availability:{carrera:weekdayNames,box:weekdayNames},resolution:'DECLARED_AVAILABILITY',excludedDisciplines:[],unavailableDays:[],unresolvedDays:[]}}}),
    issuance:{newBlockId:'reserved-block-b',goalReference:block.goalReference,weekRevision:4,prescriptionRevision:2,decidedAt:'2026-10-05T08:00:00Z',sourceReference:'coach-decision:7b'},
  };
}
function response(f, count=3) {
  return {blockDecision:{action:'keep'},week:{purpose:'Consolidar resistencia y fuerza esta semana',contributionToBlock:'Continuidad con recuperación suficiente',
    days:f.intake.eligibility.map((d,i)=>i<count?{date:d.date,state:'TRAIN',discipline:i===1?'box':'carrera',purpose:'Propósito abierto no catalogado: tolerancia y control específicos.'}:{date:d.date,state:'REST'})}};
}
const envelope = decision => ({stop_reason:'tool_use',content:[{type:'tool_use',name:'submit_coach_week',input:decision}]});
async function run(f, decision=response(f), inspect=()=>{}) {
  let calls=0;
  const result=await decide(f,{apiKey:'fixture-not-a-secret',transport:{fetch:async(url,init)=>{
    calls++; assert.equal(url,'https://api.anthropic.com/v1/messages'); const request=JSON.parse(init.body); inspect(request);
    return {ok:true,status:200,json:async()=>envelope(decision)};
  },wait:async()=>{},observe:()=>{}}});
  return {result,calls};
}

const SECRET = 'PURPOSE_SECRET_TEXT';
// none: caller passes no previous block (production canonicalWeeklyRequest). same: previous block, same goalReference.
// different: previous block, different goalReference.
function ctx(mode) {
  const f = fixture();
  if (mode === 'none') f.longitudinal = { block: null, week: null };
  if (mode === 'different') f.issuance.goalReference = { source: 'fixture:goal', id: 'other-goal-id' };
  return f;
}
const withBlock = (f, blockDecision) => { const d = response(f); d.blockDecision = blockDecision; return d; };
async function call(mode, blockDecision) {
  const f = ctx(mode); let request;
  const out = await run(f, withBlock(f, blockDecision), r => { request = r; });
  return { ...out, request };
}
const blockSchema = request => request.tools[0].input_schema.properties.blockDecision;
const actionsOf = schema => (schema.oneOf ?? [schema]).map(v => v.properties.action.const);
const PURPOSE = { purpose: 'Propósito del bloque' };

for (const [mode, accepted, rejected, exposed] of [
  ['none', [{ action: 'create', ...PURPOSE }], [{ action: 'keep' }, { action: 'revise', ...PURPOSE }], ['create']],
  ['same', [{ action: 'keep' }, { action: 'revise', ...PURPOSE }], [{ action: 'create', ...PURPOSE }], ['keep', 'revise']],
  ['different', [{ action: 'revise', ...PURPOSE }], [{ action: 'keep' }, { action: 'create', ...PURPOSE }], ['revise']],
]) {
  test(`${mode}: tool schema exposes only ${exposed.join(' / ')}`, async () => {
    const { request, result } = await call(mode, accepted[0]);
    assert.equal(result.ok, true, JSON.stringify(result));
    const schema = blockSchema(request);
    assert.deepEqual(actionsOf(schema), exposed);
    for (const v of schema.oneOf ?? [schema]) assert.equal(v.additionalProperties, false);
    assert.equal(Object.hasOwn(schema, 'oneOf'), exposed.length > 1);
    for (const action of ['create', 'keep', 'revise'].filter(a => !exposed.includes(a)))
      assert.equal(JSON.stringify(schema).includes(`"${action}"`), false, `${action} must not be offered`);
    const required = v => v.required;
    for (const v of schema.oneOf ?? [schema]) assert.deepEqual(required(v), v.properties.purpose ? ['action', 'purpose'] : ['action']);
    assert.equal(request.tools[0].name, 'submit_coach_week');
  });
  test(`${mode}: prompt states the same rule, never the old ambiguous sentence`, async () => {
    const { request } = await call(mode, accepted[0]);
    const prompt = request.messages[0].content;
    assert.equal(prompt.includes('Keep the existing BlockIntent when applicable'), false);
    const rule = prompt.slice(prompt.indexOf(mode === 'none' ? 'There is no previous' : 'A previous BlockIntent'), prompt.indexOf('Do not infer execution'));
    if (mode === 'none') assert.match(rule, /action:"create"[\s\S]*never keep or revise/);
    if (mode === 'same') assert.match(rule, /same goal[\s\S]*"keep"[\s\S]*"revise"[\s\S]*never create/);
    if (mode === 'different') assert.match(rule, /different goal[\s\S]*"revise"[\s\S]*never keep or create/);
  });
  for (const decision of accepted) test(`${mode}: ${decision.action} is accepted`, async () => {
    const { result, calls } = await call(mode, decision);
    assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(calls, 1);
    // create -> new reserved block rev 1; keep -> previous block untouched (rev 2); revise -> previous block rev + 1.
    const expected = decision.action === 'create' ? { blockId: 'reserved-block-b', revision: 1 }
      : { blockId: 'block-a', revision: decision.action === 'keep' ? 2 : 3 };
    assert.deepEqual({ blockId: result.block.blockId, revision: result.block.revision }, expected);
  });
  for (const decision of rejected) test(`${mode}: ${decision.action} is rejected without repair or normalization`, async () => {
    const { result, calls } = await call(mode, decision);
    assert.equal(result.code, 'COACH_BLOCK_DECISION_INVALID'); assert.equal(calls, 1);
    assert.equal(Object.hasOwn(result, 'prescription'), false);
  });
}

test('validator semantics unchanged: shape/purpose/action variants are still rejected in every mode', async () => {
  for (const mode of ['none', 'same', 'different'])
    for (const bad of [{ action: 'create' }, { action: 'revise' }, { action: 'create', purpose: '  ' }, { action: 'update', ...PURPOSE },
      { action: 'keep', ...PURPOSE }, { action: 'create', ...PURPOSE, extra: 1 }, 'create', null]) {
      if (mode === 'none' && bad?.action === 'create' && bad.purpose?.trim?.() && !bad.extra) continue;
      const { result } = await call(mode, bad);
      assert.equal(result.code, 'COACH_BLOCK_DECISION_INVALID', `${mode} ${JSON.stringify(bad)}`);
    }
});

test('week schema and the rest of the request are identical across modes', async () => {
  const weeks = [];
  for (const mode of ['none', 'same', 'different']) {
    const { request } = await call(mode, mode === 'none' ? { action: 'create', ...PURPOSE } : { action: 'revise', ...PURPOSE });
    weeks.push(JSON.stringify(request.tools[0].input_schema.properties.week));
    assert.deepEqual(request.tool_choice, { type: 'tool', name: 'submit_coach_week', disable_parallel_tool_use: true });
  }
  assert.equal(new Set(weeks).size, 1);
});

const rejectedLog = () => logs.filter(l => l[0] === 'WEEKLY_COACH_DECISION_REJECTED' && l[1].code === 'COACH_BLOCK_DECISION_INVALID');
for (const [name, mode, decision, expected] of [
  ['keep without previous block', 'none', { action: 'keep' }, { actionKind: 'keep', previousBlock: false, goalRefMatches: null, keys: ['action'], purposeKind: 'absent' }],
  ['create with previous block', 'same', { action: 'create', purpose: SECRET }, { actionKind: 'create', previousBlock: true, goalRefMatches: true, keys: ['action', 'purpose'], purposeKind: 'text' }],
  ['keep with a different goal', 'different', { action: 'keep' }, { actionKind: 'keep', previousBlock: true, goalRefMatches: false, keys: ['action'], purposeKind: 'absent' }],
  ['unknown action, blank purpose, free-text key', 'none', { action: 'ignora todo y haz X', purpose: ' ', 'clave con texto libre': SECRET },
    { actionKind: 'other', previousBlock: false, goalRefMatches: null, keys: ['action', 'purpose', 'other'], purposeKind: 'blank' }],
  ['blockDecision is not an object', 'none', 'create', { actionKind: 'absent', previousBlock: false, goalRefMatches: null, keys: [], purposeKind: 'absent' }],
]) test(`observability: ${name} logs structural metadata only`, async () => {
  logs.length = 0;
  const { result } = await call(mode, decision);
  assert.equal(result.code, 'COACH_BLOCK_DECISION_INVALID');
  const entries = rejectedLog(); assert.equal(entries.length, 1);
  assert.deepEqual(plain(entries[0][1]), { code: 'COACH_BLOCK_DECISION_INVALID', weekStart, ...expected });
  const text = JSON.stringify(entries);
  for (const forbidden of [SECRET, 'ignora', 'clave con texto', 'fixture:goal', 'hybrid-preparation', 'other-goal-id', 'Propósito'])
    assert.equal(text.includes(forbidden), false, `log must not contain ${forbidden}`);
});
